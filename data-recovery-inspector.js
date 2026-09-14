/**
 * HomeGym Data Recovery & Inspection Utility
 * 
 * Requirements:
 * 1. LOCALSTORAGE SWEEP: Iterate over every key in window.localStorage. Search for key names
 *    or values containing terms like "gym", "workout", "weight", "sleep", "readiness",
 *    "history", "log", "user", or "plateplan". Print matching key names, byte sizes, and raw
 *    JSON previews to the browser console.
 * 2. INDEXEDDB SWEEP: Check for any IndexedDB databases under this domain. List all object store
 *    names and dump record counts.
 * 3. FIRESTORE SWEEP: If Firebase/Firestore is initialized, run a read scan on legacy paths
 *    (e.g., users/, households/, root documents, or previous collections) and log any existing
 *    document keys to the console.
 * 4. EXPORT FUNCTION: Expose a global function window.exportRecoveredData() that gathers all
 *    found payloads from LocalStorage, IndexedDB, and Firestore into a single downloadable JSON file.
 */

(function () {
  "use strict";

  const SEARCH_TERMS = [
    "gym",
    "workout",
    "weight",
    "sleep",
    "readiness",
    "history",
    "log",
    "user",
    "plateplan"
  ];

  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes) || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * 1. LOCALSTORAGE SWEEP
   */
  function sweepLocalStorage() {
    console.group(
      "%c[HOMEGYM] 1. LOCALSTORAGE SWEEP%c Searching for: " + SEARCH_TERMS.join(", "),
      "color: #2563eb; font-size: 13px; font-weight: bold;",
      "color: #64748b; font-size: 11px; margin-left: 8px;"
    );

    const matches = {};
    const totalKeys = window.localStorage ? window.localStorage.length : 0;
    const allKeyList = [];

    for (let i = 0; i < totalKeys; i++) {
      let key = null;
      try {
        key = window.localStorage.key(i);
      } catch (e) {}
      if (!key) continue;
      allKeyList.push(key);

      let val = null;
      try {
        val = window.localStorage.getItem(key);
      } catch (e) {}

      const keyLower = String(key).toLowerCase();
      const valLower = typeof val === "string" ? val.toLowerCase() : "";

      const matchedTerms = SEARCH_TERMS.filter(
        term => keyLower.includes(term) || valLower.includes(term)
      );

      if (matchedTerms.length > 0) {
        let bytes = 0;
        try {
          bytes = new Blob([val || ""]).size;
        } catch (e) {
          bytes = val ? val.length * 2 : 0;
        }

        let parsed = null;
        let isJson = false;
        try {
          parsed = JSON.parse(val);
          isJson = true;
        } catch (e) {
          parsed = val;
        }

        matches[key] = {
          key,
          bytes,
          formattedSize: formatBytes(bytes),
          matchedTerms,
          isJson,
          data: parsed,
          raw: val
        };

        console.groupCollapsed(
          `%c🔑 Key: "${key}" %c(${formatBytes(bytes)}) %c[Matched: ${matchedTerms.join(", ")}]`,
          "color: #059669; font-weight: bold;",
          "color: #4b5563; font-weight: normal;",
          "color: #2563eb; font-weight: normal;"
        );
        console.log("%cKey Name:%c " + key, "font-weight: bold; color: #374151;", "color: #111827;");
        console.log("%cByte Size:%c " + bytes + " bytes (" + formatBytes(bytes) + ")", "font-weight: bold; color: #374151;", "color: #111827;");
        console.log("%cMatched Terms:%c", "font-weight: bold; color: #374151;", matchedTerms);
        console.log("%cRaw JSON / String:%c", "font-weight: bold; color: #374151;", val);
        console.log("%cParsed Object Preview:%c", "font-weight: bold; color: #374151;", parsed);
        console.groupEnd();
      }
    }

    console.log(
      `%cLocalStorage sweep complete: Found ${Object.keys(matches).length} matching keys out of ${totalKeys} total keys in localStorage.`,
      "color: #2563eb; font-weight: bold;"
    );
    console.groupEnd();

    return { matches, totalKeys, allKeys: allKeyList };
  }

  /**
   * Helper to open IndexedDB
   */
  function openIndexedDb(name) {
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Helper to read records and count from an Object Store
   */
  function readObjectStore(db, storeName) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const countReq = store.count();

        countReq.onsuccess = () => {
          const count = countReq.result || 0;
          let records = [];
          if (typeof store.getAll === "function") {
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              records = getAllReq.result || [];
              resolve({ count, records });
            };
            getAllReq.onerror = () => {
              resolve({ count, records: [] });
            };
          } else {
            resolve({ count, records: [] });
          }
        };

        countReq.onerror = () => {
          resolve({ count: 0, records: [] });
        };
      } catch (e) {
        resolve({ count: 0, records: [], error: e?.message });
      }
    });
  }

  /**
   * 2. INDEXEDDB SWEEP
   */
  async function sweepIndexedDB() {
    console.group(
      "%c[HOMEGYM] 2. INDEXEDDB SWEEP%c Auditing all object stores and records",
      "color: #7c3aed; font-size: 13px; font-weight: bold;",
      "color: #64748b; font-size: 11px; margin-left: 8px;"
    );

    const idbPayloads = {};
    const candidateNames = new Set();

    if (window.indexedDB && typeof window.indexedDB.databases === "function") {
      try {
        const dbs = await window.indexedDB.databases();
        if (Array.isArray(dbs)) {
          dbs.forEach(d => { if (d && d.name) candidateNames.add(d.name); });
        }
      } catch (e) {
        console.warn("indexedDB.databases() error:", e);
      }
    }

    // Common fallback database names for gym/fitness apps, plateplan, and Firebase
    const commonFallbacks = [
      "homegym",
      "home-gym",
      "plateplan",
      "gym",
      "localforage",
      "keyval-store",
      "firestore/[DEFAULT]/homegym-745d1/main",
      "firestore/[DEFAULT]/homegym-745d1",
      "firebaseLocalStorageDb",
      "firebase-installations-database"
    ];
    commonFallbacks.forEach(name => candidateNames.add(name));

    console.log(`Checking ${candidateNames.size} candidate IndexedDB database names under origin: ${window.location.origin}`);

    for (const dbName of candidateNames) {
      try {
        const db = await openIndexedDb(dbName);
        if (!db) continue;

        const storeNames = Array.from(db.objectStoreNames || []);
        if (storeNames.length === 0) {
          db.close();
          continue;
        }

        idbPayloads[dbName] = {
          name: dbName,
          version: db.version,
          stores: {}
        };

        console.group(
          `%c🗄️ Database: "${dbName}" (v${db.version}) %c- ${storeNames.length} Object Store(s)`,
          "color: #7c3aed; font-weight: bold;",
          "color: #4b5563; font-weight: normal;"
        );
        console.log("Object Store List:", storeNames);

        for (const storeName of storeNames) {
          const res = await readObjectStore(db, storeName);
          idbPayloads[dbName].stores[storeName] = res;

          console.log(
            `%c↳ Object Store: "${storeName}" %c| Total Records: ${res.count}`,
            "color: #db2777; font-weight: bold;",
            "color: #111827; font-weight: bold;"
          );

          if (res.records && res.records.length > 0) {
            console.log(`Sample records from "${storeName}" (first ${Math.min(res.records.length, 5)}):`, res.records.slice(0, 5));
          }
        }

        console.groupEnd();
        db.close();
      } catch (e) {
        // Continue to next candidate
      }
    }

    const foundCount = Object.keys(idbPayloads).length;
    console.log(
      `%cIndexedDB sweep complete: ${foundCount} active database(s) found.`,
      "color: #7c3aed; font-weight: bold;"
    );
    console.groupEnd();

    return idbPayloads;
  }

  /**
   * 3. FIRESTORE SWEEP
   */
  async function sweepFirestore() {
    console.group(
      "%c[HOMEGYM] 3. FIRESTORE SWEEP%c Scanning legacy and root collections",
      "color: #d97706; font-size: 13px; font-weight: bold;",
      "color: #64748b; font-size: 11px; margin-left: 8px;"
    );

    const firestoreResults = {};
    const rtdbResults = {};

    let fs = null;
    let rtdb = null;

    if (window.firebase) {
      try {
        if (!window.firebase.apps || !window.firebase.apps.length) {
          if (window.FIREBASE_CONFIG) {
            window.firebase.initializeApp(window.FIREBASE_CONFIG);
          }
        }
        if (typeof window.firebase.firestore === "function") {
          fs = window.firebase.firestore();
        }
        if (typeof window.firebase.database === "function") {
          rtdb = window.firebase.database();
        }
      } catch (e) {
        console.warn("Firebase initialization check during sweep:", e);
      }
    }

    if (!fs) {
      console.log("%cFirebase Firestore is not initialized or not available on window.", "color: #dc2626; font-weight: bold;");
      console.groupEnd();
      return { firestore: firestoreResults, realtimeDatabase: rtdbResults };
    }

    // Root collections to probe
    const rootCollections = [
      "users",
      "gym_users",
      "households",
      "household",
      "logs",
      "workouts",
      "programs",
      "readiness",
      "bodyweight",
      "plateplan"
    ];

    const knownProfiles = new Set(["elliott", "chloe"]);

    for (const colName of rootCollections) {
      try {
        const snap = await fs.collection(colName).get();
        if (!snap.empty) {
          console.group(
            `%c📂 Collection: "${colName}" %c(${snap.docs.length} document(s))`,
            "color: #d97706; font-weight: bold;",
            "color: #4b5563; font-weight: normal;"
          );
          snap.forEach(doc => {
            const docKey = `${colName}/${doc.id}`;
            const docData = doc.data();
            firestoreResults[docKey] = docData;

            console.log(
              `%c📄 Document Key: "${doc.id}" %c[Path: ${docKey}]`,
              "color: #059669; font-weight: bold;",
              "color: #64748b; font-weight: normal;",
              docData
            );

            if (colName === "users" || colName === "gym_users") {
              knownProfiles.add(doc.id);
            }
          });
          console.groupEnd();
        } else {
          console.log(`Collection "${colName}" queried: 0 documents (empty).`);
        }
      } catch (colErr) {
        console.log(`Collection "${colName}": ${colErr?.message || "Not found or restricted"}`);
      }
    }

    // Subcollections scan for users/ and gym_users/
    const subcollections = [
      "logs",
      "programs",
      "readiness",
      "bodyweight_logs",
      "active_program",
      "equipment",
      "history",
      "routines"
    ];

    console.log(`Scanning subcollections for ${knownProfiles.size} profile(s):`, Array.from(knownProfiles));

    for (const profileId of knownProfiles) {
      for (const parentCol of ["users", "gym_users"]) {
        for (const subCol of subcollections) {
          try {
            const subSnap = await fs.collection(parentCol).doc(profileId).collection(subCol).get();
            if (!subSnap.empty) {
              console.group(
                `%c📂 Subcollection: "${parentCol}/${profileId}/${subCol}" %c(${subSnap.docs.length} doc(s))`,
                "color: #d97706; font-weight: bold;",
                "color: #4b5563; font-weight: normal;"
              );
              subSnap.forEach(doc => {
                const subKey = `${parentCol}/${profileId}/${subCol}/${doc.id}`;
                const subData = doc.data();
                firestoreResults[subKey] = subData;
                console.log(
                  `%c📄 Sub-Doc Key: "${doc.id}" %c[Path: ${subKey}]`,
                  "color: #059669; font-weight: bold;",
                  "color: #64748b; font-weight: normal;",
                  subData
                );
              });
              console.groupEnd();
            }
          } catch (subErr) {
            // Quietly handle non-existent subcollection
          }
        }
      }
    }

    // Optional RTDB sweep for completeness
    if (rtdb) {
      console.log("Probing Firebase Realtime Database legacy paths...");
      const rtdbPaths = ["users", "gym_users", "households", "household", "plateplan"];
      for (const path of rtdbPaths) {
        try {
          const snap = await rtdb.ref(path).once("value");
          const val = snap.val();
          if (val) {
            rtdbResults[path] = val;
            console.log(`%c🔥 RTDB Path: "/${path}" found:`, "color: #ea580c; font-weight: bold;", val);
          }
        } catch (e) {}
      }
    }

    console.log(
      `%cFirestore sweep complete: ${Object.keys(firestoreResults).length} documents captured across legacy and active paths.`,
      "color: #d97706; font-weight: bold;"
    );
    console.groupEnd();

    return { firestore: firestoreResults, realtimeDatabase: rtdbResults };
  }

  /**
   * Main Inspection Sweep runner
   */
  async function runDataRecoveryInspection() {
    console.clear();
    console.log(
      "%c═══════════════════════════════════════════════════════════════════\n" +
      "  🏋️ HOMEGYM DATA RECOVERY & INSPECTION UTILITY\n" +
      "  LocalStorage • IndexedDB • Firestore / RTDB\n" +
      "═══════════════════════════════════════════════════════════════════",
      "color: #2563eb; font-weight: bold; font-family: monospace; font-size: 13px;"
    );

    const ls = sweepLocalStorage();
    const idb = await sweepIndexedDB();
    const fs = await sweepFirestore();

    console.log(
      "%c[HOMEGYM RECOVERY AUDIT SUMMARY]\n" +
      ` • LocalStorage Matching Keys: ${Object.keys(ls.matches).length} (out of ${ls.totalKeys})\n` +
      ` • IndexedDB Databases Found:  ${Object.keys(idb).length}\n` +
      ` • Firestore Documents Found:  ${Object.keys(fs.firestore).length}\n` +
      ` • RTDB Paths Found:           ${Object.keys(fs.realtimeDatabase).length}\n` +
      "Call window.exportRecoveredData() to download the full payload as a JSON file.",
      "color: #059669; font-weight: bold; font-family: monospace; font-size: 12px;"
    );

    return {
      localStorage: ls,
      indexedDB: idb,
      firestore: fs.firestore,
      realtimeDatabase: fs.realtimeDatabase
    };
  }

  /**
   * 4. EXPORT FUNCTION: window.exportRecoveredData()
   */
  async function exportRecoveredData(options = { download: true }) {
    console.log("%c[HOMEGYM RECOVERY] Gathering all payloads into unified export bundle...", "color: #2563eb; font-weight: bold;");

    const ls = sweepLocalStorage();
    const idb = await sweepIndexedDB();
    const fs = await sweepFirestore();

    const timestamp = new Date().toISOString();
    const fileTimestamp = timestamp.replace(/[:.]/g, "-");

    const exportBundle = {
      metadata: {
        app: "HomeGym",
        version: "2.4.0",
        utility: "Data Recovery & Inspection",
        exportedAt: timestamp,
        timestampMs: Date.now(),
        origin: window.location.origin,
        href: window.location.href,
        userAgent: navigator.userAgent
      },
      summary: {
        localStorageMatchesCount: Object.keys(ls.matches).length,
        localStorageTotalKeys: ls.totalKeys,
        indexedDBDatabasesCount: Object.keys(idb).length,
        firestoreDocumentsCount: Object.keys(fs.firestore).length,
        realtimeDatabasePathsCount: Object.keys(fs.realtimeDatabase).length
      },
      localStorage: ls.matches,
      indexedDB: idb,
      firestore: fs.firestore,
      realtimeDatabase: fs.realtimeDatabase
    };

    if (options.download !== false) {
      try {
        const jsonContent = JSON.stringify(exportBundle, null, 2);
        const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
        const downloadUrl = URL.createObjectURL(blob);
        const filename = `homegym-recovered-data-${fileTimestamp}.json`;

        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        }, 800);

        console.log(
          `%c✅ SUCCESS: Exported recovered data to "${filename}" (${formatBytes(blob.size)})`,
          "color: #059669; font-weight: bold; font-size: 13px;"
        );
      } catch (err) {
        console.error("Failed to trigger automatic JSON download:", err);
      }
    }

    return exportBundle;
  }

  // Expose globally to window
  window.exportRecoveredData = exportRecoveredData;
  window.runDataRecoveryInspection = runDataRecoveryInspection;
  window.HomeGymRecovery = {
    sweepLocalStorage,
    sweepIndexedDB,
    sweepFirestore,
    runDataRecoveryInspection,
    exportRecoveredData,
    version: "2.4.0"
  };

  // Welcome banner and initial passive inspection run
  console.log(
    "%c[HomeGym Recovery Utility v2.4.0 Ready]%c Global functions: %cwindow.exportRecoveredData()%c & %cwindow.runDataRecoveryInspection()",
    "color: #2563eb; font-weight: bold;",
    "color: #4b5563;",
    "color: #059669; font-weight: bold;",
    "color: #4b5563;",
    "color: #7c3aed; font-weight: bold;"
  );

  // Automatically execute the inspection sweep on startup
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(runDataRecoveryInspection, 600);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(runDataRecoveryInspection, 600);
    });
  }
})();
