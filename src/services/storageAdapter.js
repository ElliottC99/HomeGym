/**
 * Local storage adapter and context hydration manager.
 */

/**
 * Reads and safely parses the staged JSON object from local storage for a given profile key.
 * 
 * @param {string} [profileKey='data:elliott'] - The local storage key to read.
 * @returns {Object|null} The parsed profile data, or null if not found or invalid.
 */
export function getProfileData(profileKey = 'data:elliott') {
  try {
    const raw = localStorage.getItem(profileKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`[StorageAdapter] Error reading profile data for key "${profileKey}":`, error);
    return null;
  }
}

/**
 * Serializes and commits updated state objects to local storage.
 * Includes a recovery fallback block to clear known bloated/stale cache logs in case of QuotaExceededError.
 * 
 * @param {Object} data - The state object or profile data to serialize and save.
 * @param {string} [profileKey='data:elliott'] - The local storage key to write to.
 * @returns {boolean} True if the write operation succeeded, false otherwise.
 */
export function saveProfileData(data, profileKey = 'data:elliott') {
  try {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    localStorage.setItem(profileKey, serialized);
    
    // Dispatch custom synchronization event for single-tab reactive updates
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("localstorage_sync", { detail: { key: profileKey } }));
    }
    return true;
  } catch (error) {
    console.warn(`[StorageAdapter] Storage write failed or QuotaExceeded for "${profileKey}". Purging redundant caches...`);
    
    try {
      const bloatedKeys = [
        "plateplan_v1_recovery",
        "plateplan_v1_recovery_backup",
        "homegym_recovered_data",
        "hg_recovery_dump",
        "hg_diagnostic_logs"
      ];
      bloatedKeys.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("plateplan_recovery") || k.includes("recovery_") || k.includes("diagnostic_dump"))) {
          try { localStorage.removeItem(k); } catch (_) {}
        }
      }
      
      const serialized = typeof data === "string" ? data : JSON.stringify(data);
      localStorage.setItem(profileKey, serialized);
      
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("localstorage_sync", { detail: { key: profileKey } }));
      }
      return true;
    } catch (retryError) {
      console.error(`[StorageAdapter] Commit failed after storage purge recovery for key "${profileKey}":`, retryError);
      return false;
    }
  }
}

/**
 * Listens to native browser 'storage' events and custom tab-level synchronization events
 * to trigger state re-hydration across browser contexts.
 * 
 * @param {Function} callback - Callback function to invoke when matching storage shifts occur.
 * @returns {Function} A cleanup unsubscribe function.
 */
export function subscribeToStorageChanges(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {};
  }

  const handleStorageEvent = (event) => {
    if (event.key && (event.key.startsWith("data:") || event.key.startsWith("plateplan") || event.key.startsWith("hg_"))) {
      callback({ key: event.key, newValue: event.newValue });
    }
  };

  const handleCustomSync = (event) => {
    const key = event.detail?.key;
    if (key && (key.startsWith("data:") || key.startsWith("plateplan") || key.startsWith("hg_"))) {
      try {
        const val = localStorage.getItem(key);
        callback({ key, newValue: val });
      } catch (_) {
        callback({ key, newValue: null });
      }
    }
  };

  window.addEventListener("storage", handleStorageEvent);
  window.addEventListener("localstorage_sync", handleCustomSync);

  return () => {
    window.removeEventListener("storage", handleStorageEvent);
    window.removeEventListener("localstorage_sync", handleCustomSync);
  };
}
