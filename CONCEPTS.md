# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound captures and refreshes learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Training Architecture

### Exercise Identity
The permanent unique identifier for a physical movement pattern within an athlete's program.
*Avoid: Exercise name as primary key, temporary label*

All completed workout logs, personal record (PR) calculations, and longitudinal progression graphs link relationally to this key. It must remain invariant across load adjustments, set/rep modifications, and external AI routine adaptations.

### Training Session
A scheduled collection of exercises and paired antagonist supersets assigned to a specific training day.
Each session structures exercises into straight sets or supersets with prescribed target rest intervals.

### Workout Log
An immutable historical record capturing completed volume, working loads, reps, RPE, and subjective athlete feeling for a given calendar date.
Each log belongs to a specific exercise identity; all personal records and historical progression curves are computed from this collection.

### Program Milestone
An immutable point-in-time snapshot of an athlete's complete training routine created before applying external adaptations or clinical substitutions.
Enables non-destructive rollback of active programming without modifying or invalidating past workout logs.

### Routine Exchange Diff
A structured delta computed between an athlete's active program and an AI-proposed clinical adaptation.
Categorizes modifications into substitutions, load adjustments, additions, and removals with discrete athlete-approved cherry-picking.
