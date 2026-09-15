(function () {
  "use strict";

  const I = window.HG_INTERNALS;
  if (!I || !window.React || !window.ReactDOM) {
    document.getElementById("root").textContent = "Home Gym could not start. Please close and reopen the app.";
    return;
  }

  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef, useMemo } = React;
  const APP_VERSION = "v2.5.0";

  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
      console.error("[HIG ErrorBoundary]", this.props.title || "Component", error, errorInfo);
    }
    render() {
      if (this.state.hasError) {
        if (this.props.fallback) return this.props.fallback;
        return h("div", { className: "hg-hig-error-card" },
          h("div", { className: "hg-hig-error-icon" }, "!"),
          h("h2", { className: "hg-alert-title" }, this.props.title || "Display Error"),
          h("p", { className: "hg-alert-copy" },
            this.state.error?.message || "An unexpected issue occurred while rendering this section."
          ),
          h("div", { className: "hg-alert-actions" },
            h("button", {
              type: "button",
              className: "hg-alert-btn",
              onClick: () => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
              }
            }, "Try Again"),
            h("button", {
              type: "button",
              className: "hg-alert-btn danger",
              onClick: () => window.location.reload()
            }, "Reload App")
          )
        );
      }
      return this.props.children;
    }
  }
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

const PLATEPLAN_V1_KEY = "plateplan_v1";
  const QUEUE_STORAGE_KEY = "plateplan_offline_queue";
  const DEAD_LETTER_QUEUE_KEY = "plateplan_dead_letter_queue";
  const MAX_QUEUE_RETRIES = 3;
  let isProcessingOfflineQueue = false;

  function getPlatePlanV1Local() {
    try {
      const raw = localStorage.getItem(PLATEPLAN_V1_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function savePlatePlanV1Local(userId, data) {
    if (!userId || !data) return;
    try {
      let existing = getPlatePlanV1Local();
      if (!existing || typeof existing !== "object") {
        existing = { version: "2.5.0", updatedAt: Date.now(), users: {} };
      }
      if (!existing.users || typeof existing.users !== "object") {
        existing.users = {};
      }
      const prevUser = existing.users[userId] || {};
      existing.users[userId] = {
        ...prevUser,
        ...data,
        updatedAt: data.updatedAt || Date.now()
      };
      existing.updatedAt = Date.now();
      localStorage.setItem(PLATEPLAN_V1_KEY, JSON.stringify(existing));
      localStorage.setItem(`${PLATEPLAN_V1_KEY}_${userId}`, JSON.stringify(existing.users[userId]));
    } catch (e) {
      console.warn("savePlatePlanV1Local error:", e?.message);
    }
  }

  function getOfflineQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveOfflineQueue(queue) {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue || []));
    } catch (e) {}
  }

  function getDeadLetterQueue() {
    try {
      const raw = localStorage.getItem(DEAD_LETTER_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveDeadLetterQueue(queue) {
    try {
      localStorage.setItem(DEAD_LETTER_QUEUE_KEY, JSON.stringify(queue || []));
    } catch (e) {}
  }

  function moveToDeadLetterQueue(item, reason) {
    try {
      const dlq = getDeadLetterQueue();
      const deadItem = {
        ...(item || {}),
        failedAt: Date.now(),
        reason: reason || item?.lastError || "Exceeded maximum retry threshold (3) or bad mutation schema"
      };
      dlq.push(deadItem);
      if (dlq.length > 100) dlq.splice(0, dlq.length - 100);
      saveDeadLetterQueue(dlq);
      console.warn(`[PlatePlan Offline Queue] Moved mutation ${item?.id || "unknown"} (${item?.type || "unknown"}) to dead-letter queue:`, reason);
    } catch (e) {}
  }

  function enqueueOfflineMutation(userId, type, payload) {
    const queue = getOfflineQueue();
    const mutation = {
      id: "mut_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      userId,
      type,
      payload,
      retryCount: 0,
      timestamp: Date.now()
    };
    queue.push(mutation);
    saveOfflineQueue(queue);
    console.log(`[PlatePlan Offline Queue] Enqueued ${type} for ${userId} (${queue.length} pending mutations)`);
    return mutation;
  }

  const PlatePlanSyncEngine = {
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

    getOfflineQueue,
    saveOfflineQueue,
    getDeadLetterQueue,
    saveDeadLetterQueue,
    moveToDeadLetterQueue,
    enqueueOfflineMutation,

    async processOfflineQueue(onProgress) {
      if (isProcessingOfflineQueue) {
        return { processed: 0, remaining: getOfflineQueue().length, busy: true };
      }
      if (!navigator.onLine) {
        return { processed: 0, remaining: getOfflineQueue().length };
      }
      const fs = this.getFirestore();
      if (!fs) return { processed: 0, remaining: getOfflineQueue().length };

      const queue = getOfflineQueue();
      if (!queue.length) return { processed: 0, remaining: 0 };

      isProcessingOfflineQueue = true;
      console.log(`[PlatePlan Offline Queue] Draining ${queue.length} offline mutations...`);
      const failed = [];
      let processed = 0;

      for (const item of queue) {
        if (!item || typeof item !== "object") {
          console.warn("[PlatePlan Offline Queue] Discarding null/non-object mutation from queue");
          continue;
        }

        const { userId, type, payload } = item;
        if (!userId || !type || !payload || typeof payload !== "object") {
          moveToDeadLetterQueue(item, "Missing required fields (userId, type, or payload)");
          continue;
        }

        // Schema validation: record mutations must have an id
        if (!payload.id && type !== "save_program" && type !== "save_plateplan") {
          moveToDeadLetterQueue(item, `Missing payload.id for mutation type: ${type}`);
          continue;
        }

        try {
          if (type === "save_log") {
            const clean = { ...payload, updatedAt: payload.updatedAt || Date.now() };
            await fs.collection("gym_users").doc(userId).collection("logs").doc(String(clean.id)).set(clean, { merge: true });
            await fs.collection("gym_users").doc(userId).collection("exercise_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
            processed++;
          } else if (type === "delete_log") {
            await fs.collection("gym_users").doc(userId).collection("logs").doc(String(payload.id)).delete();
            await fs.collection("gym_users").doc(userId).collection("exercise_logs").doc(String(payload.id)).delete().catch(() => {});
            processed++;
          } else if (type === "save_program" || type === "save_plateplan") {
            const clean = { ...payload, updatedAt: payload.updatedAt || Date.now() };
            await fs.collection("gym_users").doc(userId).collection("active_program").doc("current").set(clean, { merge: true });
            await fs.collection("gym_users").doc(userId).collection("plateplan").doc("current").set(clean, { merge: true }).catch(() => {});
            processed++;
          } else if (type === "save_readiness") {
            const clean = { ...payload, updatedAt: payload.updatedAt || Date.now() };
            // Primary path: gym_users/{userId}/readiness
            await fs.collection("gym_users").doc(userId).collection("readiness").doc(String(clean.id)).set(clean, { merge: true });
            await fs.collection("gym_users").doc(userId).collection("readiness_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
            processed++;
          } else if (type === "delete_readiness") {
            await fs.collection("gym_users").doc(userId).collection("readiness").doc(String(payload.id)).delete();
            await fs.collection("gym_users").doc(userId).collection("readiness_logs").doc(String(payload.id)).delete().catch(() => {});
            processed++;
          } else if (type === "save_bodyweight") {
            const clean = { ...payload, updatedAt: payload.updatedAt || Date.now() };
            // Primary path: gym_users/{userId}/bodyweight
            await fs.collection("gym_users").doc(userId).collection("bodyweight").doc(String(clean.id)).set(clean, { merge: true });
            await fs.collection("gym_users").doc(userId).collection("bodyweight_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
            processed++;
          } else if (type === "delete_bodyweight") {
            await fs.collection("gym_users").doc(userId).collection("bodyweight").doc(String(payload.id)).delete();
            await fs.collection("gym_users").doc(userId).collection("bodyweight_logs").doc(String(payload.id)).delete().catch(() => {});
            processed++;
          } else if (type === "save_sleep") {
            const clean = { ...payload, updatedAt: payload.updatedAt || Date.now() };
            // Primary path: gym_users/{userId}/sleep
            await fs.collection("gym_users").doc(userId).collection("sleep").doc(String(clean.id)).set(clean, { merge: true });
            processed++;
          } else if (type === "delete_sleep") {
            await fs.collection("gym_users").doc(userId).collection("sleep").doc(String(payload.id)).delete();
            processed++;
          } else {
            moveToDeadLetterQueue(item, `Unrecognized mutation type: ${type}`);
          }
        } catch (err) {
          const retries = (item.retryCount || 0) + 1;
          item.retryCount = retries;
          item.lastError = err?.message || String(err);
          item.lastAttempt = Date.now();

          if (retries >= MAX_QUEUE_RETRIES) {
            console.warn(`[PlatePlan Offline Queue] Mutation ${item.id} (${item.type}) failed after ${retries} attempts (${item.lastError}). Moved to dead-letter queue.`);
            moveToDeadLetterQueue(item, `Exceeded ${MAX_QUEUE_RETRIES} attempts: ${item.lastError}`);
          } else {
            console.warn(`[PlatePlan Offline Queue] Mutation ${item.id} (${item.type}) attempt ${retries}/${MAX_QUEUE_RETRIES} failed:`, item.lastError);
            failed.push(item);
          }
        }
      }

      saveOfflineQueue(failed);
      isProcessingOfflineQueue = false;

      if (processed > 0) {
        console.info(`[PlatePlan Offline Queue] Successfully synced ${processed} mutation(s) to Firestore. Remaining: ${failed.length}`);
        onProgress?.({ processed, remaining: failed.length });
      }
      return { processed, remaining: failed.length };
    },

    async saveExerciseLog(profileId, log, options = {}) {
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

      // 1. Immediately update local offline cache: plateplan_v1 & data:${profileId}
      try {
        const currentProfile = loadDecoupledProfile(profileId);
        const existingLogs = Array.isArray(currentProfile.logs) ? currentProfile.logs : [];
        const updatedLogs = existingLogs.some(l => l.id === clean.id)
          ? existingLogs.map(l => l.id === clean.id ? clean : l)
          : [...existingLogs, clean];
        const updatedProfile = { ...currentProfile, logs: updatedLogs, updatedAt: Date.now() };
        savePlatePlanV1Local(profileId, updatedProfile);
        I.Ee(profileId, updatedProfile);
      } catch (e) {
        console.warn("Local cache write:", e);
      }

      // 2. Offline check
      if (!navigator.onLine) {
        if (!options.skipQueue) {
          enqueueOfflineMutation(profileId, "save_log", clean);
        }
        return clean;
      }

      // 3. Online: write to Firestore gym_users/{userId}/logs and exercise_logs
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("logs").doc(String(clean.id)).set(clean, { merge: true });
          await fs.collection("gym_users").doc(profileId).collection("exercise_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
        } catch (e) {
          console.warn("Firestore saveExerciseLog error, enqueuing offline mutation:", e?.message);
          if (!options.skipQueue) {
            enqueueOfflineMutation(profileId, "save_log", clean);
          }
        }
      } else {
        if (!options.skipQueue) {
          enqueueOfflineMutation(profileId, "save_log", clean);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/logs/${clean.id}`).set(clean);
          await rtdb.ref(`gym_users/${profileId}/exercise_logs/${clean.id}`).set(clean).catch(() => {});
        } catch (e) {}
      }

      return clean;
    },

    async deleteExerciseLog(profileId, logId, options = {}) {
      if (!profileId || !logId) return;

      // 1. Immediately update local offline cache
      try {
        const currentProfile = loadDecoupledProfile(profileId);
        const existingLogs = Array.isArray(currentProfile.logs) ? currentProfile.logs : [];
        const updatedLogs = existingLogs.filter(l => l.id !== logId);
        const updatedProfile = { ...currentProfile, logs: updatedLogs, updatedAt: Date.now() };
        savePlatePlanV1Local(profileId, updatedProfile);
        I.Ee(profileId, updatedProfile);
      } catch (e) {}

      // 2. Offline check
      if (!navigator.onLine) {
        if (!options.skipQueue) {
          enqueueOfflineMutation(profileId, "delete_log", { id: logId });
        }
        return;
      }

      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("logs").doc(String(logId)).delete();
          await fs.collection("gym_users").doc(profileId).collection("exercise_logs").doc(String(logId)).delete().catch(() => {});
        } catch (e) {
          if (!options.skipQueue) {
            enqueueOfflineMutation(profileId, "delete_log", { id: logId });
          }
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/logs/${logId}`).remove();
          await rtdb.ref(`gym_users/${profileId}/exercise_logs/${logId}`).remove().catch(() => {});
        } catch (e) {}
      }
    },

    async saveReadinessLog(profileId, log, options = {}) {
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

      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_readiness", clean);
        return clean;
      }

      const fs = this.getFirestore();
      if (fs) {
        try {
          // Primary subcollection path: gym_users/{profileId}/readiness
          await fs.collection("gym_users").doc(profileId).collection("readiness").doc(String(clean.id)).set(clean, { merge: true });
          await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_readiness", clean);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/readiness/${clean.id}`).set(clean).catch(() => {});
          await rtdb.ref(`gym_users/${profileId}/readiness_logs/${clean.id}`).set(clean).catch(() => {});
        } catch (e) {}
      }

      // Automatically mirror to sleep collection if hours/totalHours provided
      if (clean.sleep != null || clean.sleepHours != null) {
        const sleepDoc = {
          id: `slp_${clean.date}`,
          date: clean.date,
          hours: clean.sleepHours != null ? clean.sleepHours : Math.floor(clean.sleep),
          mins: clean.sleepMins != null ? clean.sleepMins : Math.round((clean.sleep % 1) * 60),
          totalHours: clean.sleep,
          notes: clean.notes || "",
          timestamp: clean.timestamp,
          updatedAt: clean.updatedAt
        };
        this.saveSleepLog(profileId, sleepDoc, { skipQueue: options.skipQueue }).catch(() => {});
      }

      return clean;
    },

    async deleteReadinessLog(profileId, logId, options = {}) {
      if (!profileId || !logId) return;
      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_readiness", { id: logId });
        return;
      }
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("readiness").doc(String(logId)).delete();
          await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(logId)).delete().catch(() => {});
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_readiness", { id: logId });
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/readiness/${logId}`).remove().catch(() => {});
          await rtdb.ref(`gym_users/${profileId}/readiness_logs/${logId}`).remove().catch(() => {});
        } catch (e) {}
      }
    },

    async saveBodyweightLog(profileId, log, options = {}) {
      if (!profileId || !log || !log.id) return;
      const clean = {
        id: String(log.id),
        date: log.date || I.W(),
        weight: Number(log.weight),
        note: log.note || "",
        timestamp: log.timestamp || Date.now(),
        updatedAt: Date.now()
      };

      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_bodyweight", clean);
        return clean;
      }

      const fs = this.getFirestore();
      if (fs) {
        try {
          // Primary subcollection path: gym_users/{profileId}/bodyweight
          await fs.collection("gym_users").doc(profileId).collection("bodyweight").doc(String(clean.id)).set(clean, { merge: true });
          await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(clean.id)).set(clean, { merge: true }).catch(() => {});
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_bodyweight", clean);
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/bodyweight/${clean.id}`).set(clean).catch(() => {});
          await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${clean.id}`).set(clean).catch(() => {});
        } catch (e) {}
      }
      return clean;
    },

    async deleteBodyweightLog(profileId, logId, options = {}) {
      if (!profileId || !logId) return;
      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_bodyweight", { id: logId });
        return;
      }
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("bodyweight").doc(String(logId)).delete();
          await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(logId)).delete().catch(() => {});
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_bodyweight", { id: logId });
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/bodyweight/${logId}`).remove().catch(() => {});
          await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${logId}`).remove().catch(() => {});
        } catch (e) {}
      }
    },

    async saveSleepLog(profileId, log, options = {}) {
      if (!profileId || !log || !log.id) return;
      const hours = log.hours != null ? Number(log.hours) : (log.totalHours != null ? Math.floor(Number(log.totalHours)) : 7);
      const mins = log.mins != null ? Number(log.mins) : (log.totalHours != null ? Math.round((Number(log.totalHours) % 1) * 60) : 30);
      const totalHours = log.totalHours != null ? Number(log.totalHours) : Math.round((hours + mins / 60) * 100) / 100;
      const clean = {
        id: String(log.id),
        date: log.date || I.W(),
        hours,
        mins,
        totalHours,
        notes: log.notes || log.note || "",
        timestamp: log.timestamp || Date.now(),
        updatedAt: Date.now()
      };

      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_sleep", clean);
        return clean;
      }

      const fs = this.getFirestore();
      if (fs) {
        try {
          // Primary subcollection path: gym_users/{profileId}/sleep
          await fs.collection("gym_users").doc(profileId).collection("sleep").doc(String(clean.id)).set(clean, { merge: true });
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_sleep", clean);
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/sleep/${clean.id}`).set(clean); } catch (e) {}
      }
      return clean;
    },

    async deleteSleepLog(profileId, logId, options = {}) {
      if (!profileId || !logId) return;
      if (!navigator.onLine) {
        if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_sleep", { id: logId });
        return;
      }
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("sleep").doc(String(logId)).delete();
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_sleep", { id: logId });
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/sleep/${logId}`).remove(); } catch (e) {}
      }
    },

    async saveActiveProgram(profileId, programData, options = {}) {
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

      // 1. Immediately cache locally
      try {
        const currentProfile = loadDecoupledProfile(profileId);
        const next = { ...currentProfile, ...payload, updatedAt: Date.now() };
        savePlatePlanV1Local(profileId, next);
        I.Ee(profileId, next);
      } catch (e) {}

      // 2. Offline check
      if (!navigator.onLine) {
        if (!options.skipQueue) {
          enqueueOfflineMutation(profileId, "save_program", payload);
        }
        return payload;
      }

      // 3. Online: write to active_program and plateplan
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("gym_users").doc(profileId).collection("active_program").doc("current").set(payload, { merge: true });
          await fs.collection("gym_users").doc(profileId).collection("plateplan").doc("current").set(payload, { merge: true }).catch(() => {});
        } catch (e) {
          console.warn("Firestore saveActiveProgram error, enqueuing:", e?.message);
          if (!options.skipQueue) {
            enqueueOfflineMutation(profileId, "save_program", payload);
          }
        }
      } else {
        if (!options.skipQueue) {
          enqueueOfflineMutation(profileId, "save_program", payload);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`gym_users/${profileId}/active_program/current`).set(payload);
          await rtdb.ref(`gym_users/${profileId}/plateplan/current`).set(payload).catch(() => {});
        } catch (e) {}
      }

      return payload;
    },

    async saveProgramToSubcollection(userId, program) {
      if (!userId || !program) return;
      const programId = String(program.id || program.programId || `prog_${Date.now()}`);
      const payload = {
        id: programId,
        programId: programId,
        name: program.name || "Custom Workout Program",
        description: program.description || "",
        frequency: program.frequency || (Array.isArray(program.sessions) ? `${program.sessions.length} days/week` : "3 days/week"),
        startDate: program.startDate || (I.j && I.W ? I.j(I.W()) : "2026-09-14"),
        sessions: Array.isArray(program.sessions) ? program.sessions : [],
        weekOverrides: program.weekOverrides || {},
        equipment: program.equipment || null,
        updatedAt: Date.now(),
        createdAt: program.createdAt || Date.now()
      };

      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("users").doc(userId).collection("programs").doc(programId).set(payload, { merge: true });
          await fs.collection("gym_users").doc(userId).collection("programs").doc(programId).set(payload, { merge: true }).catch(() => {});
        } catch (e) {
          console.warn("Firestore saveProgramToSubcollection error:", e?.message);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`users/${userId}/programs/${programId}`).set(payload);
          await rtdb.ref(`gym_users/${userId}/programs/${programId}`).set(payload).catch(() => {});
        } catch (e) {}
      }

      try {
        const storedKey = `hg_programs_${userId}`;
        const existing = JSON.parse(localStorage.getItem(storedKey) || "[]");
        const filtered = Array.isArray(existing) ? existing.filter(p => p.id !== programId) : [];
        filtered.unshift(payload);
        localStorage.setItem(storedKey, JSON.stringify(filtered));
      } catch (e) {}

      return payload;
    },

    async loadProgramsFromSubcollection(userId) {
      if (!userId) return [];
      const list = [];
      const seen = new Set();
      const fs = this.getFirestore();
      if (fs) {
        try {
          const snap = await fs.collection("users").doc(userId).collection("programs").get();
          snap.forEach(doc => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              list.push({ id: doc.id, ...doc.data() });
            }
          });
        } catch (e) {
          console.warn("Firestore loadProgramsFromSubcollection error:", e?.message);
        }
      }
      try {
        const local = JSON.parse(localStorage.getItem(`hg_programs_${userId}`) || "[]");
        if (Array.isArray(local)) {
          local.forEach(p => {
            if (p?.id && !seen.has(p.id)) {
              seen.add(p.id);
              list.push(p);
            }
          });
        }
      } catch (e) {}
      return list;
    },

    async deleteProgramFromSubcollection(userId, programId) {
      if (!userId || !programId) return;
      const fs = this.getFirestore();
      if (fs) {
        try {
          await fs.collection("users").doc(userId).collection("programs").doc(programId).delete();
          await fs.collection("gym_users").doc(userId).collection("programs").doc(programId).delete().catch(() => {});
        } catch (e) {}
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          await rtdb.ref(`users/${userId}/programs/${programId}`).remove();
        } catch (e) {}
      }
      try {
        const storedKey = `hg_programs_${userId}`;
        const existing = JSON.parse(localStorage.getItem(storedKey) || "[]");
        const filtered = Array.isArray(existing) ? existing.filter(p => p.id !== programId) : [];
        localStorage.setItem(storedKey, JSON.stringify(filtered));
      } catch (e) {}
    },

    /**
     * Automated Two-Way Sync Strategy:
     * - Queries Firestore collection gym_users/{userId}/logs and gym_users/{userId}/plateplan
     * - Compares local localStorage timestamps (plateplan_v1) against Firestore document timestamps
     * - If localStorage contains newer/missing entries, pushes them to Firestore
     * - If Firestore contains newer entries, hydrates localStorage
     */
    async syncPlatePlanWithFirestore(userId, showToast) {
      if (!userId) return null;
      if (!navigator.onLine) {
        console.log(`[PlatePlan Sync] Device offline; using offline cache for ${userId}.`);
        return loadDecoupledProfile(userId);
      }

      const fs = this.getFirestore();
      if (!fs) return null;

      try {
        // 1. Process any pending offline mutations first
        await this.processOfflineQueue();

        // 2. Fetch remote documents including health metric collections
        const [
          logsSnap, legacyLogsSnap, plateplanDoc, activeProgDoc,
          readinessSnap, legacyReadSnap,
          bwSnap, legacyBwSnap,
          sleepSnap
        ] = await Promise.allSettled([
          fs.collection("gym_users").doc(userId).collection("logs").get(),
          fs.collection("gym_users").doc(userId).collection("exercise_logs").get(),
          fs.collection("gym_users").doc(userId).collection("plateplan").doc("current").get(),
          fs.collection("gym_users").doc(userId).collection("active_program").doc("current").get(),
          fs.collection("gym_users").doc(userId).collection("readiness").get(),
          fs.collection("gym_users").doc(userId).collection("readiness_logs").get(),
          fs.collection("gym_users").doc(userId).collection("bodyweight").get(),
          fs.collection("gym_users").doc(userId).collection("bodyweight_logs").get(),
          fs.collection("gym_users").doc(userId).collection("sleep").get()
        ]);

        const remoteLogsMap = new Map();
        if (logsSnap.status === "fulfilled" && logsSnap.value) {
          logsSnap.value.forEach(doc => {
            const d = doc.data();
            const id = String(d.id || doc.id);
            remoteLogsMap.set(id, { ...d, id });
          });
        }
        if (legacyLogsSnap.status === "fulfilled" && legacyLogsSnap.value) {
          legacyLogsSnap.value.forEach(doc => {
            const d = doc.data();
            const id = String(d.id || doc.id);
            if (!remoteLogsMap.has(id)) {
              remoteLogsMap.set(id, { ...d, id });
            }
          });
        }

        // Remote Readiness
        const remoteReadinessMap = new Map();
        const ingestReadiness = (snap) => {
          if (snap && snap.forEach) {
            snap.forEach(doc => {
              const d = doc.data();
              const id = String(d.id || doc.id);
              remoteReadinessMap.set(id, { ...d, id });
            });
          }
        };
        if (readinessSnap.status === "fulfilled" && readinessSnap.value) ingestReadiness(readinessSnap.value);
        if (legacyReadSnap.status === "fulfilled" && legacyReadSnap.value) ingestReadiness(legacyReadSnap.value);

        // Remote Bodyweight
        const remoteBwMap = new Map();
        const ingestBw = (snap) => {
          if (snap && snap.forEach) {
            snap.forEach(doc => {
              const d = doc.data();
              const id = String(d.id || doc.id);
              remoteBwMap.set(id, { ...d, id });
            });
          }
        };
        if (bwSnap.status === "fulfilled" && bwSnap.value) ingestBw(bwSnap.value);
        if (legacyBwSnap.status === "fulfilled" && legacyBwSnap.value) ingestBw(legacyBwSnap.value);

        // Remote Sleep
        const remoteSleepMap = new Map();
        if (sleepSnap.status === "fulfilled" && sleepSnap.value) {
          sleepSnap.value.forEach(doc => {
            const d = doc.data();
            const id = String(d.id || doc.id);
            remoteSleepMap.set(id, { ...d, id });
          });
        }

        const remotePlateplan = (plateplanDoc.status === "fulfilled" && plateplanDoc.value?.exists)
          ? plateplanDoc.value.data()
          : null;

        const remoteActiveProg = (activeProgDoc.status === "fulfilled" && activeProgDoc.value?.exists)
          ? activeProgDoc.value.data()
          : null;

        // 3. Read local state from plateplan_v1 & data:${userId} & standalone keys
        const localProfile = loadDecoupledProfile(userId);
        const localLogs = Array.isArray(localProfile.logs) ? localProfile.logs : [];
        const localLogsMap = new Map();
        localLogs.forEach(l => {
          if (!l) return;
          const key = String(l.id || `${l.date}_${l.exerciseId || l.name}_${l.weight}_${l.sets}_${l.reps}`);
          localLogsMap.set(key, l);
        });

        let pushedToRemote = 0;
        let hydratedToLocal = 0;
        const toPush = [];

        // Check if local contains newer or missing exercise logs -> push to Firestore
        for (const [key, localLog] of localLogsMap.entries()) {
          const remoteLog = remoteLogsMap.get(key) || remoteLogsMap.get(String(localLog.id));
          const localTime = Number(localLog.updatedAt || localLog.timestamp || 0);
          const remoteTime = Number(remoteLog?.updatedAt || remoteLog?.timestamp || 0);

          if (!remoteLog || localTime > remoteTime) {
            toPush.push(localLog);
            pushedToRemote++;
          }
        }

        if (toPush.length > 0) {
          console.info(`[PlatePlan Sync] Pushing ${toPush.length} newer/missing local logs to Firestore for ${userId}...`);
          await Promise.allSettled(toPush.map(log => this.saveExerciseLog(userId, log, { skipQueue: true })));
        }

        // Check if remote contains newer exercise logs -> hydrate local
        const mergedLogsMap = new Map(localLogsMap);
        for (const [remoteKey, remoteLog] of remoteLogsMap.entries()) {
          const localLog = localLogsMap.get(remoteKey) || localLogsMap.get(String(remoteLog.id));
          const localTime = Number(localLog?.updatedAt || localLog?.timestamp || 0);
          const remoteTime = Number(remoteLog.updatedAt || remoteLog.timestamp || 0);

          if (!localLog || remoteTime > localTime) {
            mergedLogsMap.set(String(remoteLog.id || remoteKey), remoteLog);
            hydratedToLocal++;
          }
        }

        // --- Reconcile Bodyweight Logs ---
        const localBw = Array.isArray(localProfile.bodyWeightLogs) ? localProfile.bodyWeightLogs : [];
        const localBwMap = new Map();
        localBw.forEach(bw => {
          if (!bw) return;
          const key = String(bw.id || `bw_${bw.date}`);
          localBwMap.set(key, bw);
        });

        const toPushBw = [];
        for (const [key, localItem] of localBwMap.entries()) {
          const remoteItem = remoteBwMap.get(key) || remoteBwMap.get(String(localItem.id));
          const localTime = Number(localItem.updatedAt || localItem.timestamp || 0);
          const remoteTime = Number(remoteItem?.updatedAt || remoteItem?.timestamp || 0);
          if (!remoteItem || localTime > remoteTime) {
            toPushBw.push(localItem);
            pushedToRemote++;
          }
        }
        if (toPushBw.length > 0) {
          await Promise.allSettled(toPushBw.map(bw => this.saveBodyweightLog(userId, bw, { skipQueue: true })));
        }

        const mergedBwMap = new Map(localBwMap);
        for (const [remoteKey, remoteItem] of remoteBwMap.entries()) {
          const localItem = localBwMap.get(remoteKey) || localBwMap.get(String(remoteItem.id));
          const localTime = Number(localItem?.updatedAt || localItem?.timestamp || 0);
          const remoteTime = Number(remoteItem.updatedAt || remoteItem.timestamp || 0);
          if (!localItem || remoteTime > localTime) {
            mergedBwMap.set(String(remoteItem.id || remoteKey), remoteItem);
            hydratedToLocal++;
          }
        }

        // --- Reconcile Readiness Logs ---
        const localReadiness = Array.isArray(localProfile.readinessLogs) ? localProfile.readinessLogs : [];
        const localReadinessMap = new Map();
        localReadiness.forEach(r => {
          if (!r) return;
          const key = String(r.id || `r_${r.date}`);
          localReadinessMap.set(key, r);
        });

        const toPushReadiness = [];
        for (const [key, localItem] of localReadinessMap.entries()) {
          const remoteItem = remoteReadinessMap.get(key) || remoteReadinessMap.get(String(localItem.id));
          const localTime = Number(localItem.updatedAt || localItem.timestamp || 0);
          const remoteTime = Number(remoteItem?.updatedAt || remoteItem?.timestamp || 0);
          if (!remoteItem || localTime > remoteTime) {
            toPushReadiness.push(localItem);
            pushedToRemote++;
          }
        }
        if (toPushReadiness.length > 0) {
          await Promise.allSettled(toPushReadiness.map(r => this.saveReadinessLog(userId, r, { skipQueue: true })));
        }

        const mergedReadinessMap = new Map(localReadinessMap);
        for (const [remoteKey, remoteItem] of remoteReadinessMap.entries()) {
          const localItem = localReadinessMap.get(remoteKey) || localReadinessMap.get(String(remoteItem.id));
          const localTime = Number(localItem?.updatedAt || localItem?.timestamp || 0);
          const remoteTime = Number(remoteItem.updatedAt || remoteItem.timestamp || 0);
          if (!localItem || remoteTime > localTime) {
            mergedReadinessMap.set(String(remoteItem.id || remoteKey), remoteItem);
            hydratedToLocal++;
          }
        }

        // --- Reconcile Sleep Logs ---
        const localSleep = Array.isArray(localProfile.sleepLogs) ? localProfile.sleepLogs : [];
        const localSleepMap = new Map();
        localSleep.forEach(s => {
          if (!s) return;
          const key = String(s.id || `slp_${s.date}`);
          localSleepMap.set(key, s);
        });

        const toPushSleep = [];
        for (const [key, localItem] of localSleepMap.entries()) {
          const remoteItem = remoteSleepMap.get(key) || remoteSleepMap.get(String(localItem.id));
          const localTime = Number(localItem.updatedAt || localItem.timestamp || 0);
          const remoteTime = Number(remoteItem?.updatedAt || remoteItem?.timestamp || 0);
          if (!remoteItem || localTime > remoteTime) {
            toPushSleep.push(localItem);
            pushedToRemote++;
          }
        }
        if (toPushSleep.length > 0) {
          await Promise.allSettled(toPushSleep.map(s => this.saveSleepLog(userId, s, { skipQueue: true })));
        }

        const mergedSleepMap = new Map(localSleepMap);
        for (const [remoteKey, remoteItem] of remoteSleepMap.entries()) {
          const localItem = localSleepMap.get(remoteKey) || localSleepMap.get(String(remoteItem.id));
          const localTime = Number(localItem?.updatedAt || localItem?.timestamp || 0);
          const remoteTime = Number(remoteItem.updatedAt || remoteItem.timestamp || 0);
          if (!localItem || remoteTime > localTime) {
            mergedSleepMap.set(String(remoteItem.id || remoteKey), remoteItem);
            hydratedToLocal++;
          }
        }

        // Reconcile Active Program / PlatePlan
        let finalProgram = localProfile;
        const remoteProgObj = remotePlateplan || remoteActiveProg;
        if (remoteProgObj) {
          const remoteProgTime = Number(remoteProgObj.updatedAt || 0);
          const localProgTime = Number(localProfile.updatedAt || 0);
          if (remoteProgTime > localProgTime) {
            finalProgram = {
              ...localProfile,
              startDate: remoteProgObj.startDate || localProfile.startDate,
              goals: remoteProgObj.goals || localProfile.goals,
              resumeNote: remoteProgObj.resumeNote || localProfile.resumeNote,
              sessions: Array.isArray(remoteProgObj.sessions) && remoteProgObj.sessions.length ? remoteProgObj.sessions : localProfile.sessions,
              weekOverrides: remoteProgObj.weekOverrides || localProfile.weekOverrides,
              equipment: remoteProgObj.equipment || localProfile.equipment,
              updatedAt: remoteProgTime
            };
            hydratedToLocal++;
          } else if (localProgTime > remoteProgTime && localProfile.sessions?.length) {
            this.saveActiveProgram(userId, localProfile, { skipQueue: true });
            pushedToRemote++;
          }
        }

        const mergedLogsArray = Array.from(mergedLogsMap.values()).sort((a, b) =>
          (b.date || "").localeCompare(a.date || "") || ((b.timestamp || 0) - (a.timestamp || 0))
        );
        const mergedBwArray = Array.from(mergedBwMap.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        const mergedReadinessArray = Array.from(mergedReadinessMap.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        const mergedSleepArray = Array.from(mergedSleepMap.values()).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const reconciledProfile = {
          ...finalProgram,
          logs: mergedLogsArray,
          bodyWeightLogs: mergedBwArray,
          readinessLogs: mergedReadinessArray,
          sleepLogs: mergedSleepArray,
          updatedAt: Math.max(Number(finalProgram.updatedAt || 0), Date.now())
        };

        // Hydrate localStorage cache & legacy storage keys
        savePlatePlanV1Local(userId, reconciledProfile);
        I.Ee(userId, reconciledProfile);
        syncLegacyStorage(userId, reconciledProfile);

        console.info(`[PlatePlan Sync] Completed sync for ${userId}: pushed ${pushedToRemote}, hydrated ${hydratedToLocal}`);
        if (pushedToRemote > 0 || hydratedToLocal > 0) {
          showToast?.(`Cloud synced: ${pushedToRemote} uploaded, ${hydratedToLocal} downloaded`);
        }

        return reconciledProfile;
      } catch (err) {
        console.warn("[PlatePlan Sync] Two-way sync error:", err);
        return null;
      }
    },

    /**
     * Real-Time Cloud Listeners:
     * - onSnapshot for active program (gym_users/{profileId}/active_program/current)
     * - onSnapshot for plateplan (gym_users/{profileId}/plateplan/current)
     * - onSnapshot for history logs (gym_users/{profileId}/logs and exercise_logs)
     * - onSnapshot for readiness (gym_users/{profileId}/readiness and readiness_logs)
     * - onSnapshot for bodyweight (gym_users/{profileId}/bodyweight and bodyweight_logs)
     * - onSnapshot for sleep (gym_users/{profileId}/sleep)
     * - Ensures changes on mobile immediately update desktop/laptop state!
     */
    subscribe(profileId, onRemoteUpdate, onStatusChange) {
      const unsubscribers = [];

      const fs = this.getFirestore();
      if (fs) {
        try {
          // 1. Logs listener (primary path: gym_users/{profileId}/logs)
          const unsubLogs = fs.collection("gym_users").doc(profileId).collection("logs")
            .onSnapshot(snap => {
              const logs = [];
              snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
              if (logs.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("exercise_logs", logs);
              }
            }, err => console.warn("Firestore logs listener error:", err?.message));
          unsubscribers.push(unsubLogs);

          // 2. Legacy exercise_logs listener
          const unsubExerciseLogs = fs.collection("gym_users").doc(profileId).collection("exercise_logs")
            .onSnapshot(snap => {
              const logs = [];
              snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
              if (logs.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("exercise_logs", logs);
              }
            }, () => {});
          unsubscribers.push(unsubExerciseLogs);

          // 3. Readiness listener (primary: readiness)
          const unsubReadiness = fs.collection("gym_users").doc(profileId).collection("readiness")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("readiness", items);
              }
            }, () => {});
          unsubscribers.push(unsubReadiness);

          // 4. Readiness logs listener (legacy fallback: readiness_logs)
          const unsubRead = fs.collection("gym_users").doc(profileId).collection("readiness_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("readiness", items);
              }
            }, () => {});
          unsubscribers.push(unsubRead);

          // 5. Bodyweight listener (primary: bodyweight)
          const unsubBwPrimary = fs.collection("gym_users").doc(profileId).collection("bodyweight")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("bodyweight", items);
              }
            }, () => {});
          unsubscribers.push(unsubBwPrimary);

          // 6. Bodyweight logs listener (legacy fallback: bodyweight_logs)
          const unsubBw = fs.collection("gym_users").doc(profileId).collection("bodyweight_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("bodyweight", items);
              }
            }, () => {});
          unsubscribers.push(unsubBw);

          // 7. Sleep listener (primary: sleep)
          const unsubSleep = fs.collection("gym_users").doc(profileId).collection("sleep")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("sleep", items);
              }
            }, () => {});
          unsubscribers.push(unsubSleep);

          // 8. Active program listener (gym_users/{profileId}/active_program/current)
          const unsubProg = fs.collection("gym_users").doc(profileId).collection("active_program").doc("current")
            .onSnapshot(doc => {
              if (doc.exists) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("active_program", doc.data());
              }
            }, () => {});
          unsubscribers.push(unsubProg);

          // 9. Plateplan current listener (gym_users/{profileId}/plateplan/current)
          const unsubPlateplan = fs.collection("gym_users").doc(profileId).collection("plateplan").doc("current")
            .onSnapshot(doc => {
              if (doc.exists) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("active_program", doc.data());
              }
            }, () => {});
          unsubscribers.push(unsubPlateplan);
        } catch (e) {
          console.warn("Firestore subscribe exception:", e?.message);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try {
          const logsRef = rtdb.ref(`gym_users/${profileId}/logs`);
          const onLogs = snap => {
            const val = snap.val();
            if (val) {
              if (navigator.onLine) onStatusChange?.("synced");
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
              if (navigator.onLine) onStatusChange?.("synced");
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

  const GymCloudEngine = PlatePlanSyncEngine;

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

  function syncLegacyStorage(profileId, payload) {
    if (!profileId || !payload || typeof payload !== "object") return;
    try {
      if (Array.isArray(payload.bodyWeightLogs)) {
        storageSet(`hg_metrics_${profileId}`, payload.bodyWeightLogs);
      }
      if (Array.isArray(payload.readinessLogs)) {
        storageSet(`hg_readiness_${profileId}`, payload.readinessLogs);
      }
      if (Array.isArray(payload.sleepLogs)) {
        storageSet(`hg_sleep_${profileId}`, payload.sleepLogs);
      }

      // Sync data:${profileId}
      const rawData = localStorage.getItem(`data:${profileId}`);
      let currentData = {};
      try { if (rawData) currentData = JSON.parse(rawData); } catch (_) {}

      const nextData = {
        ...currentData,
        startDate: payload.startDate || currentData.startDate,
        goals: payload.goals || currentData.goals,
        resumeNote: payload.resumeNote || currentData.resumeNote,
        sessions: Array.isArray(payload.sessions) ? payload.sessions : currentData.sessions,
        weekOverrides: payload.weekOverrides || currentData.weekOverrides,
        logs: Array.isArray(payload.logs) ? payload.logs : currentData.logs,
        bodyweight: Array.isArray(payload.bodyWeightLogs) ? payload.bodyWeightLogs : (currentData.bodyweight || []),
        bodyWeightLogs: Array.isArray(payload.bodyWeightLogs) ? payload.bodyWeightLogs : (currentData.bodyWeightLogs || []),
        readiness: Array.isArray(payload.readinessLogs) ? payload.readinessLogs : (currentData.readiness || []),
        readinessLogs: Array.isArray(payload.readinessLogs) ? payload.readinessLogs : (currentData.readinessLogs || []),
        sleepLogs: Array.isArray(payload.sleepLogs) ? payload.sleepLogs : (currentData.sleepLogs || []),
        updatedAt: payload.updatedAt || Date.now()
      };
      localStorage.setItem(`data:${profileId}`, JSON.stringify(nextData));

      // Mirror plateplan_v1_${profileId}
      const rawPP = localStorage.getItem(`${PLATEPLAN_V1_KEY}_${profileId}`);
      let currentPP = {};
      try { if (rawPP) currentPP = JSON.parse(rawPP); } catch (_) {}
      localStorage.setItem(`${PLATEPLAN_V1_KEY}_${profileId}`, JSON.stringify({
        ...currentPP,
        startDate: payload.startDate || currentPP.startDate,
        goals: payload.goals || currentPP.goals,
        sessions: Array.isArray(payload.sessions) ? payload.sessions : currentPP.sessions,
        logs: Array.isArray(payload.logs) ? payload.logs : currentPP.logs,
        bodyWeightLogs: Array.isArray(payload.bodyWeightLogs) ? payload.bodyWeightLogs : currentPP.bodyWeightLogs,
        readinessLogs: Array.isArray(payload.readinessLogs) ? payload.readinessLogs : currentPP.readinessLogs,
        sleepLogs: Array.isArray(payload.sleepLogs) ? payload.sleepLogs : currentPP.sleepLogs,
        updatedAt: payload.updatedAt || Date.now()
      }));
    } catch (e) {
      console.warn("[syncLegacyStorage] warning:", e);
    }
  }

  function hydrateHealthAndLogsForProfile(profileId, source) {
    // 1. Recover and deduplicate Body Weight Logs
    const weightCandidates = [];
    const weightSeen = new Set();
    function addWeightCandidate(w) {
      if (!w || !w.date || w.weight == null) return;
      const num = Number(w.weight);
      if (Number.isNaN(num)) return;
      const id = String(w.id || `bw_${w.date}`);
      if (weightSeen.has(id)) return;
      weightSeen.add(id);
      weightCandidates.push({
        id,
        date: String(w.date),
        weight: Math.round(num * 10) / 10,
        note: String(w.note || "").trim(),
        timestamp: w.timestamp || (w.date ? new Date(`${w.date}T12:00:00`).getTime() : Date.now())
      });
    }

    if (Array.isArray(source?.bodyWeightLogs)) source.bodyWeightLogs.forEach(addWeightCandidate);
    if (Array.isArray(source?.weightLogs)) source.weightLogs.forEach(addWeightCandidate);
    if (Array.isArray(source?.bodyweight)) source.bodyweight.forEach(addWeightCandidate);
    if (Array.isArray(source?.metrics)) source.metrics.forEach(addWeightCandidate);

    const localWeights = storageGet(`hg_metrics_${profileId}`, []);
    if (Array.isArray(localWeights)) localWeights.forEach(addWeightCandidate);
    const localBw = storageGet(`hg_bodyweight_${profileId}`, []);
    if (Array.isArray(localBw)) localBw.forEach(addWeightCandidate);

    try {
      const rawLegacy = localStorage.getItem(`data:${profileId}`);
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (Array.isArray(parsed.bodyweight)) parsed.bodyweight.forEach(addWeightCandidate);
        if (Array.isArray(parsed.bodyWeightLogs)) parsed.bodyWeightLogs.forEach(addWeightCandidate);
        if (Array.isArray(parsed.metrics)) parsed.metrics.forEach(addWeightCandidate);
      }
    } catch (_) {}

    const bodyWeightLogs = weightCandidates.sort((a, b) => a.date.localeCompare(b.date));

    // 2. Recover and deduplicate Readiness Logs
    const readinessCandidates = [];
    const readinessSeen = new Set();
    function addReadinessCandidate(r) {
      if (!r || !r.date) return;
      const id = String(r.id || `r_${r.date}`);
      if (readinessSeen.has(id)) return;
      readinessSeen.add(id);
      const h = r.sleepHours != null ? Number(r.sleepHours) : (r.sleep != null ? Math.floor(Number(r.sleep)) : 7);
      const m = r.sleepMins != null ? Number(r.sleepMins) : (r.sleep != null ? Math.round((Number(r.sleep) % 1) * 60) : 30);
      const decSleep = r.sleep != null ? Number(r.sleep) : Math.round((h + m / 60) * 100) / 100;
      readinessCandidates.push({
        id,
        date: String(r.date),
        sleep: decSleep,
        sleepHours: h,
        sleepMins: m,
        soreness: r.soreness != null ? Number(r.soreness) : 3,
        motivation: r.motivation != null ? Number(r.motivation) : 3,
        notes: String(r.notes || r.note || "").trim(),
        timestamp: r.timestamp || (r.date ? new Date(`${r.date}T12:00:00`).getTime() : Date.now())
      });
    }

    if (Array.isArray(source?.readinessLogs)) source.readinessLogs.forEach(addReadinessCandidate);
    if (Array.isArray(source?.readiness)) source.readiness.forEach(addReadinessCandidate);

    const localReadiness = storageGet(`hg_readiness_${profileId}`, []);
    if (Array.isArray(localReadiness)) localReadiness.forEach(addReadinessCandidate);

    try {
      const rawLegacy = localStorage.getItem(`data:${profileId}`);
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (Array.isArray(parsed.readiness)) parsed.readiness.forEach(addReadinessCandidate);
        if (Array.isArray(parsed.readinessLogs)) parsed.readinessLogs.forEach(addReadinessCandidate);
      }
    } catch (_) {}

    const readinessLogs = readinessCandidates.sort((a, b) => a.date.localeCompare(b.date));

    // 3. Recover and deduplicate Sleep Logs
    const sleepCandidates = [];
    const sleepSeen = new Set();
    function addSleepCandidate(s) {
      if (!s || !s.date) return;
      const id = String(s.id || `slp_${s.date}`);
      if (sleepSeen.has(id)) return;
      sleepSeen.add(id);
      sleepCandidates.push({
        id,
        date: String(s.date),
        hours: s.hours != null ? Number(s.hours) : 7,
        mins: s.mins != null ? Number(s.mins) : 30,
        totalHours: s.totalHours != null ? Number(s.totalHours) : (s.hours != null ? Number(s.hours) + (Number(s.mins) || 0) / 60 : 7.5),
        notes: String(s.notes || "").trim(),
        timestamp: s.timestamp || (s.date ? new Date(`${s.date}T12:00:00`).getTime() : Date.now())
      });
    }

    if (Array.isArray(source?.sleepLogs)) source.sleepLogs.forEach(addSleepCandidate);
    if (Array.isArray(source?.sleep)) source.sleep.forEach(addSleepCandidate);

    const localSleep = storageGet(`hg_sleep_${profileId}`, []);
    if (Array.isArray(localSleep)) localSleep.forEach(addSleepCandidate);

    // Derive sleep records from readiness if not explicitly logged
    readinessLogs.forEach(r => {
      addSleepCandidate({
        id: `slp_${r.date}`,
        date: r.date,
        hours: r.sleepHours,
        mins: r.sleepMins,
        totalHours: r.sleep,
        notes: r.notes,
        timestamp: r.timestamp
      });
    });

    const sleepLogs = sleepCandidates.sort((a, b) => a.date.localeCompare(b.date));

    // 4. Backward-compatible sync to standalone keys
    syncLegacyStorage(profileId, {
      bodyWeightLogs,
      readinessLogs,
      sleepLogs
    });

    return { bodyWeightLogs, readinessLogs, sleepLogs };
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
      bodyWeightLogs: [],
      sleepLogs: [],
      readinessLogs: [],
      updatedAt: 0,
    };

    try {
      // 1. Check plateplan_v1 (cloud-first primary local cache)
      const ppv1 = getPlatePlanV1Local();
      const userPpv1 = ppv1?.users?.[profileId] || ppv1?.[profileId] || (ppv1?.userId === profileId ? ppv1 : null);

      // 2. Check per-user key plateplan_v1_${profileId}
      let perUserPpv1 = null;
      try {
        const rawPer = localStorage.getItem(`${PLATEPLAN_V1_KEY}_${profileId}`);
        if (rawPer) perUserPpv1 = JSON.parse(rawPer);
      } catch (e) {}

      // 3. Check legacy data:${profileId}
      let parsedData = null;
      try {
        const raw = localStorage.getItem(`data:${profileId}`);
        if (raw) parsedData = JSON.parse(raw);
      } catch (e) {}

      const source = userPpv1 || perUserPpv1 || parsedData || {};
      const logs = Array.isArray(source.logs) ? source.logs.map(i => ({ ...i, exerciseId: i.exerciseId || i.liftId })) : [];

      // Hydrate health tracking and standalone keys into central state
      const health = hydrateHealthAndLogsForProfile(profileId, source);

      return {
        startDate: source.startDate || defaultData.startDate,
        goals: source.goals || defaultData.goals,
        resumeNote: source.resumeNote || defaultData.resumeNote,
        sessions: Array.isArray(source.sessions) && source.sessions.length ? source.sessions : defaultData.sessions,
        weekOverrides: source.weekOverrides && typeof source.weekOverrides === "object" ? source.weekOverrides : {},
        logs: logs,
        bodyWeightLogs: health.bodyWeightLogs,
        sleepLogs: health.sleepLogs,
        readinessLogs: health.readinessLogs,
        equipment: source.equipment || null,
        updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : 0,
      };
    } catch (e) {
      console.warn("loadDecoupledProfile parse error:", e);
    }
    const health = hydrateHealthAndLogsForProfile(profileId, {});
    return {
      ...defaultData,
      bodyWeightLogs: health.bodyWeightLogs,
      sleepLogs: health.sleepLogs,
      readinessLogs: health.readinessLogs
    };
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

  function ReadinessInline({ personId, data, updateData, showToast }) {
    const key = `hg_readiness_${personId}`;
    const today = I.W();
    const centralRecords = (Array.isArray(data?.readinessLogs) && data.readinessLogs.length > 0)
      ? data.readinessLogs
      : storageGet(key, []);
    const records = Array.isArray(centralRecords) ? centralRecords : [];
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
      const nextRecords = [...records.filter(item => item.date !== today), entry].sort((a, b) => a.date.localeCompare(b.date));
      storageSet(key, nextRecords);
      syncLegacyStorage(personId, { readinessLogs: nextRecords });
      if (updateData) {
        updateData(personId, cur => ({ ...cur, readinessLogs: nextRecords }));
      }
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

  function ChecklistStep({ title, copy, items, checked, onToggle, onNext, onBack, showReadiness, personId, data, updateData, showToast }) {
    return h("div", { className: "hg-card" },
      h("div", { className: "hg-card-title" }, title),
      copy && h("div", { className: "hg-card-copy" }, copy),
      showReadiness && h(ReadinessInline, { personId, data, updateData, showToast }),
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
        data,
        updateData,
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
      h(ReadinessInline, { personId, data, updateData, showToast }),
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

  function MetricsView({ meta, personId, data, updateData, showToast }) {
    const [subTab, setSubTab] = useState("weight"); // "weight" | "readiness"
    const weightKey = `hg_metrics_${personId}`;
    const readinessKey = `hg_readiness_${personId}`;

    const getInitialWeights = () => {
      if (Array.isArray(data?.bodyWeightLogs) && data.bodyWeightLogs.length > 0) {
        return data.bodyWeightLogs;
      }
      const w = storageGet(weightKey, []);
      return Array.isArray(w) ? w : [];
    };

    const getInitialReadiness = () => {
      if (Array.isArray(data?.readinessLogs) && data.readinessLogs.length > 0) {
        return data.readinessLogs;
      }
      const r = storageGet(readinessKey, []);
      return Array.isArray(r) ? r : [];
    };

    const [weights, setWeights] = useState(getInitialWeights);
    const [readiness, setReadiness] = useState(getInitialReadiness);

    useEffect(() => {
      const w = (Array.isArray(data?.bodyWeightLogs) && data.bodyWeightLogs.length > 0)
        ? data.bodyWeightLogs
        : storageGet(weightKey, []);
      const r = (Array.isArray(data?.readinessLogs) && data.readinessLogs.length > 0)
        ? data.readinessLogs
        : storageGet(readinessKey, []);
      setWeights(Array.isArray(w) ? w : []);
      setReadiness(Array.isArray(r) ? r : []);
    }, [personId, data?.bodyWeightLogs, data?.readinessLogs]);

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
        weight: Math.round(num * 10) / 10,
        note: weightNote.trim(),
        timestamp: Date.now()
      };
      GymCloudEngine.saveBodyweightLog(personId, entry);
      const curWeights = (Array.isArray(data?.bodyWeightLogs) && data.bodyWeightLogs.length > 0)
        ? data.bodyWeightLogs
        : (Array.isArray(weights) ? weights : []);
      const next = [...curWeights.filter(w => w.date !== weightDate), entry].sort((a, b) => a.date.localeCompare(b.date));
      setWeights(next);
      storageSet(weightKey, next);
      syncLegacyStorage(personId, { bodyWeightLogs: next });
      if (updateData) {
        updateData(personId, cur => ({ ...cur, bodyWeightLogs: next }));
      }
      showToast("Body weight logged");
      setWeightVal("");
      setWeightNote("");
    }

    function deleteWeight(id) {
      GymCloudEngine.deleteBodyweightLog(personId, id);
      const curWeights = (Array.isArray(data?.bodyWeightLogs) && data.bodyWeightLogs.length > 0)
        ? data.bodyWeightLogs
        : (Array.isArray(weights) ? weights : []);
      const next = curWeights.filter(w => w.id !== id);
      setWeights(next);
      storageSet(weightKey, next);
      syncLegacyStorage(personId, { bodyWeightLogs: next });
      if (updateData) {
        updateData(personId, cur => ({ ...cur, bodyWeightLogs: next }));
      }
      showToast("Weight entry deleted");
    }

    function deleteReadiness(id) {
      GymCloudEngine.deleteReadinessLog(personId, id);
      const curReadiness = (Array.isArray(data?.readinessLogs) && data.readinessLogs.length > 0)
        ? data.readinessLogs
        : (Array.isArray(readiness) ? readiness : []);
      const next = curReadiness.filter(r => r.id !== id);
      setReadiness(next);
      storageSet(readinessKey, next);
      syncLegacyStorage(personId, { readinessLogs: next });
      if (updateData) {
        updateData(personId, cur => ({ ...cur, readinessLogs: next }));
      }
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

const EXERCISE_SUGGESTIONS = [
    { name: "Barbell Bench Press", setsReps: "4 × 6", equipmentType: "barbell", restNote: "90s", startValue: 40 },
    { name: "Barbell Squat", setsReps: "4 × 6", equipmentType: "barbell", restNote: "90s", startValue: 50 },
    { name: "Barbell RDL", setsReps: "4 × 8", equipmentType: "barbell", restNote: "90s", startValue: 45 },
    { name: "Conventional Deadlift", setsReps: "3 × 5", equipmentType: "barbell", restNote: "2 mins", startValue: 60 },
    { name: "Overhead Press (OHP)", setsReps: "3 × 8", equipmentType: "barbell", restNote: "90s", startValue: 30 },
    { name: "Incline DB Press", setsReps: "4 × 8", equipmentType: "dumbbell", restNote: "90s", startValue: 20 },
    { name: "Dumbbell Row", setsReps: "4 × 8", equipmentType: "dumbbell", restNote: "90s", startValue: 20 },
    { name: "Pull-ups / Chin-ups", setsReps: "3 × 6–8", equipmentType: "bodyweight", restNote: "90s", startValue: "" },
    { name: "Lateral Raise", setsReps: "3 × 12", equipmentType: "dumbbell", restNote: "60s", startValue: 8 },
    { name: "Face Pull", setsReps: "3 × 15", equipmentType: "cable", restNote: "60s", startValue: 15 },
    { name: "Bicep Curl", setsReps: "3 × 10", equipmentType: "dumbbell", restNote: "60s", startValue: 12 },
    { name: "Tricep Pushdown", setsReps: "3 × 12", equipmentType: "cable", restNote: "60s", startValue: 20 },
    { name: "Bulgarian Split Squat", setsReps: "3 × 8/leg", equipmentType: "dumbbell", restNote: "90s", startValue: 14 },
    { name: "Leg Press", setsReps: "3 × 10", equipmentType: "machine", restNote: "90s", startValue: 80 },
    { name: "Hamstring Curl", setsReps: "3 × 10", equipmentType: "machine", restNote: "90s", startValue: 35 },
    { name: "Standing Calf Raise", setsReps: "4 × 12", equipmentType: "dumbbell", restNote: "60s", startValue: 20 },
    { name: "Plank", setsReps: "3 × 45s", equipmentType: "bodyweight", restNote: "60s", startValue: "" }
  ];

  const PROGRAM_TEMPLATES = {
    upper_lower: {
      name: "Upper / Lower Hypertrophy",
      description: "4-day split with progressive overload on primary compounds and paired antagonist supersets.",
      frequency: "4 days/week",
      sessions: [
        {
          id: "upper_a",
          name: "Upper A",
          day: "Mon",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Barbell Bench Press", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "40", equipmentType: "barbell" },
            { name: "Dumbbell Row", setsReps: "4 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Overhead Press (OHP)", setsReps: "3 × 8", supersetGroup: "b", restNote: "90s after B2", startValue: "30", equipmentType: "barbell" },
            { name: "Pull-ups / Chin-ups", setsReps: "3 × 6–8", supersetGroup: "b", restNote: "90s after B2", startValue: "", equipmentType: "bodyweight" },
            { name: "Lateral Raise", setsReps: "3 × 12", supersetGroup: "c", restNote: "60s after C2", startValue: "8", equipmentType: "dumbbell" },
            { name: "Bicep Curl", setsReps: "3 × 10", supersetGroup: "c", restNote: "60s after C2", startValue: "12", equipmentType: "dumbbell" }
          ]
        },
        {
          id: "lower_a",
          name: "Lower A",
          day: "Tue",
          type: "strength",
          duration: "45 mins",
          exercises: [
            { name: "Barbell Squat", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "50", equipmentType: "barbell" },
            { name: "Standing Calf Raise", setsReps: "4 × 12", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Barbell RDL", setsReps: "4 × 8", supersetGroup: "b", restNote: "90s after B2", startValue: "45", equipmentType: "barbell" },
            { name: "Plank", setsReps: "3 × 45s", supersetGroup: "b", restNote: "60s after B2", startValue: "", equipmentType: "bodyweight" }
          ]
        },
        {
          id: "upper_b",
          name: "Upper B",
          day: "Thu",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Incline DB Press", setsReps: "4 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Dumbbell Row", setsReps: "4 × 10", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Lateral Raise", setsReps: "3 × 12", supersetGroup: "b", restNote: "60s after B2", startValue: "8", equipmentType: "dumbbell" },
            { name: "Face Pull", setsReps: "3 × 15", supersetGroup: "b", restNote: "60s after B2", startValue: "15", equipmentType: "cable" },
            { name: "Tricep Pushdown", setsReps: "3 × 12", supersetGroup: "c", restNote: "60s after C2", startValue: "20", equipmentType: "cable" },
            { name: "Bicep Curl", setsReps: "3 × 10", supersetGroup: "c", restNote: "60s after C2", startValue: "12", equipmentType: "dumbbell" }
          ]
        },
        {
          id: "lower_b",
          name: "Lower B",
          day: "Fri",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Conventional Deadlift", setsReps: "3 × 5", supersetGroup: "solo", restNote: "2 mins", startValue: "60", equipmentType: "barbell" },
            { name: "Bulgarian Split Squat", setsReps: "3 × 8/leg", supersetGroup: "a", restNote: "90s after A2", startValue: "14", equipmentType: "dumbbell" },
            { name: "Hamstring Curl", setsReps: "3 × 10", supersetGroup: "a", restNote: "90s after A2", startValue: "35", equipmentType: "machine" },
            { name: "Standing Calf Raise", setsReps: "3 × 12", supersetGroup: "solo", restNote: "60s", startValue: "25", equipmentType: "dumbbell" }
          ]
        }
      ]
    },
    full_body: {
      name: "3-Day Full Body",
      description: "High-efficiency 3-day full body rotation focusing on fundamental compound movements.",
      frequency: "3 days/week",
      sessions: [
        {
          id: "fb_a",
          name: "Full Body A",
          day: "Mon",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Barbell Squat", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "50", equipmentType: "barbell" },
            { name: "Barbell Bench Press", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "40", equipmentType: "barbell" },
            { name: "Dumbbell Row", setsReps: "3 × 8", supersetGroup: "b", restNote: "90s after B2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Lateral Raise", setsReps: "3 × 12", supersetGroup: "b", restNote: "60s after B2", startValue: "8", equipmentType: "dumbbell" }
          ]
        },
        {
          id: "fb_b",
          name: "Full Body B",
          day: "Wed",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Barbell RDL", setsReps: "4 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "45", equipmentType: "barbell" },
            { name: "Overhead Press (OHP)", setsReps: "3 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "30", equipmentType: "barbell" },
            { name: "Pull-ups / Chin-ups", setsReps: "3 × 6–8", supersetGroup: "b", restNote: "90s after B2", startValue: "", equipmentType: "bodyweight" },
            { name: "Tricep Pushdown", setsReps: "3 × 12", supersetGroup: "b", restNote: "60s after B2", startValue: "20", equipmentType: "cable" }
          ]
        },
        {
          id: "fb_c",
          name: "Full Body C",
          day: "Fri",
          type: "strength",
          duration: "50 mins",
          exercises: [
            { name: "Leg Press", setsReps: "3 × 10", supersetGroup: "a", restNote: "90s after A2", startValue: "80", equipmentType: "machine" },
            { name: "Incline DB Press", setsReps: "3 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Bicep Curl", setsReps: "3 × 10", supersetGroup: "b", restNote: "60s after B2", startValue: "12", equipmentType: "dumbbell" },
            { name: "Plank", setsReps: "3 × 45s", supersetGroup: "b", restNote: "60s after B2", startValue: "", equipmentType: "bodyweight" }
          ]
        }
      ]
    },
    ppl: {
      name: "Push / Pull / Legs",
      description: "Classic hypertrophy split separating pushing, pulling, and leg muscles.",
      frequency: "3 days/week",
      sessions: [
        {
          id: "push",
          name: "Push",
          day: "Mon",
          type: "strength",
          duration: "45 mins",
          exercises: [
            { name: "Barbell Bench Press", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "40", equipmentType: "barbell" },
            { name: "Incline DB Press", setsReps: "3 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Overhead Press (OHP)", setsReps: "3 × 8", supersetGroup: "b", restNote: "90s after B2", startValue: "30", equipmentType: "barbell" },
            { name: "Lateral Raise", setsReps: "3 × 12", supersetGroup: "b", restNote: "60s after B2", startValue: "8", equipmentType: "dumbbell" },
            { name: "Tricep Pushdown", setsReps: "3 × 12", supersetGroup: "solo", restNote: "60s", startValue: "20", equipmentType: "cable" }
          ]
        },
        {
          id: "pull",
          name: "Pull",
          day: "Wed",
          type: "strength",
          duration: "45 mins",
          exercises: [
            { name: "Dumbbell Row", setsReps: "4 × 8", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Pull-ups / Chin-ups", setsReps: "3 × 6–8", supersetGroup: "a", restNote: "90s after A2", startValue: "", equipmentType: "bodyweight" },
            { name: "Face Pull", setsReps: "3 × 15", supersetGroup: "b", restNote: "60s after B2", startValue: "15", equipmentType: "cable" },
            { name: "Bicep Curl", setsReps: "3 × 10", supersetGroup: "b", restNote: "60s after B2", startValue: "12", equipmentType: "dumbbell" }
          ]
        },
        {
          id: "legs",
          name: "Legs",
          day: "Fri",
          type: "strength",
          duration: "45 mins",
          exercises: [
            { name: "Barbell Squat", setsReps: "4 × 6", supersetGroup: "a", restNote: "90s after A2", startValue: "50", equipmentType: "barbell" },
            { name: "Standing Calf Raise", setsReps: "4 × 12", supersetGroup: "a", restNote: "90s after A2", startValue: "20", equipmentType: "dumbbell" },
            { name: "Barbell RDL", setsReps: "4 × 8", supersetGroup: "b", restNote: "90s after B2", startValue: "45", equipmentType: "barbell" },
            { name: "Plank", setsReps: "3 × 45s", supersetGroup: "b", restNote: "60s after B2", startValue: "", equipmentType: "bodyweight" }
          ]
        }
      ]
    }
  };

  function slugify(t) {
    return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function decompileSessionExercises(session) {
    if (!session || !Array.isArray(session.groups)) return [];
    const list = [];
    session.groups.forEach((g, gIdx) => {
      const isSuperset = g.type === "superset" || (Array.isArray(g.exercises) && g.exercises.length > 1) || (g.label && g.label.toLowerCase().includes("superset"));
      let groupLetter = "solo";
      if (isSuperset) {
        const match = g.label ? g.label.match(/Group\s+([A-Z])/i) : null;
        if (match) groupLetter = match[1].toLowerCase();
        else if (g.id && g.id.length === 1 && /[a-z]/i.test(g.id)) groupLetter = g.id.toLowerCase();
        else {
          const letters = ["a", "b", "c", "d", "e", "f"];
          groupLetter = letters[gIdx % letters.length];
        }
      }
      (g.exercises || []).forEach(ex => {
        list.push({
          id: ex.id || slugify(ex.name),
          name: ex.name,
          setsReps: ex.setsReps || "3 × 8–10",
          restNote: ex.restNote || "90s",
          startValue: ex.startValue != null ? String(ex.startValue) : "",
          note: ex.note || "",
          equipmentType: ex.equipmentType || (ex.name && ex.name.toLowerCase().includes("barbell") ? "barbell" : (ex.name && (ex.name.toLowerCase().includes("db") || ex.name.toLowerCase().includes("dumbbell"))) ? "dumbbell" : "bodyweight"),
          supersetGroup: groupLetter
        });
      });
    });
    return list;
  }

  function compileSessionGroups(exercises) {
    if (!Array.isArray(exercises)) return [];
    const groups = [];
    const groupMap = new Map();
    let soloCount = 1;

    for (const ex of exercises) {
      const sg = (ex.supersetGroup || "solo").trim().toLowerCase();
      const exObj = {
        id: ex.id || slugify(ex.name),
        name: ex.name,
        setsReps: ex.setsReps || "3 × 8–10",
        restNote: ex.restNote || "90s",
        unit: "kg",
        startValue: ex.startValue && !isNaN(Number(ex.startValue)) ? Number(ex.startValue) : null,
        startLabel: ex.startValue && !isNaN(Number(ex.startValue)) ? (ex.startValue + "kg") : "Bodyweight",
        note: ex.note || "",
        equipmentType: ex.equipmentType || "barbell"
      };

      if (sg !== "solo") {
        const letter = sg.toUpperCase();
        if (!groupMap.has(letter)) {
          const grp = {
            id: letter.toLowerCase(),
            label: "Group " + letter + " · Superset",
            type: "superset",
            exercises: []
          };
          groupMap.set(letter, grp);
          groups.push(grp);
        }
        const grp = groupMap.get(letter);
        const subIdx = grp.exercises.length + 1;
        if (!ex.restNote || ex.restNote === "90s") {
          exObj.restNote = subIdx > 1 ? ("90s after " + letter + subIdx) : "—";
        }
        grp.exercises.push(exObj);
      } else {
        const grpId = "solo_" + (soloCount++);
        groups.push({
          id: grpId,
          label: "Exercise · Straight Set",
          type: "straight",
          exercises: [exObj]
        });
      }
    }
    return groups;
  }

  function ProgramWizardModal({ personId, data, updateData, showToast, initialProgram, mode, onClose }) {
    const isEdit = mode === "edit" || Boolean(initialProgram);
    const [step, setStep] = useState(1);
    const [programId] = useState(() => initialProgram?.id || initialProgram?.programId || ("prog_" + Date.now()));
    const [name, setName] = useState(() => initialProgram?.programName || initialProgram?.name || "");
    const [description, setDescription] = useState(() => initialProgram?.goals || initialProgram?.description || "");
    const [frequency, setFrequency] = useState(() => initialProgram?.frequency || (initialProgram?.sessions ? (initialProgram.sessions.length + " days/week") : "4 days/week"));
    const [startDate, setStartDate] = useState(() => initialProgram?.startDate || (I.j && I.W ? I.j(I.W()) : "2026-09-14"));

    const [sessions, setSessions] = useState(() => {
      if (initialProgram?.sessions && Array.isArray(initialProgram.sessions) && initialProgram.sessions.length > 0) {
        return initialProgram.sessions.map((s, sIdx) => ({
          id: s.id || ("s_" + sIdx + "_" + Date.now()),
          name: s.name || ("Session " + (sIdx + 1)),
          day: s.day || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][sIdx % 7],
          type: s.type || "strength",
          duration: s.duration || "45–60 mins",
          targetKm: s.targetKm || null,
          exercises: decompileSessionExercises(s)
        }));
      }
      return JSON.parse(JSON.stringify(PROGRAM_TEMPLATES.upper_lower.sessions));
    });

    const [activeSessionIdx, setActiveSessionIdx] = useState(0);

    // Exercise form state
    const [exName, setExName] = useState("");
    const [exSetsReps, setExSetsReps] = useState("3 × 8–10");
    const [exRest, setExRest] = useState("90s");
    const [exWeight, setExWeight] = useState("");
    const [exSuperset, setExSuperset] = useState("a");
    const [exEquipment, setExEquipment] = useState("barbell");
    const [exNote, setExNote] = useState("");
    const [saving, setSaving] = useState(false);

    function applyTemplate(key) {
      const tmpl = PROGRAM_TEMPLATES[key];
      if (!tmpl) return;
      if (!name) setName(tmpl.name);
      if (!description) setDescription(tmpl.description);
      setFrequency(tmpl.frequency);
      setSessions(JSON.parse(JSON.stringify(tmpl.sessions)));
      setActiveSessionIdx(0);
      showToast("Loaded " + tmpl.name + " template");
    }

    function addSession() {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const usedDays = new Set(sessions.map(s => s.day));
      const nextDay = days.find(d => !usedDays.has(d)) || "Sat";
      const newSession = {
        id: "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        name: "Session " + (sessions.length + 1),
        day: nextDay,
        type: "strength",
        duration: "45–60 mins",
        exercises: []
      };
      setSessions(prev => [...prev, newSession]);
      showToast("Added workout day");
    }

    function updateSession(idx, updater) {
      setSessions(prev => prev.map((s, i) => i === idx ? updater(s) : s));
    }

    function removeSession(idx) {
      if (sessions.length <= 1) {
        showToast("Program must have at least 1 session day");
        return;
      }
      setSessions(prev => prev.filter((_, i) => i !== idx));
      if (activeSessionIdx >= sessions.length - 1) {
        setActiveSessionIdx(Math.max(0, sessions.length - 2));
      }
    }

    function moveSession(idx, dir) {
      const target = idx + dir;
      if (target < 0 || target >= sessions.length) return;
      setSessions(prev => {
        const copy = [...prev];
        const temp = copy[idx];
        copy[idx] = copy[target];
        copy[target] = temp;
        return copy;
      });
    }

    const currentSession = sessions[activeSessionIdx] || sessions[0];

    function addExercise() {
      if (!exName.trim()) {
        showToast("Please enter an exercise name");
        return;
      }
      const newEx = {
        id: slugify(exName),
        name: exName.trim(),
        setsReps: exSetsReps.trim() || "3 × 8–10",
        restNote: exRest.trim() || "90s",
        startValue: exWeight.trim() || "",
        supersetGroup: exSuperset,
        equipmentType: exEquipment,
        note: exNote.trim()
      };
      updateSession(activeSessionIdx, s => ({
        ...s,
        exercises: [...(s.exercises || []), newEx]
      }));
      setExName("");
      setExWeight("");
      setExNote("");
      showToast("Added " + newEx.name + " to " + (currentSession?.name || "session"));
    }

    function removeExercise(exIdx) {
      updateSession(activeSessionIdx, s => ({
        ...s,
        exercises: (s.exercises || []).filter((_, i) => i !== exIdx)
      }));
    }

    function moveExercise(exIdx, dir) {
      const target = exIdx + dir;
      const exList = currentSession?.exercises || [];
      if (target < 0 || target >= exList.length) return;
      updateSession(activeSessionIdx, s => {
        const copy = [...(s.exercises || [])];
        const temp = copy[exIdx];
        copy[exIdx] = copy[target];
        copy[target] = temp;
        return { ...s, exercises: copy };
      });
    }

    function pickSuggestion(sug) {
      setExName(sug.name);
      setExSetsReps(sug.setsReps);
      setExEquipment(sug.equipmentType);
      setExRest(sug.restNote);
      setExWeight(sug.startValue ? String(sug.startValue) : "");
    }

    async function handleSave() {
      if (!name.trim()) {
        showToast("Please enter a Program Name in Step 1");
        setStep(1);
        return;
      }
      if (!sessions.length) {
        showToast("Program must contain at least 1 session day");
        setStep(2);
        return;
      }

      setSaving(true);
      try {
        const compiledSessions = sessions.map(s => {
          if (s.type !== "strength") return s;
          return {
            id: s.id || slugify(s.name) || ("s_" + Date.now()),
            name: s.name,
            day: s.day,
            type: "strength",
            duration: s.duration || "45–60 mins",
            groups: compileSessionGroups(s.exercises || [])
          };
        });

        const fullProgram = {
          id: programId,
          programId: programId,
          name: name.trim(),
          description: description.trim(),
          frequency: frequency || (compiledSessions.length + " days/week"),
          startDate: startDate || (I.j && I.W ? I.j(I.W()) : "2026-09-14"),
          sessions: compiledSessions,
          weekOverrides: {},
          updatedAt: Date.now()
        };

        // Save atomically to Firestore subcollection: users/{userId}/programs/{programId}
        await GymCloudEngine.saveProgramToSubcollection(personId, fullProgram);

        // Save to active_program/current
        await GymCloudEngine.saveActiveProgram(personId, fullProgram);

        // Update active profile state
        updateData(personId, cur => {
          const next = {
            ...cur,
            startDate: fullProgram.startDate,
            sessions: fullProgram.sessions,
            goals: fullProgram.description || cur.goals,
            programId: fullProgram.id,
            programName: fullProgram.name
          };
          try {
            localStorage.setItem("data:" + personId, JSON.stringify(next));
          } catch (e) {}
          return next;
        });

        showToast("Program '" + fullProgram.name + "' saved to Firestore & set active!");
        onClose();
      } catch (err) {
        console.error("Save program error:", err);
        showToast("Error saving program: " + (err?.message || "Unknown error"));
      } finally {
        setSaving(false);
      }
    }

    return h("div", { className: "hg-modal-backdrop", onClick: onClose },
      h("div", {
        className: "hg-modal hg-modal-wizard",
        role: "dialog",
        "aria-modal": true,
        onClick: e => e.stopPropagation()
      },
        // Modal Header
        h("div", { className: "hg-modal-header" },
          h("div", null,
            h("div", { className: "hg-section-label" }, isEdit ? "EDIT WORKOUT PROGRAM" : "PROGRAM CREATION WIZARD"),
            h("h2", { className: "hg-modal-title" }, isEdit ? (name || "Edit Program") : "Build Workout Program")
          ),
          h("button", {
            type: "button",
            className: "hg-icon-button",
            "aria-label": "Close",
            onClick: onClose
          }, "✕")
        ),

        // Stepper Header
        h("div", { className: "hg-wizard-steps" },
          h("div", {
            className: "hg-wizard-step-item " + (step === 1 ? "active" : (step > 1 ? "completed" : "")),
            onClick: () => setStep(1)
          },
            h("div", { className: "hg-wizard-step-num" }, step > 1 ? "✓" : "1"),
            h("span", { className: "hg-wizard-step-title" }, "1. Program Meta")
          ),
          h("div", {
            className: "hg-wizard-step-item " + (step === 2 ? "active" : (step > 2 ? "completed" : "")),
            onClick: () => {
              if (!name.trim()) { showToast("Enter program name first"); return; }
              setStep(2);
            }
          },
            h("div", { className: "hg-wizard-step-num" }, step > 2 ? "✓" : "2"),
            h("span", { className: "hg-wizard-step-title" }, "2. Days & Sessions")
          ),
          h("div", {
            className: "hg-wizard-step-item " + (step === 3 ? "active" : ""),
            onClick: () => {
              if (!name.trim()) { showToast("Enter program name first"); return; }
              if (!sessions.length) { showToast("Add at least 1 session day"); return; }
              setStep(3);
            }
          },
            h("div", { className: "hg-wizard-step-num" }, "3"),
            h("span", { className: "hg-wizard-step-title" }, "3. Exercises & Supersets")
          )
        ),

        // Wizard Body
        h("div", { className: "hg-wizard-body" },
          // STEP 1: Program Meta
          step === 1 && h("div", { className: "hg-wizard-step-content" },
            h("div", { className: "hg-card-title", style: { marginBottom: 6 } }, "Program Details"),
            h("div", { className: "hg-card-copy", style: { marginBottom: 18 } },
              "Set your routine's name, primary goals or focus, and target weekly frequency."
            ),

            h("div", { className: "hg-form-group" },
              h("label", { className: "hg-label", htmlFor: "hg-prog-name" }, "Program Name *"),
              h("input", {
                id: "hg-prog-name",
                className: "hg-input",
                placeholder: "e.g. Upper / Lower Hypertrophy, 3-Day Full Body",
                value: name,
                onChange: e => setName(e.target.value)
              })
            ),

            h("div", { className: "hg-form-group" },
              h("label", { className: "hg-label", htmlFor: "hg-prog-desc" }, "Program Focus / Notes"),
              h("textarea", {
                id: "hg-prog-desc",
                className: "hg-textarea",
                placeholder: "e.g. Progressive overload on compound lifts with paired supersets for time efficiency.",
                value: description,
                onChange: e => setDescription(e.target.value)
              })
            ),

            h("div", { className: "hg-form-row" },
              h("div", { className: "hg-form-group" },
                h("label", { className: "hg-label", htmlFor: "hg-prog-freq" }, "Weekly Frequency"),
                h("select", {
                  id: "hg-prog-freq",
                  className: "hg-select",
                  value: frequency,
                  onChange: e => setFrequency(e.target.value)
                },
                  h("option", { value: "2 days/week" }, "2 days/week"),
                  h("option", { value: "3 days/week" }, "3 days/week"),
                  h("option", { value: "4 days/week" }, "4 days/week"),
                  h("option", { value: "5 days/week" }, "5 days/week"),
                  h("option", { value: "6 days/week" }, "6 days/week")
                )
              ),
              h("div", { className: "hg-form-group" },
                h("label", { className: "hg-label", htmlFor: "hg-prog-start" }, "Start Week / Date"),
                h("input", {
                  id: "hg-prog-start",
                  type: "date",
                  className: "hg-input",
                  value: startDate,
                  onChange: e => setStartDate(e.target.value)
                })
              )
            ),

            !isEdit && h("div", { style: { marginTop: 24 } },
              h("div", { className: "hg-section-label" }, "OR START WITH A PROVEN TEMPLATE"),
              h("div", { className: "hg-template-grid" },
                h("button", {
                  type: "button",
                  className: "hg-template-btn",
                  onClick: () => applyTemplate("upper_lower")
                },
                  h("div", { className: "hg-template-btn-title" }, "4-Day Upper / Lower"),
                  h("div", { className: "hg-template-btn-copy" }, "4 strength sessions with paired antagonist supersets.")
                ),
                h("button", {
                  type: "button",
                  className: "hg-template-btn",
                  onClick: () => applyTemplate("full_body")
                },
                  h("div", { className: "hg-template-btn-title" }, "3-Day Full Body"),
                  h("div", { className: "hg-template-btn-copy" }, "High-frequency compound movement rotation.")
                ),
                h("button", {
                  type: "button",
                  className: "hg-template-btn",
                  onClick: () => applyTemplate("ppl")
                },
                  h("div", { className: "hg-template-btn-title" }, "Push / Pull / Legs"),
                  h("div", { className: "hg-template-btn-copy" }, "Classic 3-day body-part targeted hypertrophy.")
                )
              )
            )
          ),

          // STEP 2: Days & Sessions
          step === 2 && h("div", { className: "hg-wizard-step-content" },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
              h("div", null,
                h("div", { className: "hg-card-title" }, "Workout Days & Sessions"),
                h("div", { className: "hg-card-copy" }, "Add, rename, or reorder the days in your weekly rotation.")
              ),
              h("button", {
                type: "button",
                className: "hg-button secondary",
                onClick: addSession
              }, "+ Add Day")
            ),

            h("div", { className: "hg-session-cards-list" },
              sessions.map((sess, idx) => h("div", { key: sess.id || idx, className: "hg-session-card-edit" },
                h("div", { className: "hg-session-card-edit-header" },
                  h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    h("span", { className: "hg-chip" }, sess.day || "Day"),
                    h("strong", null, sess.name || ("Session " + (idx + 1)))
                  ),
                  h("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                    h("button", {
                      type: "button",
                      className: "hg-icon-button",
                      title: "Move Up",
                      disabled: idx === 0,
                      onClick: () => moveSession(idx, -1)
                    }, "↑"),
                    h("button", {
                      type: "button",
                      className: "hg-icon-button",
                      title: "Move Down",
                      disabled: idx === sessions.length - 1,
                      onClick: () => moveSession(idx, 1)
                    }, "↓"),
                    h("button", {
                      type: "button",
                      className: "hg-icon-button danger",
                      title: "Delete Day",
                      onClick: () => removeSession(idx)
                    }, "🗑")
                  )
                ),
                h("div", { className: "hg-form-row", style: { marginTop: 10 } },
                  h("div", { className: "hg-form-group" },
                    h("label", { className: "hg-label" }, "Day of Week"),
                    h("select", {
                      className: "hg-select",
                      value: sess.day,
                      onChange: e => updateSession(idx, s => ({ ...s, day: e.target.value }))
                    },
                      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d =>
                        h("option", { key: d, value: d }, d)
                      )
                    )
                  ),
                  h("div", { className: "hg-form-group" },
                    h("label", { className: "hg-label" }, "Session Title"),
                    h("input", {
                      className: "hg-input",
                      placeholder: "e.g. Push A, Legs B, Upper Power",
                      value: sess.name,
                      onChange: e => updateSession(idx, s => ({ ...s, name: e.target.value }))
                    })
                  ),
                  h("div", { className: "hg-form-group" },
                    h("label", { className: "hg-label" }, "Type"),
                    h("select", {
                      className: "hg-select",
                      value: sess.type || "strength",
                      onChange: e => updateSession(idx, s => ({ ...s, type: e.target.value }))
                    },
                      h("option", { value: "strength" }, "Strength Workout"),
                      h("option", { value: "run" }, "Cardio / Run")
                    )
                  ),
                  h("div", { className: "hg-form-group" },
                    h("label", { className: "hg-label" }, "Duration"),
                    h("input", {
                      className: "hg-input",
                      placeholder: "e.g. 45–60 mins",
                      value: sess.duration || "45–60 mins",
                      onChange: e => updateSession(idx, s => ({ ...s, duration: e.target.value }))
                    })
                  )
                ),
                h("div", { style: { marginTop: 8, fontSize: 13, color: "var(--text-muted)" } },
                  (sess.exercises || []).length + " exercises configured for this day."
                )
              ))
            )
          ),

          // STEP 3: Exercise & Superset Builder
          step === 3 && h("div", { className: "hg-wizard-step-content" },
            h("div", { className: "hg-card-title" }, "Exercise & Superset Builder"),
            h("div", { className: "hg-card-copy", style: { marginBottom: 14 } },
              "Select a session tab, add exercises, and assign superset groupings (A1/A2, B1/B2) for paired antagonist circuits."
            ),

            // Session Tabs
            h("div", { className: "hg-wizard-tab-bar" },
              sessions.map((s, sIdx) => h("button", {
                key: s.id || sIdx,
                type: "button",
                className: "hg-wizard-tab-btn " + (activeSessionIdx === sIdx ? "active" : ""),
                onClick: () => setActiveSessionIdx(sIdx)
              }, (s.name || ("Day " + (sIdx + 1))) + " (" + (s.day || "") + ")"))
            ),

            // Active Session Exercises List
            h("div", { style: { marginTop: 14 } },
              h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 } },
                h("div", { className: "hg-section-label" },
                  (currentSession?.name || "Session") + " EXERCISES (" + ((currentSession?.exercises || []).length) + ")"
                ),
                h("span", { style: { fontSize: 12, color: "var(--text-muted)" } },
                  "Drag or use arrows to reorder"
                )
              ),

              (!currentSession?.exercises || currentSession.exercises.length === 0)
                ? h("div", { className: "hg-wizard-empty-box" },
                    "No exercises added to this session yet. Choose from popular exercises below or use the custom form."
                  )
                : h("div", { className: "hg-wizard-exercise-list" },
                    currentSession.exercises.map((ex, exIdx) => {
                      const sg = (ex.supersetGroup || "solo").toLowerCase();
                      const isSuperset = sg !== "solo";
                      const badgeClass = isSuperset ? ("hg-superset-badge group-" + sg) : "hg-superset-badge solo";
                      const badgeText = isSuperset ? ("GROUP " + sg.toUpperCase() + " · SUPERSET") : "SOLO · STRAIGHT SET";

                      return h("div", { key: ex.id || exIdx, className: "hg-wizard-exercise-item" },
                        h("div", { className: "hg-wizard-exercise-info" },
                          h("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
                            h("span", { className: badgeClass }, badgeText),
                            h("strong", { style: { fontSize: 15 } }, ex.name)
                          ),
                          h("div", { style: { fontSize: 13, color: "var(--text-muted)" } },
                            ex.setsReps + " · " + (ex.startValue ? (ex.startValue + "kg") : "Bodyweight") + " · rest " + (ex.restNote || "—") + (ex.equipmentType ? (" · " + ex.equipmentType) : "")
                          ),
                          ex.note && h("div", { style: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 } },
                            "Note: " + ex.note
                          )
                        ),
                        h("div", { className: "hg-wizard-exercise-actions" },
                          h("button", {
                            type: "button",
                            className: "hg-icon-button",
                            title: "Move Up",
                            disabled: exIdx === 0,
                            onClick: () => moveExercise(exIdx, -1)
                          }, "↑"),
                          h("button", {
                            type: "button",
                            className: "hg-icon-button",
                            title: "Move Down",
                            disabled: exIdx === currentSession.exercises.length - 1,
                            onClick: () => moveExercise(exIdx, 1)
                          }, "↓"),
                          h("button", {
                            type: "button",
                            className: "hg-icon-button danger",
                            title: "Remove",
                            onClick: () => removeExercise(exIdx)
                          }, "🗑")
                        )
                      );
                    })
                  )
            ),

            // Quick Pick Exercise Bank
            h("div", { style: { marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" } },
              h("div", { className: "hg-section-label", style: { marginBottom: 8 } }, "QUICK PICK POPULAR EXERCISES"),
              h("div", { className: "hg-wizard-quick-picks" },
                EXERCISE_SUGGESTIONS.map((sug, sIdx) => h("button", {
                  key: sIdx,
                  type: "button",
                  className: "hg-quick-pick-chip",
                  onClick: () => pickSuggestion(sug)
                }, "+ " + sug.name))
              )
            ),

            // Add Exercise Form
            h("div", { className: "hg-wizard-add-form", style: { marginTop: 16 } },
              h("div", { className: "hg-card-title", style: { fontSize: 14, marginBottom: 10 } },
                "Add Exercise to " + (currentSession?.name || "Current Session")
              ),
              h("div", { className: "hg-form-row" },
                h("div", { className: "hg-form-group", style: { flex: 2 } },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-name-input" }, "Exercise Name *"),
                  h("input", {
                    id: "hg-ex-name-input",
                    className: "hg-input",
                    placeholder: "e.g. Barbell Bench Press, Pull-ups",
                    value: exName,
                    onChange: e => setExName(e.target.value)
                  })
                ),
                h("div", { className: "hg-form-group" },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-sets-reps" }, "Sets × Reps"),
                  h("input", {
                    id: "hg-ex-sets-reps",
                    className: "hg-input",
                    placeholder: "4 × 6 or 3 × 8–10",
                    value: exSetsReps,
                    onChange: e => setExSetsReps(e.target.value)
                  })
                ),
                h("div", { className: "hg-form-group" },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-weight" }, "Start Weight (kg)"),
                  h("input", {
                    id: "hg-ex-weight",
                    type: "number",
                    step: "0.5",
                    className: "hg-input",
                    placeholder: "e.g. 40 (or blank)",
                    value: exWeight,
                    onChange: e => setExWeight(e.target.value)
                  })
                )
              ),

              h("div", { className: "hg-form-row", style: { marginTop: 8 } },
                h("div", { className: "hg-form-group" },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-superset" }, "Superset Assignment"),
                  h("select", {
                    id: "hg-ex-superset",
                    className: "hg-select",
                    value: exSuperset,
                    onChange: e => setExSuperset(e.target.value)
                  },
                    h("option", { value: "solo" }, "Solo (Straight Set)"),
                    h("option", { value: "a" }, "Group A (A1 / A2 Superset)"),
                    h("option", { value: "b" }, "Group B (B1 / B2 Superset)"),
                    h("option", { value: "c" }, "Group C (C1 / C2 Superset)"),
                    h("option", { value: "d" }, "Group D (D1 / D2 Superset)")
                  )
                ),
                h("div", { className: "hg-form-group" },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-rest" }, "Rest Note"),
                  h("input", {
                    id: "hg-ex-rest",
                    className: "hg-input",
                    placeholder: "e.g. 90s, 2 mins, 60s",
                    value: exRest,
                    onChange: e => setExRest(e.target.value)
                  })
                ),
                h("div", { className: "hg-form-group" },
                  h("label", { className: "hg-label", htmlFor: "hg-ex-equip" }, "Equipment"),
                  h("select", {
                    id: "hg-ex-equip",
                    className: "hg-select",
                    value: exEquipment,
                    onChange: e => setExEquipment(e.target.value)
                  },
                    h("option", { value: "barbell" }, "Barbell"),
                    h("option", { value: "dumbbell" }, "Dumbbell"),
                    h("option", { value: "cable" }, "Cable"),
                    h("option", { value: "machine" }, "Machine"),
                    h("option", { value: "bodyweight" }, "Bodyweight")
                  )
                )
              ),

              h("div", { className: "hg-form-group", style: { marginTop: 8 } },
                h("label", { className: "hg-label", htmlFor: "hg-ex-cues" }, "Technique Cues / Notes (Optional)"),
                h("input", {
                  id: "hg-ex-cues",
                  className: "hg-input",
                  placeholder: "e.g. Retract scapula, pause 1s at bottom",
                  value: exNote,
                  onChange: e => setExNote(e.target.value)
                })
              ),

              h("button", {
                type: "button",
                className: "hg-button secondary",
                style: { marginTop: 10, width: "100%" },
                onClick: addExercise
              }, "+ Add Exercise to " + (currentSession?.name || "Session"))
            )
          )
        ),

        // Modal Footer
        h("div", { className: "hg-modal-footer" },
          step > 1 && h("button", {
            type: "button",
            className: "hg-button secondary",
            onClick: () => setStep(step - 1)
          }, "← Back"),

          h("div", { style: { display: "flex", gap: 10 } },
            h("button", {
              type: "button",
              className: "hg-button secondary",
              onClick: onClose
            }, "Cancel"),

            step < 3 && h("button", {
              type: "button",
              className: "hg-button primary",
              onClick: () => {
                if (step === 1 && !name.trim()) {
                  showToast("Please enter a Program Name");
                  return;
                }
                if (step === 2 && !sessions.length) {
                  showToast("Add at least 1 session day");
                  return;
                }
                setStep(step + 1);
              }
            }, "Next Step →"),

            step === 3 && h("button", {
              type: "button",
              className: "hg-button primary",
              disabled: saving,
              onClick: handleSave
            }, saving ? "Saving Program…" : "Save Program to Firestore & Set Active ✓")
          )
        )
      )
    );
  }

  // =========================================================================
  // Data Exporter & Backup Engine (schemaVersion: 3 with health tracking stores)
  // =========================================================================

  function exportBackupJSON(store) {
    const people = {};
    const candidateProfiles = new Set(["elliott", "chloe"]);

    // Detect any additional user profiles in localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("data:")) {
          const id = k.slice(5).trim();
          if (id) candidateProfiles.add(id);
        }
      }
    } catch (e) {}

    const profiles = Array.from(candidateProfiles);

    profiles.forEach(pId => {
      const pData = (store && store[pId]) ? store[pId] : loadDecoupledProfile(pId);
      const decoupled = loadDecoupledProfile(pId);

      const bodyWeightLogs = (Array.isArray(pData.bodyWeightLogs) && pData.bodyWeightLogs.length > 0)
        ? pData.bodyWeightLogs
        : (decoupled.bodyWeightLogs || []);

      const readinessLogs = (Array.isArray(pData.readinessLogs) && pData.readinessLogs.length > 0)
        ? pData.readinessLogs
        : (decoupled.readinessLogs || []);

      let sleepLogs = (Array.isArray(pData.sleepLogs) && pData.sleepLogs.length > 0)
        ? pData.sleepLogs
        : (decoupled.sleepLogs || []);

      if (!Array.isArray(sleepLogs) || sleepLogs.length === 0) {
        if (Array.isArray(readinessLogs) && readinessLogs.length > 0) {
          sleepLogs = readinessLogs.map(r => {
            const h = r.sleepHours != null ? Number(r.sleepHours) : Math.floor(Number(r.sleep) || 0);
            const m = r.sleepMins != null ? Number(r.sleepMins) : Math.round(((Number(r.sleep) || 0) % 1) * 60);
            return {
              id: r.id ? `slp_${r.id}` : `slp_${r.date}`,
              date: r.date,
              hours: h,
              mins: m,
              totalHours: r.sleep != null ? Number(r.sleep) : Math.round((h + m / 60) * 100) / 100,
              notes: r.notes || "",
              timestamp: r.timestamp || Date.now()
            };
          });
        }
      }

      people[pId] = {
        startDate: pData.startDate || decoupled.startDate || "2026-09-07",
        goals: pData.goals || decoupled.goals || "",
        resumeNote: pData.resumeNote || decoupled.resumeNote || "",
        sessions: Array.isArray(pData.sessions) && pData.sessions.length > 0 ? pData.sessions : (decoupled.sessions || []),
        weekOverrides: pData.weekOverrides || decoupled.weekOverrides || {},
        logs: Array.isArray(pData.logs) && pData.logs.length > 0 ? pData.logs : (decoupled.logs || []),
        bodyWeightLogs: Array.isArray(bodyWeightLogs) ? bodyWeightLogs : [],
        sleepLogs: Array.isArray(sleepLogs) ? sleepLogs : [],
        readinessLogs: Array.isArray(readinessLogs) ? readinessLogs : [],
        updatedAt: pData.updatedAt || Date.now(),
        rawLocalStorage: {
          [`data:${pId}`]: localStorage.getItem(`data:${pId}`),
          [`hg_readiness_${pId}`]: localStorage.getItem(`hg_readiness_${pId}`),
          [`hg_sleep_${pId}`]: localStorage.getItem(`hg_sleep_${pId}`),
          [`hg_metrics_${pId}`]: localStorage.getItem(`hg_metrics_${pId}`),
          [`plateplan_v1_${pId}`]: localStorage.getItem(`plateplan_v1_${pId}`)
        }
      };
    });

    const backup = {
      schemaVersion: 3,
      app: "home-gym-log",
      type: "full-backup",
      version: "2.5.0",
      exportedAt: (I.W ? I.W() : new Date().toISOString().slice(0, 10)),
      timestamp: Date.now(),
      instructions: "Comprehensive full backup of both profiles, including sessions, day overrides, logged exercise history, and all health tracking stores (body weight, sleep, readiness) and offline queues.",
      globalSettings: {
        pin: localStorage.getItem("hg_pin") || "",
        appearance: localStorage.getItem("hg_appearance") || "system"
      },
      offlineQueues: {
        pending: PlatePlanSyncEngine.getOfflineQueue(),
        deadLetter: PlatePlanSyncEngine.getDeadLetterQueue()
      },
      people
    };

    return backup;
  }

  async function restoreBackupJSON(payload, updateData, showToast) {
    if (!payload || typeof payload !== "object" || !payload.people) {
      throw new Error("Invalid backup format: missing 'people' profile data.");
    }

    const profiles = Object.keys(payload.people);
    let count = 0;

    for (const pId of profiles) {
      const pBackup = payload.people[pId];
      if (!pBackup) continue;

      const sessions = Array.isArray(pBackup.sessions) && pBackup.sessions.length > 0
        ? pBackup.sessions
        : (I.K && I.K[pId] ? I.K[pId].sessions : []);
      const weekOverrides = pBackup.weekOverrides || {};
      const logs = Array.isArray(pBackup.logs) ? pBackup.logs : [];
      const bodyWeightLogs = Array.isArray(pBackup.bodyWeightLogs)
        ? pBackup.bodyWeightLogs
        : (Array.isArray(pBackup.weights) ? pBackup.weights : []);
      const readinessLogs = Array.isArray(pBackup.readinessLogs)
        ? pBackup.readinessLogs
        : (Array.isArray(pBackup.readiness) ? pBackup.readiness : []);
      const sleepLogs = Array.isArray(pBackup.sleepLogs) ? pBackup.sleepLogs : [];

      // Restore raw keys if present
      if (pBackup.rawLocalStorage && typeof pBackup.rawLocalStorage === "object") {
        try {
          Object.entries(pBackup.rawLocalStorage).forEach(([k, v]) => {
            if (v != null) localStorage.setItem(k, v);
          });
        } catch (e) {}
      }

      // 1. Explicitly write local storage caches & standalone health keys
      storageSet(`hg_metrics_${pId}`, bodyWeightLogs);
      storageSet(`hg_readiness_${pId}`, readinessLogs);
      storageSet(`hg_sleep_${pId}`, sleepLogs);

      // Sync legacy storage keys (data:pId, plateplan_v1_pId)
      syncLegacyStorage(pId, {
        bodyWeightLogs,
        readinessLogs,
        sleepLogs,
        sessions,
        weekOverrides,
        logs,
        startDate: pBackup.startDate,
        goals: pBackup.goals,
        resumeNote: pBackup.resumeNote
      });

      // 2. Sync to cloud Firestore collections
      for (const bw of bodyWeightLogs) {
        try { await GymCloudEngine.saveBodyweightLog(pId, bw, { skipQueue: true }); } catch (e) {}
      }
      for (const rd of readinessLogs) {
        try { await GymCloudEngine.saveReadinessLog(pId, rd, { skipQueue: true }); } catch (e) {}
      }
      for (const sl of sleepLogs) {
        try { await GymCloudEngine.saveSleepLog(pId, sl, { skipQueue: true }); } catch (e) {}
      }
      for (const lg of logs) {
        try { await GymCloudEngine.saveExerciseLog(pId, lg, { skipQueue: true }); } catch (e) {}
      }
      try {
        await GymCloudEngine.saveActiveProgram(pId, {
          startDate: pBackup.startDate,
          goals: pBackup.goals,
          resumeNote: pBackup.resumeNote,
          sessions,
          weekOverrides,
          updatedAt: Date.now()
        }, { skipQueue: true });
      } catch (e) {}

      // 3. React state update
      if (updateData) {
        await updateData(pId, cur => ({
          ...cur,
          startDate: pBackup.startDate || cur.startDate,
          goals: pBackup.goals || cur.goals,
          resumeNote: pBackup.resumeNote || cur.resumeNote,
          sessions,
          weekOverrides,
          logs,
          bodyWeightLogs,
          readinessLogs,
          sleepLogs,
          updatedAt: Date.now()
        }));
      }

      // 4. Trigger cloud synchronization check
      PlatePlanSyncEngine.syncPlatePlanWithFirestore(pId).catch(() => {});

      count++;
    }

    // Restore global settings if present
    if (payload.globalSettings) {
      if (payload.globalSettings.pin) {
        localStorage.setItem("hg_pin", payload.globalSettings.pin);
      }
      if (payload.globalSettings.appearance) {
        localStorage.setItem("hg_appearance", payload.globalSettings.appearance);
      }
    }

    if (showToast) {
      showToast(`Restored backup for ${count} profile(s) with all health logs`);
    }
    return count;
  }

  // Hook into internal exports and window for accessibility
  try {
    if (window.HG_INTERNALS) {
      window.HG_INTERNALS.tt = exportBackupJSON;
    }
    window.exportBackupJSON = exportBackupJSON;
    window.restoreBackupJSON = restoreBackupJSON;

    window.exportFullBackup = function(options = { download: true }) {
      try {
        const store = window.__HG_STORE__ || {
          elliott: loadDecoupledProfile("elliott"),
          chloe: loadDecoupledProfile("chloe")
        };
        const payload = exportBackupJSON(store);
        if (options.download !== false) {
          const dateStr = (I.W ? I.W() : new Date().toISOString().slice(0, 10));
          downloadFile(payload, `training-full-backup-${dateStr}.json`);
        }
        if (typeof window.__HG_SHOW_TOAST__ === "function") {
          window.__HG_SHOW_TOAST__("Exported full backup (.json)");
        } else {
          console.log("Full backup exported successfully:", payload);
        }
        return payload;
      } catch (err) {
        console.error("exportFullBackup error, trying exportRecoveredData fallback:", err);
        if (typeof window.exportRecoveredData === "function") {
          return window.exportRecoveredData(options);
        }
        throw err;
      }
    };
  } catch (e) {}

  function downloadFile(data, filename, type = "application/json") {
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Format helper: Display only sets and target reps (stripping out target weight text)
  function formatMetricOnly(setsReps) {
    if (!setsReps) return "—";
    return String(setsReps)
      .replace(/@\s*[\d.]+\s*(kg|lb)?/gi, "")
      .replace(/\([\d.]+\s*(kg|lb)?\)/gi, "")
      .replace(/@\s*[a-zA-Z]+/gi, "")
      .trim() || setsReps;
  }

  // Format helper: Handle all progression weight steps exclusively inside progression column
  function formatProgressionSteps(ex) {
    if (!ex) return "—";
    const unit = ex.unit || "kg";
    if (Array.isArray(ex.blocks) && ex.blocks.length > 0) {
      return ex.blocks.map(b => `${b} ${unit}`).join(", ");
    }
    if (ex.startValue != null && ex.startValue !== "") {
      const s = Number(ex.startValue);
      if (!Number.isNaN(s) && ex.inc) {
        const step = Number(ex.inc);
        return [s, s + step, s + step * 2, s + step * 3].map(v => `${v} ${unit}`).join(", ");
      }
      return `${ex.startValue} ${unit}`;
    }
    if (ex.startLabel) {
      return ex.startLabel;
    }
    if (ex.targetWeight != null) {
      return `Goal: ${ex.targetWeight} ${unit}`;
    }
    return "Bodyweight";
  }

  function extractSessionExercises(session) {
    if (!session) return [];
    if (Array.isArray(session.exercises) && session.exercises.length > 0) {
      return session.exercises.map((ex, idx) => ({
        ...ex,
        supersetTag: ex.supersetGroup && ex.supersetGroup !== "solo"
          ? (ex.supersetGroup.toUpperCase() + (idx + 1))
          : (ex.supersetTag || "SOLO")
      }));
    }
    if (Array.isArray(session.groups)) {
      const list = [];
      session.groups.forEach((grp, gIdx) => {
        const gLetter = (grp.label || "").replace(/^Group\s*/i, "").trim().slice(0, 1).toUpperCase();
        (grp.exercises || []).forEach((ex, exIdx) => {
          const tag = gLetter ? `${gLetter}${exIdx + 1}` : (ex.supersetGroup && ex.supersetGroup !== "solo" ? ex.supersetGroup.toUpperCase() : "SOLO");
          list.push({
            ...ex,
            _groupIndex: gIdx,
            _groupLabel: grp.label || `Group ${String.fromCharCode(65 + gIdx)}`,
            supersetTag: tag
          });
        });
      });
      return list;
    }
    return [];
  }

  function commitExercisesToSession(session, exercisesList) {
    if (Array.isArray(session.groups) && session.groups.length > 0) {
      const groupMap = new Map();
      exercisesList.forEach(ex => {
        const gLabel = ex._groupLabel || (ex.supersetGroup && ex.supersetGroup !== "solo" ? `Group ${ex.supersetGroup.toUpperCase()}` : "Straight Sets");
        if (!groupMap.has(gLabel)) {
          groupMap.set(gLabel, []);
        }
        const { _groupIndex, _groupLabel, supersetTag, ...cleanEx } = ex;
        groupMap.get(gLabel).push(cleanEx);
      });

      const groups = Array.from(groupMap.entries()).map(([label, exercises]) => ({
        label,
        exercises
      }));

      return {
        ...session,
        groups,
        exercises: exercisesList.map(ex => {
          const { _groupIndex, _groupLabel, supersetTag, ...cleanEx } = ex;
          return cleanEx;
        })
      };
    }

    return {
      ...session,
      exercises: exercisesList.map(ex => {
        const { _groupIndex, _groupLabel, supersetTag, ...cleanEx } = ex;
        return cleanEx;
      })
    };
  }

  // Exercise Edit Modal Sheet
  function ExerciseSheetModal({ exercise, isNew, onSave, onClose }) {
    const [name, setName] = useState(exercise?.name || "");
    const [setsReps, setSetsReps] = useState(exercise?.setsReps || "4 × 6");
    const [startValue, setStartValue] = useState(exercise?.startValue != null ? String(exercise.startValue) : "");
    const [unit, setUnit] = useState(exercise?.unit || "kg");
    const [blocksInput, setBlocksInput] = useState(
      Array.isArray(exercise?.blocks) ? exercise.blocks.join(", ") : ""
    );
    const [supersetGroup, setSupersetGroup] = useState(exercise?.supersetGroup || "solo");
    const [equipmentType, setEquipmentType] = useState(exercise?.equipmentType || "Barbell");
    const [restNote, setRestNote] = useState(exercise?.restNote || "90s");
    const [note, setNote] = useState(exercise?.note || "");

    const suggestionChips = [
      "Barbell Bench Press",
      "Barbell Squat",
      "Deadlift",
      "Overhead Press",
      "Barbell Row",
      "Romanian Deadlift",
      "Incline Dumbbell Press",
      "Pull-Up",
      "Dumbbell Lateral Raise",
      "Hanging Leg Raise"
    ];

    function handleSave(e) {
      e.preventDefault();
      if (!name.trim()) return;

      const parsedBlocks = blocksInput
        .split(",")
        .map(s => Number(s.trim()))
        .filter(n => !Number.isNaN(n) && n > 0);

      onSave({
        ...exercise,
        name: name.trim(),
        setsReps: setsReps.trim(),
        startValue: startValue ? Number(startValue) : null,
        unit,
        blocks: parsedBlocks.length > 0 ? parsedBlocks : (exercise?.blocks || []),
        supersetGroup,
        equipmentType,
        restNote: restNote.trim(),
        note: note.trim()
      });
    }

    return h("div", { className: "hg-hig-modal-backdrop", onClick: onClose },
      h("div", { className: "hg-modal", style: { maxWidth: 520, width: "100%" }, onClick: e => e.stopPropagation() },
        h("div", { className: "hg-modal-head" },
          h("h2", null, isNew ? "New Exercise" : "Edit Exercise"),
          h("button", { type: "button", className: "hg-icon-button", onClick: onClose, "aria-label": "Close" }, "×")
        ),
        h("form", { onSubmit: handleSave },
          h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
            h(Field, { label: "Exercise Name" },
              h("input", {
                className: "hg-input",
                type: "text",
                required: true,
                value: name,
                onChange: e => setName(e.target.value),
                placeholder: "e.g., Barbell Bench Press"
              }),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } },
                suggestionChips.map(chip =>
                  h("button", {
                    key: chip,
                    type: "button",
                    className: "hg-bank-chip",
                    onClick: () => setName(chip)
                  }, chip)
                )
              )
            ),

            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
              h(Field, { label: "Sets × Reps (Metric only)" },
                h("input", {
                  className: "hg-input",
                  type: "text",
                  value: setsReps,
                  onChange: e => setSetsReps(e.target.value),
                  placeholder: "e.g. 4 × 6 or 3 × 8–10"
                })
              ),
              h(Field, { label: "Superset Pairing" },
                h("select", {
                  className: "hg-input",
                  value: supersetGroup,
                  onChange: e => setSupersetGroup(e.target.value)
                },
                  h("option", { value: "solo" }, "Straight Sets (Solo)"),
                  h("option", { value: "a" }, "Superset Group A"),
                  h("option", { value: "b" }, "Superset Group B"),
                  h("option", { value: "c" }, "Superset Group C")
                )
              )
            ),

            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
              h(Field, { label: "Starting Weight" },
                h("input", {
                  className: "hg-input",
                  type: "number",
                  step: "0.5",
                  value: startValue,
                  onChange: e => setStartValue(e.target.value),
                  placeholder: "e.g. 46"
                })
              ),
              h(Field, { label: "Unit" },
                h("select", {
                  className: "hg-input",
                  value: unit,
                  onChange: e => setUnit(e.target.value)
                },
                  h("option", { value: "kg" }, "Kilograms (kg)"),
                  h("option", { value: "lb" }, "Pounds (lb)")
                )
              )
            ),

            h(Field, { label: "Progression Weight Steps (comma-separated)" },
              h("input", {
                className: "hg-input",
                type: "text",
                value: blocksInput,
                onChange: e => setBlocksInput(e.target.value),
                placeholder: "e.g. 46, 49, 51.5, 54"
              })
            ),

            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
              h(Field, { label: "Equipment" },
                h("select", {
                  className: "hg-input",
                  value: equipmentType,
                  onChange: e => setEquipmentType(e.target.value)
                },
                  h("option", { value: "Barbell" }, "Barbell"),
                  h("option", { value: "Dumbbell" }, "Dumbbell"),
                  h("option", { value: "Cable" }, "Cable"),
                  h("option", { value: "Machine" }, "Machine"),
                  h("option", { value: "Bodyweight" }, "Bodyweight")
                )
              ),
              h(Field, { label: "Rest Interval" },
                h("input", {
                  className: "hg-input",
                  type: "text",
                  value: restNote,
                  onChange: e => setRestNote(e.target.value),
                  placeholder: "e.g. 90s after A2"
                })
              )
            ),

            h(Field, { label: "Form Cues & Notes" },
              h("input", {
                className: "hg-input",
                type: "text",
                value: note,
                onChange: e => setNote(e.target.value),
                placeholder: "e.g. Plant feet, chest up, control eccentric"
              })
            )
          ),

          h("div", { className: "hg-actions", style: { marginTop: 22, justifyContent: "flex-end" } },
            h("button", {
              type: "button",
              className: "hg-button secondary",
              onClick: onClose
            }, "Cancel"),
            h("button", {
              type: "submit",
              className: "hg-btn-primary-hig"
            }, isNew ? "Add Exercise ✓" : "Save Changes ✓")
          )
        )
      )
    );
  }

  // HIG Plan View Component
  function PlanView({ personId, data, store, meta, updateData, showToast }) {
    const [activeSessionIdx, setActiveSessionIdx] = useState(0);
    const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
    const [rowMenuId, setRowMenuId] = useState(null);
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Modals
    const [editingExercise, setEditingExercise] = useState(null);
    const [isNewExercise, setIsNewExercise] = useState(false);
    const [deletingExercise, setDeletingExercise] = useState(null);
    const [pendingRestoreData, setPendingRestoreData] = useState(null);
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [equipmentOpen, setEquipmentOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [wizardState, setWizardState] = useState({ open: false, initialProgram: null, mode: "create" });
    const [savedPrograms, setSavedPrograms] = useState([]);

    const fileInputRef = useRef(null);

    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const activeSession = sessions[activeSessionIdx] || sessions[0] || null;
    const exercises = (useMemo || React.useMemo)(() => extractSessionExercises(activeSession), [activeSession]);

    const activeProgramName = data.programName || "Current Routine";
    const sessionCount = sessions.length;

    const loadSaved = useCallback(async () => {
      try {
        const progs = await GymCloudEngine.loadProgramsFromSubcollection(personId);
        setSavedPrograms(progs);
      } catch (e) {}
    }, [personId]);

    useEffect(() => {
      loadSaved();
    }, [loadSaved]);

    // Close menus on outside click
    useEffect(() => {
      function handleClickOutside(e) {
        if (!e.target.closest(".hg-plan-actions")) {
          setOverflowMenuOpen(false);
        }
        if (!e.target.closest(".hg-row-popover") && !e.target.closest(".hg-hig-action-btn")) {
          setRowMenuId(null);
        }
      }
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    // Session updater helper
    function updateActiveSession(updatedSession) {
      updateData(personId, cur => {
        const nextSessions = (cur.sessions || []).map((s, idx) => {
          if (idx !== activeSessionIdx && s.id !== activeSession?.id) return s;
          return updatedSession;
        });
        const next = { ...cur, sessions: nextSessions, updatedAt: Date.now() };
        try {
          localStorage.setItem(`plateplan_v1:${personId}`, JSON.stringify({
            sessions: nextSessions,
            startDate: cur.startDate,
            goals: cur.goals,
            updatedAt: Date.now()
          }));
          localStorage.setItem(`data:${personId}`, JSON.stringify(next));
        } catch (e) {}
        GymCloudEngine.savePlatePlanState(personId, nextSessions, cur.startDate, cur.goals);
        return next;
      });
    }

    // Drag-and-drop exercise reordering
    function handleDragStart(e, idx) {
      setDragIndex(idx);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      } catch (err) {}
    }

    function handleDragOver(e, idx) {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (err) {}
      if (dragOverIndex !== idx) {
        setDragOverIndex(idx);
      }
    }

    function handleDrop(e, targetIdx) {
      e.preventDefault();
      if (dragIndex === null || dragIndex === targetIdx) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      const updatedList = [...exercises];
      const [moved] = updatedList.splice(dragIndex, 1);
      updatedList.splice(targetIdx, 0, moved);
      const updatedSession = commitExercisesToSession(activeSession, updatedList);
      updateActiveSession(updatedSession);
      showToast("Reordered exercises");
      setDragIndex(null);
      setDragOverIndex(null);
    }

    // Exercise CRUD Handlers
    function handleNewExercise() {
      setIsNewExercise(true);
      setEditingExercise({
        id: "ex_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        name: "",
        setsReps: "4 × 6",
        unit: "kg",
        startValue: "",
        blocks: [],
        supersetGroup: "solo",
        equipmentType: "Barbell",
        restNote: "90s",
        note: ""
      });
    }

    function handleDuplicateExercise(ex, index) {
      const newId = "ex_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
      const cloned = {
        ...ex,
        id: newId,
        name: `${ex.name} (Copy)`
      };
      const updatedList = [...exercises];
      updatedList.splice(index + 1, 0, cloned);
      const updatedSession = commitExercisesToSession(activeSession, updatedList);
      updateActiveSession(updatedSession);
      setRowMenuId(null);
      showToast(`Duplicated "${ex.name}"`);
    }

    function handleSaveExercise(savedEx) {
      let updatedList;
      if (isNewExercise) {
        updatedList = [...exercises, savedEx];
        showToast(`Added "${savedEx.name}"`);
      } else {
        updatedList = exercises.map(e => (e.id === savedEx.id ? { ...e, ...savedEx } : e));
        showToast(`Updated "${savedEx.name}"`);
      }
      const updatedSession = commitExercisesToSession(activeSession, updatedList);
      updateActiveSession(updatedSession);
      setEditingExercise(null);
    }

    function handleConfirmDeleteExercise() {
      if (!deletingExercise) return;
      const updatedList = exercises.filter(e => e.id !== deletingExercise.id);
      const updatedSession = commitExercisesToSession(activeSession, updatedList);
      updateActiveSession(updatedSession);
      showToast(`Removed "${deletingExercise.name}"`);
      setDeletingExercise(null);
    }

    // Backup & Restore Handlers
    function handleDownloadBackup() {
      setOverflowMenuOpen(false);
      const payload = exportBackupJSON(store);
      const dateStr = I.W ? I.W() : new Date().toISOString().slice(0, 10);
      downloadFile(payload, `training-full-backup-${dateStr}.json`);
      showToast("Downloaded full backup with health logs (schemaVersion: 3)");
    }

    function handleFileSelected(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (!parsed || typeof parsed !== "object" || !parsed.people) {
            showToast("Invalid backup file: missing 'people' profile mappings");
            return;
          }
          setPendingRestoreData(parsed);
        } catch (err) {
          showToast("Failed to parse JSON file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    }

    async function handleConfirmRestore() {
      if (!pendingRestoreData) return;
      try {
        await restoreBackupJSON(pendingRestoreData, updateData, showToast);
      } catch (err) {
        showToast("Restore failed: " + (err?.message || "Unknown error"));
      } finally {
        setPendingRestoreData(null);
      }
    }

    function handleConfirmReset() {
      const defaultProg = I.K?.[personId]?.sessions;
      if (!defaultProg) {
        showToast("No default program found for " + meta.label);
        return;
      }
      updateData(personId, cur => {
        const next = {
          ...cur,
          sessions: defaultProg,
          programName: "Default 4-Day Plan",
          updatedAt: Date.now()
        };
        try {
          localStorage.setItem(`plateplan_v1:${personId}`, JSON.stringify({
            sessions: defaultProg,
            startDate: cur.startDate,
            goals: cur.goals,
            updatedAt: Date.now()
          }));
          localStorage.setItem(`data:${personId}`, JSON.stringify(next));
        } catch (e) {}
        GymCloudEngine.savePlatePlanState(personId, defaultProg, cur.startDate, cur.goals);
        return next;
      });
      showToast("Reset to default program");
      setResetModalOpen(false);
    }

    function handleExportPlanOnly() {
      setOverflowMenuOpen(false);
      const payload = {
        schemaVersion: 3,
        app: "home-gym-log",
        type: "plan-export",
        exportedAt: I.W ? I.W() : new Date().toISOString().slice(0, 10),
        person: personId,
        sessions: data.sessions
      };
      downloadFile(payload, `training-plan-${personId}-${payload.exportedAt}.json`);
      showToast("Exported plan definition");
    }

    function handleDownloadReminders() {
      setOverflowMenuOpen(false);
      try {
        if (I.at && I.rt) {
          const ics = I.at(store, 9);
          I.rt(ics, `training-reminders-${personId}.ics`);
          showToast("Downloaded workout calendar reminders (.ics)");
        }
      } catch (e) {
        showToast("Calendar generator unavailable");
      }
    }

    return h("div", { className: "hg-plan-container" },
      // Hidden file input for restore
      h("input", {
        type: "file",
        ref: fileInputRef,
        accept: ".json,application/json",
        style: { display: "none" },
        onChange: handleFileSelected
      }),

      // Apple HIG Header: Clean title + single primary CTA + top-right overflow menu
      h("div", { className: "hg-plan-header" },
        h("div", { className: "hg-plan-title-area" },
          h("h1", { style: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em" } }, "Plan"),
          h("div", { style: { fontSize: 13.5, color: "var(--hg-text-2)", marginTop: 2 } },
            `${meta.label} · ${activeProgramName} · ${sessionCount} days/week`
          )
        ),
        h("div", { className: "hg-plan-actions" },
          // Primary Call-to-Action: + New exercise
          h("button", {
            type: "button",
            id: "hg-btn-new-exercise",
            className: "hg-btn-primary-hig",
            onClick: handleNewExercise
          }, "+ New exercise"),

          // Overflow Menu Button (•••)
          h("button", {
            type: "button",
            id: "hg-btn-plan-overflow",
            className: "hg-btn-overflow-hig",
            "aria-label": "Program & backup options",
            title: "More options",
            onClick: e => {
              e.stopPropagation();
              setOverflowMenuOpen(!overflowMenuOpen);
            }
          }, "•••"),

          // Overflow Menu Popover
          overflowMenuOpen && h("div", { className: "hg-overflow-menu", onClick: e => e.stopPropagation() },
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: handleDownloadBackup
            }, "📥 Download backup"),
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: () => {
                setOverflowMenuOpen(false);
                fileInputRef.current?.click();
              }
            }, "📤 Restore from backup…"),
            h("button", {
              type: "button",
              className: "hg-menu-item danger",
              onClick: () => {
                setOverflowMenuOpen(false);
                setResetModalOpen(true);
              }
            }, "🔄 Reset to default program…"),

            h("div", { className: "hg-menu-divider" }),

            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: handleExportPlanOnly
            }, "📋 Export plan only (.json)"),
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: handleDownloadReminders
            }, "🗓 Download reminders (.ics)"),
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: () => {
                setOverflowMenuOpen(false);
                setWizardState({ open: true, initialProgram: null, mode: "create" });
              }
            }, "🧙 Program creation wizard"),
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: () => {
                setOverflowMenuOpen(false);
                setEquipmentOpen(!equipmentOpen);
              }
            }, "🛠 Equipment & plates"),
            h("button", {
              type: "button",
              className: "hg-menu-item",
              onClick: () => {
                setOverflowMenuOpen(false);
                const monday = I.j ? I.j(I.W()) : "this_week";
                const active = I.HGgetDeload ? I.HGgetDeload(personId) === monday : false;
                if (I.HGsetDeload) I.HGsetDeload(personId, active ? null : monday);
                showToast(active ? "Deload cleared" : "Deload set for this week");
              }
            }, "⏸ Toggle weekly deload")
          )
        )
      ),

      // Session Segmented Control (Apple HIG Navigation Tabs)
      sessions.length > 1 && h("div", { className: "hg-session-nav" },
        sessions.map((s, idx) =>
          h("button", {
            key: s.id || idx,
            type: "button",
            className: "hg-session-tab " + (activeSessionIdx === idx ? "active" : ""),
            onClick: () => setActiveSessionIdx(idx)
          }, `${s.day || `Day ${idx + 1}`}: ${s.name}`)
        )
      ),

      // Inset-Grouped Session Card
      activeSession && h("div", { className: "hg-session-card" },
        h("div", { className: "hg-session-card-header" },
          h("div", null,
            h("strong", { style: { fontSize: 16, color: "var(--hg-text)" } }, activeSession.name),
            h("div", { className: "hg-session-meta", style: { marginTop: 4 } },
              h("span", null, `${exercises.length} exercises`),
              activeSession.duration && h("span", null, `· ${activeSession.duration}`),
              activeSession.type && h("span", {
                className: "hg-progression-pill",
                style: { textTransform: "capitalize" }
              }, activeSession.type)
            )
          ),
          h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            h("span", { style: { fontSize: 13, color: "var(--hg-text-2)" } }, "Day:"),
            h("select", {
              className: "hg-input",
              style: { minHeight: 32, padding: "2px 8px", fontSize: 13 },
              value: activeSession.day || "Mon",
              onChange: e => {
                const updated = { ...activeSession, day: e.target.value };
                updateActiveSession(updated);
              }
            },
              ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d =>
                h("option", { key: d, value: d }, d)
              )
            )
          )
        ),

        // Streamlined HIG Exercise Table
        h("div", { className: "hg-hig-table-wrap" },
          h("table", { className: "hg-hig-table" },
            h("thead", null,
              h("tr", null,
                h("th", { className: "hg-hig-th", style: { width: 36, textAlign: "center" } }),
                h("th", { className: "hg-hig-th" }, "Exercise"),
                h("th", { className: "hg-hig-th", style: { width: 140 } }, "Metric"),
                h("th", { className: "hg-hig-th" }, "Progression"),
                h("th", { className: "hg-hig-th", style: { width: 44, textAlign: "center" } })
              )
            ),
            h("tbody", null,
              exercises.length === 0 && h("tr", null,
                h("td", { colSpan: 5, className: "hg-hig-td", style: { textAlign: "center", padding: "36px 16px", color: "var(--hg-text-2)" } },
                  "No exercises in this session. Tap '+ New exercise' above to add your first movement."
                )
              ),
              exercises.map((ex, idx) => {
                const isDragging = dragIndex === idx;
                const isDragOver = dragOverIndex === idx;

                return h("tr", {
                  key: ex.id || idx,
                  className: "hg-hig-row " + (isDragging ? "dragging" : "") + (isDragOver ? "drag-over" : ""),
                  onDragOver: e => handleDragOver(e, idx),
                  onDrop: e => handleDrop(e, idx)
                },
                  // Drag Handle (⋮⋮)
                  h("td", { className: "hg-hig-td", style: { width: 36, padding: "10px 4px 10px 12px", textAlign: "center" } },
                    h("span", {
                      className: "hg-drag-handle",
                      draggable: true,
                      title: "Drag to reorder",
                      onDragStart: e => handleDragStart(e, idx),
                      onDragEnd: () => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }
                    }, "⋮⋮")
                  ),

                  // Exercise Column
                  h("td", { className: "hg-hig-td" },
                    h("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
                      ex.supersetTag && h("span", {
                        className: "hg-progression-pill",
                        style: {
                          color: "var(--person-accent, #0969da)",
                          borderColor: "color-mix(in srgb, var(--person-accent, #0969da) 30%, transparent)",
                          fontSize: 11,
                          fontWeight: 700
                        }
                      }, ex.supersetTag),
                      h("strong", { style: { fontSize: 14.5, color: "var(--hg-text)" } }, ex.name)
                    ),
                    (ex.equipmentType || ex.note || ex.restNote) && h("div", {
                      style: { fontSize: 12.5, color: "var(--hg-text-2)", marginTop: 3 }
                    },
                      [ex.equipmentType, ex.restNote ? `Rest: ${ex.restNote}` : null, ex.note]
                        .filter(Boolean)
                        .join(" · ")
                    )
                  ),

                  // Metric Column: Sets × Reps ONLY (Target weight stripped out)
                  h("td", { className: "hg-hig-td" },
                    h("span", { className: "hg-metric-text" },
                      formatMetricOnly(ex.setsReps)
                    )
                  ),

                  // Progression Column: Weight steps exclusively
                  h("td", { className: "hg-hig-td" },
                    h("div", { className: "hg-progression-cell" },
                      formatProgressionSteps(ex)
                    )
                  ),

                  // Context Action Menu (⋮)
                  h("td", { className: "hg-hig-td", style: { width: 44, textAlign: "center", position: "relative" } },
                    h("button", {
                      type: "button",
                      className: "hg-hig-action-btn",
                      title: "Exercise actions",
                      onClick: e => {
                        e.stopPropagation();
                        setRowMenuId(rowMenuId === ex.id ? null : ex.id);
                      }
                    }, "⋮"),

                    rowMenuId === ex.id && h("div", {
                      className: "hg-row-popover",
                      onClick: e => e.stopPropagation()
                    },
                      h("button", {
                        type: "button",
                        className: "hg-menu-item",
                        onClick: () => {
                          setRowMenuId(null);
                          setIsNewExercise(false);
                          setEditingExercise(ex);
                        }
                      }, "✎ Edit exercise"),
                      h("button", {
                        type: "button",
                        className: "hg-menu-item",
                        onClick: () => handleDuplicateExercise(ex, idx)
                      }, "⎘ Duplicate"),
                      h("div", { className: "hg-menu-divider" }),
                      h("button", {
                        type: "button",
                        className: "hg-menu-item danger",
                        onClick: () => {
                          setRowMenuId(null);
                          setDeletingExercise(ex);
                        }
                      }, "🗑 Delete")
                    )
                  )
                );
              })
            )
          )
        )
      ),

      // Collapsible Equipment Section
      equipmentOpen && h("div", { style: { marginBottom: 20 } },
        h(EquipmentSection, { personId, data, updateData, showToast })
      ),

      // Collapsible Advanced Cloud & Recovery Card
      h("div", { className: "hg-card", style: { marginTop: 24 } },
        h("div", {
          style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" },
          onClick: () => setAdvancedOpen(!advancedOpen)
        },
          h("div", null,
            h("div", { className: "hg-card-title", style: { margin: 0, fontSize: 15 } }, "Advanced Program Management & Continuity"),
            h("div", { className: "hg-card-copy", style: { margin: 0, fontSize: 12.5 } },
              "Decoupled exercise logs, cloud subcollections, and program wizard"
            )
          ),
          h("button", { type: "button", className: "hg-button secondary", style: { minHeight: 30, padding: "2px 10px" } },
            advancedOpen ? "Hide" : "Show"
          )
        ),
        advancedOpen && h("div", { style: { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--hg-border)" } },
          h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 } },
            h(Button, {
              primary: true,
              onClick: () => setWizardState({ open: true, initialProgram: null, mode: "create" })
            }, "+ Create New Program in Wizard"),
            h(Button, {
              onClick: () => setWizardState({
                open: true,
                initialProgram: {
                  id: data.programId || ("prog_" + Date.now()),
                  name: data.programName || "Current Routine",
                  description: data.goals || "",
                  frequency: sessionCount + " days/week",
                  startDate: data.startDate,
                  sessions: data.sessions
                },
                mode: "edit"
              })
            }, "✎ Edit in Wizard")
          ),
          savedPrograms.length > 0 && h("div", { className: "hg-saved-programs-grid", style: { marginTop: 10 } },
            savedPrograms.map(prog => {
              const isActive = (data.programId && data.programId === prog.id) || (data.programName && data.programName === prog.name);
              return h("div", { key: prog.id, className: "hg-saved-program-card " + (isActive ? "active-border" : "") },
                h("strong", { style: { fontSize: 14 } }, prog.name),
                isActive && h("span", { className: "hg-chip", style: { marginLeft: 6, fontSize: 10 } }, "Active"),
                h("div", { style: { fontSize: 12, color: "var(--hg-text-2)", marginTop: 2 } },
                  (prog.frequency || `${(prog.sessions || []).length} days/week`) + ` · ${(prog.sessions || []).length} sessions`
                ),
                h("div", { className: "hg-actions", style: { marginTop: 8 } },
                  !isActive && h("button", {
                    type: "button",
                    className: "hg-button secondary",
                    style: { minHeight: 28, padding: "2px 8px", fontSize: 11.5 },
                    onClick: async () => {
                      await GymCloudEngine.saveActiveProgram(personId, prog);
                      updateData(personId, c => ({ ...c, sessions: prog.sessions, programName: prog.name, programId: prog.id }));
                      showToast("Activated program: " + prog.name);
                    }
                  }, "Activate"),
                  h("button", {
                    type: "button",
                    className: "hg-button secondary danger",
                    style: { minHeight: 28, padding: "2px 8px", fontSize: 11.5 },
                    onClick: async () => {
                      if (!confirm(`Delete ${prog.name}?`)) return;
                      await GymCloudEngine.deleteProgramFromSubcollection(personId, prog.id);
                      showToast("Deleted " + prog.name);
                      loadSaved();
                    }
                  }, "Delete")
                )
              );
            })
          )
        )
      ),

      // HIG Modals & Alerts
      editingExercise && h(ExerciseSheetModal, {
        exercise: editingExercise,
        isNew: isNewExercise,
        onSave: handleSaveExercise,
        onClose: () => setEditingExercise(null)
      }),

      // Destructive Confirmation: Restore Backup Alert
      pendingRestoreData && h("div", { className: "hg-hig-modal-backdrop" },
        h("div", { className: "hg-hig-alert" },
          h("h3", { className: "hg-alert-title" }, "Restore Full Backup?"),
          h("p", { className: "hg-alert-copy" },
            "Restoring this backup will replace all workout routines, logged exercise history, and health logs (body weight, sleep, readiness) for both Elliott and Chloe. This action cannot be undone."
          ),
          h("div", { className: "hg-alert-actions" },
            h("button", {
              type: "button",
              className: "hg-alert-btn",
              onClick: () => setPendingRestoreData(null)
            }, "Cancel"),
            h("button", {
              type: "button",
              className: "hg-alert-btn danger",
              onClick: handleConfirmRestore
            }, "Restore Backup")
          )
        )
      ),

      // Destructive Confirmation: Reset to Default Program Alert
      resetModalOpen && h("div", { className: "hg-hig-modal-backdrop" },
        h("div", { className: "hg-hig-alert" },
          h("h3", { className: "hg-alert-title" }, "Reset to Default Program?"),
          h("p", { className: "hg-alert-copy" },
            `Reset ${meta.label}'s workout routine to the default 4-day training plan? Logged session history and health records are strictly preserved and will not be lost.`
          ),
          h("div", { className: "hg-alert-actions" },
            h("button", {
              type: "button",
              className: "hg-alert-btn",
              onClick: () => setResetModalOpen(false)
            }, "Cancel"),
            h("button", {
              type: "button",
              className: "hg-alert-btn danger",
              onClick: handleConfirmReset
            }, "Reset Program")
          )
        )
      ),

      // Destructive Confirmation: Delete Exercise Alert
      deletingExercise && h("div", { className: "hg-hig-modal-backdrop" },
        h("div", { className: "hg-hig-alert" },
          h("h3", { className: "hg-alert-title" }, "Delete Exercise?"),
          h("p", { className: "hg-alert-copy" },
            `Remove "${deletingExercise.name}" from ${activeSession?.name || "this session"}? All past logged sets in Progress are safely kept.`
          ),
          h("div", { className: "hg-alert-actions" },
            h("button", {
              type: "button",
              className: "hg-alert-btn",
              onClick: () => setDeletingExercise(null)
            }, "Cancel"),
            h("button", {
              type: "button",
              className: "hg-alert-btn danger",
              onClick: handleConfirmDeleteExercise
            }, "Delete")
          )
        )
      ),

      // Program Wizard Modal
      wizardState.open && h(ProgramWizardModal, {
        personId,
        data,
        updateData,
        showToast,
        initialProgram: wizardState.initialProgram,
        mode: wizardState.mode,
        onClose: () => {
          setWizardState({ open: false, initialProgram: null, mode: "create" });
          loadSaved();
        }
      })
    );
  }

  function SettingsModal({ personId, store, pin, syncStatus, queueCount = 0, updateData, onSaveKey, onClose, showToast }) {
    const [theme, setTheme] = useState(getTheme());
    const [key, setKey] = useState(pin || "");
    const [elliottStart, setElliottStart] = useState(store?.elliott?.startDate || "2026-09-07");
    const [chloeStart, setChloeStart] = useState(store?.chloe?.startDate || "2026-09-07");
    const [reminderHour, setReminderHour] = useState(() => storageGet(`hg_reminderhour_${personId}`, 9));
    const [enabling, setEnabling] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [deadLetters, setDeadLetters] = useState(() => PlatePlanSyncEngine.getDeadLetterQueue());
    const backupFileInputRef = useRef(null);

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

    function handleExportBackup() {
      try {
        if (typeof window.exportFullBackup === "function") {
          window.exportFullBackup({ download: true });
        } else {
          const payload = exportBackupJSON(store);
          const dateStr = (I.W ? I.W() : new Date().toISOString().slice(0, 10));
          downloadFile(payload, `training-full-backup-${dateStr}.json`);
          showToast("Exported full backup (.json)");
        }
      } catch (err) {
        showToast("Export failed: " + (err?.message || "Unknown error"));
      }
    }

    async function handleRestoreFileChange(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!window.confirm("Restoring this backup will replace current workouts and health metrics for both profiles. Continue?")) {
            return;
          }
          setRestoring(true);
          await restoreBackupJSON(parsed, updateData, showToast);
          setRestoring(false);
          onClose?.();
        } catch (err) {
          setRestoring(false);
          showToast("Restore failed: " + (err?.message || "Invalid JSON file"));
        }
      };
      reader.readAsText(file);
      e.target.value = "";
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
          h("h3", null, "Cloud-First Architecture & Automated Sync"),
          h("p", null,
            `${syncStatus === "synced" ? "Cloud Synced." : syncStatus === "connecting" ? "Connecting to Firestore…" : syncStatus === "offline" ? "Offline mode active." : "Local cache."} PlatePlan v2.5.0 two-way cloud sync engine automatically replicates exercise history and health metrics (bodyweight, sleep, readiness) to Firestore.`
          ),
          h("div", { style: { marginTop: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
              h("span", null, "Offline Mutation Queue:"),
              h("strong", { style: { color: queueCount > 0 ? "#f59e0b" : "#10b981" } }, queueCount > 0 ? `${queueCount} pending offline write(s)` : "Clean (0 pending)")
            ),
            h(Button, {
              style: { width: "100%" },
              onClick: async () => {
                showToast("Executing Two-Way Cloud Sync with Firestore…");
                await PlatePlanSyncEngine.processOfflineQueue();
                const res = await PlatePlanSyncEngine.syncPlatePlanWithFirestore(personId, showToast);
                if (res) {
                  updateData(personId, () => res);
                  showToast("Two-way cloud sync complete!");
                }
              }
            }, "Sync Now with Firestore")
          )
        ),
        h("div", { className: "hg-setting-section" },
          h("h3", null, "Data & Full Backup"),
          h("p", null, "Export a complete JSON archive of all workout routines, logged exercise history, bodyweight logs, sleep metrics, and readiness logs for all profiles. Restoring repopulates local storage and cloud database."),
          h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 } },
            h(Button, {
              primary: true,
              id: "hg-export-full-backup-btn",
              onClick: handleExportBackup
            }, "📥 Export Full Backup (.json)"),
            h(Button, {
              id: "hg-restore-backup-btn",
              disabled: restoring,
              onClick: () => backupFileInputRef.current?.click()
            }, restoring ? "Restoring…" : "Restore from Backup"),
            h("input", {
              ref: backupFileInputRef,
              type: "file",
              accept: "application/json",
              style: { display: "none" },
              onChange: handleRestoreFileChange
            })
          ),
          deadLetters.length > 0 && h("div", { style: { marginTop: 12, padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 8, fontSize: 12.5 } },
            h("div", { style: { color: "#ef4444", fontWeight: 600, marginBottom: 4 } }, `Dead-Letter Queue: ${deadLetters.length} unprocessable mutation(s)`),
            h("div", { style: { color: "var(--text-muted)", marginBottom: 8 } }, "Mutations that failed 3 times or had invalid schema were moved here to prevent offline queue deadlock."),
            h(Button, {
              style: { fontSize: 12, padding: "4px 10px" },
              onClick: () => {
                PlatePlanSyncEngine.clearDeadLetterQueue();
                setDeadLetters([]);
                showToast("Dead-letter queue cleared");
              }
            }, "Clear Dead-Letter Queue")
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

  function Header({ personId, setPersonId, syncStatus, queueCount = 0, onSettings }) {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    const statusText = !isOnline
      ? (queueCount > 0 ? `Offline (${queueCount} queued)` : "Offline")
      : (syncStatus === "synced"
          ? (queueCount > 0 ? `Syncing (${queueCount})…` : "Cloud Synced")
          : syncStatus === "syncing"
            ? "Syncing…"
            : syncStatus === "connecting"
              ? "Connecting…"
              : "Local cache");

    const statusDotColor = !isOnline
      ? "#f59e0b"
      : syncStatus === "synced" && queueCount === 0
        ? "#10b981"
        : "#3b82f6";

    return h("header", { className: "hg-header" },
      h("div", { className: "hg-brand" },
        h("div", { className: "hg-eyebrow", style: { display: "flex", alignItems: "center", gap: 6 } },
          h("span", {
            style: {
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: statusDotColor,
              display: "inline-block",
              boxShadow: syncStatus === "synced" ? "0 0 6px rgba(16,185,129,0.5)" : "none"
            }
          }),
          statusText
        ),
        h("div", { className: "hg-brand-name" },
          "PlatePlan",
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
    const [queueCount, setQueueCount] = useState(() => PlatePlanSyncEngine.getOfflineQueue().length);
    const dbRef = useRef(null);
    const toastTimer = useRef(null);

    const showToast = useCallback(message => {
      setToast(message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 2800);
    }, []);

    // Automated Two-Way Sync on boot & person switch
    useEffect(() => {
      let active = true;
      PlatePlanSyncEngine.syncPlatePlanWithFirestore(personId, showToast).then(reconciled => {
        if (!active) return;
        if (reconciled) {
          setStore(current => ({
            ...current,
            [personId]: reconciled
          }));
        }
        setQueueCount(PlatePlanSyncEngine.getOfflineQueue().length);
      }).catch(err => {
        console.warn("[PlatePlan Sync] Initial sync error:", err);
      });
      return () => { active = false; };
    }, [personId, showToast]);

    // Offline Fallback, Mutation Queue Processor & Connectivity Watcher
    useEffect(() => {
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

      // Periodic offline queue check every 15s when online
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

    // Asynchronous legacy data recovery
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
          console.warn("[v2.4.1] Recovery notice:", err?.message);
        });
      }, 300);
      return () => clearTimeout(timer);
    }, []);

    // Real-Time Cloud Listeners:
    // onSnapshot for active program (gym_users/{id}/active_program/current) and history logs
    // Ensures changes made on mobile immediately update desktop/laptop state!
    useEffect(() => {
      const handleRemoteUpdate = (id, subCollection, remoteData) => {
        setStore(current => {
          if (!current[id]) return current;
          const currentProfile = current[id];
          if (subCollection === "exercise_logs") {
            const mergedLogs = mergeDeduplicatedLogs(currentProfile.logs || [], remoteData);
            const next = { ...currentProfile, logs: mergedLogs, updatedAt: Date.now() };
            savePlatePlanV1Local(id, next);
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
              sessions: Array.isArray(remoteData.sessions) && remoteData.sessions.length ? remoteData.sessions : currentProfile.sessions,
              weekOverrides: remoteData.weekOverrides || currentProfile.weekOverrides,
              equipment: remoteData.equipment || currentProfile.equipment,
              updatedAt: Date.now()
            };
            savePlatePlanV1Local(id, next);
            I.Ee(id, next);
            return { ...current, [id]: next };
          }
          return current;
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

      const timeout = setTimeout(() => {
        setSyncStatus(prev => (prev === "connecting" ? (navigator.onLine ? "synced" : "offline") : prev));
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
          bodyWeightLogs: updated.bodyWeightLogs || currentProfile.bodyWeightLogs || [],
          readinessLogs: updated.readinessLogs || currentProfile.readinessLogs || [],
          sleepLogs: updated.sleepLogs || currentProfile.sleepLogs || [],
          updatedAt: Date.now()
        };

        // Save active program to sub-collection
        GymCloudEngine.saveActiveProgram(id, next);

        // Mirror to local storage & legacy keys
        I.Ee(id, next);
        syncLegacyStorage(id, next);

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
        toast && h("div", { className: "hg-toast", role: "status" }, toast)
      );
    }

    let content;
    if (view === "today") content = h(ErrorBoundary, { title: "Could not display Today view" }, h(TodayView, { personId, data, meta, active, onStart: startWorkout, updateData, showToast }));
    if (view === "history") content = h(ErrorBoundary, { title: "Could not display History view" }, h(HistoryView, { personId, data, updateData, showToast }));
    if (view === "progress") content = h(ErrorBoundary, { title: "Could not display Progress view" }, h(ProgressView, { personId, data, meta, weekInfo, showToast }));
    if (view === "metrics") content = h(ErrorBoundary, { title: "Could not display Metrics view" }, h(MetricsView, { meta, personId, data, updateData, showToast }));
    if (view === "plan") content = h(ErrorBoundary, { title: "Could not display Plan view" }, h(PlanView, { personId, data, store, meta, updateData, showToast }));

    return h("div", { className: "hg-app", style: { "--person-accent": meta.accent } },
      h("div", { className: "hg-app-shell" },
        h(Header, { personId, setPersonId, syncStatus, queueCount, onSettings: () => setSettingsOpen(true) }),
        h("div", { className: "hg-layout" },
          h(Navigation, { view, setView, mobile: false }),
          h("main", { className: "hg-main" }, content)
        ),
        h(Navigation, { view, setView, mobile: true })
      ),
      settingsOpen && h(SettingsModal, {
        personId, store, pin, syncStatus, queueCount, updateData,
        onSaveKey: saveHouseholdKey,
        onClose: () => setSettingsOpen(false),
        showToast,
      }),
      toast && h("div", { className: "hg-toast", role: "status" }, toast)
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(h(App));
})();
