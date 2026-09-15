import sys

engine_code = '''  const PLATEPLAN_V1_KEY = "plateplan_v1";
  const QUEUE_STORAGE_KEY = "plateplan_offline_queue";

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
        existing = { version: "2.4.1", updatedAt: Date.now(), users: {} };
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

  function enqueueOfflineMutation(userId, type, payload) {
    const queue = getOfflineQueue();
    const mutation = {
      id: "mut_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      userId,
      type,
      payload,
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
    enqueueOfflineMutation,

    async processOfflineQueue(onProgress) {
      if (!navigator.onLine) {
        return { processed: 0, remaining: getOfflineQueue().length };
      }
      const fs = this.getFirestore();
      if (!fs) return { processed: 0, remaining: getOfflineQueue().length };

      const queue = getOfflineQueue();
      if (!queue.length) return { processed: 0, remaining: 0 };

      console.log(`[PlatePlan Offline Queue] Draining ${queue.length} offline mutations...`);
      const failed = [];
      let processed = 0;

      for (const item of queue) {
        try {
          const { userId, type, payload } = item;
          if (!userId || !payload) continue;

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
            await fs.collection("gym_users").doc(userId).collection("readiness_logs").doc(String(payload.id)).set(payload, { merge: true });
            processed++;
          } else if (type === "delete_readiness") {
            await fs.collection("gym_users").doc(userId).collection("readiness_logs").doc(String(payload.id)).delete().catch(() => {});
            processed++;
          } else if (type === "save_bodyweight") {
            await fs.collection("gym_users").doc(userId).collection("bodyweight_logs").doc(String(payload.id)).set(payload, { merge: true });
            processed++;
          } else if (type === "delete_bodyweight") {
            await fs.collection("gym_users").doc(userId).collection("bodyweight_logs").doc(String(payload.id)).delete().catch(() => {});
            processed++;
          }
        } catch (err) {
          console.warn("[PlatePlan Offline Queue] Mutation sync error, keeping in queue:", err?.message);
          failed.push(item);
        }
      }

      saveOfflineQueue(failed);
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
          await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(clean.id)).set(clean, { merge: true });
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_readiness", clean);
        }
      }

      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/readiness_logs/${clean.id}`).set(clean); } catch (e) {}
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
        try { await fs.collection("gym_users").doc(profileId).collection("readiness_logs").doc(String(logId)).delete(); } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_readiness", { id: logId });
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/readiness_logs/${logId}`).remove(); } catch (e) {}
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
          await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(clean.id)).set(clean, { merge: true });
        } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "save_bodyweight", clean);
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${clean.id}`).set(clean); } catch (e) {}
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
        try { await fs.collection("gym_users").doc(profileId).collection("bodyweight_logs").doc(String(logId)).delete(); } catch (e) {
          if (!options.skipQueue) enqueueOfflineMutation(profileId, "delete_bodyweight", { id: logId });
        }
      }
      const rtdb = this.getRTDB();
      if (rtdb) {
        try { await rtdb.ref(`gym_users/${profileId}/bodyweight_logs/${logId}`).remove(); } catch (e) {}
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

        // 2. Fetch remote documents
        const [logsSnap, legacyLogsSnap, plateplanDoc, activeProgDoc] = await Promise.allSettled([
          fs.collection("gym_users").doc(userId).collection("logs").get(),
          fs.collection("gym_users").doc(userId).collection("exercise_logs").get(),
          fs.collection("gym_users").doc(userId).collection("plateplan").doc("current").get(),
          fs.collection("gym_users").doc(userId).collection("active_program").doc("current").get()
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

        const remotePlateplan = (plateplanDoc.status === "fulfilled" && plateplanDoc.value?.exists)
          ? plateplanDoc.value.data()
          : null;

        const remoteActiveProg = (activeProgDoc.status === "fulfilled" && activeProgDoc.value?.exists)
          ? activeProgDoc.value.data()
          : null;

        // 3. Read local state from plateplan_v1 & data:${userId}
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

        // Check if local contains newer or missing entries -> push to Firestore
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

        // Check if remote contains newer entries -> hydrate local
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

        const reconciledProfile = {
          ...finalProgram,
          logs: mergedLogsArray,
          updatedAt: Math.max(Number(finalProgram.updatedAt || 0), Date.now())
        };

        // Hydrate localStorage cache
        savePlatePlanV1Local(userId, reconciledProfile);
        I.Ee(userId, reconciledProfile);

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

          // 3. Readiness logs listener
          const unsubRead = fs.collection("gym_users").doc(profileId).collection("readiness_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("readiness_logs", items);
              }
            }, () => {});
          unsubscribers.push(unsubRead);

          // 4. Bodyweight logs listener
          const unsubBw = fs.collection("gym_users").doc(profileId).collection("bodyweight_logs")
            .onSnapshot(snap => {
              const items = [];
              snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
              if (items.length > 0) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("bodyweight_logs", items);
              }
            }, () => {});
          unsubscribers.push(unsubBw);

          // 5. Active program listener (gym_users/{profileId}/active_program/current)
          const unsubProg = fs.collection("gym_users").doc(profileId).collection("active_program").doc("current")
            .onSnapshot(doc => {
              if (doc.exists) {
                if (navigator.onLine) onStatusChange?.("synced");
                onRemoteUpdate?.("active_program", doc.data());
              }
            }, () => {});
          unsubscribers.push(unsubProg);

          // 6. Plateplan current listener (gym_users/{profileId}/plateplan/current)
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
'''

with open('app-redesign.js', 'r') as f:
    app_code = f.read()

# Replace version
app_code = app_code.replace('const APP_VERSION = "v2.4.0";', 'const APP_VERSION = "v2.4.1";', 1)

# Locate GymCloudEngine block in app-redesign.js
target_start = '  const GymCloudEngine = {'
target_end = '    }\n  };'

idx1 = app_code.find(target_start)
idx2 = app_code.find(target_end, idx1)

if idx1 == -1 or idx2 == -1:
    print("Could not find GymCloudEngine block!", idx1, idx2)
    sys.exit(1)

full_target = app_code[idx1 : idx2 + len(target_end)]
print("Found GymCloudEngine block to replace, length:", len(full_target))

new_app_code = app_code[:idx1] + engine_code.strip() + app_code[idx2 + len(target_end):]

with open('/tmp/test_app_redesign.js', 'w') as f:
    f.write(new_app_code)

print("Saved /tmp/test_app_redesign.js")
