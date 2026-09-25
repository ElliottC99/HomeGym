/**
 * String formatting and exercise naming normalizers.
 */

/**
 * Strips internal suffixes (_e, _run, -e, -run), replaces underscores with spaces,
 * and converts to Title Case with common acronym preservation.
 * 
 * @param {string} rawName - The raw exercise name.
 * @returns {string} The normalized Title Case exercise name.
 */
export function normalizeExerciseName(rawName) {
  if (!rawName) return "";
  let s = String(rawName).trim();
  
  // 1. Remove trailing suffixes like _e or _run (case-insensitive)
  s = s.replace(/(_e|_run|-e|-run)$/i, "");
  
  // 2. Replace underscores and dashes with spaces
  s = s.replace(/[_-]+/g, " ").trim();

  // Acronym map for common terminology (keep them uppercase or standard casing)
  const acronyms = {
    db: "DB",
    bb: "BB",
    rdl: "RDL",
    ohp: "OHP",
    kb: "KB",
    ez: "EZ",
    pr: "PR",
    "1rm": "1RM",
    amrap: "AMRAP",
    bw: "BW",
    bicep: "Bicep",
    tricep: "Tricep"
  };

  const words = s.split(/\s+/).filter(Boolean);
  const titleWords = words.map(w => {
    const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (acronyms[lower]) {
      return acronyms[lower];
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });

  return titleWords.join(" ");
}

/**
 * Merges duplicate exercise IDs and names case-insensitively from a list of exercises.
 * 
 * @param {Array} exerciseList - The raw list of exercises or exercise logs.
 * @returns {Array} The deduplicated list of exercises.
 */
export function deduplicateExercises(exerciseList) {
  if (!Array.isArray(exerciseList)) return [];
  const seen = new Map();
  
  exerciseList.forEach(ex => {
    if (!ex) return;
    const name = ex.name || ex.exerciseName || ex.exerciseId || ex.id || "";
    const normalized = normalizeExerciseName(name);
    const key = normalized.toLowerCase();
    
    if (!seen.has(key)) {
      seen.set(key, {
        id: ex.id || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        name: normalized,
        ...ex
      });
    } else {
      const existing = seen.get(key);
      seen.set(key, {
        ...existing,
        ...ex,
        id: existing.id,
        name: existing.name
      });
    }
  });
  
  return Array.from(seen.values());
}
