(function () {
  "use strict";

  const I = window.HG_INTERNALS;
  if (!I || !window.React || !window.ReactDOM) {
    document.getElementById("root").textContent = "Home Gym could not start. Please close and reopen the app.";
    return;
  }

  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef } = React;
  const APP_VERSION = "v2.3.2";
  const FEELINGS = [
    ["very_easy", "Very easy"],
    ["good", "Good"],
    ["challenging", "Challenging"],
    ["very_hard", "Very hard"],
    ["pain", "Pain / discomfort"],
  ];
  const FEELING_LABELS = Object.fromEntries(FEELINGS);

  const SORENESS_MAP = {
    1: "Fresh",
    2: "Mild",
    3: "Moderate",
    4: "High",
    5: "Severe"
  };
  const SORENESS_OPTIONS = [
    { val: 1, label: "Fresh", desc: "No soreness" },
    { val: 2, label: "Mild", desc: "Slight tightness" },
    { val: 3, label: "Moderate", desc: "Noticeable stiffness" },
    { val: 4, label: "High", desc: "Tender / fatigued" },
    { val: 5, label: "Severe", desc: "Very sore" }
  ];

  const MOTIVATION_MAP = {
    1: "Very Low",
    2: "Low",
    3: "Moderate",
    4: "High",
    5: "Fired Up"
  };
  const MOTIVATION_OPTIONS = [
    { val: 1, label: "Very Low", desc: "Drained" },
    { val: 2, label: "Low", desc: "Sluggish" },
    { val: 3, label: "Moderate", desc: "Ready to work" },
    { val: 4, label: "High", desc: "Energized" },
    { val: 5, label: "Fired Up", desc: "Peak drive" }
  ];
  const NAV = [
    ["today", "◉", "Today"],
    ["history", "≡", "History"],
    ["progress", "↗", "Progress"],
    ["metrics", "◇", "Metrics"],
    ["plan", "☰", "Plan"],
  ];
  const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function storageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function activeKey(personId) {
    return `hg_active_workout_v1:${personId}`;
  }

  function loadActive(personId) {
    return storageGet(activeKey(personId), null);
  }

  function saveActive(personId, value) {
    if (value) storageSet(activeKey(personId), value);
    else {
      try { localStorage.removeItem(activeKey(personId)); } catch {}
    }
  }

  function applyTheme(theme) {
    const safe = ["system", "light", "dark"].includes(theme) ? theme : "system";
    try { localStorage.setItem("hg_appearance", safe); } catch {}
    if (safe === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = safe;
    document.documentElement.style.colorScheme = safe === "system" ? "light dark" : safe;
    const dark = safe === "dark" ||
      (safe === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111214" : "#F7F6F2");
  }

  function getTheme() {
    try { return localStorage.getItem("hg_appearance") || "system"; }
    catch { return "system"; }
  }

  function lockPortrait() {
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true ||
      document.fullscreenElement;
    if (!standalone || !screen.orientation?.lock) return Promise.resolve(false);
    return screen.orientation.lock("portrait-primary").then(() => true).catch(() => false);
  }

  function formatElapsed(startedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  function parsePrescription(text) {
    const values = String(text || "").match(/\d+(?:\.\d+)?/g) || [];
    return { sets: values[0] || "", reps: values[1] || "" };
  }

  function rpeToFeeling(rpe) {
    if (rpe == null || rpe === "") return "good";
    const value = Number(rpe);
    if (value <= 3) return "very_easy";
    if (value <= 6) return "good";
    if (value <= 8) return "challenging";
    return "very_hard";
  }

  function normalizeExerciseName(name) {
    if (!name) return "";
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function findLogsForExercise(logs, exercise) {
    if (!logs || !exercise) return [];
    const exId = String(exercise.id || "");
    const targetNorm = normalizeExerciseName(exercise.name);
    return logs.filter(l => {
      if (!l) return false;
      if (l.exerciseId && String(l.exerciseId) === exId) return true;
      if (targetNorm && l.exerciseName && normalizeExerciseName(l.exerciseName) === targetNorm) return true;
      if (targetNorm && l.name && normalizeExerciseName(l.name) === targetNorm) return true;
      if (targetNorm && l.exerciseId && normalizeExerciseName(l.exerciseId) === targetNorm) return true;
      return false;
    });
  }

  function mergeDeduplicatedLogs(baseLogs, incomingLogs) {
    const map = new Map();
    (baseLogs || []).forEach(l => {
      if (!l) return;
      const key = l.id ? String(l.id) : `${l.date}_${l.exerciseId || l.name}_${l.weight}_${l.sets}_${l.reps}`;
      map.set(String(key), l);
    });
    (incomingLogs || []).forEach(l => {
      if (!l) return;
      const key = l.id ? String(l.id) : `${l.date}_${l.exerciseId || l.name}_${l.weight}_${l.sets}_${l.reps}`;
      const existing = map.get(String(key));
      map.set(String(key), { ...(existing || {}), ...l });
    });
    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  const GymCloudEngine = {
    getFirestore() {
      try {
        if (window.firebase && window.firebase.firestore) {
          if (!window.firebase.apps || !window.firebase.apps.length) {
            if (window.FIREBASE_CONFIG) window.firebase.initializeApp(window.FIREBASE_CONFIG);
          }
          return window.firebase.firestore();
        }
      } catch (err) {
        console.warn("Firestore access:", err?.message);
      }
      return null;
    },

    getRTDB() {
      try {
        if (window.firebase && window.firebase.database) {
          if (!window.firebase.apps || !window.firebase.apps.length) {
            if (window.FIREBASE_CONFIG) window.firebase.initializeApp(window.FIREBASE_CONFIG);
          }
          return window.firebase.database();
        }
      } catch (err) {
        console.warn("RTDB access:", err?.message);
      }
      return null;
    },

    async saveExerciseLog(profileId, log) {
      if (!profileId || !log || !log.id) return;
      const clean = {
        id: String(log.id),
        type: log.type || "exercise",
        sessionId: log.sessionId || "",
        exerciseId: log.exerciseId || "",
        exerciseName: log.exerciseName || "",
        normalizedName: normalizeExerciseName(log.exerciseName || log.exerciseId),
        date: log.date || I.W(),
        weight: log.weight != null ? Number(log.weight) : null,
        sets: log.sets != null ? Number(log.sets) : null,
        reps: log.reps != null ? Number(log.reps) : null,
        completed: log.completed ?? true,
        feeling: log.feeling || rpeToFeeling(log.rpe),
        rpe: log.rpe ?? null,
        notes: log.notes || "",
        distance: log.distance != null ? Number(log.distance) : undefined,
        duration: log.duration != null ? Number(log.duration) : undefined,
        effort: log.effort || undefined,
        timestamp: log.timestamp || Date.now(),
        updatedAt: Date.now()
      };
      Object.keys(clean).forEach(k => clean[k] === undefined && delete clean[k]);

      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("exercise_logs").doc(String(clean.id)).set(clean, { merge: true });
        } catch (e) {
          console.warn("Firestore saveExerciseLog:", e?.message);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/exercise_logs/${clean.id}`).set(clean);
        } catch (e) {
          console.warn("RTDB saveExerciseLog:", e?.message);
        }
      }
    },

    async deleteExerciseLog(profileId, logId) {
      if (!profileId || !logId) return;
      const fs = this.getFirestore();
      if (fs) {
        try { await fs.collection("gym_users").doc(profileId).collection("exercise_logs").doc(String(logId)).delete(); } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/exercise_logs/${logId}`).remove(); } catch (e) {}
      }
    },

    async saveReadinessLog(profileId, log) {
      if (!profileId || !log || !log.id) return;
      const clean = {
        id: String(log.id),
        date: log.date || I.W(),
        sleep: log.sleep != null ? Number(log.sleep) : 7.5,
        sleepHours: log.sleepHours != null ? Number(log.sleepHours) : 7,
        sleepMins: log.sleepMins != null ? Number(log.sleepMins) : 30,
        soreness: log.soreness != null ? Number(log.soreness) : 3,
        motivation: log.motivation != null ? Number(log.motivation) : 3,
        notes: log.notes || "",
        timestamp: log.timestamp || Date.now(),
        updatedAt: Date.now()
      };
      const fs = this.getFirestore();
      if (fs) {
        try { await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(clean.id)).set(clean, { merge: true }); } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/readiness_logs/${clean.id}`).set(clean); } catch (e) {}
      }
    },

    async deleteReadinessLog(profileId, logId) {
      if (!profileId || !logId) return;
      const fs = this.getFirestore();
      if (fs) {
        try { await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(logId)).delete(); } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/readiness_logs/${logId}`).remove(); } catch (e) {}
      }
    },

    async saveBodyweightLog(profileId, log) {
      if (!profileId || !log || !log.id) return;
      const clean = {
        id: String(log.id),
        date: log.date || I.W(),
        weight: Number(log.weight),
        note: log.note || "",
        timestamp: log.timestamp || Date.now(),
        updatedAt: Date.now()
      };
      const fs = this.getFirestore();
      if (fs) {
        try { await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(clean.id)).set(clean, { merge: true }); } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${clean.id}`).set(clean); } catch (e) {}
      }
    },

    async deleteBodyweightLog(profileId, logId) {
      if (!profileId || !logId) return;
      const fs = this.getFirestore();
      if (fs) {
        try { await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(logId)).delete(); } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${logId}`).remove(); } catch (e) {}
      }
    },

    async saveActiveProgram(profileId, programData) {
      if (!profileId || !programData) return;
      const payload = {
        programId: programData.programId || "current",
        name: programData.programName || programData.name || "Active Routine",
        startDate: programData.startDate || "",
        goals: programData.goals || "",
        resumeNote: programData.resumeNote || "",
        sessions: programData.sessions || [],
        weekOverrides: programData.weekOverrides || {},
        equipment: programData.equipment || null,
        updatedAt: Date.now()
      };
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("active_program").doc("current").set(payload, { merge: true });
        } catch (e) {
          console.warn("Firestore saveActiveProgram:", e?.message);
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/active_program/current`).set(payload);
        } catch (e) {
          console.warn("RTDB saveActiveProgram:", e?.message);
        }
      }
    },

    subscribe(profileId, onRemoteUpdate, onStatusChange) {
      const unsubscribers = [];

      const fs = this.getFirestore();
      if (fs) {
        try {
          const unsubLogs = fs.collection("gym_users").doc(profileId).collection("exercise_logs")
            .onSnapshot(snap => {
              const logs = [];
              snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
              if (logs.length > 0) {
                onStatusChange?.("synced");
                onRemoteUpdate?.("exercise_logs", logs);
              }
            }, err => console.warn("Firestore logs error:", err?.message));
          unsubscribers.push(unsubLogs);

          const unsubRead = fs.collection("gym_users").doc(profileId).collection("readiness_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                onStatusChange?.("synced");
                onRemoteUpdate?.("readiness_logs", items);
              }
            }, () => {});
          unsubscribers.push(unsubRead);

          const unsubBw = fs.collection("gym_users").doc(profileId).collection("bodyweight_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                onStatusChange?.("synced");
                onRemoteUpdate?.("bodyweight_logs", items);
              }
            }, () => {});
          unsubscribers.push(unsubBw);

          const unsubProg = fs.collection("gym_users").doc(profileId).collection("active_program").doc("current")
            .onSnapshot(doc => {
              if (doc.exists) {
                onStatusChange?.("synced");
                onRemoteUpdate?.("active_program", doc.data());
              }
            }, () => {});
          unsubscribers.push(unsubProg);
        } catch (e) {
          console.warn("Firestore subscribe exception:", e?.message);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          const logsRef = rtdb.ref(`gym_users/${profileId}/exercise_logs`);
          const onLogs = snap => {
            const val = snap.val();
            if (val) {
              onStatusChange?.("synced");
              const logs = Object.keys(val).map(k => ({ id: k, ...val[k] }));
              onRemoteUpdate?.("exercise_logs", logs);
            }
          };
          logsRef.on("value", onLogs);
          unsubscribers.push(() => logsRef.off("value", onLogs));

          const progRef = rtdb.ref(`gym_users/${profileId}/active_program/current`);
          const onProg = snap => {
            const val = snap.val();
            if (val) {
              onStatusChange?.("synced");
              onRemoteUpdate?.("active_program", val);
            }
          };
          progRef.on("value", onProg);
          unsubscribers.push(() => progRef.off("value", onProg));
        } catch (e) {
          console.warn("RTDB subscribe exception:", e?.message);
        }
      }

      return () => {
        unsubscribers.forEach(fn => {
          try { fn(); } catch (e) {}
        });
      };
    }
  };

  async function runLegacyDataRecoveryAndMigration() {
    const profiles = ["elliott", "chloe"];
    const results = { elliott: [], chloe: [] };
    for (const profileId of profiles) {
      try {
        const recoveredLogs = [];
        const logSeen = new Set();
        function addLogCandidate(l) {
          if (!l) return;
          const exId = l.exerciseId || l.liftId || l.sessionId || "";
          const name = l.exerciseName || l.name || exId;
          const normName = normalizeExerciseName(name);
          const date = l.date || "";
          const dedupKey = l.id ? String(l.id) : `${date}_${normName}_${l.weight}_${l.sets}_${l.reps}`;
          if (logSeen.has(dedupKey)) return;
          logSeen.add(dedupKey);

          recoveredLogs.push({
            id: String(l.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            type: l.type || (l.distance != null ? "run" : "exercise"),
            sessionId: l.sessionId || "",
            exerciseId: exId,
            exerciseName: name,
            normalizedName: normName,
            date: date || I.W(),
            weight: l.weight != null && Number.isFinite(Number(l.weight)) ? Number(l.weight) : null,
            sets: l.sets != null ? Number(l.sets) : null,
            reps: l.reps != null ? Number(l.reps) : null,
            completed: l.completed ?? true,
            feeling: l.feeling || rpeToFeeling(l.rpe),
            rpe: l.rpe ?? null,
            notes: l.notes || "",
            distance: l.distance != null ? Number(l.distance) : undefined,
            duration: l.duration != null ? Number(l.duration) : undefined,
            effort: l.effort || undefined,
            timestamp: l.timestamp || (date ? new Date(`${date}T12:00:00`).getTime() : Date.now()),
          });
        }

        let legacyData = null;
        try {
          const raw = localStorage.getItem(`data:${profileId}`);
          if (raw) legacyData = JSON.parse(raw);
        } catch (e) {}
        if (legacyData?.logs && Array.isArray(legacyData.logs)) {
          legacyData.logs.forEach(addLogCandidate);
        }

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("backup") || key.includes("snapshot") || key.includes("hg_"))) {
            if (key.includes(profileId)) {
              try {
                const parsed = JSON.parse(localStorage.getItem(key));
                if (parsed?.logs && Array.isArray(parsed.logs)) {
                  parsed.logs.forEach(addLogCandidate);
                } else if (parsed?.people?.[profileId]?.logs) {
                  parsed.people[profileId].logs.forEach(addLogCandidate);
                }
              } catch (e) {}
            }
          }
        }

        const fs = GymCloudEngine.getFirestore();
        if (fs) {
          try {
            const docSnap = await fs.collection("gym_users").doc(profileId).get();
            if (docSnap.exists) {
              const rootData = docSnap.data();
              if (rootData?.logs && Array.isArray(rootData.logs)) {
                rootData.logs.forEach(addLogCandidate);
              }
            }
          } catch (e) {}
        }

        const rtdb = GymCloudEngine.getRTDB();
        if (rtdb) {
          try {
            const snap = await rtdb.ref(`gym_users/${profileId}`).once("value");
            const val = snap.val();
            if (val?.logs && Array.isArray(val.logs)) {
              val.logs.forEach(addLogCandidate);
            }
          } catch (e) {}
        }

        const recoveredReadiness = [];
        const readSeen = new Set();
        function addReadinessCandidate(r) {
          if (!r || !r.date) return;
          const id = String(r.id || `r_${r.date}`);
          if (readSeen.has(id)) return;
          readSeen.add(id);
          recoveredReadiness.push({
            id,
            date: r.date,
            sleep: r.sleep != null ? Number(r.sleep) : 7.5,
            sleepHours: r.sleepHours != null ? Number(r.sleepHours) : 7,
            sleepMins: r.sleepMins != null ? Number(r.sleepMins) : 30,
            soreness: r.soreness != null ? Number(r.soreness) : 3,
            motivation: r.motivation != null ? Number(r.motivation) : 3,
            notes: r.notes || r.note || "",
            timestamp: r.timestamp || new Date(`${r.date}T12:00:00`).getTime(),
          });
        }
        try {
          const localR = JSON.parse(localStorage.getItem(`hg_readiness_${profileId}`) || "[]");
          if (Array.isArray(localR)) localR.forEach(addReadinessCandidate);
        } catch (e) {}
        if (legacyData?.readiness && Array.isArray(legacyData.readiness)) {
          legacyData.readiness.forEach(addReadinessCandidate);
        }

        const recoveredWeights = [];
        const weightSeen = new Set();
        function addWeightCandidate(w) {
          if (!w || !w.date || w.weight == null) return;
          const id = String(w.id || `bw_${w.date}`);
          if (weightSeen.has(id)) return;
          weightSeen.add(id);
          recoveredWeights.push({
            id,
            date: w.date,
            weight: Number(w.weight),
            note: w.note || "",
            timestamp: w.timestamp || new Date(`${w.date}T12:00:00`).getTime(),
          });
        }
        try {
          const localW = JSON.parse(localStorage.getItem(`hg_metrics_${profileId}`) || "[]");
          if (Array.isArray(localW)) localW.forEach(addWeightCandidate);
        } catch (e) {}
        if (legacyData?.bodyweight && Array.isArray(legacyData.bodyweight)) {
          legacyData.bodyweight.forEach(addWeightCandidate);
        }

        const logSaves = recoveredLogs.map(log => GymCloudEngine.saveExerciseLog(profileId, log));
        const readSaves = recoveredReadiness.map(r => GymCloudEngine.saveReadinessLog(profileId, r));
        const bwSaves = recoveredWeights.map(w => GymCloudEngine.saveBodyweightLog(profileId, w));

        if (legacyData) {
          await GymCloudEngine.saveActiveProgram(profileId, {
            startDate: legacyData.startDate,
            goals: legacyData.goals,
            resumeNote: legacyData.resumeNote,
            sessions: legacyData.sessions,
            weekOverrides: legacyData.weekOverrides,
            equipment: legacyData.equipment,
          });
        }

        await Promise.allSettled([...logSaves, ...readSaves, ...bwSaves]);
        results[profileId] = recoveredLogs;
        localStorage.setItem(`hg_v23_migration_confirmed_${profileId}`, "true");
        console.info(`[v2.3.1] Legacy recovery & migration confirmed for ${profileId} (${recoveredLogs.length} logs synced)`);
      } catch (err) {
        console.error(`[v2.3.1] Recovery notice for ${profileId}:`, err);
      }
    }
    return results;
  }

  function loadDecoupledProfile(profileId) {
    const k = (I.K && I.K[profileId]) ? I.K[profileId] : { goals: "", resumeNote: "", sessions: [] };
    const defaultData = {
      startDate: (I.j && I.W) ? I.j(I.W()) : "2026-09-07",
      goals: k.goals || "",
      resumeNote: k.resumeNote || "",
      sessions: Array.isArray(k.sessions) ? k.sessions : [],
      weekOverrides: {},
      logs: [],
      updatedAt: 0,
    };

    try {
      const raw = localStorage.getItem(`data:${profileId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const logs = Array.isArray(parsed.logs) ? parsed.logs.map(i => ({ ...i, exerciseId: i.exerciseId || i.liftId })) : [];
          return {
            startDate: parsed.startDate || defaultData.startDate,
            goals: parsed.goals || defaultData.goals,
            resumeNote: parsed.resumeNote || defaultData.resumeNote,
            sessions: Array.isArray(parsed.sessions) && parsed.sessions.length ? parsed.sessions : defaultData.sessions,
            weekOverrides: parsed.weekOverrides && typeof parsed.weekOverrides === "object" ? parsed.weekOverrides : {},
            logs: logs,
            equipment: parsed.equipment || null,
            updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
          };
        }
      }
    } catch (e) {
      console.warn("loadDecoupledProfile parse error:", e);
    }
    return defaultData;
  }

  // --- Equipment & Progressive Overload Helpers ---

  function getAvailablePlates(data, personId) {
    if (Array.isArray(data?.equipment?.plates) && data.equipment.plates.length > 0) {
      return data.equipment.plates;
    }
    const saved = storageGet(`hg_equipment_${personId}`, null);
    if (Array.isArray(saved?.plates) && saved.plates.length > 0) {
      return saved.plates;
    }
    return [1.5, 2.5, 5]; // Default plates requested by user (5kg, 2.5kg, 1.5kg)
  }

  function getEquipmentConfig(data, personId) {
    const custom = data?.equipment || storageGet(`hg_equipment_${personId}`, null) || {};
    return {
      plates: Array.isArray(custom.plates) && custom.plates.length > 0 ? custom.plates : [1.5, 2.5, 5],
      barbellWeight: Number(custom.barbellWeight) || 20,
      dbHandleWeight: Number(custom.dbHandleWeight) || 2,
    };
  }

  function saveEquipmentConfig(personId, config, updateData) {
    storageSet(`hg_equipment_${personId}`, config);
    if (updateData) {
      updateData(personId, current => ({
        ...current,
        equipment: config,
      }));
    }
  }

  function getAchievableIncrements(plates, isPerSide) {
    const sortedPlates = [...new Set(plates.map(Number))].filter(p => p > 0).sort((a, b) => a - b);
    if (sortedPlates.length === 0) return [1.5, 2.5, 5];

    const jumps = new Set();
    if (isPerSide) {
      // Dumbbells per handle
      for (const p of sortedPlates) {
        jumps.add(p);
        jumps.add(p * 2);
      }
      for (let i = 0; i < sortedPlates.length; i++) {
        for (let j = i + 1; j < sortedPlates.length; j++) {
          jumps.add(sortedPlates[i] + sortedPlates[j]);
          jumps.add(sortedPlates[i] * 2 + sortedPlates[j] * 2);
        }
      }
    } else {
      // Barbells (pairs added to both sides)
      for (const p of sortedPlates) {
        jumps.add(p * 2);
      }
      for (let i = 0; i < sortedPlates.length; i++) {
        for (let j = i + 1; j < sortedPlates.length; j++) {
          jumps.add(sortedPlates[i] * 2 + sortedPlates[j] * 2);
        }
      }
      for (const p of sortedPlates) {
        jumps.add(p * 4);
      }
    }
    return Array.from(jumps).sort((a, b) => a - b);
  }

  function getPossibleWeightJumps(currentWeight, plates, isPerSide, count = 4) {
    const base = Number(currentWeight) || 0;
    const increments = getAchievableIncrements(plates, isPerSide);
    const possible = increments.map(inc => ({
      increment: inc,
      totalWeight: Math.round((base + inc) * 100) / 100,
      label: `+${inc}kg (${Math.round((base + inc) * 100) / 100}kg)`
    }));
    return possible.slice(0, count);
  }

  function snapToAchievable(rawWeight, currentWeight, plates, isPerSide) {
    if (rawWeight == null || !Number.isFinite(Number(rawWeight))) return rawWeight;
    const target = Number(rawWeight);
    const base = currentWeight != null && Number.isFinite(Number(currentWeight)) ? Number(currentWeight) : null;
    
    if (base != null && target > base) {
      const jumps = getPossibleWeightJumps(base, plates, isPerSide, 12);
      let best = jumps[0]?.totalWeight || target;
      let minDiff = Math.abs(best - target);
      for (const j of jumps) {
        const diff = Math.abs(j.totalWeight - target);
        if (diff < minDiff) {
          minDiff = diff;
          best = j.totalWeight;
        }
      }
      return best;
    }
    return Math.round(target * 2) / 2;
  }

  function getExerciseRecommendation({ exercise, data, weekInfo, personId }) {
    if (!exercise) return null;
    
    const plates = getAvailablePlates(data, personId);
    const isPerSide = exercise.weightMode === "perSide";

    const logs = findLogsForExercise(data?.logs || [], exercise).filter(l => l.weight != null && Number.isFinite(Number(l.weight)));
    logs.sort((a, b) => b.date.localeCompare(a.date));
    const previous = logs[0] || null;
    const prev2 = logs[1] || null;

    const isDeload = weekInfo?.isDeload;

    let recWeight = null;
    let reason = "";
    let overloadType = "maintain";
    let weightDiff = 0;

    if (isDeload) {
      const baseVal = previous?.weight ?? exercise.startValue ?? 20;
      recWeight = Math.round((baseVal * 0.8) * 2) / 2;
      reason = "Deload week: Lightened load (80%) for active recovery";
      overloadType = "deload";
    } else if (previous) {
      const prevW = Number(previous.weight);
      const feel = previous.feeling || rpeToFeeling(previous.rpe);
      const feel2 = prev2 ? (prev2.feeling || rpeToFeeling(prev2.rpe)) : null;

      const isEasy = feel === "very_easy" || feel === "easy" || feel === "good_easy";
      const isGood = feel === "good";
      const prev2IsGoodOrBetter = prev2 && (feel2 === "good" || feel2 === "very_easy" || feel2 === "easy" || feel2 === "good_easy");

      if (isEasy) {
        // Immediate weight increase if rated Easy or Very Easy
        overloadType = "increase";
        const possibleJumps = getPossibleWeightJumps(prevW, plates, isPerSide, 4);
        const smallestJump = possibleJumps[0];
        recWeight = smallestJump ? smallestJump.totalWeight : prevW + (isPerSide ? 1.5 : 3.0);
        weightDiff = Math.round((recWeight - prevW) * 10) / 10;
        reason = `Progressive overload: +${weightDiff}kg increase (last session felt ${FEELING_LABELS[feel] || "Easy"})`;
      } else if (isGood && prev2IsGoodOrBetter && Number(prev2.weight) >= prevW) {
        // Increase weight after 2 consecutive 'Good' sessions
        overloadType = "increase";
        const possibleJumps = getPossibleWeightJumps(prevW, plates, isPerSide, 4);
        const smallestJump = possibleJumps[0];
        recWeight = smallestJump ? smallestJump.totalWeight : prevW + (isPerSide ? 1.5 : 3.0);
        weightDiff = Math.round((recWeight - prevW) * 10) / 10;
        reason = `Progressive overload: +${weightDiff}kg increase (rated 'Good' 2 sessions in a row at ${prevW}kg)`;
      } else if (isGood) {
        // First good session -> consolidate at current weight
        recWeight = prevW;
        reason = `Consolidating at ${prevW}kg (1 of 2 'Good' sessions completed before next weight increase)`;
        overloadType = "maintain";
      } else if (feel === "very_hard" || feel === "pain") {
        recWeight = prevW;
        reason = `Maintain ${prevW}kg — last session felt ${FEELING_LABELS[feel] || "very hard"}`;
        overloadType = "maintain";
      } else {
        recWeight = prevW;
        reason = `Maintain ${prevW}kg for current block`;
        overloadType = "maintain";
      }
    } else {
      if (exercise.startValue != null) {
        recWeight = exercise.startValue;
        reason = `Starting plan weight: ${exercise.startValue}kg`;
        overloadType = "initial";
      } else {
        recWeight = null;
        reason = exercise.startLabel || "Bodyweight / Band";
        overloadType = "initial";
      }
    }

    let possibleJumps = [];
    if (recWeight != null && Number.isFinite(recWeight)) {
      const baseW = previous ? Number(previous.weight) : recWeight;
      possibleJumps = getPossibleWeightJumps(baseW, plates, isPerSide, 4);
    }

    return {
      recommendedWeight: recWeight,
      formattedWeight: recWeight != null ? I.z(recWeight, isPerSide) : (exercise.startLabel || "Bodyweight"),
      reason,
      overloadType,
      previousWeight: previous?.weight ?? null,
      possibleJumps,
      plates,
    };
  }

  function EquipmentSection({ personId, data, updateData, showToast }) {
    const config = getEquipmentConfig(data, personId);
    const [selectedPlates, setSelectedPlates] = useState(config.plates);
    const [barbellWeight, setBarbellWeight] = useState(String(config.barbellWeight));
    const [dbHandleWeight, setDbHandleWeight] = useState(String(config.dbHandleWeight));
    const [customPlate, setCustomPlate] = useState("");

    const ALL_COMMON_PLATES = [0.5, 1.25, 1.5, 2.5, 5, 10, 15, 20];

    function togglePlate(weightVal) {
      setSelectedPlates(prev => {
        if (prev.includes(weightVal)) {
          if (prev.length <= 1) return prev;
          return prev.filter(p => p !== weightVal);
        } else {
          return [...prev, weightVal].sort((a, b) => a - b);
        }
      });
    }

    function addCustomPlate() {
      const val = parseFloat(customPlate);
      if (!val || val <= 0) return;
      if (!selectedPlates.includes(val)) {
        setSelectedPlates(prev => [...prev, val].sort((a, b) => a - b));
      }
      setCustomPlate("");
    }

    function saveEquipment() {
      const newConfig = {
        plates: selectedPlates,
        barbellWeight: Number(barbellWeight) || 20,
        dbHandleWeight: Number(dbHandleWeight) || 2,
      };
      saveEquipmentConfig(personId, newConfig, updateData);
      showToast("Equipment & plates updated");
    }

    const bbJumps = getPossibleWeightJumps(Number(barbellWeight) || 20, selectedPlates, false, 5);
    const dbJumps = getPossibleWeightJumps(Number(dbHandleWeight) || 2, selectedPlates, true, 5);

    return h("div", { className: "hg-setting-section" },
      h("h3", null, "Available Weight Plates & Equipment"),
      h("p", null, "Select available weight plates (e.g., 1.5kg, 2.5kg, 5kg) to calculate progressive overload jumps."),
      
      h("div", { className: "hg-field", style: { marginBottom: 12 } },
        h("label", null, "Available Weight Plates (kg)"),
        h("div", { className: "hg-plates-grid" },
          ALL_COMMON_PLATES.map(p => {
            const isSel = selectedPlates.includes(p);
            return h("button", {
              key: p,
              type: "button",
              className: `hg-plate-tag${isSel ? " selected" : ""}`,
              onClick: () => togglePlate(p)
            }, isSel ? `✓ ${p}kg` : `+ ${p}kg`);
          })
        )
      ),

      h("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 } },
        h("input", {
          className: "hg-input",
          type: "number",
          step: ".25",
          placeholder: "Custom plate kg",
          value: customPlate,
          onChange: e => setCustomPlate(e.target.value),
          style: { width: 150 }
        }),
        h(Button, { onClick: addCustomPlate }, "Add plate")
      ),

      h("div", { className: "hg-fields" },
        h(Field, { label: "Empty Barbell Weight (kg)" },
          h("input", { className: "hg-input", type: "number", step: "1", value: barbellWeight, onChange: e => setBarbellWeight(e.target.value) })
        ),
        h(Field, { label: "Dumbbell Handle Weight (kg)" },
          h("input", { className: "hg-input", type: "number", step: ".5", value: dbHandleWeight, onChange: e => setDbHandleWeight(e.target.value) })
        )
      ),

      h("div", { className: "hg-callout", style: { marginTop: 12 } },
        h("strong", null, "Calculated Weight Increases:"),
        h("div", { style: { marginTop: 4, fontSize: 12 } },
          `Barbell (+2 plates): ${bbJumps.map(j => j.label).join(", ")}`,
          h("br"),
          `Dumbbells (per side): ${dbJumps.map(j => j.label).join(", ")}`
        )
      ),

      h("div", { className: "hg-actions" },
        h(Button, { primary: true, onClick: saveEquipment }, "Save equipment")
      )
    );
  }

  function randomHouseholdKey() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  function flattenExercises(session) {
    if (!session || session.type !== "strength") return [];
    return (session.groups || []).flatMap(group =>
      (group.exercises || []).map(exercise => ({ exercise, groupLabel: group.label }))
    );
  }

  function findExercise(data, sessionId, exerciseId) {
    const session = data.sessions.find(item => item.id === sessionId);
    if (!session || session.type !== "strength") return null;
    for (const group of session.groups || []) {
      const exercise = (group.exercises || []).find(item => item.id === exerciseId);
      if (exercise) return { session, group, exercise };
    }
    return null;
  }

  function todaySessions(data) {
    if (!data || !Array.isArray(data.sessions)) return [];
    const today = I.W();
    const monday = I.j(today);
    const day = I.De(today);
    return data.sessions.filter(session => I.ue(data, session, monday) === day);
  }

  function nextScheduled(data) {
    if (!data || !Array.isArray(data.sessions)) return null;
    const today = I.W();
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = I.ae(today, offset);
      const monday = I.j(date);
      const day = I.De(date);
      const session = data.sessions.find(item => I.ue(data, item, monday) === day);
      if (session) return { session, date, day };
    }
    return null;
  }

  function mutateLegacyStyles() {
    const styles = I.o;
    if (!styles || styles.__hg2) return;
    styles.__hg2 = true;
    const surface = "var(--hg-surface)";
    const background = "var(--hg-bg)";
    const border = "1px solid var(--hg-border)";
    const text = "var(--hg-text)";
    const text2 = "var(--hg-text-2)";
    for (const key of ["formCard", "sessionCard", "liftCard", "statCard", "modal"]) {
      if (styles[key]) Object.assign(styles[key], { background: surface, border });
    }
    for (const key of ["input", "select", "daySelect", "targetHint", "noteBox", "restTimer"]) {
      if (styles[key]) Object.assign(styles[key], { background, border, color: text });
    }
    if (styles.smallBtn) Object.assign(styles.smallBtn, { border, color: text2, minHeight: 44 });
    if (styles.primaryBtn) Object.assign(styles.primaryBtn, { minHeight: 46 });
    if (styles.label) styles.label.color = text2;
    if (styles.emptyState) styles.emptyState.color = text2;
    if (styles.sectionTitle) styles.sectionTitle.color = text2;
  }

  mutateLegacyStyles();
  applyTheme(getTheme());

  function Field({ label, full, children }) {
    return h("div", { className: `hg-field${full ? " full" : ""}` },
      h("label", null, label),
      children
    );
  }

  function Button({ children, primary, ghost, danger, ...props }) {
    const classes = ["hg-button"];
    if (primary) classes.push("primary");
    if (ghost) classes.push("ghost");
    if (danger) classes.push("danger");
    return h("button", { type: "button", className: classes.join(" "), ...props }, children);
  }

  function RestTimer({ defaultSeconds, timerEndAt, onTimerChange }) {
    const [duration, setDuration] = useState(defaultSeconds || 90);
    const [now, setNow] = useState(Date.now());
    const remaining = timerEndAt ? Math.max(0, Math.ceil((timerEndAt - now) / 1000)) : duration;
    const wasRunning = useRef(Boolean(timerEndAt));

    useEffect(() => {
      if (!timerEndAt) {
        wasRunning.current = false;
        return undefined;
      }
      const interval = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(interval);
    }, [timerEndAt]);

    useEffect(() => {
      if (timerEndAt && remaining === 0 && wasRunning.current) {
        wasRunning.current = false;
        onTimerChange(null);
        if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
        try {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (Context) {
            const context = new Context();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(.12, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .35);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + .35);
          }
        } catch {}
      }
    }, [remaining, timerEndAt, onTimerChange]);

    function start() {
      wasRunning.current = true;
      setNow(Date.now());
      onTimerChange(Date.now() + duration * 1000);
    }

    return h("div", { className: "hg-timer" },
      h("div", null,
        h("div", { className: "hg-timer-value" },
          `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
        ),
        h("div", { className: "hg-history-meta" }, timerEndAt ? "Resting" : "Rest timer")
      ),
      h("div", { style: { display: "flex", gap: 7, alignItems: "center" } },
        !timerEndAt && h("select", {
          className: "hg-input",
          value: duration,
          "aria-label": "Rest duration",
          style: { width: 88, minHeight: 42, padding: "6px 8px" },
          onChange: event => setDuration(Number(event.target.value)),
        }, [30, 45, 60, 75, 90, 120, 180].map(value =>
          h("option", { key: value, value }, `${value}s`)
        )),
        h(Button, {
          onClick: timerEndAt ? () => onTimerChange(null) : start,
        }, timerEndAt ? "Stop" : "Start")
      )
    );
  }

  function ReadinessInline({ personId, showToast }) {
    const key = `hg_readiness_${personId}`;
    const today = I.W();
    const rawRecords = storageGet(key, []);
    const records = Array.isArray(rawRecords) ? rawRecords : [];
    const current = records.find(item => item.date === today);
    const [open, setOpen] = useState(!current);

    const initialHours = current?.sleepHours != null ? current.sleepHours : (current?.sleep != null ? Math.floor(Number(current.sleep)) : "");
    const initialMins = current?.sleepMins != null ? current.sleepMins : (current?.sleep != null ? Math.round((Number(current.sleep) % 1) * 60) : "");

    const [sleepHours, setSleepHours] = useState(current ? String(initialHours) : "7");
    const [sleepMins, setSleepMins] = useState(current ? String(initialMins) : "30");
    const [soreness, setSoreness] = useState(current ? Number(current.soreness) : 2);
    const [motivation, setMotivation] = useState(current ? Number(current.motivation) : 4);

    function save() {
      const hrs = Number(sleepHours) || 0;
      const mins = Number(sleepMins) || 0;
      if (!sleepHours && !sleepMins) {
        showToast("Add hours and minutes of sleep");
        return;
      }
      const decimalSleep = Math.round((hrs + mins / 60) * 100) / 100;
      const entry = {
        id: current?.id || `read_${Date.now()}`,
        date: today,
        sleep: decimalSleep,
        sleepHours: hrs,
        sleepMins: mins,
        soreness: Number(soreness),
        motivation: Number(motivation),
        notes: "",
        timestamp: Date.now()
      };
      GymCloudEngine.saveReadinessLog(personId, entry);
      storageSet(key, [...records.filter(item => item.date !== today), entry]);
      setOpen(false);
      showToast("Readiness saved");
    }

    const formatSleepSummary = (item) => {
      if (!item) return "";
      const h = item.sleepHours != null ? item.sleepHours : Math.floor(Number(item.sleep) || 0);
      const m = item.sleepMins != null ? item.sleepMins : Math.round(((Number(item.sleep) || 0) % 1) * 60);
      return `${h}h ${m}m sleep`;
    };

    return h("div", { className: "hg-callout" },
      h("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" } },
        h("div", null,
          h("strong", null, "Today's readiness"),
          current && !open && h("div", { className: "hg-history-meta" },
            `${formatSleepSummary(current)} · soreness ${current.soreness} (${SORENESS_MAP[current.soreness] || ""}) · drive ${current.motivation} (${MOTIVATION_MAP[current.motivation] || ""})`
          )
        ),
        h("button", { type: "button", className: "hg-link-button", onClick: () => setOpen(value => !value) },
          open ? "Close" : current ? "Edit" : "Check in"
        )
      ),
      open && h(React.Fragment, null,
        h("div", { className: "hg-fields" },
          h(Field, { label: "Sleep duration", full: true },
            h("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
              h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
                h("input", {
                  className: "hg-input",
                  type: "number",
                  min: "0",
                  max: "24",
                  placeholder: "7",
                  value: sleepHours,
                  onChange: event => setSleepHours(event.target.value)
                }),
                h("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--hg-text-2)" } }, "hrs")
              ),
              h("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1 } },
                h("input", {
                  className: "hg-input",
                  type: "number",
                  min: "0",
                  max: "59",
                  step: "5",
                  placeholder: "30",
                  value: sleepMins,
                  onChange: event => setSleepMins(event.target.value)
                }),
                h("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--hg-text-2)" } }, "mins")
              )
            )
          ),
          h(Field, { label: `Soreness: ${soreness} · ${SORENESS_MAP[soreness] || ""}`, full: true },
            h("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 4 } },
              SORENESS_OPTIONS.map(opt =>
                h("button", {
                  key: opt.val,
                  type: "button",
                  className: `hg-scale-card-btn ${Number(soreness) === opt.val ? "active" : ""}`,
                  onClick: () => setSoreness(opt.val)
                },
                  h("span", { className: "hg-scale-num" }, opt.val),
                  h("span", { className: "hg-scale-name" }, opt.label)
                )
              )
            )
          ),
          h(Field, { label: `Motivation to Train: ${motivation} · ${MOTIVATION_MAP[motivation] || ""}`, full: true },
            h("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 4 } },
              MOTIVATION_OPTIONS.map(opt =>
                h("button", {
                  key: opt.val,
                  type: "button",
                  className: `hg-scale-card-btn ${Number(motivation) === opt.val ? "active" : ""}`,
                  onClick: () => setMotivation(opt.val)
                },
                  h("span", { className: "hg-scale-num" }, opt.val),
                  h("span", { className: "hg-scale-name" }, opt.label)
                )
              )
            )
          )
        ),
        h("div", { className: "hg-actions" }, h(Button, { onClick: save }, "Save readiness"))
      )
    );
  }

  function ChecklistStep({ title, copy, items, checked, onToggle, onNext, onBack, showReadiness, personId, showToast }) {
    return h("div", { className: "hg-card" },
      h("div", { className: "hg-card-title" }, title),
      copy && h("div", { className: "hg-card-copy" }, copy),
      showReadiness && h(ReadinessInline, { personId, showToast }),
      items.length > 0 ? h("div", { className: "hg-checklist" },
        items.map((item, index) => {
          const key = `${title}:${index}`;
          return h("label", { className: "hg-check", key },
            h("input", { type: "checkbox", checked: checked.includes(key), onChange: () => onToggle(key) }),
            h("div", null, h("strong", null, item.name), item.detail && h("span", null, item.detail))
          );
        })
      ) : h("div", { className: "hg-callout" }, "No movements are listed for this step."),
      h("div", { className: "hg-actions" },
        onBack && h(Button, { onClick: onBack }, "Back"),
        h(Button, { primary: true, onClick: onNext }, items.length ? "Done — continue" : "Continue")
      )
    );
  }

  function ExerciseStep({ personId, data, session, item, weekInfo, date, active, setActive, updateData, showToast, onBack, onSkip, onSaved }) {
    const exercise = item.exercise;
    const logsList = Array.isArray(data?.logs) ? data.logs : [];
    const sameDay = logsList.find(log =>
      log.type === "exercise" && log.sessionId === session.id &&
      log.exerciseId === exercise.id && log.date === date
    );
    const previous = [...logsList].filter(log =>
      log.type === "exercise" && log.exerciseId === exercise.id && log.id !== sameDay?.id
    ).sort((a, b) => b.date.localeCompare(a.date))[0];
    const prescribed = parsePrescription(exercise.setsReps);

    const recommendation = getExerciseRecommendation({ exercise, data, weekInfo, personId });

    const initialWeight = sameDay?.weight != null ? String(sameDay.weight) :
      recommendation?.recommendedWeight != null ? String(recommendation.recommendedWeight) :
      previous?.weight != null ? String(previous.weight) : "";

    const [weight, setWeight] = useState(initialWeight);
    const [sets, setSets] = useState(sameDay?.sets != null ? String(sameDay.sets) : prescribed.sets);
    const [reps, setReps] = useState(sameDay?.reps != null ? String(sameDay.reps) : prescribed.reps);
    const [feeling, setFeeling] = useState(sameDay?.feeling || rpeToFeeling(sameDay?.rpe));
    const [notes, setNotes] = useState(sameDay?.notes || "");

    useEffect(() => {
      if (!sameDay && recommendation?.recommendedWeight != null && (weight === "" || weight === undefined)) {
        setWeight(String(recommendation.recommendedWeight));
      }
    }, [exercise.id, sameDay]);

    function save() {
      if (!sets || !reps) {
        showToast("Add sets and reps first");
        return;
      }
      const entry = {
        id: sameDay?.id || `${Date.now()}`,
        type: "exercise",
        sessionId: session.id,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        normalizedName: normalizeExerciseName(exercise.name),
        date,
        weight: I.Ae(weight),
        sets: Number.parseInt(sets, 10),
        reps: Number.parseInt(reps, 10),
        completed: true,
        feeling,
        rpe: sameDay?.rpe ?? null,
        notes: notes.trim(),
        timestamp: Date.now()
      };
      const isPr = I.ye(data.logs, exercise.id, entry);
      GymCloudEngine.saveExerciseLog(personId, entry);
      updateData(personId, current => ({
        ...current,
        logs: sameDay
          ? current.logs.map(log => log.id === sameDay.id ? entry : log)
          : [...current.logs, entry],
      }));
      showToast(isPr ? "New PR! Exercise saved" : "Exercise saved");
      onSaved();
    }

    return h("div", { className: "hg-card" },
      h("div", { className: "hg-section-label", style: { margin: "0 0 7px" } }, item.groupLabel),
      h("div", { className: "hg-exercise-heading" },
        h("div", null,
          h("div", { className: "hg-card-title" }, exercise.name),
          h("div", { className: "hg-card-copy" },
            exercise.setsReps,
            exercise.restNote && exercise.restNote !== "—" ? ` · rest ${exercise.restNote}` : ""
          )
        ),
        h("div", { className: "hg-exercise-target", title: "Target Recommendation" },
          recommendation?.recommendedWeight != null
            ? recommendation.formattedWeight
            : (exercise.startLabel || "Bodyweight")
        )
      ),
      exercise.note && h("div", { className: "hg-callout" }, exercise.note),
      recommendation && recommendation.recommendedWeight != null && h("div", { className: "hg-recommendation-card" },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 } },
          h("div", null,
            h("div", { className: "hg-rec-label" }, "RECOMMENDED WEIGHT (PROGRESSIVE OVERLOAD)"),
            h("div", { className: "hg-rec-weight" }, recommendation.formattedWeight)
          ),
          h("button", {
            type: "button",
            className: "hg-button primary",
            style: { minHeight: 36, padding: "6px 12px", fontSize: 13 },
            onClick: () => setWeight(String(recommendation.recommendedWeight))
          }, "Use " + recommendation.formattedWeight)
        ),
        h("div", { className: "hg-rec-reason" }, recommendation.reason),
        recommendation.possibleJumps && recommendation.possibleJumps.length > 0 && h("div", { className: "hg-rec-jumps" },
          h("span", { className: "hg-rec-jumps-title" }, `Possible increases with your ${recommendation.plates.join("kg, ")}kg plates:`),
          recommendation.possibleJumps.map(j =>
            h("button", {
              key: j.totalWeight,
              type: "button",
              className: `hg-jump-chip${String(weight) === String(j.totalWeight) ? " active" : ""}`,
              onClick: () => setWeight(String(j.totalWeight))
            }, j.label)
          )
        )
      ),
      previous && h("div", { className: "hg-previous" },
        h("strong", null, "Previous performance"),
        h("div", null,
          `${previous.date} · ${previous.weight != null ? I.je(previous.weight, exercise.weightMode === "perSide") + " · " : ""}${previous.sets} × ${previous.reps}${exercise.metric === "seconds" ? " sec" : ""}`,
          previous.feeling ? ` · ${FEELING_LABELS[previous.feeling] || previous.feeling}` :
            previous.rpe != null ? ` · RPE ${previous.rpe}` : ""
        )
      ),
      h("div", { className: "hg-fields" },
        h(Field, { label: `Weight (${exercise.unit}${exercise.weightMode === "perSide" ? " each" : ""})` },
          h("input", { className: "hg-input", type: "text", inputMode: "decimal", value: weight, onChange: event => setWeight(event.target.value), placeholder: recommendation?.formattedWeight || "Weight" })
        ),
        h(Field, { label: "Sets completed" },
          h("input", { className: "hg-input", type: "number", min: 0, value: sets, onChange: event => setSets(event.target.value) })
        ),
        h(Field, { label: exercise.metric === "seconds" ? "Seconds per set" : "Reps per set" },
          h("input", { className: "hg-input", type: "number", min: 0, value: reps, onChange: event => setReps(event.target.value) })
        ),
        h(Field, { label: "How did it feel?" },
          h("select", { className: "hg-input", value: feeling, onChange: event => setFeeling(event.target.value) },
            FEELINGS.map(([value, label]) => h("option", { key: value, value }, label))
          )
        )
      ),
      h("details", { style: { marginTop: 13 } },
        h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex", alignItems: "center" } }, notes ? "Edit note" : "Add optional note"),
        h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value), placeholder: "Anything worth remembering?" })
      ),
      h(RestTimer, {
        defaultSeconds: exercise.restSec || 90,
        timerEndAt: active.timerEndAt || null,
        onTimerChange: timerEndAt => setActive({ ...active, timerEndAt }),
      }),
      h("div", { className: "hg-actions" },
        h(Button, { onClick: onBack }, "Back"),
        h(Button, { ghost: true, onClick: onSkip }, "Skip"),
        h(Button, { primary: true, onClick: save }, sameDay ? "Update & next" : "Save & next")
      )
    );
  }

  function RunStep({ personId, data, session, date, updateData, showToast, onSaved, onSkip }) {
    const sameDay = data.logs.find(log => log.type === "run" && log.sessionId === session.id && log.date === date);
    const [distance, setDistance] = useState(sameDay ? String(sameDay.distance) : String(session.targetKm || ""));
    const [duration, setDuration] = useState(sameDay ? String(sameDay.duration) : "");
    const [effort, setEffort] = useState(sameDay?.effort || "easy");
    const [notes, setNotes] = useState(sameDay?.notes || "");
    const phase = session.runPhases?.[I.Re(data.startDate).cycleWeek <= 4 ? 0 : 1] || session.runPhases?.[0];

    function save() {
      if (!distance || !duration) {
        showToast("Add distance and duration first");
        return;
      }
      const entry = {
        id: sameDay?.id || `${Date.now()}`,
        type: "run",
        sessionId: session.id,
        exerciseId: session.id,
        exerciseName: session.name || "Run",
        normalizedName: normalizeExerciseName(session.name || "run"),
        date,
        distance: Number(distance),
        duration: Number(duration),
        effort,
        notes: notes.trim(),
        timestamp: Date.now()
      };
      GymCloudEngine.saveExerciseLog(personId, entry);
      updateData(personId, current => ({
        ...current,
        logs: sameDay
          ? current.logs.map(log => log.id === sameDay.id ? entry : log)
          : [...current.logs, entry],
      }));
      showToast("Run saved");
      onSaved();
    }

    return h("div", { className: "hg-card" },
      h("div", { className: "hg-card-title" }, session.name),
      h("div", { className: "hg-card-copy" }, session.duration),
      phase && h("div", { className: "hg-callout" },
        h("strong", null, phase.label),
        phase.items.map((item, index) => h("div", { key: index, style: { marginTop: 5 } }, `${item.label}: ${item.value}`))
      ),
      h("div", { className: "hg-fields" },
        h(Field, { label: "Distance (km)" },
          h("input", { className: "hg-input", type: "number", step: ".1", value: distance, onChange: event => setDistance(event.target.value) })
        ),
        h(Field, { label: "Duration (minutes)" },
          h("input", { className: "hg-input", type: "number", value: duration, onChange: event => setDuration(event.target.value) })
        ),
        h(Field, { label: "Effort", full: true },
          h("select", { className: "hg-input", value: effort, onChange: event => setEffort(event.target.value) },
            h("option", { value: "easy" }, "Easy / Zone 2"),
            h("option", { value: "moderate" }, "Moderate"),
            h("option", { value: "hard" }, "Hard / intervals")
          )
        )
      ),
      h("details", { style: { marginTop: 13 } },
        h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, notes ? "Edit note" : "Add optional note"),
        h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value) })
      ),
      h("div", { className: "hg-actions" },
        h(Button, { ghost: true, onClick: onSkip }, "Skip"),
        h(Button, { primary: true, onClick: save }, sameDay ? "Update & finish" : "Save & finish")
      )
    );
  }

  function GuidedWorkout({ personId, data, meta, active, setActive, updateData, showToast, onClose, onHistory }) {
    const session = data.sessions.find(item => item.id === active.sessionId);
    const weekInfo = I.HGgetDeload(personId) === I.j(I.W())
      ? { ...I.Re(data.startDate), isDeload: true }
      : I.Re(data.startDate);
    const exercises = flattenExercises(session);
    const steps = session?.type === "run"
      ? [{ type: "run", key: "run" }, { type: "complete", key: "complete" }]
      : [
          { type: "warmup", key: "warmup" },
          ...exercises.map((item, index) => ({ type: "exercise", key: `exercise:${item.exercise.id}:${index}`, item })),
          { type: "cooldown", key: "cooldown" },
          { type: "complete", key: "complete" },
        ];
    const stepIndex = Math.min(active.step || 0, Math.max(steps.length - 1, 0));
    const step = steps[stepIndex];

    useEffect(() => {
      lockPortrait();
      const onVisible = () => { if (!document.hidden) lockPortrait(); };
      document.addEventListener("visibilitychange", onVisible);
      return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    useEffect(() => { saveActive(personId, active); }, [personId, active]);

    if (!session || !step) {
      saveActive(personId, null);
      return h("div", { className: "hg-workout" },
        h("div", { className: "hg-card hg-empty" },
          h("h2", null, "This workout is no longer in the plan"),
          h(Button, { primary: true, onClick: onClose }, "Return to Today")
        )
      );
    }

    function advance() {
      setActive({ ...active, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function back() {
      setActive({ ...active, step: Math.max(0, stepIndex - 1), timerEndAt: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function skip() {
      const skipped = Array.from(new Set([...(active.skipped || []), step.key]));
      setActive({ ...active, skipped, step: Math.min(stepIndex + 1, steps.length - 1), timerEndAt: null });
      showToast("Skipped — you can go back if needed");
    }

    function toggleCheck(key) {
      const current = active.completedRefs || [];
      setActive({
        ...active,
        completedRefs: current.includes(key) ? current.filter(item => item !== key) : [...current, key],
      });
    }

    function endWorkout() {
      if (!window.confirm("End this workout now? Saved exercises will stay in History.")) return;
      saveActive(personId, null);
      onClose();
    }

    const progress = steps.length <= 1 ? 100 : Math.round((stepIndex / (steps.length - 1)) * 100);
    const logsList = Array.isArray(data?.logs) ? data.logs : [];
    const sessionLogs = logsList.filter(log => log.sessionId === session.id && log.date === active.date);
    const prCount = sessionLogs.filter(log => log.type === "exercise" && I.ye(logsList, log.exerciseId, log)).length;

    return h("div", { className: "hg-workout", style: { "--person-accent": meta.accent } },
      h("div", { className: "hg-workout-top" },
        h("strong", null, session.name),
        step.type !== "complete" && h(Button, { ghost: true, danger: true, onClick: endWorkout }, "End workout")
      ),
      h("div", { className: "hg-progress-track", "aria-label": `${progress}% complete` },
        h("span", { style: { width: `${progress}%` } })
      ),
      h("div", { className: "hg-step-count" },
        step.type === "complete" ? "Workout complete" : `Step ${stepIndex + 1} of ${steps.length - 1}`
      ),
      step.type === "warmup" && h(ChecklistStep, {
        title: "Warm-up",
        copy: "Get ready, then move into the first exercise.",
        items: session.warmup || [],
        checked: active.completedRefs || [],
        onToggle: toggleCheck,
        onNext: advance,
        showReadiness: true,
        personId,
        showToast,
      }),
      step.type === "exercise" && h(ExerciseStep, {
        key: step.key,
        personId, data, session, item: step.item, weekInfo, date: active.date,
        active, setActive, updateData, showToast,
        onBack: back, onSkip: skip, onSaved: advance,
      }),
      step.type === "cooldown" && h(ChecklistStep, {
        title: "Cool-down",
        copy: "Finish the session and give yourself a head start on recovery.",
        items: session.cooldown || [],
        checked: active.completedRefs || [],
        onToggle: toggleCheck,
        onNext: advance,
        onBack: back,
        personId,
        showToast,
      }),
      step.type === "run" && h(RunStep, {
        personId, data, session, date: active.date, updateData, showToast,
        onSaved: advance, onSkip: skip,
      }),
      step.type === "complete" && h("div", { className: "hg-card" },
        h("div", { className: "hg-pill success" }, "Workout complete"),
        h("div", { className: "hg-card-title", style: { marginTop: 12 } }, "Nicely done."),
        h("div", { className: "hg-complete-number" }, sessionLogs.length),
        h("div", { className: "hg-card-copy" },
          session.type === "run" ? "run logged" : `of ${exercises.length} exercises logged`
        ),
        h("div", { className: "hg-stats", style: { marginTop: 16 } },
          h("div", { className: "hg-stat" }, h("span", null, "Duration"), h("strong", null, formatElapsed(active.startedAt))),
          h("div", { className: "hg-stat" }, h("span", null, "PRs"), h("strong", null, prCount))
        ),
        (active.skipped || []).length > 0 && h("div", { className: "hg-callout" },
          `${active.skipped.length} step${active.skipped.length === 1 ? "" : "s"} skipped. The session remains partial until every exercise is logged.`
        ),
        h("div", { className: "hg-actions" },
          h(Button, { onClick: back }, "Go back"),
          h(Button, {
            primary: true,
            onClick: () => {
              saveActive(personId, null);
              onClose();
            },
          }, "Finish"),
          h(Button, {
            onClick: () => {
              saveActive(personId, null);
              onHistory();
            },
          }, "View history")
        )
      )
    );
  }

  function TodayView({ personId, data, meta, active, onStart, updateData, showToast }) {
    const sessions = todaySessions(data);
    const next = nextScheduled(data);
    const today = I.W();
    const monday = I.j(today);
    const todayDay = I.De(today);
    const [sessionToMove, setSessionToMove] = useState(null);
    const [bringToTodayOpen, setBringToTodayOpen] = useState(false);
    const [rearrangeWeekOpen, setRearrangeWeekOpen] = useState(false);
    const sessionsList = Array.isArray(data?.sessions) ? data.sessions : [];
    const otherSessions = sessionsList.filter(session =>
      I.ue(data, session, monday) !== todayDay
    );

    function moveWorkout(session, targetDay) {
      if (!session || !targetDay) return;
      updateData(personId, current => {
        const weekOverrides = I.dt(current, monday, session.id, targetDay);
        return { ...current, weekOverrides };
      });
      setSessionToMove(null);
      setBringToTodayOpen(false);
      setRearrangeWeekOpen(false);
      showToast(`${session.name} moved to ${targetDay === todayDay ? "today" : I._[targetDay]} for this week`);
    }

    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Today"),
        h("p", null, new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))
      ),
      sessions.length === 0 && h("div", { className: "hg-card hg-empty" },
        h("div", { className: "hg-pill success" }, "Rest day"),
        h("h2", { style: { marginTop: 13 } }, "Nothing scheduled today"),
        h("p", null, next ? `Next: ${next.session.name} on ${I._[next.day]}.` : "Your next session will appear here."),
        otherSessions.length > 0 && h("div", { className: "hg-actions", style: { justifyContent: "center" } },
          h(Button, { primary: true, onClick: () => setBringToTodayOpen(true) }, "Move a workout here"),
          h(Button, { onClick: () => setRearrangeWeekOpen(true) }, "Rearrange this week")
        )
      ),
      sessions.map(session => {
        const status = I.Fe(data, session, today, today);
        const count = session.type === "run" ? 1 : flattenExercises(session).length;
        const isActive = active?.sessionId === session.id;
        return h("div", { className: "hg-card", key: session.id },
          h("div", { className: `hg-pill ${status === "done" ? "success" : status === "partial" ? "danger" : ""}` },
            status === "done" ? "Completed" : status === "partial" ? "In progress" : session.badge || "Today's workout"
          ),
          h("div", { className: "hg-card-title", style: { marginTop: 11 } }, session.name),
          h("div", { className: "hg-card-copy" }, session.duration),
          h("div", { className: "hg-meta" },
            h("span", null, session.type === "run" ? `Target ${session.targetKm}km` : `${count} exercises`),
            session.type === "strength" && h("span", null, `${session.groups?.length || 0} groups`)
          ),
          session.notes && h("details", { style: { marginTop: 10 } },
            h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, "Session notes"),
            h("div", { className: "hg-callout", style: { marginTop: 4 } }, session.notes)
          ),
          session.type === "strength" && h("details", { style: { marginTop: 10 } },
            h("summary", { className: "hg-link-button", style: { cursor: "pointer", display: "inline-flex" } }, "Exercises & Recommended Weights"),
            h("div", { className: "hg-callout", style: { marginTop: 4, display: "grid", gap: 6 } },
              flattenExercises(session).map(({ exercise }) => {
                const rec = getExerciseRecommendation({ exercise, data, weekInfo: I.Re(data.startDate), personId });
                return h("div", { key: exercise.id, style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 } },
                  h("span", { style: { fontWeight: 600 } }, exercise.name),
                  h("span", { style: { color: "var(--person-accent, var(--hg-action))", fontWeight: 700, fontFamily: "monospace" } },
                    rec?.recommendedWeight != null ? `Rec: ${rec.formattedWeight}` : (exercise.startLabel || exercise.setsReps)
                  )
                );
              })
            )
          ),
          h("div", { className: "hg-actions" },
            status !== "done" && h(Button, {
              primary: true,
              onClick: () => onStart(session),
            }, isActive ? "Resume workout" : status === "partial" ? "Continue workout" : "Start workout"),
            status !== "done" && h(Button, {
              onClick: () => setSessionToMove(session),
            }, "Move workout"),
            status === "done" && h(Button, { primary: true, onClick: () => onStart(session) }, "Start workout")
          )
        );
      }),
      sessions.length > 0 && h("div", { className: "hg-actions" },
        otherSessions.length > 0 && h(Button, { onClick: () => setBringToTodayOpen(true) }, "Add another workout today"),
        h(Button, { onClick: () => setRearrangeWeekOpen(true) }, "Rearrange this week")
      ),
      sessionToMove && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setSessionToMove(null),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "move-workout-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "move-workout-title" }, "Move workout"),
              h("p", { className: "hg-card-copy" },
                `${sessionToMove.name} is currently on ${I._[I.ue(data, sessionToMove, monday)]}. Choose a new day.`
              )
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setSessionToMove(null),
              "aria-label": "Close workout mover",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "Only this week changes. Choosing an occupied day will put both workouts there; the current day becomes free."
          ),
          h("div", { className: "hg-swap-options" },
            WEEK_DAYS.filter(day => day !== I.ue(data, sessionToMove, monday)).map(day => {
              const workoutsThere = sessionsList.filter(option =>
                option.id !== sessionToMove.id && I.ue(data, option, monday) === day
              );
              return h("button", {
                key: day,
                type: "button",
                className: "hg-swap-option",
                onClick: () => moveWorkout(sessionToMove, day),
              },
                h("span", null,
                  h("strong", null, I._[day]),
                  h("small", null, workoutsThere.length
                    ? `Also scheduled: ${workoutsThere.map(option => option.name).join(", ")}`
                    : "Free slot")
                ),
                h("span", { className: "hg-swap-days" }, workoutsThere.length ? "Double up" : "Move here")
              );
            })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setSessionToMove(null) }, "Cancel")
          )
        )
      ),
      rearrangeWeekOpen && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setRearrangeWeekOpen(false),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "rearrange-week-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "rearrange-week-title" }, "Rearrange this week"),
              h("p", { className: "hg-card-copy" }, "Choose any workout, then choose its new day.")
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setRearrangeWeekOpen(false),
              "aria-label": "Close weekly rearranger",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "You can repeat this as many times as needed. Free slots and doubled-up days are both supported."
          ),
          h("div", { className: "hg-swap-options" },
            [...data.sessions]
              .sort((a, b) =>
                WEEK_DAYS.indexOf(I.ue(data, a, monday)) - WEEK_DAYS.indexOf(I.ue(data, b, monday))
              )
              .map(option => {
                const optionDay = I.ue(data, option, monday);
                return h("button", {
                  key: option.id,
                  type: "button",
                  className: "hg-swap-option",
                  onClick: () => {
                    setRearrangeWeekOpen(false);
                    setSessionToMove(option);
                  },
                },
                  h("span", null,
                    h("strong", null, option.name),
                    h("small", null, option.duration)
                  ),
                  h("span", { className: "hg-swap-days" }, I._[optionDay])
                );
              })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setRearrangeWeekOpen(false) }, "Cancel")
          )
        )
      ),
      bringToTodayOpen && h("div", {
        className: "hg-modal-wrap",
        role: "presentation",
        onClick: () => setBringToTodayOpen(false),
      },
        h("div", {
          className: "hg-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "bring-workout-title",
          onClick: event => event.stopPropagation(),
        },
          h("div", { className: "hg-modal-head" },
            h("div", null,
              h("h2", { id: "bring-workout-title" }, "Add a workout today"),
              h("p", { className: "hg-card-copy" }, sessions.length
                ? "Choose another workout to double up today."
                : "Choose a workout from later this week.")
            ),
            h("button", {
              type: "button",
              className: "hg-icon-button",
              onClick: () => setBringToTodayOpen(false),
              "aria-label": "Close workout picker",
            }, "×")
          ),
          h("div", { className: "hg-callout", style: { marginTop: 0 } },
            "The workout moves here and its original day becomes free. Your usual plan is unchanged."
          ),
          h("div", { className: "hg-swap-options" },
            otherSessions.map(option => {
              const optionDay = I.ue(data, option, monday);
              return h("button", {
                key: option.id,
                type: "button",
                className: "hg-swap-option",
                onClick: () => moveWorkout(option, todayDay),
              },
                h("span", null,
                  h("strong", null, option.name),
                  h("small", null, `${I._[optionDay]} · ${option.duration}`)
                ),
                h("span", { className: "hg-swap-days" }, "Move to today")
              );
            })
          ),
          h("div", { className: "hg-actions" },
            h(Button, { onClick: () => setBringToTodayOpen(false) }, "Cancel")
          )
        )
      )
    );
  }

  function logDisplay(data, log) {
    if (log.type === "run") return `${log.distance}km · ${log.duration} min`;
    const found = findExercise(data, log.sessionId, log.exerciseId);
    const exercise = found?.exercise;
    return `${log.weight != null ? I.je(log.weight, exercise?.weightMode === "perSide") + " · " : ""}${log.sets} × ${log.reps}${exercise?.metric === "seconds" ? " sec" : ""}`;
  }

  function HistoryEditor({ personId, data, initialLog, updateData, showToast, onClose }) {
    const options = [];
    data.sessions.forEach(session => {
      if (session.type === "run") options.push({ value: `${session.id}|run`, label: session.name, session, type: "run" });
      else flattenExercises(session).forEach(({ exercise, groupLabel }) =>
        options.push({ value: `${session.id}|${exercise.id}`, label: `${session.name} — ${exercise.name}`, session, exercise, groupLabel, type: "exercise" })
      );
    });
    const initialValue = initialLog
      ? `${initialLog.sessionId}|${initialLog.type === "run" ? "run" : initialLog.exerciseId}`
      : options[0]?.value || "";
    const [selection, setSelection] = useState(initialValue);
    const selected = options.find(item => item.value === selection) || options[0];
    const [date, setDate] = useState(initialLog?.date || I.W());
    const [weight, setWeight] = useState(initialLog?.weight != null ? String(initialLog.weight) : "");
    const prescribed = parsePrescription(selected?.exercise?.setsReps);
    const [sets, setSets] = useState(initialLog?.sets != null ? String(initialLog.sets) : prescribed.sets);
    const [reps, setReps] = useState(initialLog?.reps != null ? String(initialLog.reps) : prescribed.reps);
    const [feeling, setFeeling] = useState(initialLog?.feeling || rpeToFeeling(initialLog?.rpe));
    const [distance, setDistance] = useState(initialLog?.distance != null ? String(initialLog.distance) : String(selected?.session?.targetKm || ""));
    const [duration, setDuration] = useState(initialLog?.duration != null ? String(initialLog.duration) : "");
    const [effort, setEffort] = useState(initialLog?.effort || "easy");
    const [notes, setNotes] = useState(initialLog?.notes || "");

    useEffect(() => {
      if (!initialLog && selected?.exercise) {
        const parsed = parsePrescription(selected.exercise.setsReps);
        setSets(parsed.sets);
        setReps(parsed.reps);
        const logsList = Array.isArray(data?.logs) ? data.logs : [];
        const previous = [...logsList].filter(log => log.exerciseId === selected.exercise.id).sort((a,b) => b.date.localeCompare(a.date))[0];
        setWeight(previous?.weight != null ? String(previous.weight) : "");
      }
      if (!initialLog && selected?.type === "run") setDistance(String(selected.session.targetKm || ""));
    }, [selection]);

    function save() {
      if (!selected) return;
      let entry;
      if (selected.type === "run") {
        if (!distance || !duration) return showToast("Add distance and duration");
        entry = {
          id: initialLog?.id || `${Date.now()}`, type: "run", sessionId: selected.session.id,
          exerciseId: selected.session.id, exerciseName: selected.session.name || "Run",
          normalizedName: normalizeExerciseName(selected.session.name || "run"),
          date, distance: Number(distance), duration: Number(duration),
          effort, notes: notes.trim(), timestamp: Date.now()
        };
      } else {
        if (!sets || !reps) return showToast("Add sets and reps");
        entry = {
          id: initialLog?.id || `${Date.now()}`, type: "exercise", sessionId: selected.session.id,
          exerciseId: selected.exercise.id, exerciseName: selected.exercise.name,
          normalizedName: normalizeExerciseName(selected.exercise.name),
          date, weight: I.Ae(weight), sets: Number(sets),
          reps: Number(reps), completed: true, feeling, rpe: initialLog?.rpe ?? null, notes: notes.trim(),
          timestamp: Date.now()
        };
      }
      GymCloudEngine.saveExerciseLog(personId, entry);
      updateData(personId, current => ({
        ...current,
        logs: initialLog ? current.logs.map(log => log.id === initialLog.id ? entry : log) : [...current.logs, entry],
      }));
      showToast(initialLog ? "Entry updated" : "Entry added");
      onClose();
    }

    return h("div", { className: "hg-modal-wrap", onClick: onClose },
      h("div", { className: "hg-modal", onClick: event => event.stopPropagation() },
        h("div", { className: "hg-modal-head" },
          h("h2", null, initialLog ? "Edit history" : "Add past entry"),
          h("button", { className: "hg-icon-button", type: "button", onClick: onClose, "aria-label": "Close" }, "×")
        ),
        h("div", { className: "hg-fields" },
          h(Field, { label: "Activity", full: true },
            h("select", { className: "hg-input", value: selection, disabled: Boolean(initialLog), onChange: event => setSelection(event.target.value) },
              options.map(option => h("option", { key: option.value, value: option.value }, option.label))
            )
          ),
          h(Field, { label: "Date", full: true },
            h("input", { className: "hg-input", type: "date", value: date, onChange: event => setDate(event.target.value) })
          ),
          selected?.type === "run" ? h(React.Fragment, null,
            h(Field, { label: "Distance (km)" }, h("input", { className: "hg-input", type: "number", step: ".1", value: distance, onChange: event => setDistance(event.target.value) })),
            h(Field, { label: "Duration (minutes)" }, h("input", { className: "hg-input", type: "number", value: duration, onChange: event => setDuration(event.target.value) })),
            h(Field, { label: "Effort", full: true },
              h("select", { className: "hg-input", value: effort, onChange: event => setEffort(event.target.value) },
                h("option", { value: "easy" }, "Easy / Zone 2"),
                h("option", { value: "moderate" }, "Moderate"),
                h("option", { value: "hard" }, "Hard / intervals")
              )
            )
          ) : h(React.Fragment, null,
            h(Field, { label: "Weight" }, h("input", { className: "hg-input", type: "text", inputMode: "decimal", value: weight, onChange: event => setWeight(event.target.value) })),
            h(Field, { label: "Sets" }, h("input", { className: "hg-input", type: "number", value: sets, onChange: event => setSets(event.target.value) })),
            h(Field, { label: selected?.exercise?.metric === "seconds" ? "Seconds" : "Reps" }, h("input", { className: "hg-input", type: "number", value: reps, onChange: event => setReps(event.target.value) })),
            h(Field, { label: "How did it feel?" },
              h("select", { className: "hg-input", value: feeling, onChange: event => setFeeling(event.target.value) },
                FEELINGS.map(([value, label]) => h("option", { key: value, value }, label))
              )
            )
          ),
          h(Field, { label: "Optional note", full: true },
            h("textarea", { className: "hg-input", value: notes, onChange: event => setNotes(event.target.value) })
          )
        ),
        h("div", { className: "hg-actions" },
          h(Button, { primary: true, onClick: save }, initialLog ? "Save changes" : "Add entry"),
          h(Button, { onClick: onClose }, "Cancel")
        )
      )
    );
  }

  function HistoryView({ personId, data, updateData, showToast }) {
    const [editor, setEditor] = useState(null);
    const logsList = Array.isArray(data?.logs) ? data.logs : [];
    const sorted = [...logsList].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 50);

    function remove(log) {
      if (!window.confirm("Delete this history entry? This cannot be undone.")) return;
      GymCloudEngine.deleteExerciseLog(personId, log.id);
      updateData(personId, current => ({ ...current, logs: (current?.logs || []).filter(item => item.id !== log.id) }));
      showToast("Entry deleted");
    }

    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "History"),
        h("p", null, "Review workouts or add a manual and backdated entry.")
      ),
      h("div", { className: "hg-actions", style: { margin: "0 0 16px" } },
        h(Button, { primary: true, onClick: () => setEditor({ mode: "new" }) }, "Add past entry")
      ),
      sorted.length === 0 ? h("div", { className: "hg-card hg-empty" },
        h("h2", null, "No workouts logged yet"),
        h("p", null, "Completed exercises will appear here.")
      ) : h("div", { className: "hg-card" },
        sorted.map(log => {
          const found = log.type === "exercise" ? findExercise(data, log.sessionId, log.exerciseId) : null;
          const session = (data?.sessions || []).find(item => item.id === log.sessionId);
          return h("div", { className: "hg-history-row", key: log.id },
            h("div", null,
              h("div", { className: "hg-history-result" }, log.type === "run" ? (session?.name || log.exerciseName || "Run") : (found?.exercise?.name || log.exerciseName || log.exerciseId)),
              h("div", null, logDisplay(data, log)),
              h("div", { className: "hg-history-meta" },
                `${log.date}${log.feeling ? ` · ${FEELING_LABELS[log.feeling] || log.feeling}` : log.rpe != null ? ` · RPE ${log.rpe}` : ""}${log.type === "run" ? ` · ${log.effort}` : ""}`
              ),
              log.notes && h("div", { className: "hg-history-meta" }, log.notes)
            ),
            h("div", null,
              h("button", { className: "hg-link-button", type: "button", onClick: () => setEditor({ mode: "edit", log }) }, "Edit"),
              h("button", { className: "hg-link-button", type: "button", style: { color: "var(--hg-danger)" }, onClick: () => remove(log) }, "Delete")
            )
          );
        })
      ),
      editor && h(HistoryEditor, {
        personId, data, initialLog: editor.log || null, updateData, showToast,
        onClose: () => setEditor(null),
      })
    );
  }

  // --- Chart & Metrics Components (HIG Compliant with Axes & Grids) ---

  function WeightTrendChart({ records, accent }) {
    if (!records || records.length < 2) return null;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const weights = sorted.map(r => Number(r.weight));
    const minW = Math.floor(Math.min(...weights) - 0.5);
    const maxW = Math.ceil(Math.max(...weights) + 0.5);
    const rangeW = maxW - minW || 1;

    const width = 360;
    const height = 180;
    const padLeft = 46;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 32;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const getX = index => padLeft + (index / (sorted.length - 1)) * plotW;
    const getY = val => padTop + plotH - ((val - minW) / rangeW) * plotH;

    const points = sorted.map((r, i) => `${getX(i).toFixed(1)},${getY(Number(r.weight)).toFixed(1)}`).join(" ");

    // Y axis ticks (3-4 grid lines)
    const yTicks = [minW, minW + rangeW / 2, maxW];

    // X axis ticks (first, middle, last dates)
    const xIndices = sorted.length === 2 ? [0, 1] : [0, Math.floor(sorted.length / 2), sorted.length - 1];

    return h("div", { className: "hg-chart-wrap" },
      h("svg", { viewBox: `0 0 ${width} ${height}`, className: "hg-svg-chart" },
        // Grid lines & Y-axis labels
        yTicks.map((tick, idx) => {
          const y = getY(tick);
          return h("g", { key: idx },
            h("line", { x1: padLeft, y1: y, x2: width - padRight, y2: y, stroke: "var(--hg-border)", strokeDasharray: "3,3", strokeWidth: 1 }),
            h("text", { x: padLeft - 8, y: y + 4, textAnchor: "end", fontSize: 11, fill: "var(--hg-text-3)", fontFamily: "system-ui, sans-serif" }, `${tick.toFixed(1)}kg`)
          );
        }),
        // X-axis baseline
        h("line", { x1: padLeft, y1: padTop + plotH, x2: width - padRight, y2: padTop + plotH, stroke: "var(--hg-border-strong)", strokeWidth: 1.5 }),
        // X-axis date labels
        xIndices.map(idx => {
          const item = sorted[idx];
          const x = getX(idx);
          const dateLabel = item.date.slice(5); // MM-DD
          return h("text", {
            key: idx,
            x,
            y: height - 10,
            textAnchor: idx === 0 ? "start" : idx === sorted.length - 1 ? "end" : "middle",
            fontSize: 11,
            fill: "var(--hg-text-3)",
            fontFamily: "system-ui, sans-serif"
          }, dateLabel);
        }),
        // Area under curve
        h("polygon", {
          points: `${padLeft},${padTop + plotH} ${points} ${getX(sorted.length - 1)},${padTop + plotH}`,
          fill: accent,
          fillOpacity: 0.12
        }),
        // Polyline
        h("polyline", { points, fill: "none", stroke: accent, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }),
        // Data dots
        sorted.map((r, i) =>
          h("circle", {
            key: i,
            cx: getX(i),
            cy: getY(Number(r.weight)),
            r: 3.5,
            fill: accent,
            stroke: "var(--hg-surface)",
            strokeWidth: 1.5
          })
        )
      )
    );
  }

  function ReadinessTrendsChart({ records, accent }) {
    if (!records || records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    if (sorted.length < 2) return null;

    const width = 360;
    const height = 180;
    const padLeft = 40;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 32;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const getX = index => padLeft + (index / (sorted.length - 1)) * plotW;
    const getYSleep = val => padTop + plotH - (Math.min(12, Math.max(4, val)) - 4) / 8 * plotH;
    const getYScore = val => padTop + plotH - ((Math.min(5, Math.max(1, val)) - 1) / 4) * plotH;

    const sleepPoints = sorted.map((r, i) => `${getX(i).toFixed(1)},${getYSleep(Number(r.sleep) || 7).toFixed(1)}`).join(" ");
    const sorePoints = sorted.map((r, i) => `${getX(i).toFixed(1)},${getYScore(Number(r.soreness) || 3).toFixed(1)}`).join(" ");
    const motPoints = sorted.map((r, i) => `${getX(i).toFixed(1)},${getYScore(Number(r.motivation) || 3).toFixed(1)}`).join(" ");

    const xIndices = sorted.length === 2 ? [0, 1] : [0, Math.floor(sorted.length / 2), sorted.length - 1];

    return h("div", { className: "hg-chart-wrap" },
      h("div", { className: "hg-chart-legend" },
        h("span", { className: "hg-legend-item" }, h("span", { style: { background: "#38BDF8" } }), "Sleep (hrs)"),
        h("span", { className: "hg-legend-item" }, h("span", { style: { background: "#F0728C" } }), "Soreness (1-5)"),
        h("span", { className: "hg-legend-item" }, h("span", { style: { background: "#4ADE80" } }), "Motivation (1-5)")
      ),
      h("svg", { viewBox: `0 0 ${width} ${height}`, className: "hg-svg-chart" },
        // Grid lines for scores 1 to 5
        [1, 3, 5].map(score => {
          const y = getYScore(score);
          return h("g", { key: score },
            h("line", { x1: padLeft, y1: y, x2: width - padRight, y2: y, stroke: "var(--hg-border)", strokeDasharray: "3,3", strokeWidth: 1 }),
            h("text", { x: padLeft - 6, y: y + 4, textAnchor: "end", fontSize: 10, fill: "var(--hg-text-3)" }, `${score}`)
          );
        }),
        h("line", { x1: padLeft, y1: padTop + plotH, x2: width - padRight, y2: padTop + plotH, stroke: "var(--hg-border-strong)", strokeWidth: 1.5 }),
        xIndices.map(idx => {
          const item = sorted[idx];
          return h("text", {
            key: idx,
            x: getX(idx),
            y: height - 10,
            textAnchor: idx === 0 ? "start" : idx === sorted.length - 1 ? "end" : "middle",
            fontSize: 11,
            fill: "var(--hg-text-3)"
          }, item.date.slice(5));
        }),
        // Lines
        h("polyline", { points: sleepPoints, fill: "none", stroke: "#38BDF8", strokeWidth: 2 }),
        h("polyline", { points: sorePoints, fill: "none", stroke: "#F0728C", strokeWidth: 2, strokeDasharray: "4,2" }),
        h("polyline", { points: motPoints, fill: "none", stroke: "#4ADE80", strokeWidth: 2 }),
        // Dots
        sorted.map((r, i) => h("circle", { key: `s-${i}`, cx: getX(i), cy: getYSleep(Number(r.sleep) || 7), r: 3, fill: "#38BDF8" })),
        sorted.map((r, i) => h("circle", { key: `sr-${i}`, cx: getX(i), cy: getYScore(Number(r.soreness) || 3), r: 3, fill: "#F0728C" })),
        sorted.map((r, i) => h("circle", { key: `m-${i}`, cx: getX(i), cy: getYScore(Number(r.motivation) || 3), r: 3, fill: "#4ADE80" }))
      )
    );
  }

  function MetricsView({ meta, personId, data, showToast }) {
    const [subTab, setSubTab] = useState("weight"); // "weight" | "readiness"
    const weightKey = `hg_metrics_${personId}`;
    const readinessKey = `hg_readiness_${personId}`;

    const [weights, setWeights] = useState(() => {
      const w = storageGet(weightKey, []);
      return Array.isArray(w) ? w : [];
    });
    const [readiness, setReadiness] = useState(() => {
      const r = storageGet(readinessKey, []);
      return Array.isArray(r) ? r : [];
    });

    useEffect(() => {
      const w = storageGet(weightKey, []);
      const r = storageGet(readinessKey, []);
      setWeights(Array.isArray(w) ? w : []);
      setReadiness(Array.isArray(r) ? r : []);
    }, [personId]);

    const [weightDate, setWeightDate] = useState(I.W());
    const [weightVal, setWeightVal] = useState("");
    const [weightNote, setWeightNote] = useState("");

    function logWeight() {
      if (!weightVal) return showToast("Enter a weight value");
      const num = parseFloat(weightVal);
      if (Number.isNaN(num)) return showToast("Invalid weight number");
      const entry = {
        id: I.HGuid ? I.HGuid("metric") : `w_${Date.now()}`,
        date: weightDate,
        weight: num,
        note: weightNote.trim(),
        timestamp: Date.now()
      };
      GymCloudEngine.saveBodyweightLog(personId, entry);
      const curWeights = Array.isArray(weights) ? weights : [];
      const next = [...curWeights.filter(w => w.date !== weightDate), entry].sort((a, b) => a.date.localeCompare(b.date));
      setWeights(next);
      storageSet(weightKey, next);
      showToast("Body weight logged");
      setWeightVal("");
      setWeightNote("");
    }

    function deleteWeight(id) {
      GymCloudEngine.deleteBodyweightLog(personId, id);
      const next = (Array.isArray(weights) ? weights : []).filter(w => w.id !== id);
      setWeights(next);
      storageSet(weightKey, next);
      showToast("Weight entry deleted");
    }

    function deleteReadiness(id) {
      GymCloudEngine.deleteReadinessLog(personId, id);
      const next = (Array.isArray(readiness) ? readiness : []).filter(r => r.id !== id);
      setReadiness(next);
      storageSet(readinessKey, next);
      showToast("Readiness entry deleted");
    }

    const sortedWeights = [...(Array.isArray(weights) ? weights : [])].sort((a, b) => a.date.localeCompare(b.date));
    const latestW = sortedWeights.length ? sortedWeights[sortedWeights.length - 1] : null;
    const earliestW = sortedWeights.length ? sortedWeights[0] : null;
    const diffW = latestW && earliestW && latestW !== earliestW ? Math.round((latestW.weight - earliestW.weight) * 10) / 10 : 0;

    const sortedReadiness = [...readiness].sort((a, b) => a.date.localeCompare(b.date));
    const latestR = sortedReadiness.length ? sortedReadiness[sortedReadiness.length - 1] : null;

    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Metrics & Trends"),
        h("p", null, `Tracking body weight, sleep, soreness, and motivation for ${meta.label}.`)
      ),

      h("div", { className: "hg-segment", style: { marginBottom: 18 }, role: "group", "aria-label": "Metrics tab" },
        h("button", {
          type: "button",
          "aria-pressed": subTab === "weight",
          onClick: () => setSubTab("weight")
        }, "Body Weight"),
        h("button", {
          type: "button",
          "aria-pressed": subTab === "readiness",
          onClick: () => setSubTab("readiness")
        }, "Sleep & Readiness")
      ),

      subTab === "weight" && h(React.Fragment, null,
        h("div", { className: "hg-card" },
          h("div", { className: "hg-card-title" }, "Log Body Weight"),
          h("div", { className: "hg-fields" },
            h(Field, { label: "Date" },
              h("input", { className: "hg-input", type: "date", value: weightDate, onChange: e => setWeightDate(e.target.value) })
            ),
            h(Field, { label: "Weight (kg)" },
              h("input", { className: "hg-input", type: "number", step: "0.1", placeholder: "e.g. 74.5", value: weightVal, onChange: e => setWeightVal(e.target.value) })
            ),
            h(Field, { label: "Note (optional)", full: true },
              h("input", { className: "hg-input", type: "text", placeholder: "Time of day, digestion, hydration...", value: weightNote, onChange: e => setWeightNote(e.target.value) })
            )
          ),
          h("div", { className: "hg-actions" },
            h(Button, { primary: true, onClick: logWeight }, "Save weigh-in")
          )
        ),

        latestW && h("div", { className: "hg-stats", style: { marginTop: 14 } },
          h("div", { className: "hg-stat" },
            h("span", null, "Latest weight"),
            h("strong", null, `${latestW.weight} kg`)
          ),
          h("div", { className: "hg-stat" },
            h("span", null, "Net change"),
            h("strong", { style: { color: diffW < 0 ? "var(--hg-success)" : diffW > 0 ? "var(--hg-danger)" : "inherit" } },
              `${diffW > 0 ? "+" : ""}${diffW} kg`
            )
          )
        ),

        sortedWeights.length >= 2 && h("div", { className: "hg-card", style: { marginTop: 14 } },
          h("div", { className: "hg-card-title" }, "Weight Trend & Axis"),
          h("div", { className: "hg-card-copy" }, "Historical weigh-in curve with clear grid scale and date references."),
          h(WeightTrendChart, { records: sortedWeights, accent: meta.accent })
        ),

        h("div", { className: "hg-card", style: { marginTop: 14 } },
          h("div", { className: "hg-card-title" }, "Weight History"),
          sortedWeights.length === 0 ? h("p", { className: "hg-card-copy" }, "No weigh-ins logged yet.") :
          h("div", null,
            [...sortedWeights].reverse().map(w =>
              h("div", { key: w.id, className: "hg-history-row" },
                h("div", null,
                  h("div", { className: "hg-history-result" }, `${w.weight} kg`),
                  h("div", { className: "hg-history-meta" }, w.date),
                  w.note && h("div", { className: "hg-history-meta", style: { fontStyle: "italic" } }, w.note)
                ),
                h("button", {
                  type: "button",
                  className: "hg-link-button",
                  style: { color: "var(--hg-danger)" },
                  onClick: () => deleteWeight(w.id)
                }, "Delete")
              )
            )
          )
        )
      ),

      subTab === "readiness" && h(React.Fragment, null,
        latestR && h("div", { className: "hg-stats", style: { marginBottom: 14 } },
          h("div", { className: "hg-stat" },
            h("span", null, "Latest sleep"),
            h("strong", null, `${latestR.sleepHours ?? Math.floor(latestR.sleep)}h ${latestR.sleepMins ?? Math.round((latestR.sleep % 1) * 60)}m`)
          ),
          h("div", { className: "hg-stat" },
            h("span", null, "Soreness (1-5)"),
            h("strong", null, `${latestR.soreness} · ${SORENESS_MAP[latestR.soreness] || ""}`)
          ),
          h("div", { className: "hg-stat" },
            h("span", null, "Motivation (1-5)"),
            h("strong", null, `${latestR.motivation} · ${MOTIVATION_MAP[latestR.motivation] || ""}`)
          )
        ),

        sortedReadiness.length >= 2 && h("div", { className: "hg-card" },
          h("div", { className: "hg-card-title" }, "Readiness Trends (Last 14 days)"),
          h("div", { className: "hg-card-copy" }, "Comparison of sleep duration against soreness and motivation scores."),
          h(ReadinessTrendsChart, { records: sortedReadiness, accent: meta.accent })
        ),

        h("div", { className: "hg-card", style: { marginTop: 14 } },
          h("div", { className: "hg-card-title" }, "Readiness Log History"),
          sortedReadiness.length === 0 ? h("p", { className: "hg-card-copy" }, "No readiness check-ins logged yet.") :
          h("div", null,
            [...sortedReadiness].reverse().map(r =>
              h("div", { key: r.id, className: "hg-history-row" },
                h("div", null,
                  h("div", { className: "hg-history-result" },
                    `${r.sleepHours ?? Math.floor(r.sleep)}h ${r.sleepMins ?? Math.round((r.sleep % 1) * 60)}m sleep`
                  ),
                  h("div", { className: "hg-history-meta" },
                    `${r.date} · Soreness: ${r.soreness}/5 (${SORENESS_MAP[r.soreness] || ""}) · Motivation: ${r.motivation}/5 (${MOTIVATION_MAP[r.motivation] || ""})`
                  )
                ),
                h("button", {
                  type: "button",
                  className: "hg-link-button",
                  style: { color: "var(--hg-danger)" },
                  onClick: () => deleteReadiness(r.id)
                }, "Delete")
              )
            )
          )
        )
      )
    );
  }

  function ProgressView({ personId, data, meta, weekInfo, showToast }) {
    const streak = I.HGcurrentStreak ? I.HGcurrentStreak(data) : 0;
    const logsList = Array.isArray(data?.logs) ? data.logs : [];
    const completed = logsList.filter(log => log.date.slice(0, 7) === I.W().slice(0, 7)).length;
    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Progress"),
        h("p", null, "Consistency, personal bests, and exercise trends.")
      ),
      h("div", { className: "hg-stats" },
        h("div", { className: "hg-stat" }, h("span", null, "Week streak"), h("strong", null, streak)),
        h("div", { className: "hg-stat" }, h("span", null, "Logs this month"), h("strong", null, completed))
      ),
      h("div", { className: "hg-legacy-wrap" },
        h(I.Ct, { meta, data, weekInfo })
      )
    );
  }

  function PlanView({ personId, data, store, meta, updateData, showToast }) {
    return h(React.Fragment, null,
      h("div", { className: "hg-view-header" },
        h("h1", null, "Plan"),
        h("p", null, "Schedule, progression, deloads, backups, and plan editing.")
      ),
      h("div", { className: "hg-card", style: { marginBottom: 18 } },
        h("div", { className: "hg-card-title" }, "Sub-Collection Cloud Engine & Continuity"),
        h("div", { className: "hg-card-copy" },
          "Exercise logs, 1RM progression, readiness, and weight logs are strictly decoupled from your workout plan. Updating or swapping your .json routine updates your active program without purging or resetting your history."
        ),
        h("div", { className: "hg-actions" },
          h(Button, {
            onClick: async () => {
              showToast("Syncing & linking history to current routine…");
              await runLegacyDataRecoveryAndMigration();
              const exMap = new Map();
              data.sessions.forEach(s => s.groups?.forEach(g => g.exercises?.forEach(ex => {
                if (ex) exMap.set(normalizeExerciseName(ex.name), ex);
              })));
              let linked = 0;
              const reLinked = (data.logs || []).map(l => {
                const norm = normalizeExerciseName(l.exerciseName || l.exerciseId);
                const matched = exMap.get(norm);
                if (matched) {
                  linked++;
                  return { ...l, exerciseId: matched.id, exerciseName: matched.name, normalizedName: norm };
                }
                return l;
              });
              updateData(personId, c => ({ ...c, logs: reLinked }));
              reLinked.forEach(l => GymCloudEngine.saveExerciseLog(personId, l));
              showToast(`History linked & synced: ${linked} matching logs connected to current routine`);
            }
          }, "Re-link History & Sync Sub-Collections")
        )
      ),
      h(EquipmentSection, { personId, data, updateData, showToast }),
      h("div", { className: "hg-card", style: { marginBottom: 18 } },
        h("div", { className: "hg-card-title" }, "Recovery controls"),
        h("div", { className: "hg-card-copy" }, "Use a manual deload when fatigue is unusually high."),
        h("div", { className: "hg-actions" },
          h(Button, {
            onClick: () => {
              const monday = I.j(I.W());
              const active = I.HGgetDeload(personId) === monday;
              I.HGsetDeload(personId, active ? null : monday);
              showToast(active ? "Deload override cleared" : "Deload set for this week");
            },
          }, I.HGgetDeload(personId) === I.j(I.W()) ? "Clear this week's deload" : "Deload this week")
        )
      ),
      h("div", { className: "hg-legacy-wrap" },
        h(I.Et, { meta, personId, store, data, updateData, showToast })
      )
    );
  }

  function SettingsModal({ personId, store, pin, syncStatus, updateData, onSaveKey, onClose, showToast }) {
    const [theme, setTheme] = useState(getTheme());
    const [key, setKey] = useState(pin || "");
    const [elliottStart, setElliottStart] = useState(store?.elliott?.startDate || "2026-09-07");
    const [chloeStart, setChloeStart] = useState(store?.chloe?.startDate || "2026-09-07");
    const [reminderHour, setReminderHour] = useState(() => storageGet(`hg_reminderhour_${personId}`, 9));
    const [enabling, setEnabling] = useState(false);

    function chooseTheme(value) {
      setTheme(value);
      applyTheme(value);
    }

    function saveDates() {
      updateData("elliott", data => ({ ...data, startDate: elliottStart }));
      updateData("chloe", data => ({ ...data, startDate: chloeStart }));
      showToast("Program dates updated");
    }

    async function enableNotifications() {
      setEnabling(true);
      const ok = window.HG_enableNotifications
        ? await window.HG_enableNotifications(personId, reminderHour, key)
        : false;
      storageSet(`hg_reminderhour_${personId}`, reminderHour);
      setEnabling(false);
      showToast(ok ? "Notifications enabled" : "Notifications could not be enabled");
    }

    return h("div", { className: "hg-modal-wrap", onClick: onClose },
      h("div", { className: "hg-modal", onClick: event => event.stopPropagation() },
        h("div", { className: "hg-modal-head" },
          h("h2", null, "Settings"),
          h("button", { type: "button", className: "hg-icon-button", onClick: onClose, "aria-label": "Close settings" }, "×")
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Appearance"),
          h("p", null, "Follow this phone or choose a fixed theme."),
          h("div", { className: "hg-segment", role: "group", "aria-label": "Appearance" },
            ["system", "light", "dark"].map(value =>
              h("button", { key: value, type: "button", "aria-pressed": theme === value, onClick: () => chooseTheme(value) },
                value[0].toUpperCase() + value.slice(1)
              )
            )
          )
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Household sync key"),
          h("p", null,
            `${syncStatus === "synced" ? "Synced." : syncStatus === "connecting" ? "Connecting…" : "Local only."} Use the same private key on both phones. It is no longer published with the app.`
          ),
          h("div", { className: "hg-key-row" },
            h("input", { className: "hg-input", type: "text", value: key, onChange: event => setKey(event.target.value.trim()), placeholder: "Enter or generate a private key" }),
            h(Button, { onClick: () => setKey(randomHouseholdKey()) }, "Generate")
          ),
          h("div", { className: "hg-actions" },
            h(Button, { primary: true, disabled: !key, onClick: () => onSaveKey(key) }, "Save & sync"),
            key && h(Button, {
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(key);
                  showToast("Household key copied");
                } catch { showToast("Could not copy the key"); }
              },
            }, "Copy key")
          )
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Program start dates"),
          h("div", { className: "hg-fields" },
            h(Field, { label: "Elliott" }, h("input", { className: "hg-input", type: "date", value: elliottStart, onChange: event => setElliottStart(event.target.value) })),
            h(Field, { label: "Chloe" }, h("input", { className: "hg-input", type: "date", value: chloeStart, onChange: event => setChloeStart(event.target.value) }))
          ),
          h("div", { className: "hg-actions" }, h(Button, { onClick: saveDates }, "Save dates"))
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Workout reminder"),
          h("p", null, `Enable a reminder for ${I.ie[personId].label} on this phone.`),
          h("div", { className: "hg-key-row" },
            h("select", { className: "hg-input", value: reminderHour, onChange: event => setReminderHour(Number(event.target.value)) },
              Array.from({ length: 24 }, (_, hour) => h("option", { key: hour, value: hour }, `${String(hour).padStart(2, "0")}:00`))
            ),
            h(Button, { disabled: enabling || !key, onClick: enableNotifications }, enabling ? "Enabling…" : "Enable")
          )
        ),
        h(EquipmentSection, { personId, data: store[personId], updateData, showToast })
      )
    );
  }

  function Header({ personId, setPersonId, syncStatus, onSettings }) {
    return h("header", { className: "hg-header" },
      h("div", { className: "hg-brand" },
        h("div", { className: "hg-eyebrow" }, syncStatus === "synced" ? "Synced" : syncStatus === "connecting" ? "Connecting" : "Home training"),
        h("div", { className: "hg-brand-name" },
          "Home Gym",
          h("span", { className: "hg-version-tag" }, APP_VERSION)
        )
      ),
      h("div", { className: "hg-header-actions" },
        h("div", { className: "hg-person-switch", role: "group", "aria-label": "Person" },
          I.J.map(id => h("button", {
            key: id,
            type: "button",
            "aria-pressed": personId === id,
            onClick: () => setPersonId(id),
            style: personId === id ? { background: I.ie[id].accent } : null,
          }, I.ie[id].label))
        ),
        h("button", { type: "button", className: "hg-icon-button", onClick: onSettings, "aria-label": "Settings" }, "⚙")
      )
    );
  }

  function Navigation({ view, setView, mobile }) {
    const className = mobile ? "hg-bottom-nav" : "hg-sidebar";
    const element = mobile ? "nav" : "aside";
    return h(element, { className, "aria-label": "Main navigation" },
      NAV.map(([id, icon, label]) => h("button", {
        key: id,
        type: "button",
        "aria-current": view === id ? "page" : undefined,
        onClick: () => setView(id),
      }, mobile ? h(React.Fragment, null, h("span", { "aria-hidden": "true" }, icon), label) : label))
    );
  }

  function UpdateNotice() {
    const [available, setAvailable] = useState(Boolean(window.HG_UPDATE_AVAILABLE));
    useEffect(() => {
      const listener = () => setAvailable(true);
      window.addEventListener("hg-update-available", listener);
      return () => window.removeEventListener("hg-update-available", listener);
    }, []);
    if (!available) return null;
    return h("div", { className: "hg-update", role: "status" },
      h("div", null, h("strong", null, "Update available"), h("div", { className: "hg-history-meta" }, "Install the newest HomeGym version.")),
      h(Button, { primary: true, onClick: () => window.HG_applyUpdate?.() }, "Update now")
    );
  }

  function getInitialActiveProfile() {
    const candidateKeys = [
      "hg_active_profile",
      "activeProfile",
      "currentProfile",
      "hg_selected_person"
    ];
    try {
      for (const k of candidateKeys) {
        const val = localStorage.getItem(k);
        if (val && I.J && I.J.includes(val)) {
          return val;
        }
      }
      // Default to 'elliott' if null or missing
      localStorage.setItem("hg_active_profile", "elliott");
      localStorage.setItem("activeProfile", "elliott");
      localStorage.setItem("currentProfile", "elliott");
      localStorage.setItem("hg_selected_person", "elliott");
    } catch (e) {}
    return "elliott";
  }

  function App() {
    const [personId, setPersonIdState] = useState(getInitialActiveProfile);
    const [store, setStore] = useState(() => ({
      elliott: loadDecoupledProfile("elliott"),
      chloe: loadDecoupledProfile("chloe")
    }));
    const [view, setView] = useState("today");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [toast, setToast] = useState("");
    const [pin, setPin] = useState(I.qe());
    const [syncStatus, setSyncStatus] = useState(pin ? "connecting" : "local-only");
    const [authEpoch, setAuthEpoch] = useState(0);
    const [active, setActiveState] = useState(() => loadActive(getInitialActiveProfile()));
    const dbRef = useRef(null);
    const toastTimer = useRef(null);

    // Asynchronous background migration routine:
    // Runs safely after initial UI render without blocking boot or awaiting cloud promises
    useEffect(() => {
      const timer = setTimeout(() => {
        runLegacyDataRecoveryAndMigration().then(recovered => {
          if (recovered && (recovered.elliott?.length || recovered.chloe?.length)) {
            setStore(current => {
              const nextElliott = recovered.elliott?.length
                ? { ...current.elliott, logs: mergeDeduplicatedLogs(current.elliott?.logs || [], recovered.elliott) }
                : current.elliott;
              const nextChloe = recovered.chloe?.length
                ? { ...current.chloe, logs: mergeDeduplicatedLogs(current.chloe?.logs || [], recovered.chloe) }
                : current.chloe;
              return { elliott: nextElliott, chloe: nextChloe };
            });
          }
        }).catch(err => {
          console.warn("[v2.3.1] Background migration notice:", err?.message);
        });
      }, 150);
      return () => clearTimeout(timer);
    }, []);

    // Direct profile-based cloud sync with sub-collections gym_users/{profileId}
    // No failing anonymous auth calls!
    useEffect(() => {
      const handleRemoteUpdate = (id, subCollection, remoteData) => {
        setStore(current => {
          if (!current[id]) return current;
          const currentProfile = current[id];
          if (subCollection === "exercise_logs") {
            const mergedLogs = mergeDeduplicatedLogs(currentProfile.logs || [], remoteData);
            const next = { ...currentProfile, logs: mergedLogs, updatedAt: Date.now() };
            I.Ee(id, next);
            return { ...current, [id]: next };
          }
          if (subCollection === "active_program") {
            // Decoupled: Updating active program MUST NEVER overwrite exercise history
            const next = {
              ...currentProfile,
              startDate: remoteData.startDate || currentProfile.startDate,
              goals: remoteData.goals || currentProfile.goals,
              resumeNote: remoteData.resumeNote || currentProfile.resumeNote,
              sessions: remoteData.sessions || currentProfile.sessions,
              weekOverrides: remoteData.weekOverrides || currentProfile.weekOverrides,
              equipment: remoteData.equipment || currentProfile.equipment,
              updatedAt: Date.now()
            };
            I.Ee(id, next);
            return { ...current, [id]: next };
          }
          return current;
        });
      };

      const unsubElliott = GymCloudEngine.subscribe(
        "elliott",
        (subCol, data) => handleRemoteUpdate("elliott", subCol, data),
        status => setSyncStatus(status)
      );

      const unsubChloe = GymCloudEngine.subscribe(
        "chloe",
        (subCol, data) => handleRemoteUpdate("chloe", subCol, data),
        status => setSyncStatus(status)
      );

      const timeout = setTimeout(() => {
        setSyncStatus(prev => (prev === "connecting" ? "local-only" : prev));
      }, 5000);

      return () => {
        unsubElliott();
        unsubChloe();
        clearTimeout(timeout);
      };
    }, []);

    useEffect(() => {
      setActiveState(loadActive(personId));
    }, [personId]);

    const showToast = useCallback(message => {
      setToast(message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2800);
    }, []);

    const updateData = useCallback((id, updater) => {
      setStore(current => {
        if (!current[id]) return current;
        const currentProfile = current[id];
        const updated = updater(currentProfile);

        // Decoupled preservation: NEVER purge or overwrite exercise history, readiness, or weight logs
        const preservedLogs = (Array.isArray(updated.logs) && updated.logs.length > 0)
          ? mergeDeduplicatedLogs(currentProfile.logs || [], updated.logs)
          : (currentProfile.logs || []);

        const next = {
          ...updated,
          logs: preservedLogs,
          updatedAt: Date.now()
        };

        // Save active program to sub-collection
        GymCloudEngine.saveActiveProgram(id, next);

        // Mirror to local storage
        I.Ee(id, next);

        return { ...current, [id]: next };
      });
    }, []);

    function setPersonId(id) {
      if (!I.J.includes(id)) return;
      try {
        localStorage.setItem("hg_active_profile", id);
        localStorage.setItem("activeProfile", id);
        localStorage.setItem("currentProfile", id);
        localStorage.setItem("hg_selected_person", id);
      } catch {}
      setPersonIdState(id);
      setView("today");
    }

    function setActive(value) {
      setActiveState(value);
      saveActive(personId, value);
    }

    function startWorkout(session) {
      const existing = loadActive(personId);
      if (existing?.sessionId === session.id && existing.date === I.W()) {
        setActive(existing);
      } else {
        const profile = (store && store[personId]) || loadDecoupledProfile(personId);
        const status = I.Fe ? I.Fe(profile, session, I.W(), I.W()) : "not_started";
        const currentLogs = Array.isArray(profile?.logs) ? profile.logs : [];
        const firstIncomplete = session.type === "strength"
          ? flattenExercises(session).findIndex(({ exercise }) =>
              !currentLogs.some(log => log.sessionId === session.id && log.exerciseId === exercise.id && log.date === I.W())
            )
          : -1;
        setActive({
          schemaVersion: 1,
          sessionId: session.id,
          date: I.W(),
          step: status === "partial" && firstIncomplete >= 0 ? firstIncomplete + 1 : 0,
          skipped: [],
          completedRefs: [],
          startedAt: Date.now(),
          timerEndAt: null,
        });
      }
      lockPortrait();
    }

    function saveHouseholdKey(value) {
      I.Je(value);
      setPin(value);
      GymCloudEngine.saveActiveProgram("elliott", store.elliott);
      GymCloudEngine.saveActiveProgram("chloe", store.chloe);
      setSettingsOpen(false);
      showToast("Settings saved & sub-collections synced");
    }

    const rawData = (store && store[personId]) ? store[personId] : loadDecoupledProfile(personId);
    const data = (rawData && Array.isArray(rawData.sessions)) ? rawData : loadDecoupledProfile(personId);
    if (!data) return null;
    const meta = (I.ie && I.ie[personId]) ? I.ie[personId] : { name: personId, accent: "#2563EB" };
    const weekInfo = (I.HGgetDeload && I.HGgetDeload(personId) === I.j(I.W()))
      ? { ...(I.Re ? I.Re(data.startDate) : {}), isDeload: true }
      : (I.Re ? I.Re(data.startDate) : {});

    if (active) {
      return h("div", { className: "hg-app", style: { "--person-accent": meta.accent } },
        h(GuidedWorkout, {
          personId, data, meta, active, setActive, updateData, showToast,
          onClose: () => setActive(null),
          onHistory: () => { setActive(null); setView("history"); },
        }),
        toast && h("div", { className: "hg-toast", role: "status" }, toast),
        h(UpdateNotice)
      );
    }

    let content;
    if (view === "today") content = h(TodayView, { personId, data, meta, active, onStart: startWorkout, updateData, showToast });
    if (view === "history") content = h(HistoryView, { personId, data, updateData, showToast });
    if (view === "progress") content = h(ProgressView, { personId, data, meta, weekInfo, showToast });
    if (view === "metrics") content = h(MetricsView, { meta, personId, data, showToast });
    if (view === "plan") content = h(PlanView, { personId, data, store, meta, updateData, showToast });

    return h("div", { className: "hg-app", style: { "--person-accent": meta.accent } },
      h("div", { className: "hg-app-shell" },
        h(Header, { personId, setPersonId, syncStatus, onSettings: () => setSettingsOpen(true) }),
        h("div", { className: "hg-layout" },
          h(Navigation, { view, setView, mobile: false }),
          h("main", { className: "hg-main" }, content)
        ),
        h(Navigation, { view, setView, mobile: true })
      ),
      settingsOpen && h(SettingsModal, {
        personId, store, pin, syncStatus, updateData,
        onSaveKey: saveHouseholdKey,
        onClose: () => setSettingsOpen(false),
        showToast,
      }),
      toast && h("div", { className: "hg-toast", role: "status" }, toast),
      h(UpdateNotice)
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(h(App));
})();
