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

## Cloud Synchronization & State

### Active Routine Blueprint
The canonical, declarative definition of an athlete's current training schedule, session structures, and prescribed exercise metrics.
*Avoid: Full profile state, tracking log archive*

The blueprint is strictly decoupled from historical workout logs and health metrics. It contains only program metadata, ordered weekly sessions, and equipment profiles, ensuring rapid, lightweight cloud propagation and preventing tracking data from corrupting database nodes.

### Dual-Path Synchronization
A concurrent cloud data distribution pattern that writes active routine blueprints across multiple database topologies (such as direct user paths and shared household scopes) simultaneously using non-blocking settlement.
Ensures real-time continuity across heterogeneous clients and prevents access control mismatches or path deprecations on one endpoint from stalling replication to another.

### Routine LWW Clock
The logical last-write-wins clock (`programUpdatedAt`) tracking intentional routine authoring events.
*Avoid: Generalized device record update timestamps (`updatedAt`)*

Guarantees that cloud routine distribution is governed strictly by the recency of the training blueprint itself, preventing local device metadata churn or workout completion logs from inadvertently overwriting newer routines.

