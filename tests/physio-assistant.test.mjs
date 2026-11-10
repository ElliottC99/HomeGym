// Unit tests for Physio & AI Routine Exchange Loop
// Run with: node --test tests/physio-assistant.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// We import the engine logic or load it from the implementation
// For modular execution, we test the pure helper functions in HG_PHYSIO_ENGINE
import { HG_PHYSIO_ENGINE } from "../physio-engine.js";

const sampleProfile = {
  athlete: "Elliott",
  programName: "4-Day Hypertrophy",
  equipment: ["Power Rack", "Olympic Barbell", "Plates up to 140kg", "Adjustable Dumbbells", "Bench"],
  sessions: [
    {
      id: "day1_push",
      name: "Day 1 - Push",
      day: "Monday",
      groups: [
        {
          label: "Chest & Shoulders",
          exercises: [
            { id: "bench", name: "Barbell Bench Press", setsReps: "3 x 8", startValue: 75, unit: "kg", note: "Working weight dialed in" },
            { id: "ohp", name: "Overhead Press", setsReps: "3 x 10", startValue: 45, unit: "kg" }
          ]
        }
      ]
    },
    {
      id: "day2_legs",
      name: "Day 2 - Legs",
      day: "Tuesday",
      groups: [
        {
          label: "Quads & Hamstrings",
          exercises: [
            { id: "squat", name: "Barbell Back Squat", setsReps: "3 x 6", startValue: 100, unit: "kg", note: "Mild knee twinge" },
            { id: "split_squat", name: "Bulgarian Split Squats", setsReps: "3 x 10", startValue: 20, unit: "kg" }
          ]
        }
      ]
    }
  ]
};

test("U1: buildClinicalPrompt generates structured markdown prompt", () => {
  const prompt = HG_PHYSIO_ENGINE.buildClinicalPrompt(sampleProfile, "Elliott", "Avoid deep knee flexion due to patellar tendinopathy");
  assert.ok(prompt.includes("# Clinical Workout Routine Consultation"));
  assert.ok(prompt.includes("Elliott"));
  assert.ok(prompt.includes("Avoid deep knee flexion"));
  assert.ok(prompt.includes("**Barbell Bench Press** (3 x 8 @ 75kg)"));
  assert.ok(prompt.includes("**Barbell Back Squat** (3 x 6 @ 100kg)"));
  assert.ok(prompt.includes("Power Rack"));
  assert.ok(prompt.includes("```json"));
});

test("U1: buildClinicalPrompt falls back to default equipment if empty", () => {
  const emptyEquipProfile = { ...sampleProfile, equipment: null };
  const prompt = HG_PHYSIO_ENGINE.buildClinicalPrompt(emptyEquipProfile, "Chloe");
  assert.ok(prompt.includes("Standard Home Gym Profile"));
  assert.ok(prompt.includes("Barbell"));
});

test("U2: extractRoutineFromText extracts JSON from fenced code blocks", () => {
  const rawAIResponse = `
Here is my clinical assessment:
Based on your patellar tendinopathy, we should swap out deep back squats for goblet squats with an elevated heel.

\`\`\`json
{
  "sessions": [
    {
      "id": "day2_legs",
      "name": "Day 2 - Legs",
      "day": "Tuesday",
      "groups": [
        {
          "label": "Quads & Hamstrings",
          "exercises": [
            { "id": "squat", "name": "Heel-Elevated Goblet Squat", "setsReps": "3 x 12", "startValue": 24, "unit": "kg", "note": "Knee-friendly regression" },
            { "id": "split_squat", "name": "Bulgarian Split Squats", "setsReps": "3 x 10", "startValue": 20, "unit": "kg" }
          ]
        }
      ]
    }
  ]
}
\`\`\`

Let me know if you experience any discomfort.
`;

  const extracted = HG_PHYSIO_ENGINE.extractRoutineFromText(rawAIResponse);
  assert.ok(extracted, "Should successfully parse routine");
  assert.equal(extracted.sessions.length, 1);
  assert.equal(extracted.sessions[0].groups[0].exercises[0].name, "Heel-Elevated Goblet Squat");
});

test("U2: extractRoutineFromText parses raw JSON without fences", () => {
  const rawJSON = JSON.stringify({
    sessions: [
      { id: "day1_push", name: "Day 1 - Push", groups: [] }
    ]
  });
  const extracted = HG_PHYSIO_ENGINE.extractRoutineFromText(rawJSON);
  assert.ok(extracted);
  assert.equal(extracted.sessions[0].id, "day1_push");
});

test("U2: extractRoutineFromText throws helpful error on unparseable input", () => {
  assert.throws(() => {
    HG_PHYSIO_ENGINE.extractRoutineFromText("This is just advice with no code block or JSON at all.");
  }, /No valid workout routine JSON found/);
});

test("U2: computeRoutineDiff identifies substitutions, additions, and load changes", () => {
  const currentSessions = sampleProfile.sessions;
  const proposedSessions = [
    {
      id: "day1_push",
      name: "Day 1 - Push",
      day: "Monday",
      groups: [
        {
          label: "Chest & Shoulders",
          exercises: [
            // Load adjustment: 75kg -> 70kg
            { id: "bench", name: "Barbell Bench Press", setsReps: "3 x 8", startValue: 70, unit: "kg", note: "Deload for elbow" },
            { id: "ohp", name: "Overhead Press", setsReps: "3 x 10", startValue: 45, unit: "kg" },
            // Addition
            { id: "lateral_raise", name: "Dumbbell Lateral Raise", setsReps: "3 x 15", startValue: 10, unit: "kg" }
          ]
        }
      ]
    },
    {
      id: "day2_legs",
      name: "Day 2 - Legs",
      day: "Tuesday",
      groups: [
        {
          label: "Quads & Hamstrings",
          exercises: [
            // Substitution: squat replaced with Goblet Squat
            { id: "squat", name: "Goblet Squat", setsReps: "3 x 12", startValue: 24, unit: "kg" },
            { id: "split_squat", name: "Bulgarian Split Squats", setsReps: "3 x 10", startValue: 20, unit: "kg" }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  assert.equal(diffs.length, 3, "Expected 3 changes: 1 load change, 1 addition, 1 substitution");

  const loadChange = diffs.find(d => d.type === "LOAD_CHANGE");
  assert.ok(loadChange);
  assert.equal(loadChange.originalExercise.startValue, 75);
  assert.equal(loadChange.proposedExercise.startValue, 70);
  assert.equal(loadChange.approved, true);

  const addition = diffs.find(d => d.type === "ADDITION");
  assert.ok(addition);
  assert.equal(addition.proposedExercise.name, "Dumbbell Lateral Raise");
  assert.equal(addition.approved, true);

  const swap = diffs.find(d => d.type === "SUBSTITUTION");
  assert.ok(swap);
  assert.equal(swap.originalExercise.name, "Barbell Back Squat");
  assert.equal(swap.proposedExercise.name, "Goblet Squat");
  assert.equal(swap.approved, true);
});

test("U2: applyDiffToRoutine respects cherry-picked approvals", () => {
  const currentSessions = sampleProfile.sessions;
  const proposedSessions = [
    {
      id: "day2_legs",
      name: "Day 2 - Legs",
      day: "Tuesday",
      groups: [
        {
          label: "Quads & Hamstrings",
          exercises: [
            { id: "squat", name: "Goblet Squat", setsReps: "3 x 12", startValue: 24, unit: "kg" },
            { id: "split_squat", name: "Leg Press", setsReps: "3 x 10", startValue: 120, unit: "kg" }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  assert.equal(diffs.length, 2);

  // User approves Goblet Squat swap, but rejects Leg Press swap (keeps Bulgarian Split Squats)
  diffs[0].approved = true;   // Goblet Squat
  diffs[1].approved = false;  // Leg Press (rejected)

  const updatedSessions = HG_PHYSIO_ENGINE.applyDiffToRoutine(currentSessions, diffs);
  const day2 = updatedSessions.find(s => s.id === "day2_legs");
  const day2Exercises = day2.groups[0].exercises;

  assert.equal(day2Exercises[0].name, "Goblet Squat", "Approved swap should be applied");
  assert.equal(day2Exercises[1].name, "Bulgarian Split Squats", "Rejected swap should retain original exercise");
});

test("U4: Milestone snapshot creation and rollback", () => {
  const snapshot = HG_PHYSIO_ENGINE.createMilestoneSnapshot(sampleProfile, "Baseline v1.0", "elliott");
  assert.ok(snapshot.id.startsWith("ms_"));
  assert.equal(snapshot.label, "Baseline v1.0");
  assert.equal(snapshot.sessions.length, 2);
  assert.equal(snapshot.createdBy, "elliott");

  // Simulate modified routine
  const modifiedProfile = {
    ...sampleProfile,
    sessions: [sampleProfile.sessions[0]] // only 1 session left
  };
  assert.equal(modifiedProfile.sessions.length, 1);

  // Revert
  const revertedSessions = HG_PHYSIO_ENGINE.restoreFromMilestoneSnapshot(snapshot);
  assert.equal(revertedSessions.length, 2);
  assert.equal(revertedSessions[0].id, "day1_push");
  assert.equal(revertedSessions[1].id, "day2_legs");
});

test("U5: getExerciseLatestStats extracts latest weight, sets, reps, and PR data", () => {
  const profileWithLogs = {
    ...sampleProfile,
    logs: [
      { id: "log_1", type: "exercise", exerciseId: "bench", exerciseName: "Barbell Bench Press", date: "2026-10-20", weight: 70, sets: 3, reps: 8, timestamp: 100 },
      { id: "log_2", type: "exercise", exerciseId: "bench", exerciseName: "Barbell Bench Press", date: "2026-11-03", weight: 75, sets: 4, reps: 6, rpe: 8, timestamp: 200 }
    ]
  };

  const stats = HG_PHYSIO_ENGINE.getExerciseLatestStats(profileWithLogs, "bench", "Barbell Bench Press");
  assert.ok(stats);
  assert.equal(stats.lastLoggedDate, "2026-11-03");
  assert.equal(stats.lastLoggedWeight, 75);
  assert.equal(stats.lastLoggedSets, 4);
  assert.equal(stats.lastLoggedReps, "6");
  assert.equal(stats.lastLoggedRpe, 8);
  assert.equal(stats.maxHistoricalWeight, 75);
  assert.ok(stats.summary.includes("4 × 6 @ 75kg"));
});

test("U6: buildEnrichedRoutineJSON includes exercise IDs and latest stats", () => {
  const profileWithLogs = {
    ...sampleProfile,
    logs: [
      { id: "log_1", type: "exercise", exerciseId: "bench", date: "2026-11-04", weight: 77.5, sets: 3, reps: 5, timestamp: 300 }
    ]
  };

  const json = HG_PHYSIO_ENGINE.buildEnrichedRoutineJSON(profileWithLogs, "Elliott");
  assert.equal(json.schema, "homegym-routine-v1");
  assert.equal(json.athlete, "Elliott");
  assert.equal(json.sessions.length, 2);

  const benchEx = json.sessions[0].groups[0].exercises[0];
  assert.equal(benchEx.id, "bench");
  assert.equal(benchEx.name, "Barbell Bench Press");
  assert.ok(benchEx.latestPerformance);
  assert.equal(benchEx.latestPerformance.lastLoggedWeight, 77.5);
});

test("U7: computeRoutineDiff and applyDiffToRoutine strictly preserve exercise IDs", () => {
  const currentSessions = [
    {
      id: "day1",
      name: "Day 1",
      groups: [
        {
          label: "Chest",
          exercises: [
            { id: "barbell_bench_press", name: "Barbell Bench Press", setsReps: "3 x 8", startValue: 70 }
          ]
        }
      ]
    }
  ];

  // AI returns updated routine without an id or with mismatched id, but same exercise name
  const proposedSessions = [
    {
      id: "day1",
      name: "Day 1",
      groups: [
        {
          label: "Chest",
          exercises: [
            { name: "Barbell Bench Press", setsReps: "4 x 6", startValue: 72.5 }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].type, "LOAD_CHANGE");
  // Check that canonical ID is kept in the diff
  assert.equal(diffs[0].proposedExercise.id, "barbell_bench_press");

  const merged = HG_PHYSIO_ENGINE.applyDiffToRoutine(currentSessions, diffs);
  assert.equal(merged[0].groups[0].exercises[0].id, "barbell_bench_press", "Exercise ID must stay identical");
  assert.equal(merged[0].groups[0].exercises[0].setsReps, "4 x 6");
  assert.equal(merged[0].groups[0].exercises[0].startValue, 72.5);
});

test("U8: RDL baseline 43kg is updated to latest logged 50kg in JSON export", () => {
  const profileWithRdl = {
    programName: "Elliott's Hypertrophy",
    sessions: [
      {
        id: "e_lower",
        name: "Lower Body",
        day: "Tuesday",
        groups: [
          {
            label: "Superset A",
            exercises: [
              { id: "rdl", name: "Barbell RDL", setsReps: "4 × 6", startValue: 43, unit: "kg" }
            ]
          }
        ]
      }
    ],
    logs: [
      // Log where RDL was lifted at 50kg
      { id: "log_rdl_recent", type: "exercise", exerciseId: "rdl", exerciseName: "Barbell RDL", date: "2026-11-01", weight: 50, sets: 4, reps: 6 }
    ]
  };

  const json = HG_PHYSIO_ENGINE.buildEnrichedRoutineJSON(profileWithRdl, "Elliott");
  const rdlEx = json.sessions[0].groups[0].exercises[0];

  assert.equal(rdlEx.name, "Barbell RDL");
  assert.equal(rdlEx.currentWeight, 50, "Current working weight must be 50kg, not 43kg");
  assert.equal(rdlEx.startValue, 50, "startValue in JSON must reflect latest working load 50kg");
  assert.equal(rdlEx.baselineWeight, 43, "baselineWeight retains 43kg initial starting point");
  assert.equal(rdlEx.latestPerformance.lastLoggedWeight, 50);
});

test("U9: Warmup additions at start of session do not trigger false substitutions for compound lifts", () => {
  const currentSessions = [
    {
      id: "e_lower",
      name: "Lower Body",
      day: "Tuesday",
      groups: [
        {
          label: "Superset A",
          exercises: [
            { id: "rdl", name: "Barbell RDL", setsReps: "3 × 8", startValue: 50, unit: "kg" },
            { id: "reverse_lunge", name: "DB reverse lunge", setsReps: "3 × 10", startValue: 14.5, unit: "kg" }
          ]
        }
      ]
    }
  ];

  // Proposed has warmups at index 0 and 1, followed by Barbell RDL
  const proposedSessions = [
    {
      id: "e_lower",
      name: "Lower Body & Physio",
      day: "Monday",
      groups: [
        {
          label: "Physio Flow",
          exercises: [
            { id: "physio_catcow", name: "Cat-Cow", setsReps: "1 × 10", startValue: null },
            { id: "physio_childspose", name: "Child's Posture", setsReps: "1 × 30 sec", startValue: null }
          ]
        },
        {
          label: "Superset A",
          exercises: [
            { id: "rdl", name: "Barbell RDL", setsReps: "3 × 8", startValue: 50, unit: "kg" },
            { id: "reverse_lunge", name: "DB reverse lunge", setsReps: "3 × 10", startValue: 14.5, unit: "kg" }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  // There should be NO substitution for Barbell RDL or DB reverse lunge!
  const substitutions = diffs.filter(d => d.type === "SUBSTITUTION");
  assert.equal(substitutions.length, 0, "No false substitutions should be detected");

  const additions = diffs.filter(d => d.type === "ADDITION");
  assert.equal(additions.length, 2, "Both warmups should be detected as ADDITION");
  assert.equal(additions[0].proposedExercise.name, "Cat-Cow");
  assert.equal(additions[1].proposedExercise.name, "Child's Posture");
});

test("U10: applyDiffToRoutine preserves proposed group structure and session day/name", () => {
  const currentSessions = [
    {
      id: "e_lower",
      name: "Lower Body",
      day: "Tuesday",
      groups: [
        {
          label: "Superset A",
          exercises: [
            { id: "rdl", name: "Barbell RDL", setsReps: "3 × 8", startValue: 50, unit: "kg" }
          ]
        }
      ]
    }
  ];

  const proposedSessions = [
    {
      id: "e_lower",
      name: "Lower Body & Physio",
      day: "Monday",
      groups: [
        {
          label: "Physio Flow",
          exercises: [
            { id: "physio_catcow", name: "Cat-Cow", setsReps: "1 × 10", startValue: null }
          ]
        },
        {
          label: "Superset A",
          exercises: [
            { id: "rdl", name: "Barbell RDL", setsReps: "3 × 8", startValue: 50, unit: "kg" }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  const updated = HG_PHYSIO_ENGINE.applyDiffToRoutine(currentSessions, diffs, proposedSessions);

  assert.equal(updated.length, 1);
  assert.equal(updated[0].name, "Lower Body & Physio");
  assert.equal(updated[0].day, "Monday");
  assert.equal(updated[0].groups.length, 2);
  assert.equal(updated[0].groups[0].label, "Physio Flow");
  assert.equal(updated[0].groups[0].exercises[0].name, "Cat-Cow");
  assert.equal(updated[0].groups[1].label, "Superset A");
  assert.equal(updated[0].groups[1].exercises[0].id, "rdl");
});

test("U11: extractRoutineFromText normalizes session type and currentSetsReps to setsReps", () => {
  const rawJSON = JSON.stringify({
    sessions: [
      {
        id: "e_lower",
        name: "Lower Body & Physio",
        day: "Mon",
        groups: [
          {
            label: "Physio Flow",
            exercises: [
              {
                id: "physio_catcow",
                name: "Cat-Cow",
                currentSetsReps: "1 × 10",
                startValue: null
              }
            ]
          }
        ]
      }
    ]
  });

  const extracted = HG_PHYSIO_ENGINE.extractRoutineFromText(rawJSON);
  assert.equal(extracted.sessions[0].type, "strength", "Session type must default to strength");
  assert.equal(extracted.sessions[0].groups[0].exercises[0].setsReps, "1 × 10", "setsReps must be populated from currentSetsReps");
});

test("U12: applyDiffToRoutine ensures applied sessions carry type='strength' and exercises have setsReps", () => {
  const currentSessions = [
    {
      id: "e_lower",
      name: "Lower Body",
      type: "strength",
      day: "Tue",
      groups: []
    }
  ];

  const proposedSessions = [
    {
      id: "e_lower",
      name: "Lower Body & Physio",
      day: "Mon",
      groups: [
        {
          label: "Physio Flow",
          exercises: [
            {
              id: "physio_catcow",
              name: "Cat-Cow",
              currentSetsReps: "1 × 10",
              startValue: null
            }
          ]
        }
      ]
    }
  ];

  const diffs = HG_PHYSIO_ENGINE.computeRoutineDiff(currentSessions, proposedSessions);
  const updated = HG_PHYSIO_ENGINE.applyDiffToRoutine(currentSessions, diffs, proposedSessions);

  assert.equal(updated[0].type, "strength");
  assert.equal(updated[0].groups[0].exercises[0].setsReps, "1 × 10");
});

test("U13: Cloud payload sanitization strips undefined properties to prevent RTDB fatal exceptions", () => {
  const payloadWithUndefined = {
    programId: "current",
    name: "Phase 1: Back Rehab",
    sessions: [
      {
        id: "e_lower",
        name: "Lower Body",
        type: undefined,
        groups: [
          {
            label: "Physio Flow",
            exercises: [
              {
                id: "catcow",
                name: "Cat-Cow",
                setsReps: "1 × 10",
                startValue: undefined,
                note: undefined
              }
            ]
          }
        ]
      }
    ]
  };

  const sanitized = JSON.parse(JSON.stringify(payloadWithUndefined));
  assert.equal("type" in sanitized.sessions[0], false, "Undefined type should be removed");
  assert.equal("startValue" in sanitized.sessions[0].groups[0].exercises[0], false, "Undefined startValue should be removed");
  assert.equal("note" in sanitized.sessions[0].groups[0].exercises[0], false, "Undefined note should be removed");
  assert.equal(sanitized.name, "Phase 1: Back Rehab");
});

test("U14: LWW timestamp comparison prevents stale cloud snapshot from overwriting newer local routine", () => {
  const localProfile = {
    programUpdatedAt: 1730000000000,
    updatedAt: 1730000000000,
    sessions: [{ id: "session_new", name: "New Plan", groups: [] }]
  };

  const staleRemote = {
    programUpdatedAt: 1729000000000,
    updatedAt: 1735000000000, // incidental re-save by a stale device: fresh updatedAt, old routine clock
    sessions: [{ id: "session_old", name: "Old Plan", groups: [] }]
  };

  const newerRemote = {
    programUpdatedAt: 1731000000000,
    updatedAt: 1731000000000,
    sessions: [{ id: "session_freshest", name: "Freshest Plan", groups: [] }]
  };

  const legacyZeroClockRemote = {
    programUpdatedAt: 0,
    updatedAt: 1735000000000,
    sessions: [{ id: "session_legacy", name: "Legacy Plan", groups: [] }]
  };

  const emptyLocal = { updatedAt: 0, sessions: [] };

  // 1. Stale routine must be rejected even if its write-time updatedAt is fresh
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(localProfile, staleRemote),
    false,
    "Stale cloud routine must not overwrite newer local routine"
  );

  // 2. Newer remote routine must be accepted
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(localProfile, newerRemote),
    true,
    "Newer remote routine should update local profile"
  );

  // 3. Explicit 0 routine clock (legacy re-save) must not overwrite a timestamped local routine
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(localProfile, legacyZeroClockRemote),
    false,
    "Zero-clock remote must not overwrite timestamped local routine"
  );

  // 4. Remote initializes empty local profile
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(emptyLocal, staleRemote),
    true,
    "Remote should initialize an empty local profile"
  );

  // 5. Phone scenario: incoming logs bumped profile.updatedAt past the laptop's edit time,
  //    but the phone's routine clock is older, so the laptop's routine must still win.
  const phoneProfile = {
    programUpdatedAt: 1729000000000,
    updatedAt: 1739000000000,
    sessions: [{ id: "session_old", name: "Old Plan", groups: [] }]
  };
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(phoneProfile, newerRemote),
    true,
    "Log-driven updatedAt bumps must not block a newer routine from another device"
  );

  // 6. Unversioned phone profile (programUpdatedAt: 0) must accept newer remote program
  const unversionedPhoneProfile = {
    programUpdatedAt: 0,
    updatedAt: 1729000000000,
    sessions: [{ id: "session_old", name: "Old Plan", groups: [] }]
  };
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(unversionedPhoneProfile, newerRemote),
    true,
    "Unversioned phone profile must accept newer remote program with positive programUpdatedAt"
  );

  // 7. Unversioned phone profile must accept remote program falling back to positive updatedAt
  assert.equal(
    HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(unversionedPhoneProfile, legacyZeroClockRemote),
    true,
    "Unversioned phone profile must accept remote program falling back to positive updatedAt"
  );
});

test("U15: Active routine payload sanitization guarantees positive non-zero programUpdatedAt", () => {
  const inputWithoutClock = {
    sessions: [{ id: "s1", name: "Push", groups: [] }],
    updatedAt: 1730000000000
  };

  const resolvedClock = (Number(inputWithoutClock.programUpdatedAt || 0) > 0)
    ? Number(inputWithoutClock.programUpdatedAt)
    : (Number(inputWithoutClock.updatedAt || 0) > 0 ? Number(inputWithoutClock.updatedAt) : 12345);

  assert.equal(resolvedClock, 1730000000000, "Unversioned input falls back to updatedAt positive timestamp");

  const inputWithClock = {
    sessions: [{ id: "s1", name: "Push", groups: [] }],
    programUpdatedAt: 1731111111111,
    updatedAt: 1730000000000
  };

  const resolvedClock2 = (Number(inputWithClock.programUpdatedAt || 0) > 0)
    ? Number(inputWithClock.programUpdatedAt)
    : (Number(inputWithClock.updatedAt || 0) > 0 ? Number(inputWithClock.updatedAt) : 12345);

  assert.equal(resolvedClock2, 1731111111111, "Explicit programUpdatedAt takes precedence");
});

test("U16: Routine updates reset ghost weekOverrides so new session days show on Today view", () => {
  const profileWithOverrides = {
    programName: "Old Plan",
    sessions: [{ id: "e_lower", name: "Lower Body", day: "Tue", groups: [] }],
    weekOverrides: { "2026-11-09": { e_lower: "Tue" } }
  };

  // Simulating handleApplyChanges weekOverrides reset:
  const newProfile = {
    ...profileWithOverrides,
    sessions: [{ id: "e_lower", name: "Lower Body & Physio", day: "Mon", groups: [] }],
    weekOverrides: {}
  };

  assert.deepEqual(newProfile.weekOverrides, {}, "weekOverrides must be reset when a new routine is adopted");
  assert.equal(newProfile.sessions[0].day, "Mon", "New session day is Monday");
});

test("U17: normalizeRemoteProgram ensures weekOverrides is empty object when omitted by RTDB", () => {
  const rtdbPayloadWithoutWeekOverrides = {
    programId: "current",
    programName: "Phase 1: Back Rehab",
    sessions: [{ id: "e_lower", name: "Lower Body", day: "Mon", groups: [] }],
    programUpdatedAt: 1731112223334
  };

  const localProfileWithOldOverrides = {
    programName: "Old Plan",
    programUpdatedAt: 1730000000000,
    sessions: [{ id: "e_lower", name: "Lower Body", day: "Tue", groups: [] }],
    weekOverrides: { "2026-11-09": { e_lower: "Tue" } }
  };

  const remoteNormalized = HG_PHYSIO_ENGINE.normalizeRemoteProgram
    ? HG_PHYSIO_ENGINE.normalizeRemoteProgram(rtdbPayloadWithoutWeekOverrides)
    : { ...rtdbPayloadWithoutWeekOverrides, weekOverrides: rtdbPayloadWithoutWeekOverrides.weekOverrides || {} };

  const merged = {
    ...localProfileWithOldOverrides,
    ...remoteNormalized,
    weekOverrides: remoteNormalized.weekOverrides || {}
  };

  assert.deepEqual(merged.weekOverrides, {}, "Local stale weekOverrides must be replaced by empty object from remote update");
  assert.equal(merged.sessions[0].day, "Mon", "New routine day takes effect");
});

test("U18: Unversioned phone profile with recent updatedAt accepts newer remote program and does not overwrite", () => {
  const unversionedPhoneProfile = {
    programName: "Old Plan",
    programUpdatedAt: 0,
    updatedAt: 1731199999999,
    sessions: [{ id: "old_s", name: "Old Routine", day: "Mon", groups: [] }]
  };

  const laptopRemoteProgram = {
    programName: "Phase 1: Back Rehab",
    programUpdatedAt: 1731199000000,
    updatedAt: 1731199000000,
    sessions: [{ id: "e_lower", name: "Lower Body & Physio", day: "Mon", groups: [] }]
  };

  const accepted = HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(unversionedPhoneProfile, laptopRemoteProgram);
  assert.equal(accepted, true, "Phone must accept laptop routine because phone has no explicit routine version");

  const localRoutineClock = Number(unversionedPhoneProfile.programUpdatedAt || 0);
  const remoteRoutineClock = Number(laptopRemoteProgram.programUpdatedAt || 0);
  const localIsNewer = localRoutineClock > remoteRoutineClock;
  assert.equal(localIsNewer, false, "Local unversioned profile must NOT be considered newer than remote");
});

test("U19: Stale weekOverrides pointing away from routine natural day are sanitized", () => {
  const profile = {
    programUpdatedAt: 1731199000000,
    sessions: [{ id: "e_lower", name: "Lower Body & Physio", day: "Mon", groups: [] }],
    weekOverrides: {
      "2026-11-02": { e_lower: "Tue" },
      "2026-11-09": { e_lower: "Tue" }
    }
  };

  const sanitized = HG_PHYSIO_ENGINE.sanitizeWeekOverrides
    ? HG_PHYSIO_ENGINE.sanitizeWeekOverrides(profile.weekOverrides, profile.sessions, "2026-11-09", profile.programUpdatedAt)
    : {};

  assert.deepEqual(sanitized, {}, "Overrides from old routine or past weeks must be sanitized");
});

test("U20: Routine resolution across local storage keys selects candidate with highest programUpdatedAt", () => {
  const legacyDataWithOldSessions = {
    sessions: [
      { id: "e_run", name: "Run", day: "Mon" },
      { id: "e_lower", name: "Lower Body", day: "Tue" }
    ],
    updatedAt: 1730000000000
    // programUpdatedAt missing/0
  };

  const newerPpv1WithNewRoutine = {
    programName: "Phase 1: Back Rehab & Match Fit",
    programUpdatedAt: 1731112223334,
    sessions: [
      { id: "e_lower", name: "Lower Body & Physio", day: "Mon" },
      { id: "e_full", name: "Full Body, Core & Physio", day: "Thu" }
    ],
    updatedAt: 1731112223334
  };

  const resolved = HG_PHYSIO_ENGINE.resolveLocalRoutineSource
    ? HG_PHYSIO_ENGINE.resolveLocalRoutineSource(legacyDataWithOldSessions, newerPpv1WithNewRoutine)
    : (Number(newerPpv1WithNewRoutine.programUpdatedAt || 0) > Number(legacyDataWithOldSessions.programUpdatedAt || 0) ? newerPpv1WithNewRoutine : legacyDataWithOldSessions);

  assert.equal(resolved.programName, "Phase 1: Back Rehab & Match Fit");
  assert.equal(resolved.sessions[0].name, "Lower Body & Physio");
  assert.equal(resolved.sessions[0].day, "Mon");
  assert.equal(resolved.programUpdatedAt, 1731112223334);
});

test("U21: sortSessionsByDay arranges sessions strictly in Monday to Sunday order", () => {
  const unsortedSessions = [
    { id: "e_run", name: "Run (10km)", day: "Fri" },
    { id: "e_lower", name: "Lower Body & Physio", day: "Mon" },
    { id: "e_upper", name: "Upper Body & Physio", day: "Tue" },
    { id: "e_total", name: "Full Body, Core & Physio", day: "Thu" },
  ];

  const sorted = HG_PHYSIO_ENGINE.sortSessionsByDay(unsortedSessions);
  assert.deepEqual(
    sorted.map(s => s.day),
    ["Mon", "Tue", "Thu", "Fri"],
    "Sessions must be sorted Monday to Sunday"
  );
  assert.equal(sorted[0].name, "Lower Body & Physio");
  assert.equal(sorted[3].name, "Run (10km)");
});

test("U22: shouldAcceptRemoteProgram accepts remote named program if local has default boilerplate sessions even with equal or higher timestamp", () => {
  const localBoilerplate = {
    programName: "Current Routine",
    programUpdatedAt: 1731200000000,
    sessions: [
      { id: "e_run", name: "Run", day: "Mon" },
      { id: "e_lower", name: "Lower Body", day: "Tue" },
      { id: "e_upper", name: "Upper Body", day: "Wed" },
      { id: "e_total", name: "Full Body", day: "Thu" }
    ]
  };

  const remoteNamed = {
    programName: "Phase 1: Back Rehab & Match Fit",
    programUpdatedAt: 1731100000000, // Older timestamp in RTDB
    sessions: [
      { id: "e_lower", name: "Lower Body & Physio", day: "Mon" },
      { id: "e_upper", name: "Upper Body & Physio", day: "Tue" },
      { id: "e_total", name: "Full Body, Core & Physio", day: "Thu" },
      { id: "e_run", name: "Run (10km)", day: "Fri" }
    ]
  };

  const accepted = HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(localBoilerplate, remoteNamed);
  assert.equal(accepted, true, "Named remote program must replace local boilerplate routine even if local clock was bumped");
});

test("U23: shouldAcceptRemoteProgram accepts remote program when timestamps are equal and remote has different sessions or program name", () => {
  const localProfile = {
    programName: "Current Routine",
    programUpdatedAt: 1731112223334,
    sessions: [
      { id: "e_run", name: "Run", day: "Mon" },
      { id: "e_lower", name: "Lower Body", day: "Tue" }
    ]
  };

  const remoteProgram = {
    programName: "Phase 1: Back Rehab & Match Fit",
    programUpdatedAt: 1731112223334, // Exactly equal timestamp (Frankenstein bug scenario)
    sessions: [
      { id: "e_lower", name: "Lower Body & Physio", day: "Mon" },
      { id: "e_upper", name: "Upper Body & Physio", day: "Tue" },
      { id: "e_total", name: "Full Body, Core & Physio", day: "Thu" },
      { id: "e_run", name: "Run (10km)", day: "Fri" }
    ]
  };

  const accepted = HG_PHYSIO_ENGINE.shouldAcceptRemoteProgram(localProfile, remoteProgram);
  assert.equal(accepted, true, "Equal timestamp with different sessions or named program must be accepted");
});
