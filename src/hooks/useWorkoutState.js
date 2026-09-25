import { getProfileData, saveProfileData, subscribeToStorageChanges } from "../services/storageAdapter.js";

const { useState, useEffect, useCallback, useRef } = window.React || React;

/**
 * Custom React hook for centralizing state, active profiles, timers, and storage synchronization.
 */
export function useWorkoutState() {
  const I = window.HG_INTERNALS || {};
  const PlatePlanSyncEngine = window.PlatePlanSyncEngine || {};
  const GymCloudEngine = window.GymCloudEngine || {};

  // Helpers
  const getInitialActiveProfile = () => {
    const candidateKeys = [
      "hg_active_profile",
      "activeProfile",
      "currentProfile",
      "hg_selected_person"
    ];
    try {
      for (const k of candidateKeys) {
        const val = localStorage.getItem(k);
        if (val && I.J && I.J.includes(val)) return val;
      }
      localStorage.setItem("hg_active_profile", "elliott");
    } catch {}
    return "elliott";
  };

  const loadDecoupledProfileLocal = (profileId) => {
    if (window.loadDecoupledProfile) {
      return window.loadDecoupledProfile(profileId);
    }
    const raw = getProfileData(`data:${profileId}`);
    return raw || { logs: [], sessions: [] };
  };

  const loadActiveLocal = (profileId) => {
    try {
      const activeKey = `hg_active_workout_${profileId}`;
      const raw = localStorage.getItem(activeKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const saveActiveLocal = (profileId, value) => {
    try {
      const activeKey = `hg_active_workout_${profileId}`;
      if (value) {
        localStorage.setItem(activeKey, JSON.stringify(value));
      } else {
        localStorage.removeItem(activeKey);
      }
    } catch {}
  };

  // State Definitions
  const [personId, setPersonIdState] = useState(getInitialActiveProfile);
  const [store, setStore] = useState(() => ({
    elliott: loadDecoupledProfileLocal("elliott"),
    chloe: loadDecoupledProfileLocal("chloe")
  }));
  const [view, setView] = useState("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [pin, setPin] = useState(() => I.qe ? I.qe() : "");
  const [syncStatus, setSyncStatus] = useState(pin ? "connecting" : "local-only");
  const [active, setActiveState] = useState(() => loadActiveLocal(getInitialActiveProfile()));
  const [queueCount, setQueueCount] = useState(() => 
    PlatePlanSyncEngine.getOfflineQueue ? PlatePlanSyncEngine.getOfflineQueue().length : 0
  );

  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  // Reactive Storage Synchronization Effect
  useEffect(() => {
    const handleStorageUpdate = (e) => {
      const k = e?.detail?.key || e?.key;
      if (!k || k.includes("elliott") || k.includes("plateplan") || k.includes("hg_")) {
        setStore(cur => ({ ...cur, elliott: loadDecoupledProfileLocal("elliott") }));
      }
      if (!k || k.includes("chloe") || k.includes("plateplan") || k.includes("hg_")) {
        setStore(cur => ({ ...cur, chloe: loadDecoupledProfileLocal("chloe") }));
      }
    };

    window.addEventListener("storage", handleStorageUpdate);
    window.addEventListener("localstorage_sync", handleStorageUpdate);
    return () => {
      window.removeEventListener("storage", handleStorageUpdate);
      window.removeEventListener("localstorage_sync", handleStorageUpdate);
    };
  }, []);

  // Sync plate plan on personId change
  useEffect(() => {
    if (!PlatePlanSyncEngine.syncPlatePlanWithFirestore) return;
    let isActive = true;
    PlatePlanSyncEngine.syncPlatePlanWithFirestore(personId, showToast)
      .then(reconciled => {
        if (!isActive) return;
        if (reconciled) {
          setStore(current => ({ ...current, [personId]: reconciled }));
        }
        if (PlatePlanSyncEngine.getOfflineQueue) {
          setQueueCount(PlatePlanSyncEngine.getOfflineQueue().length);
        }
      })
      .catch(err => console.warn("[PlatePlan Sync] Initial sync error:", err));

    return () => { isActive = false; };
  }, [personId, showToast]);

  // Online/Offline Listeners & Periodic Processor
  useEffect(() => {
    if (!PlatePlanSyncEngine.processOfflineQueue) return;

    const handleOnline = async () => {
      setSyncStatus("syncing");
      const res = await PlatePlanSyncEngine.processOfflineQueue();
      setQueueCount(res.remaining);
      if (res.processed > 0) {
        showToast(`Auto-synced ${res.processed} offline workout(s) to cloud`);
      }
      const reconciled = await PlatePlanSyncEngine.syncPlatePlanWithFirestore(personId);
      if (reconciled) {
        setStore(current => ({ ...current, [personId]: reconciled }));
      }
      setSyncStatus("synced");
    };

    const handleOffline = () => {
      setSyncStatus("offline");
      setQueueCount(PlatePlanSyncEngine.getOfflineQueue().length);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(async () => {
      if (navigator.onLine && PlatePlanSyncEngine.getOfflineQueue().length > 0) {
        const res = await PlatePlanSyncEngine.processOfflineQueue();
        setQueueCount(res.remaining);
        if (res.processed > 0) {
          showToast(`Auto-synced ${res.processed} offline workout(s) to cloud`);
        }
      }
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [personId, showToast]);

  // Sync subscription logic for Elliott and Chloe
  useEffect(() => {
    if (!PlatePlanSyncEngine.subscribe) return;

    const handleRemoteUpdate = (id, subCollection, remoteData) => {
      setStore(current => {
        if (!current[id]) return current;
        const currentProfile = current[id];
        
        let next = { ...currentProfile };
        if (subCollection === "exercise_logs") {
          const mergedLogs = window.mergeDeduplicatedLogs ? window.mergeDeduplicatedLogs(currentProfile.logs || [], remoteData) : remoteData;
          next = { ...currentProfile, logs: mergedLogs, updatedAt: Date.now() };
        } else if (subCollection === "weight" || subCollection === "bodyweight") {
          const items = Array.isArray(remoteData) ? remoteData : [remoteData];
          const map = new Map();
          (currentProfile.bodyWeightLogs || []).forEach(b => { if (b) map.set(String(b.id || `bw_${b.date}`), b); });
          items.forEach(b => {
            if (b) {
              const key = String(b.id || `bw_${b.date}`);
              map.set(key, { ...(map.get(key) || {}), ...b });
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          next = { ...currentProfile, bodyWeightLogs: merged, updatedAt: Date.now() };
        } else if (subCollection === "readiness") {
          const items = Array.isArray(remoteData) ? remoteData : [remoteData];
          const map = new Map();
          (currentProfile.readinessLogs || []).forEach(r => { if (r) map.set(String(r.id || `r_${r.date}`), r); });
          items.forEach(r => {
            if (r) {
              const key = String(r.id || `r_${r.date}`);
              map.set(key, { ...(map.get(key) || {}), ...r });
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          next = { ...currentProfile, readinessLogs: merged, updatedAt: Date.now() };
        } else if (subCollection === "sleep") {
          const items = Array.isArray(remoteData) ? remoteData : [remoteData];
          const map = new Map();
          (currentProfile.sleepLogs || []).forEach(s => { if (s) map.set(String(s.id || `slp_${s.date}`), s); });
          items.forEach(s => {
            if (s) {
              const key = String(s.id || `slp_${s.date}`);
              map.set(key, { ...(map.get(key) || {}), ...s });
            }
          });
          const merged = Array.from(map.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          next = { ...currentProfile, sleepLogs: merged, updatedAt: Date.now() };
        } else if (subCollection === "active_program") {
          next = {
            ...currentProfile,
            startDate: remoteData.startDate || currentProfile.startDate,
            goals: remoteData.goals || currentProfile.goals,
            resumeNote: remoteData.resumeNote || currentProfile.resumeNote,
            sessions: Array.isArray(remoteData.sessions) && remoteData.sessions.length ? remoteData.sessions : currentProfile.sessions,
            weekOverrides: remoteData.weekOverrides || currentProfile.weekOverrides,
            equipment: remoteData.equipment || currentProfile.equipment,
            updatedAt: Date.now()
          };
        }

        if (window.savePlatePlanV1Local) window.savePlatePlanV1Local(id, next);
        if (I.Ee) I.Ee(id, next);
        return { ...current, [id]: next };
      });
    };

    const unsubElliott = PlatePlanSyncEngine.subscribe(
      "elliott",
      (subCol, data) => handleRemoteUpdate("elliott", subCol, data),
      status => setSyncStatus(status)
    );

    const unsubChloe = PlatePlanSyncEngine.subscribe(
      "chloe",
      (subCol, data) => handleRemoteUpdate("chloe", subCol, data),
      status => setSyncStatus(status)
    );

    return () => {
      unsubElliott();
      unsubChloe();
    };
  }, []);

  // Update active workout state when switching personId
  useEffect(() => {
    setActiveState(loadActiveLocal(personId));
  }, [personId]);

  // Profile switches
  const setPersonId = useCallback((id) => {
    if (!I.J.includes(id)) return;
    try {
      localStorage.setItem("hg_active_profile", id);
      localStorage.setItem("activeProfile", id);
      localStorage.setItem("currentProfile", id);
      localStorage.setItem("hg_selected_person", id);
    } catch {}
    const localData = loadDecoupledProfileLocal(id);
    setStore(current => ({ ...current, [id]: localData }));
    setPersonIdState(id);
    setView("today");
  }, [I.J]);

  const setActive = useCallback((value) => {
    setActiveState(value);
    saveActiveLocal(personId, value);
  }, [personId]);

  const updateData = useCallback((id, updater) => {
    setStore(current => {
      if (!current[id]) return current;
      const currentProfile = current[id];
      const updated = updater(currentProfile);

      const preservedLogs = (Array.isArray(updated.logs) && updated.logs.length > 0)
        ? (window.mergeDeduplicatedLogs ? window.mergeDeduplicatedLogs(currentProfile.logs || [], updated.logs) : updated.logs)
        : (currentProfile.logs || []);

      const next = {
        ...updated,
        logs: preservedLogs,
        bodyWeightLogs: updated.bodyWeightLogs || currentProfile.bodyWeightLogs || [],
        readinessLogs: updated.readinessLogs || currentProfile.readinessLogs || [],
        sleepLogs: updated.sleepLogs || currentProfile.sleepLogs || [],
        updatedAt: Date.now()
      };

      if (GymCloudEngine.saveActiveProgram) {
        GymCloudEngine.saveActiveProgram(id, next);
      }
      if (I.Ee) I.Ee(id, next);
      if (window.syncLegacyStorage) window.syncLegacyStorage(id, next);

      return { ...current, [id]: next };
    });
  }, [GymCloudEngine, I]);

  const startWorkout = useCallback((session) => {
    const existing = loadActiveLocal(personId);
    if (existing?.sessionId === session.id && existing.date === (I.W ? I.W() : "")) {
      setActive(existing);
    } else {
      const profile = store[personId] || loadDecoupledProfileLocal(personId);
      const status = I.Fe ? I.Fe(profile, session, I.W(), I.W()) : "not_started";
      const currentLogs = Array.isArray(profile?.logs) ? profile.logs : [];
      
      const flattenExercisesLocal = (s) => {
        if (!s || s.type !== "strength") return [];
        return (s.groups || []).flatMap(g =>
          (g.exercises || []).map(ex => ({ exercise: ex, groupLabel: g.label }))
        );
      };

      const exercises = flattenExercisesLocal(session);
      const firstIncomplete = session.type === "strength"
        ? exercises.findIndex(({ exercise }) =>
            !currentLogs.some(log => log.sessionId === session.id && log.exerciseId === exercise.id && log.date === (I.W ? I.W() : ""))
          )
        : -1;

      setActive({
        schemaVersion: 1,
        sessionId: session.id,
        date: I.W ? I.W() : "",
        step: status === "partial" && firstIncomplete >= 0 ? firstIncomplete + 1 : 0,
        skipped: [],
        completedRefs: [],
        startedAt: Date.now(),
        timerEndAt: null,
      });
    }
    if (window.lockPortrait) window.lockPortrait();
  }, [personId, store, setActive, I]);

  const saveHouseholdKey = useCallback((value) => {
    if (I.Je) I.Je(value);
    setPin(value);
    if (GymCloudEngine.saveActiveProgram) {
      GymCloudEngine.saveActiveProgram("elliott", store.elliott);
      GymCloudEngine.saveActiveProgram("chloe", store.chloe);
    }
    setSettingsOpen(false);
    showToast("Settings saved & sub-collections synced");
  }, [store, GymCloudEngine, I, showToast]);

  return {
    personId,
    setPersonId,
    store,
    updateData,
    view,
    setView,
    settingsOpen,
    setSettingsOpen,
    toast,
    showToast,
    pin,
    setPin,
    syncStatus,
    setSyncStatus,
    queueCount,
    setQueueCount,
    active,
    setActive,
    startWorkout,
    saveHouseholdKey
  };
}
