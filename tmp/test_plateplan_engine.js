// Verification of PlatePlanSyncEngine code structure
const testCode = `
  const PLATEPLAN_V1_KEY = "plateplan_v1";
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
      localStorage.setItem(\`\${PLATEPLAN_V1_KEY}_\${userId}\`, JSON.stringify(existing.users[userId]));
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
    return mutation;
  }
`;
console.log("Snippet length:", testCode.length);
