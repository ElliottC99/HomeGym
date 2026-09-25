/**
 * Pure data calculations for workout metrics.
 */

/**
 * Evaluates a log entry and returns metric details.
 * 
 * @param {Object} log - The flat workout log entry.
 * @returns {Object} Metric details including type, maxWeight, tonnage, and totalReps.
 */
export function resolveLogMetric(log) {
  if (!log) {
    return { type: "unknown", maxWeight: 0, tonnage: 0, totalReps: 0 };
  }

  const weight = log.weight != null ? Number(log.weight) : 0;
  const sets = log.sets != null ? Number(log.sets) : 0;
  const reps = log.reps != null ? Number(log.reps) : 0;

  if (weight > 0) {
    return {
      type: "weighted",
      maxWeight: weight,
      tonnage: sets * reps * weight,
      totalReps: sets * reps
    };
  } else {
    return {
      type: "bodyweight",
      maxWeight: 0,
      tonnage: 0,
      totalReps: sets * reps
    };
  }
}

/**
 * Calculates aggregate volume and total reps for a given session/set of logs.
 * 
 * @param {Array} logs - An array of workout logs.
 * @returns {Object} Aggregate metrics including tonnage and totalReps.
 */
export function calculateSessionVolume(logs) {
  if (!Array.isArray(logs)) {
    return { tonnage: 0, totalReps: 0 };
  }

  let totalTonnage = 0;
  let totalReps = 0;

  logs.forEach(log => {
    if (!log) return;
    const metric = resolveLogMetric(log);
    totalTonnage += metric.tonnage;
    totalReps += metric.totalReps;
  });

  return {
    tonnage: totalTonnage,
    totalReps: totalReps
  };
}
