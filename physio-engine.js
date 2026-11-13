// Physio & AI Routine Exchange Engine
// Pure functional core for prompt serialization, tolerant JSON extraction,
// structural diffing, and program version milestones.

export const HG_PHYSIO_ENGINE = {
  DEFAULT_EQUIPMENT: [
    "Power Rack with safety spotter arms",
    "Olympic Barbell (20kg)",
    "Bumper Plates (up to 140kg total)",
    "Adjustable Bench (incline/flat)",
    "Adjustable Dumbbells (5kg to 32kg pairs)",
    "Pull-up bar & dip station",
    "Resistance bands (light, medium, heavy)"
  ],

  /**
   * Safe string slugifier for canonical exercise & session IDs.
   */
  slugify(text) {
    return (text || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  },

  /**
   * Normalize an exercise name or ID for fuzzy matching across legacy log formats.
   */
  normalizeName(text) {
    if (!text) return "";
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  },

  /**
   * Flatten and normalize all logs across legacy session logs, array sets, and flat logs.
   */
  flattenAllLogs(rawLogs) {
    if (!Array.isArray(rawLogs)) return [];
    const flat = [];

    rawLogs.forEach(entry => {
      if (!entry) return;
      if (entry.type === "run" || entry.sessionId === "run") return;

      const date = entry.date || (entry.timestamp ? new Date(entry.timestamp).toISOString().slice(0, 10) : "");
      const timestamp = entry.timestamp || (date ? new Date(date).getTime() : 0);

      function extractSetsAndWeight(item) {
        let maxWeight = 0;
        let setsCount = 1;
        let repsDesc = "";

        if (Array.isArray(item.sets) && item.sets.length > 0) {
          setsCount = item.sets.length;
          const weights = item.sets.map(s => Number(s?.weight)).filter(w => !isNaN(w) && w > 0);
          if (weights.length > 0) maxWeight = Math.max(...weights);
          const reps = item.sets.map(s => s?.reps).filter(r => r != null);
          repsDesc = reps.join(", ");
        } else {
          setsCount = item.sets != null && !isNaN(Number(item.sets)) ? Number(item.sets) : 1;
          repsDesc = item.reps != null ? String(item.reps) : "";
          const w = Number(item.weight);
          if (!isNaN(w) && w > 0) maxWeight = w;
        }

        if (maxWeight === 0 && item.weight != null) {
          const w = Number(item.weight);
          if (!isNaN(w) && w > 0) maxWeight = w;
        }

        return { setsCount, repsDesc, maxWeight };
      }

      // Check for legacy session-level logs containing an exercises array
      if (Array.isArray(entry.exercises) && entry.exercises.length > 0) {
        entry.exercises.forEach(subEx => {
          if (!subEx) return;
          const { setsCount, repsDesc, maxWeight } = extractSetsAndWeight(subEx);
          flat.push({
            id: subEx.id || entry.id,
            date,
            timestamp,
            exerciseId: subEx.exerciseId || subEx.liftId || subEx.id || "",
            exerciseName: subEx.exerciseName || subEx.name || "",
            weight: maxWeight > 0 ? maxWeight : (subEx.weight != null ? Number(subEx.weight) : null),
            sets: setsCount,
            reps: repsDesc || (subEx.reps != null ? String(subEx.reps) : ""),
            rpe: subEx.rpe != null ? subEx.rpe : entry.rpe,
            feeling: subEx.feeling || entry.feeling,
            notes: subEx.notes || subEx.note || entry.notes || ""
          });
        });
      } else {
        // Flat exercise log
        const { setsCount, repsDesc, maxWeight } = extractSetsAndWeight(entry);
        flat.push({
          id: entry.id,
          date,
          timestamp,
          exerciseId: entry.exerciseId || entry.liftId || entry.id || "",
          exerciseName: entry.exerciseName || entry.name || "",
          weight: maxWeight > 0 ? maxWeight : (entry.weight != null ? Number(entry.weight) : null),
          sets: setsCount,
          reps: repsDesc || (entry.reps != null ? String(entry.reps) : ""),
          rpe: entry.rpe,
          feeling: entry.feeling,
          notes: entry.notes || entry.note || ""
        });
      }
    });

    return flat;
  },

  /**
   * Determine whether a log entry corresponds to a target exercise ID or name.
   */
  matchesExercise(log, targetId, targetName) {
    const normTargetName = this.normalizeName(targetName);
    const normTargetId = this.normalizeName(targetId);

    const logExId = String(log.exerciseId || "").trim().toLowerCase();
    const logExName = String(log.exerciseName || "").trim().toLowerCase();
    const normLogName = this.normalizeName(logExName);
    const normLogId = this.normalizeName(logExId);

    // 1. Exact ID match (e.g. "rdl" === "rdl")
    if (targetId && logExId === targetId.toLowerCase()) return true;

    // 2. Exact or normalized name match (e.g. "Barbell RDL" matches "Barbell RDL")
    if (normTargetName && normLogName === normTargetName) return true;

    // 3. Normalized ID matches normalized Name (e.g. id "barbell_rdl" matches name "Barbell RDL")
    if (normTargetId && (normLogName === normTargetId || normLogId === normTargetId)) return true;
    if (normTargetName && (normLogId === normTargetName || normLogName === normTargetName)) return true;

    // 4. Substring / acronym heuristics for common gym shorthands:
    // "rdl" matches "barbellrdl", "barbell_rdl"
    if (normTargetId && normLogId && (normTargetId.includes(normLogId) || normLogId.includes(normTargetId))) {
      if (normLogId.length >= 3 && normTargetId.length >= 3) return true;
    }
    if (normTargetName && normLogId && (normTargetName.includes(normLogId) || normLogId.includes(normTargetName))) {
      if (normLogId.length >= 3 && normTargetName.length >= 3) return true;
    }

    return false;
  },

  getExerciseLatestStats(profileData, exerciseId, exerciseName, preFlattenedLogs = null) {
    const flattenedLogs = Array.isArray(preFlattenedLogs)
      ? preFlattenedLogs
      : this.flattenAllLogs(Array.isArray(profileData?.logs) ? profileData.logs : []);
    if (flattenedLogs.length === 0) return null;

    const matchedLogs = flattenedLogs.filter(log => this.matchesExercise(log, exerciseId, exerciseName));
    if (matchedLogs.length === 0) return null;

    matchedLogs.sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    const latest = matchedLogs[0];
    let maxWeight = 0;
    matchedLogs.forEach(l => {
      const w = Number(l.weight);
      if (!isNaN(w) && w > maxWeight) maxWeight = w;
    });

    const weightVal = latest.weight != null && !isNaN(Number(latest.weight)) ? Number(latest.weight) : null;
    const setsCount = latest.sets || 1;
    const repsDesc = latest.reps || "";
    const weightStr = weightVal != null && weightVal > 0 ? ` @ ${weightVal}kg` : " (Bodyweight)";

    return {
      lastLoggedDate: latest.date || null,
      lastLoggedWeight: weightVal,
      lastLoggedSets: setsCount,
      lastLoggedReps: repsDesc || null,
      lastLoggedRpe: latest.rpe ?? null,
      lastLoggedFeeling: latest.feeling || null,
      maxHistoricalWeight: maxWeight > 0 ? maxWeight : null,
      summary: `${setsCount} × ${repsDesc || "reps"}${weightStr} (${latest.date || "recent"})`
    };
  },

  _coerceArray(val) {
    if (Array.isArray(val)) return val;
    if (val && typeof val === "object") {
      return Object.keys(val).sort((a, b) => Number(a) - Number(b)).map(k => val[k]);
    }
    return [];
  },

  _normalizeExerciseFields(ex) {
    return {
      ...ex,
      setsReps: ex.setsReps || ex.currentSetsReps || (ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : "3 × 10"),
      startValue: ex.startValue != null ? ex.startValue : (ex.currentWeight != null ? ex.currentWeight : null)
    };
  },

  _enrichExercise(ex, profileData, preFlattenedLogs) {
    const exId = ex.id || this.slugify(ex.name);
    const stats = this.getExerciseLatestStats(profileData, exId, ex.name, preFlattenedLogs);
    const baselineWeight = ex.startValue != null && !isNaN(Number(ex.startValue)) ? Number(ex.startValue) : null;
    const activeWeight = (stats?.lastLoggedWeight != null && stats.lastLoggedWeight > 0)
      ? stats.lastLoggedWeight
      : baselineWeight;
    const activeSetsReps = (stats?.lastLoggedSets && stats?.lastLoggedReps)
      ? `${stats.lastLoggedSets} × ${stats.lastLoggedReps}`
      : (ex.setsReps || "3 × 8–10");

    return {
      id: exId,
      name: ex.name,
      equipmentType: ex.equipmentType || "barbell",
      currentWeight: activeWeight,
      currentSetsReps: activeSetsReps,
      startValue: activeWeight,
      baselineWeight,
      unit: ex.unit || "kg",
      restNote: ex.restNote || "90s",
      note: ex.note || "",
      latestPerformance: stats
    };
  },

  buildEnrichedRoutineJSON(profileData, athleteName = "Elliott") {
    const sessions = Array.isArray(profileData?.sessions)
      ? profileData.sessions
      : (Array.isArray(profileData?.active_program?.sessions) ? profileData.active_program.sessions : []);
    const equipment = (Array.isArray(profileData?.equipment) && profileData.equipment.length > 0)
      ? profileData.equipment
      : this.DEFAULT_EQUIPMENT;
    const programName = profileData?.programName || profileData?.active_program?.name || "Active Training Routine";
    const preFlattenedLogs = this.flattenAllLogs(Array.isArray(profileData?.logs) ? profileData.logs : []);

    const enrichedSessions = sessions.map((session, sIdx) => {
      const sessionId = session.id || this.slugify(session.name) || `session_${sIdx + 1}`;
      const sessionName = session.name || `Session ${sIdx + 1}`;
      const day = session.day || "";

      let groups = [];
      if (Array.isArray(session.groups) && session.groups.length > 0) {
        groups = session.groups.map(group => ({
          label: group.label || "Main Exercises",
          type: group.type || "straight",
          exercises: (Array.isArray(group.exercises) ? group.exercises : []).map(ex =>
            this._enrichExercise(ex, profileData, preFlattenedLogs)
          )
        }));
      } else if (Array.isArray(session.exercises)) {
        groups = [{
          label: "Main Exercises",
          type: "straight",
          exercises: session.exercises.map(ex => this._enrichExercise(ex, profileData, preFlattenedLogs))
        }];
      }

      return { id: sessionId, name: sessionName, day, groups };
    });

    return {
      schema: "homegym-routine-v1",
      athlete: athleteName,
      programName,
      exportedAt: new Date().toISOString(),
      equipment,
      sessions: enrichedSessions
    };
  },

  /**
   * Build a rich, clinical prompt bundle for external AI assistants.
   */
  buildClinicalPrompt(profileData, athleteName = "Elliott", physioNotes = "") {
    const enriched = this.buildEnrichedRoutineJSON(profileData, athleteName);
    const dateStr = enriched.exportedAt.slice(0, 10);
    const sessions = enriched.sessions;
    const splitName = enriched.programName;

    let markdown = `# Clinical Workout Routine Consultation\n\n`;
    markdown += `**Athlete:** ${athleteName}\n`;
    markdown += `**Date:** ${dateStr}\n`;
    markdown += `**Active Program:** ${splitName} (${sessions.length} training days)\n\n`;

    if (physioNotes && physioNotes.trim()) {
      markdown += `## Physiotherapist Guidance & Clinical Directives\n`;
      markdown += `${physioNotes.trim()}\n\n`;
    }

    markdown += `## Available Equipment\n`;
    enriched.equipment.forEach(item => {
      markdown += `- ${item}\n`;
    });
    if (!profileData?.equipment || profileData.equipment.length === 0) {
      markdown += `*(Standard Home Gym Profile)*\n`;
    }
    markdown += `\n`;

    markdown += `## Current Active Routine Schedule & Baseline Loads\n\n`;
    sessions.forEach((session, sIdx) => {
      const sessionTitle = session.name || `Session ${sIdx + 1}`;
      const day = session.day ? ` (${session.day})` : "";
      markdown += `### ${sessionTitle}${day}\n`;

      session.groups.forEach(group => {
        if (group.label) markdown += `*${group.label}:*\n`;
        group.exercises.forEach(ex => {
          const load = ex.currentWeight ? ` @ ${ex.currentWeight}${ex.unit || "kg"}` : "";
          const sr = ex.currentSetsReps ? ` (${ex.currentSetsReps}${load})` : "";
          const note = ex.note ? ` — Note: ${ex.note}` : "";
          const stats = ex.latestPerformance;
          const baselineNote = (ex.baselineWeight && ex.currentWeight && ex.baselineWeight !== ex.currentWeight) ? ` | Initial Baseline: ${ex.baselineWeight}kg` : "";
          const statsStr = stats ? `\n    - Latest Logged: ${stats.summary}${stats.maxHistoricalWeight ? ` | PR Max: ${stats.maxHistoricalWeight}kg` : ""}${baselineNote}` : "";
          markdown += `- **${ex.name}**${sr} [id: \`${ex.id}\`]${note}${statsStr}\n`;
        });
      });
      markdown += `\n`;
    });

    markdown += `## Instructions for AI Assistant\n`;
    markdown += `1. **PRESERVE EXERCISE IDs (MANDATORY)**: Every exercise in this program has a unique, permanent identifier (e.g. "id": "bench" or "id": "barbell_bench_press"). When adjusting sets, reps, load, rest times, or tempo cues for an existing exercise, you MUST preserve its exact \`id\`. DO NOT change, rename, or omit existing exercise IDs. HomeGym uses this exact ID to link historical workout logs, progression graphs, and personal records.\n`;
    markdown += `2. **SUBSTITUTIONS & NEW EXERCISES**: Only generate a new snake_case \`id\` (e.g. "id": "goblet_squat") when clinically substituting an exercise or adding a brand new movement.\n`;
    markdown += `3. **Clinical Reasoning:** Explain the clinical rationale for any recommended exercise substitutions, loading reductions, or volume tweaks based on the physiotherapist guidance above.\n`;
    markdown += `4. **Equipment Check:** Ensure all recommended exercises strictly use the athlete's available equipment listed above.\n`;
    markdown += `5. **Output Format:** You MUST end your response with a single valid \`\`\`json code block containing the complete updated 'sessions' array matching HomeGym's structure:\n\n`;

    markdown += `\`\`\`json\n`;
    markdown += JSON.stringify({ programName: `${splitName} (Adapted)`, sessions: enriched.sessions }, null, 2);
    markdown += `\n\`\`\`\n`;

    return markdown;
  },

  /**
   * Tolerantly extract workout routine JSON from AI chat text or markdown.
   */
  extractRoutineFromText(rawText) {
    if (!rawText || typeof rawText !== "string") {
      throw new Error("No input text provided to parse.");
    }

    let jsonString = null;

    // Pass 1: Look for ```json ... ``` or ``` ... ``` code fence
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      jsonString = fenceMatch[1].trim();
    } else {
      // Pass 2: Look for balanced outer braces containing "sessions"
      const firstBrace = rawText.indexOf("{");
      const lastBrace = rawText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = rawText.slice(firstBrace, lastBrace + 1).trim();
        if (candidate.includes('"sessions"') || candidate.includes("'sessions'")) {
          jsonString = candidate;
        }
      }
    }

    if (!jsonString) {
      // Pass 3: Check if raw text is bare JSON
      const trimmed = rawText.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        jsonString = trimmed;
      }
    }

    if (!jsonString) {
      throw new Error("No valid workout routine JSON found in the provided text. Ensure the AI provided a ```json code block with a 'sessions' array.");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      throw new Error("Found JSON block, but failed to parse it: " + e.message);
    }

    // Normalize: if parsed is array of sessions directly, wrap it
    if (Array.isArray(parsed)) {
      parsed = { sessions: parsed };
    }

    if (!parsed || !Array.isArray(parsed.sessions)) {
      throw new Error("Invalid routine schema: parsed JSON must contain a 'sessions' array.");
    }

    // Defensive normalization: ensure session type and exercise setsReps / startValue are populated
    parsed.sessions = parsed.sessions.map(s => {
      const type = s.type || (s.targetKm ? "run" : "strength");
      const groups = Array.isArray(s.groups) ? s.groups.map(g => ({
        ...g,
        exercises: Array.isArray(g.exercises) ? g.exercises.map(ex => ({
          ...ex,
          setsReps: ex.setsReps || ex.currentSetsReps || (ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : "3 × 10"),
          startValue: ex.startValue != null ? ex.startValue : (ex.currentWeight != null ? ex.currentWeight : null)
        })) : []
      })) : [];
      return {
        ...s,
        type,
        groups
      };
    });

    return parsed;
  },

  _findMatchingCurrentSession(currentSessions, propSession) {
    return currentSessions.find(s =>
      (s.id && s.id === propSession.id) ||
      (s.day && propSession.day && s.day.toLowerCase() === propSession.day.toLowerCase()) ||
      (s.name && propSession.name && s.name.toLowerCase() === propSession.name.toLowerCase())
    );
  },

  _matchProposedExercise(propEx, currById, currByName) {
    if (propEx.id && currById.has(String(propEx.id))) {
      return currById.get(String(propEx.id));
    }
    const propNameNorm = (propEx.name || "").trim().toLowerCase();
    const match = currByName.get(propNameNorm) || null;
    if (match?.id && (!propEx.id || propEx.id !== match.id)) {
      propEx.id = match.id;
    }
    return match;
  },

  computeRoutineDiff(currentSessions = [], proposedSessions = []) {
    const diffs = [];
    let diffCounter = 1;

    for (const propSession of proposedSessions) {
      const currSession = this._findMatchingCurrentSession(currentSessions, propSession);
      const sessionName = propSession.name || currSession?.name || "Training Session";
      const sessionId = propSession.id || currSession?.id || `sess_${diffCounter}`;

      const currExercises = this._extractExercisesFromSession(currSession);
      const propExercises = this._extractExercisesFromSession(propSession);

      const currById = new Map();
      const currByName = new Map();
      currExercises.forEach(ex => {
        if (ex.id) currById.set(String(ex.id), ex);
        if (ex.name) currByName.set(ex.name.trim().toLowerCase(), ex);
      });

      const matchedCurrIds = new Set();

      for (const propEx of propExercises) {
        const match = this._matchProposedExercise(propEx, currById, currByName);
        if (!match) {
          diffs.push({
            id: `diff_${diffCounter++}`,
            sessionId,
            sessionName,
            type: "ADDITION",
            approved: true,
            proposedExercise: propEx,
            clinicalReason: propEx.note || "New exercise added to routine"
          });
          continue;
        }

        matchedCurrIds.add(match.id || match.name);
        const propNameNorm = (propEx.name || "").trim().toLowerCase();
        const matchNameNorm = (match.name || "").trim().toLowerCase();

        if (matchNameNorm !== propNameNorm) {
          diffs.push({
            id: `diff_${diffCounter++}`,
            sessionId,
            sessionName,
            type: "SUBSTITUTION",
            approved: true,
            originalExercise: match,
            proposedExercise: propEx,
            clinicalReason: propEx.note || "Exercise swapped for clinical adaptation"
          });
          continue;
        }

        const propSr = propEx.setsReps || propEx.currentSetsReps;
        const matchSr = match.setsReps || match.currentSetsReps;
        const loadChanged = Number(match.startValue) !== Number(propEx.startValue) && propEx.startValue != null;
        const srChanged = matchSr !== propSr && propSr != null;
        if (loadChanged || srChanged) {
          diffs.push({
            id: `diff_${diffCounter++}`,
            sessionId,
            sessionName,
            type: "LOAD_CHANGE",
            approved: true,
            originalExercise: match,
            proposedExercise: propEx,
            clinicalReason: propEx.note || "Sets/reps or target working weight adjusted"
          });
        }
      }

      for (const currEx of currExercises) {
        if (!matchedCurrIds.has(currEx.id || currEx.name)) {
          diffs.push({
            id: `diff_${diffCounter++}`,
            sessionId,
            sessionName,
            type: "REMOVAL",
            approved: true,
            originalExercise: currEx,
            clinicalReason: "Exercise omitted in proposed routine"
          });
        }
      }
    }

    return diffs;
  },

  /**
   * Helper to extract a flat list of exercises from a session structure.
   */
  _extractExercisesFromSession(session) {
    if (!session) return [];
    if (Array.isArray(session.exercises)) return session.exercises;
    const list = [];
    if (Array.isArray(session.groups)) {
      session.groups.forEach(g => {
        if (Array.isArray(g.exercises)) {
          g.exercises.forEach(e => list.push(e));
        }
      });
    }
    return list;
  },

  _resolveProposalExercise(ex, sId, unapprovedAdditions, unapprovedSubstitutions, unapprovedLoadChanges) {
    const exIdKey = ex.id ? `${sId}::${ex.id}` : null;
    const exNameKey = ex.name ? `${sId}::${ex.name.trim().toLowerCase()}` : null;

    if ((exIdKey && unapprovedAdditions.has(exIdKey)) || (exNameKey && unapprovedAdditions.has(exNameKey))) {
      return null;
    }
    const sub = (exIdKey && unapprovedSubstitutions.get(exIdKey)) || (exNameKey && unapprovedSubstitutions.get(exNameKey));
    if (sub) return JSON.parse(JSON.stringify(sub));

    const orig = (exIdKey && unapprovedLoadChanges.get(exIdKey)) || (exNameKey && unapprovedLoadChanges.get(exNameKey));
    if (orig) {
      return {
        ...ex,
        startValue: orig.startValue,
        setsReps: orig.setsReps || orig.currentSetsReps || ex.setsReps
      };
    }
    return JSON.parse(JSON.stringify(ex));
  },

  _applyProposalToSessions(currentSessions, diffItems, proposedSessions) {
    const unapprovedAdditions = new Set();
    const unapprovedSubstitutions = new Map();
    const unapprovedLoadChanges = new Map();
    const unapprovedRemovals = [];

    for (const d of diffItems) {
      if (d.approved) continue;
      const sId = d.sessionId;
      const pKey = d.proposedExercise ? (d.proposedExercise.id || (d.proposedExercise.name || "").trim().toLowerCase()) : null;
      if (d.type === "ADDITION" && pKey) unapprovedAdditions.add(`${sId}::${pKey}`);
      else if (d.type === "SUBSTITUTION" && pKey && d.originalExercise) unapprovedSubstitutions.set(`${sId}::${pKey}`, d.originalExercise);
      else if (d.type === "LOAD_CHANGE" && pKey && d.originalExercise) unapprovedLoadChanges.set(`${sId}::${pKey}`, d.originalExercise);
      else if (d.type === "REMOVAL" && d.originalExercise) unapprovedRemovals.push({ sessionId: sId, origEx: d.originalExercise });
    }

    const nextSessions = proposedSessions.map(propSess => {
      const sId = propSess.id;
      const currSess = currentSessions.find(cs => cs.id === sId) || {};
      const groups = (propSess.groups || [])
        .map(group => ({
          ...group,
          exercises: (group.exercises || [])
            .map(ex => this._resolveProposalExercise(ex, sId, unapprovedAdditions, unapprovedSubstitutions, unapprovedLoadChanges))
            .filter(Boolean)
        }))
        .filter(g => g.exercises.length > 0);

      const sessionRemovals = unapprovedRemovals.filter(r => r.sessionId === sId);
      if (sessionRemovals.length > 0) {
        if (groups.length === 0) groups.push({ label: "Restored Exercises", exercises: [] });
        sessionRemovals.forEach(r => groups[groups.length - 1].exercises.push(JSON.parse(JSON.stringify(r.origEx))));
      }

      const normalizedGroups = groups.map(g => ({
        ...g,
        exercises: (g.exercises || []).map(ex => this._normalizeExerciseFields(ex))
      }));

      return {
        ...currSess,
        ...propSess,
        id: sId,
        type: propSess.type || currSess.type || (propSess.targetKm ? "run" : "strength"),
        name: propSess.name || currSess.name,
        day: propSess.day || currSess.day,
        groups: normalizedGroups
      };
    });

    return this.sortSessionsByDay(nextSessions);
  },

  applyDiffToRoutine(currentSessions = [], diffItems = [], proposedSessions = null) {
    if (!Array.isArray(currentSessions)) return [];
    if (!Array.isArray(diffItems)) return currentSessions;
    if (Array.isArray(proposedSessions) && proposedSessions.length > 0) {
      return this._applyProposalToSessions(currentSessions, diffItems, proposedSessions);
    }

    const nextSessions = JSON.parse(JSON.stringify(currentSessions));
    const approvedDiffs = (diffItems || []).filter(d => d.approved);

    approvedDiffs.forEach(diff => {
      const session = nextSessions.find(s => s.id === diff.sessionId || s.name === diff.sessionName);
      if (!session) return;

      const groups = Array.isArray(session.groups) ? session.groups : [];

      if (diff.type === "SUBSTITUTION" || diff.type === "LOAD_CHANGE") {
        const origNameNorm = (diff.originalExercise?.name || "").trim().toLowerCase();
        const origId = diff.originalExercise?.id;

        groups.forEach(g => {
          if (!Array.isArray(g.exercises)) return;
          g.exercises = g.exercises.map(ex => {
            const isMatch = (origId && ex.id === origId) || ((ex.name || "").trim().toLowerCase() === origNameNorm);
            if (!isMatch) return ex;
            const targetId = diff.type === "SUBSTITUTION"
              ? (diff.proposedExercise?.id || this.slugify(diff.proposedExercise?.name) || `ex_${Date.now()}`)
              : (ex.id || diff.proposedExercise?.id || `ex_${Date.now()}`);
            const mergedSetsReps = diff.proposedExercise?.setsReps || diff.proposedExercise?.currentSetsReps || ex.setsReps;
            const mergedStartValue = diff.proposedExercise?.startValue != null ? diff.proposedExercise.startValue : (diff.proposedExercise?.currentWeight != null ? diff.proposedExercise.currentWeight : ex.startValue);
            return {
              ...ex,
              ...diff.proposedExercise,
              setsReps: mergedSetsReps,
              startValue: mergedStartValue,
              id: targetId
            };
          });
        });
      } else if (diff.type === "ADDITION") {
        if (groups.length === 0) {
          groups.push({ label: "Main Exercises", exercises: [] });
          session.groups = groups;
        }
        const targetGroup = groups[0];
        if (!Array.isArray(targetGroup.exercises)) targetGroup.exercises = [];
        targetGroup.exercises.push({
          ...diff.proposedExercise,
          setsReps: diff.proposedExercise?.setsReps || diff.proposedExercise?.currentSetsReps || "3 × 10",
          startValue: diff.proposedExercise?.startValue != null ? diff.proposedExercise.startValue : (diff.proposedExercise?.currentWeight != null ? diff.proposedExercise.currentWeight : null),
          id: diff.proposedExercise?.id || `ex_${Date.now()}`
        });
      } else if (diff.type === "REMOVAL") {
        const origNameNorm = (diff.originalExercise?.name || "").trim().toLowerCase();
        const origId = diff.originalExercise?.id;
        groups.forEach(g => {
          if (!Array.isArray(g.exercises)) return;
          g.exercises = g.exercises.filter(ex => {
            const isMatch = (origId && ex.id === origId) || ((ex.name || "").trim().toLowerCase() === origNameNorm);
            return !isMatch;
          });
        });
      }
    });

    return this.sortSessionsByDay(nextSessions);
  },

  /**
   * Create an immutable snapshot of a program milestone.
   */
  createMilestoneSnapshot(profileData, label = "Routine Milestone", createdBy = "elliott") {
    const timestamp = Date.now();
    return {
      id: `ms_${timestamp}`,
      label: label.trim() || `Milestone ${new Date().toISOString().slice(0, 10)}`,
      createdAt: timestamp,
      createdBy,
      programName: profileData?.programName || "Active Routine",
      sessions: JSON.parse(JSON.stringify(profileData?.sessions || []))
    };
  },

  /**
   * Restore sessions from a milestone snapshot.
   */
  restoreFromMilestoneSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.sessions)) {
      throw new Error("Invalid milestone snapshot: missing sessions array.");
    }
    return JSON.parse(JSON.stringify(snapshot.sessions));
  },

  sortSessionsByDay(sessions) {
    if (!Array.isArray(sessions)) return [];
    const DAY_ORDER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return [...sessions].sort((a, b) => {
      const dayA = DAY_ORDER[a?.day] || 99;
      const dayB = DAY_ORDER[b?.day] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (a?.name || "").localeCompare(b?.name || "");
    });
  },

  /**
   * Determines whether an incoming remote program snapshot should replace the local profile.
   * Routine-specific LWW (Last-Write-Wins): remote must have a newer programUpdatedAt.
   * If local has only the default boilerplate routine and remote is a named clinical/physio routine,
   * remote takes precedence even if local clock was bumped by routine-unaware health updates.
   */
  shouldAcceptRemoteProgram(localProfile, remoteProgram) {
    if (!remoteProgram || typeof remoteProgram !== "object") return false;
    const remoteSessions = remoteProgram.sessions;
    const hasRemoteSessions = (Array.isArray(remoteSessions) && remoteSessions.length > 0) ||
      (remoteSessions && typeof remoteSessions === "object" && Object.keys(remoteSessions).length > 0);
    if (!hasRemoteSessions) return false;

    // If local has no sessions or no profile, remote always initializes it
    const localSessions = localProfile?.sessions;
    const hasLocalSessions = Array.isArray(localSessions) && localSessions.length > 0;
    if (!hasLocalSessions) return true;

    // Local uses the routine-specific clock only: profile.updatedAt is bumped by
    // log/health updates and must not make a stale routine look newer.
    const localTime = Number(localProfile?.programUpdatedAt || 0);

    // Remote routine timestamp: prefer positive programUpdatedAt (> 0).
    const remoteProgTime = Number(remoteProgram?.programUpdatedAt || 0);
    const remoteTime = remoteProgTime > 0
      ? remoteProgTime
      : (localTime === 0 ? Number(remoteProgram?.updatedAt || 0) : 0);

    const isLocalDefaultBoilerplate = !localProfile?.programName ||
      localProfile.programName === "Current Routine" ||
      localProfile.programName === "Active Routine" ||
      (Array.isArray(localSessions) && localSessions.every(s => ["e_run", "e_lower", "e_upper", "e_total"].includes(s.id)));

    const isRemoteNamedCustom = Boolean(remoteProgram.programName &&
      remoteProgram.programName !== "Current Routine" &&
      remoteProgram.programName !== "Active Routine");

    // If local is default boilerplate and remote is a named routine, remote MUST win
    if (isLocalDefaultBoilerplate && isRemoteNamedCustom) {
      return true;
    }

    // If both have timestamps:
    if (remoteTime > 0 && localTime > 0) {
      if (remoteTime > localTime) return true;
      if (remoteTime === localTime) {
        // If timestamps are equal, check if remote carries a named routine or different sessions
        if (isRemoteNamedCustom && (!localProfile.programName || remoteProgram.programName !== localProfile.programName)) {
          return true;
        }
        const rList = Array.isArray(remoteSessions) ? remoteSessions : Object.values(remoteSessions);
        const remoteIds = rList.map(s => `${s.id}_${s.day}`).join(",");
        const localIds = localSessions.map(s => `${s.id}_${s.day}`).join(",");
        if (remoteIds !== localIds) return true;
      }
      return false;
    }
    // If local has no routine timestamp (e.g. unversioned local routine on phone), accept remote:
    if (remoteTime > 0 && localTime === 0) {
      return true;
    }
    // If remote has no timestamp but local does, local is newer:
    if (localTime > 0 && remoteTime === 0) {
      return false;
    }
    // Fallback: keep local if neither has timestamp
    return false;
  },

  normalizeRemoteProgram(remote) {
    if (!remote || typeof remote !== "object") return remote;
    const cleanSessions = this._coerceArray(remote.sessions).filter(Boolean).map(s => ({
      ...s,
      type: s.type || (s.targetKm ? "run" : "strength"),
      groups: this._coerceArray(s.groups).filter(Boolean).map(g => ({
        ...g,
        exercises: this._coerceArray(g.exercises).filter(Boolean).map(ex => this._normalizeExerciseFields(ex))
      }))
    }));

    return {
      ...remote,
      name: remote.name || remote.programName || "Active Routine",
      programName: remote.name || remote.programName || "Active Routine",
      sessions: this.sortSessionsByDay(cleanSessions),
      // If remote has no weekOverrides (e.g. stripped as empty object by RTDB), default to empty object
      weekOverrides: (remote.weekOverrides && typeof remote.weekOverrides === "object") ? remote.weekOverrides : {}
    };
  },

  /**
   * Sanitize weekOverrides against the current routine sessions and date.
   * Prunes past weeks and discards overrides that were created on a previous routine version.
   */
  sanitizeWeekOverrides(weekOverrides, sessions = [], currentMonday = null, programUpdatedAt = 0, weekOverridesUpdatedAt = 0) {
    if (!weekOverrides || typeof weekOverrides !== "object") return {};
    // If the routine was updated and overrides do not have a timestamp newer than the routine,
    // they belong to an older routine and must be discarded.
    if (Number(programUpdatedAt || 0) > 0 && Number(weekOverridesUpdatedAt || 0) < Number(programUpdatedAt || 0)) {
      return {};
    }
    const sanitized = {};
    const sessionMap = new Map((sessions || []).map(s => [s.id, s.day]));

    Object.keys(weekOverrides).forEach(weekKey => {
      if (currentMonday && weekKey < currentMonday) return;
      const weekObj = weekOverrides[weekKey];
      if (!weekObj || typeof weekObj !== "object") return;

      const cleanWeek = {};
      Object.keys(weekObj).forEach(sessId => {
        const targetDay = weekObj[sessId];
        const naturalDay = sessionMap.get(sessId);
        if (naturalDay && targetDay && targetDay !== naturalDay) {
          cleanWeek[sessId] = targetDay;
        }
      });
      if (Object.keys(cleanWeek).length > 0) {
        sanitized[weekKey] = cleanWeek;
      }
    });
    return sanitized;
  },

  /**
   * Resolves the primary local routine source among available local storage candidates
   * (e.g. plateplan_v1_elliott, plateplan_v1, data:elliott).
   * Picks the candidate with the highest programUpdatedAt (> 0).
   * Never splices stale sessions from one store with a newer timestamp from another store.
   */
  resolveLocalRoutineSource(...candidates) {
    let best = null;
    let bestTime = -1;
    for (const c of candidates) {
      if (!c || typeof c !== "object") continue;
      const time = Number(c.programUpdatedAt || 0);
      const hasSessions = Array.isArray(c.sessions) && c.sessions.length > 0;
      if (hasSessions && time > bestTime) {
        best = c;
        bestTime = time;
      }
    }
    if (!best) {
      for (const c of candidates) {
        if (c && typeof c === "object" && Array.isArray(c.sessions) && c.sessions.length > 0) {
          return c;
        }
      }
    }
    return best || {};
  },

  /**
   * Selects the best candidate program across multiple cloud endpoints (e.g. gym_users vs households).
   * Prioritizes non-empty sessions, named routines over boilerplate, and higher programUpdatedAt.
   */
  selectBestRemoteProgramCandidate(...candidates) {
    const valid = candidates.filter(c => c && typeof c === "object" && Array.isArray(c.sessions) && c.sessions.length > 0);
    if (!valid.length) return null;

    let best = valid[0];
    for (let i = 1; i < valid.length; i++) {
      const candidate = valid[i];
      if (this.shouldAcceptRemoteProgram(best, candidate)) {
        best = candidate;
      }
    }
    return best;
  },

  /**
   * Dispatches dual-path cloud writes concurrently via Promise.allSettled.
   * Guarantees that a rejection on one endpoint (e.g. gym_users PERMISSION_DENIED) does not abort
   * writes to other endpoints (e.g. households).
   *
   * @param {Object} payload The sanitized routine payload to write.
   * @param {Array<{ name: string, write: (payload: Object) => Promise<any> }>} endpoints
   * @returns {Promise<{ succeeded: Array<{ name: string, value: any }>, failed: Array<{ name: string, error: string }>, allFailed: boolean }>}
   */
  async dispatchDualPathProgramWrite(payload, endpoints) {
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      return { succeeded: [], failed: [], allFailed: true };
    }

    const settled = await Promise.allSettled(
      endpoints.map(ep => ep.write(payload))
    );

    const succeeded = [];
    const failed = [];

    settled.forEach((res, idx) => {
      const epName = endpoints[idx]?.name || `endpoint_${idx}`;
      if (res.status === "fulfilled") {
        succeeded.push({ name: epName, value: res.value });
      } else {
        const errMsg = res.reason?.message || String(res.reason || "Unknown error");
        failed.push({ name: epName, error: errMsg });
      }
    });

    return {
      succeeded,
      failed,
      allFailed: succeeded.length === 0
    };
  },

  buildCleanActiveProgramPayload(programData, timestamp = Date.now()) {
    if (!programData || typeof programData !== "object") return null;
    const cleanSessions = this._coerceArray(programData.sessions).filter(Boolean).map(s => ({
      ...s,
      type: s.type || (s.targetKm ? "run" : "strength"),
      groups: this._coerceArray(s.groups).filter(Boolean).map(g => ({
        ...g,
        exercises: this._coerceArray(g.exercises).filter(Boolean).map(ex => this._normalizeExerciseFields(ex))
      }))
    }));

    const raw = {
      programId: programData.programId || "current",
      name: programData.programName || programData.name || "Active Routine",
      programName: programData.programName || programData.name || "Active Routine",
      startDate: programData.startDate || "",
      goals: programData.goals || "",
      resumeNote: programData.resumeNote || "",
      sessions: this.sortSessionsByDay ? this.sortSessionsByDay(cleanSessions) : cleanSessions,
      weekOverrides: programData.weekOverrides || {},
      equipment: programData.equipment || null,
      programUpdatedAt: Number(programData.programUpdatedAt || 0) > 0 ? Number(programData.programUpdatedAt) : timestamp,
      updatedAt: timestamp
    };

    return JSON.parse(JSON.stringify(raw));
  },

  mergeActiveProgramIntoProfile(currentProfile, normalizedProgram, programTime) {
    const base = currentProfile && typeof currentProfile === "object" ? currentProfile : {};
    const prog = normalizedProgram && typeof normalizedProgram === "object" ? normalizedProgram : {};
    const resolvedTime = Number(programTime || prog.programUpdatedAt || prog.updatedAt || Date.now());
    return {
      ...base,
      programName: prog.programName || prog.name || base.programName,
      startDate: prog.startDate || base.startDate,
      goals: prog.goals || base.goals,
      resumeNote: prog.resumeNote || base.resumeNote,
      sessions: prog.sessions,
      weekOverrides: prog.weekOverrides || {},
      weekOverridesUpdatedAt: Number(prog.weekOverridesUpdatedAt || resolvedTime),
      equipment: prog.equipment || base.equipment,
      logs: Array.isArray(base.logs) ? base.logs : [],
      bodyWeightLogs: Array.isArray(base.bodyWeightLogs) ? base.bodyWeightLogs : [],
      readinessLogs: Array.isArray(base.readinessLogs) ? base.readinessLogs : [],
      sleepLogs: Array.isArray(base.sleepLogs) ? base.sleepLogs : [],
      programUpdatedAt: resolvedTime,
      updatedAt: Math.max(Number(base.updatedAt || 0), resolvedTime)
    };
  }
};



// Also attach globally for browser / window environments
if (typeof window !== "undefined") {
  window.HG_PHYSIO_ENGINE = HG_PHYSIO_ENGINE;
}
