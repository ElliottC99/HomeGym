---
title: "Preserving Canonical Exercise IDs and Recent Performance History During External AI Routine Exchanges"
date: "2026-11-05"
category: "integration-issues"
module: "physio-assistant"
problem_type: "integration_issue"
component: "data_model"
symptoms:
  - "External LLMs regenerate or omit exercise IDs during routine adaptation, severing historical workout logs from updated routines"
  - "Progress graphs, personal records (PRs), and 1RM calculations fail to display past achievements for modified exercises"
  - "Clinical prompts generated from baseline weights instead of recent working loads caused AI assistants to prescribe obsolete loads"
root_cause: "data_integrity"
resolution_type: "code_fix"
severity: "high"
tags:
  - "llm-integration"
  - "exercise-id"
  - "workout-history"
  - "physio-assistant"
  - "data-continuity"
---

# Preserving Canonical Exercise IDs and Recent Performance History During External AI Routine Exchanges

## Problem
When users export active workout routines to external AI assistants (ChatGPT, Claude) for physiotherapist-guided adaptations, the AI frequently re-indexes, renames, or omits exercise identifiers (`id`). In HomeGym, historical workout logs, personal record (PR) determinations, and progress charts are relational to the canonical `exercise.id`. Altering these IDs during an AI routine import silently decouples an athlete's entire performance history from their active training program.

## Symptoms
- After importing an AI-adjusted routine, progress charts for continued exercises show zero historical sessions.
- PR notifications (`I.ye`) fail to recognize prior personal bests because `log.exerciseId` no longer matches the session's exercise ID.
- AI assistant prompts without recent workout performance context caused the model to hallucinate loads based on initial program baselines rather than current working capacity.

## What Didn't Work
- Relying purely on natural language instructions in the prompt asking the AI to "keep IDs": external LLMs frequently hallucinate fresh IDs (`ex_1`, `ex_2`, or `db_bench_press_new`) regardless of prompt wording.
- Full overwrite without reconciliatory diffing: directly applying external JSON payloads without validating existing ID relationships destroyed continuity.

## Solution
Implemented a two-tier defense combining performance-enriched schema serialization, prompt constraints, and defensive ID reconciliation in [`physio-engine.js`](file:///Users/elliottcallender/Downloads/HomeGym/physio-engine.js):

1. **Performance-Enriched Serialization (`getExerciseLatestStats` & `buildEnrichedRoutineJSON`)**:
   - Queries `profileData.logs` for the athlete's most recent session for each exercise.
   - Extracts real-world metrics (`lastLoggedDate`, `lastLoggedWeight`, `lastLoggedSets`, `lastLoggedReps`, `maxHistoricalWeight`).
   - Exports both human-readable markdown and a clean JSON schema with explicit `id` and `latestPerformance` objects.

2. **Strict LLM System Directives**:
   - Explicitly instructs the external AI: `PRESERVE EXERCISE IDs (MANDATORY)`. Emphasizes that `id` is a relational database key, and new snake_case IDs may only be created for clinical substitutions or newly added exercises.

3. **Reconciliatory Name-Matching Fallback in `computeRoutineDiff` & `applyDiffToRoutine`**:
   - If an AI returns an adjusted routine with an omitted or mutated ID, `computeRoutineDiff` matches the normalized exercise name (`currByName.get(propNameNorm)`) against the active routine and forcefully rebinds `propEx.id = match.id`.
   - In `applyDiffToRoutine`, load changes and set/rep tweaks strictly retain the original `ex.id`. Only genuine `SUBSTITUTION` diffs receive a new slugified ID.

4. **Direct UI Export Controls**:
   - Added dedicated `Download JSON` and `Copy JSON` controls to `PhysioAIAssistantModal` in [`app-redesign.js`](file:///Users/elliottcallender/Downloads/HomeGym/app-redesign.js) alongside the clinical prompt.

## Why This Works
By passing recent logged performance in the JSON, the LLM has exact knowledge of current working weights. Enforcing name-based canonical ID preservation in the client-side diff engine creates an unbreakable guarantee: even if an external LLM ignores prompt rules and changes the ID, HomeGym detects that the exercise name is unchanged and reattaches the canonical ID, keeping all historical PRs and graph telemetry intact.

## Prevention
- Automated unit test suite in [`tests/physio-assistant.test.mjs`](file:///Users/elliottcallender/Downloads/HomeGym/tests/physio-assistant.test.mjs):
  - `U5: getExerciseLatestStats extracts latest weight, sets, reps, and PR data` verifies query logic across diverse log structures.
  - `U6: buildEnrichedRoutineJSON includes exercise IDs and latest stats` guarantees JSON export structure.
  - `U7: computeRoutineDiff and applyDiffToRoutine strictly preserve exercise IDs` proves that an AI omitting or changing an exercise ID is reconciled to the original ID.

## Related Issues
- Plan: [Physio & AI Routine Exchange Plan](file:///Users/elliottcallender/Downloads/HomeGym/docs/plans/2026-11-05-1525-feat-physio-ai-routine-exchange-plan.md)
- Ideation: [Lean HomeGym Simplification](file:///Users/elliottcallender/Downloads/HomeGym/docs/ideation/2026-11-05-app-simplification-declutter-ideation.html)
