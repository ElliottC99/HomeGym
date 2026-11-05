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
   * Build a rich, clinical prompt bundle for external AI assistants.
   */
  buildClinicalPrompt(profileData, athleteName = "Elliott", physioNotes = "") {
    const sessions = Array.isArray(profileData?.sessions) ? profileData.sessions : [];
    const equipment = (Array.isArray(profileData?.equipment) && profileData.equipment.length > 0)
      ? profileData.equipment
      : this.DEFAULT_EQUIPMENT;
    const splitName = profileData?.programName || "Active Training Routine";
    const dateStr = new Date().toISOString().slice(0, 10);

    let markdown = `# Clinical Workout Routine Consultation\n\n`;
    markdown += `**Athlete:** ${athleteName}\n`;
    markdown += `**Date:** ${dateStr}\n`;
    markdown += `**Active Program:** ${splitName} (${sessions.length} training days)\n\n`;

    if (physioNotes && physioNotes.trim()) {
      markdown += `## Physiotherapist Guidance & Clinical Directives\n`;
      markdown += `${physioNotes.trim()}\n\n`;
    }

    markdown += `## Available Equipment\n`;
    equipment.forEach(item => {
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

      const groups = Array.isArray(session.groups) ? session.groups : [];
      if (groups.length === 0 && Array.isArray(session.exercises)) {
        session.exercises.forEach(ex => {
          const load = ex.startValue ? ` @ ${ex.startValue}${ex.unit || "kg"}` : "";
          const sr = ex.setsReps ? ` (${ex.setsReps}${load})` : "";
          const note = ex.note ? ` — Note: ${ex.note}` : "";
          markdown += `- **${ex.name}**${sr}${note}\n`;
        });
      } else {
        groups.forEach(group => {
          if (group.label) markdown += `*${group.label}:*\n`;
          const exList = Array.isArray(group.exercises) ? group.exercises : [];
          exList.forEach(ex => {
            const load = ex.startValue ? ` @ ${ex.startValue}${ex.unit || "kg"}` : "";
            const sr = ex.setsReps ? ` (${ex.setsReps}${load})` : "";
            const note = ex.note ? ` — Note: ${ex.note}` : "";
            markdown += `- **${ex.name}**${sr}${note}\n`;
          });
        });
      }
      markdown += `\n`;
    });

    markdown += `## Instructions for AI Assistant\n`;
    markdown += `1. **Clinical Reasoning:** Explain the clinical rationale for any recommended exercise substitutions, loading reductions, or volume tweaks based on the physiotherapist guidance above.\n`;
    markdown += `2. **Equipment Check:** Ensure all recommended exercises strictly use the athlete's available equipment listed above.\n`;
    markdown += `3. **Output Format:** You MUST end your response with a single valid \`\`\`json code block containing the complete updated 'sessions' array matching HomeGym's structure:\n\n`;
    markdown += `\`\`\`json\n`;
    markdown += `{\n`;
    markdown += `  "programName": "${splitName} (Adapted)",\n`;
    markdown += `  "sessions": [\n`;
    markdown += `    {\n`;
    markdown += `      "id": "session_id",\n`;
    markdown += `      "name": "Session Name",\n`;
    markdown += `      "day": "Monday",\n`;
    markdown += `      "groups": [\n`;
    markdown += `        {\n`;
    markdown += `          "label": "Group Label",\n`;
    markdown += `          "exercises": [\n`;
    markdown += `            {\n`;
    markdown += `              "id": "exercise_id",\n`;
    markdown += `              "name": "Exercise Name",\n`;
    markdown += `              "setsReps": "3 x 10",\n`;
    markdown += `              "startValue": 50,\n`;
    markdown += `              "unit": "kg",\n`;
    markdown += `              "note": "Clinical note or tempo cue"\n`;
    markdown += `            }\n`;
    markdown += `          ]\n`;
    markdown += `        }\n`;
    markdown += `      ]\n`;
    markdown += `    }\n`;
    markdown += `  ]\n`;
    markdown += `}\n`;
    markdown += `\`\`\`\n`;

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

    return parsed;
  },

  /**
   * Compare active sessions against proposed sessions and generate individual diff cards.
   */
  computeRoutineDiff(currentSessions = [], proposedSessions = []) {
    const diffs = [];
    let diffCounter = 1;

    proposedSessions.forEach(propSession => {
      // Match session by ID or day or name
      const currSession = currentSessions.find(s =>
        (s.id && s.id === propSession.id) ||
        (s.day && propSession.day && s.day.toLowerCase() === propSession.day.toLowerCase()) ||
        (s.name && propSession.name && s.name.toLowerCase() === propSession.name.toLowerCase())
      );

      const sessionName = propSession.name || (currSession ? currSession.name : "Training Session");
      const sessionId = propSession.id || (currSession ? currSession.id : `sess_${diffCounter}`);

      const currExercises = this._extractExercisesFromSession(currSession);
      const propExercises = this._extractExercisesFromSession(propSession);

      // Map current exercises by normalized name and ID
      const currById = new Map();
      const currByName = new Map();
      currExercises.forEach(ex => {
        if (ex.id) currById.set(String(ex.id), ex);
        if (ex.name) currByName.set(ex.name.trim().toLowerCase(), ex);
      });

      const matchedCurrIds = new Set();

      propExercises.forEach((propEx, idx) => {
        const propNameNorm = (propEx.name || "").trim().toLowerCase();
        let match = null;

        // Try exact ID match first
        if (propEx.id && currById.has(String(propEx.id))) {
          match = currById.get(String(propEx.id));
        } else if (currByName.has(propNameNorm)) {
          match = currByName.get(propNameNorm);
        } else {
          // If at the same index in the session and names differ, consider it a substitution
          const currAtIdx = currExercises[idx];
          if (currAtIdx && !matchedCurrIds.has(currAtIdx.id || currAtIdx.name)) {
            match = currAtIdx;
          }
        }

        if (match) {
          matchedCurrIds.add(match.id || match.name);
          const matchNameNorm = (match.name || "").trim().toLowerCase();

          if (matchNameNorm !== propNameNorm) {
            // Exercise Substitution
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
          } else {
            // Same exercise: check load / setsReps changes
            const loadChanged = Number(match.startValue) !== Number(propEx.startValue) && propEx.startValue != null;
            const srChanged = match.setsReps !== propEx.setsReps && propEx.setsReps != null;
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
        } else {
          // Proposed exercise has no current match -> ADDITION
          diffs.push({
            id: `diff_${diffCounter++}`,
            sessionId,
            sessionName,
            type: "ADDITION",
            approved: true,
            proposedExercise: propEx,
            clinicalReason: propEx.note || "New exercise added to routine"
          });
        }
      });

      // Check for removed exercises
      currExercises.forEach(currEx => {
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
      });
    });

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

  /**
   * Merge user-approved diff items into the active routine.
   */
  applyDiffToRoutine(currentSessions = [], diffItems = []) {
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
            return {
              ...ex,
              ...diff.proposedExercise,
              id: ex.id || diff.proposedExercise.id || `ex_${Date.now()}`
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
          id: diff.proposedExercise.id || `ex_${Date.now()}`
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

    return nextSessions;
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
  }
};

// Also attach globally for browser / window environments
if (typeof window !== "undefined") {
  window.HG_PHYSIO_ENGINE = HG_PHYSIO_ENGINE;
}
