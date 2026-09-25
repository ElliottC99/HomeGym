/**
 * HomeGym Data Validation Utilities
 * 
 * Validates data schemas for workout logs, user settings, and backups.
 * Ensures data matches the flat workout log schema:
 * { id, exerciseName, weight, sets, reps, completed, timestamp }
 */

/**
 * Validates whether a given object matches the flat workout log schema.
 * @param {any} item 
 * @returns {boolean}
 */
export function isValidWorkoutLog(item) {
  if (!item || typeof item !== "object") return false;

  // Check required fields
  const hasId = item.id !== undefined && item.id !== null;
  const hasExerciseName = typeof item.exerciseName === "string" && item.exerciseName.trim().length > 0;
  const hasWeight = item.weight !== undefined && !isNaN(parseFloat(item.weight));
  const hasSets = item.sets !== undefined && !isNaN(parseInt(item.sets, 10));
  const hasReps = item.reps !== undefined && !isNaN(parseInt(item.reps, 10));
  const hasCompleted = typeof item.completed === "boolean" || item.completed === 0 || item.completed === 1;

  return hasId && hasExerciseName && hasWeight && hasSets && hasReps && hasCompleted;
}

/**
 * Safely parses JSON and returns the parsed object or null.
 * @param {string} rawString 
 * @returns {any|null}
 */
export function safeParseJSON(rawString) {
  if (typeof rawString !== "string") return null;
  try {
    return JSON.parse(rawString);
  } catch (e) {
    return null;
  }
}

/**
 * Audits a given payload, looking for any valid workout logs.
 * Finds logs inside arrays or objects, recursively if needed.
 * @param {any} payload 
 * @returns {{ validLogs: any[], totalChecked: number }}
 */
export function auditPayloadForWorkoutLogs(payload) {
  const validLogs = [];
  let totalChecked = 0;

  function traverse(node) {
    if (!node) return;
    totalChecked++;

    if (Array.isArray(node)) {
      node.forEach(item => {
        if (isValidWorkoutLog(item)) {
          validLogs.push(item);
        } else if (item && typeof item === "object") {
          traverse(item);
        }
      });
    } else if (typeof node === "object") {
      if (isValidWorkoutLog(node)) {
        validLogs.push(node);
      } else {
        Object.values(node).forEach(val => {
          if (val && typeof val === "object") {
            traverse(val);
          }
        });
      }
    }
  }

  traverse(payload);

  return {
    validLogs,
    totalChecked
  };
}

/**
 * Validates a complete HomeGym backup payload.
 * Checks for expected sections like localStorage, indexedDB, firestore.
 * @param {any} payload 
 * @returns {{ isValid: boolean, issues: string[] }}
 */
export function validateBackupSchema(payload) {
  const issues = [];
  if (!payload || typeof payload !== "object") {
    return { isValid: false, issues: ["Backup is not a valid JSON object"] };
  }

  if (!payload.metadata || typeof payload.metadata !== "object") {
    issues.push("Missing metadata object");
  } else {
    if (payload.metadata.app !== "HomeGym") {
      issues.push("Metadata 'app' is not 'HomeGym'");
    }
  }

  const hasData = payload.localStorage || payload.indexedDB || payload.firestore || payload.realtimeDatabase;
  if (!hasData) {
    issues.push("No data payloads found (localStorage, indexedDB, firestore, or realtimeDatabase)");
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}
