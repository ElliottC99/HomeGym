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
