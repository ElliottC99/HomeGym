---
title: "Preventing Firebase RTDB Silent Write Failures and Sync Stalls via Recursive Undefined Sanitization and Dual-Path Endpoints"
date: "2026-11-10"
category: "database-issues"
module: "sync-engine"
problem_type: "runtime_error"
component: "database"
symptoms:
  - "Mobile device stays stuck on old workout routine while laptop has the updated routine despite successful Google authentication"
  - "Manual cloud re-sync displays a false success toast when the underlying RTDB write throws or is rejected"
  - "Push exception: 'set failed: value argument contains undefined in property gym_users.elliott.active_program.current.logs.0.distance'"
root_cause: "type_error_and_sequential_rejection"
resolution_type: "code_fix"
severity: "high"
tags:
  - "firebase-rtdb"
  - "cloud-sync"
  - "data-sanitization"
  - "undefined-properties"
  - "dual-path-sync"
  - "cross-device-continuity"
---

# Preventing Firebase RTDB Silent Write Failures and Sync Stalls via Recursive Undefined Sanitization and Dual-Path Endpoints

## Problem
In a cross-device PWA environment (desktop/laptop and mobile phone) backed by Firebase Realtime Database (RTDB), updates to training routines failed to propagate from the laptop to the phone. The phone remained perpetually frozen on an older routine. Re-sync attempts reported apparent success in the UI while failing silently on the wire, and force-push operations crashed with fatal Firebase client exceptions: `set failed: value argument contains undefined in property 'gym_users.elliott.active_program.current.logs.0.distance'`.

## Symptoms
- Desktop/laptop had the updated routine ("Phase 1: Back Rehab & Match Fit"), but the phone remained stuck on the default boilerplate routine ("Current Routine").
- Tapping "⚡ Re-sync routine to cloud" displayed a success toast, but no data arrived on the mobile device.
- Attempting to force-push the routine threw: `Push exception: set failed: value argument contains undefined in property 'gym_users.elliott.active_program.current.logs.0.distance'`.
- Neither device had visibility into whether Firebase Auth was verified, whether RTDB sockets were connected, or which endpoint path rejected writes.

## Root Cause
Two compounding defects blocked cross-device sync:

1. **Firebase RTDB Fatal Rejection on `undefined`**:
   Firebase RTDB strictly forbids `undefined` anywhere in a written object graph. If a single nested property is `undefined` (such as `distance: undefined` on strength exercises), calling `rtdb.ref(...).set(payload)` throws an uncatchable or fatal `set failed: value argument contains undefined...` exception. Passing the athlete's local state (which bundled `logs`) directly into `active_program/current` introduced un-sanitized log fields containing `undefined`.

2. **Sequential `await` Abort in `saveActiveProgram`**:
   The cloud persistence engine executed sequential writes:
   ```javascript
   await rtdb.ref(`gym_users/${profileId}/active_program/current`).set(payload);
   await rtdb.ref(`gym_users/${profileId}/plateplan/current`).set(payload);
   if (pin) await rtdb.ref(`households/${pin}/${profileId}`).set(payload);
   ```
   When `gym_users` threw (due to security rule constraints or an `undefined` property), execution immediately aborted into a swallowed `catch (e) { console.warn(...) }`. The household write (`households/${pin}/${profileId}`) was never executed, yet the calling UI layer displayed a success toast. Furthermore, mobile listeners were only subscribed to `gym_users`, leaving them stranded when that path failed.

## Solution

1. **Clean Routine Payload Extraction & Recursive Sanitization (`buildCleanActiveProgramPayload`)**:
   Implemented in [`physio-engine.js`](file:///Users/elliottcallender/Downloads/HomeGym/physio-engine.js) and utilized in [`app-redesign.js`](file:///Users/elliottcallender/Downloads/HomeGym/app-redesign.js):
   - Extracts *strictly* routine definition fields (`sessions`, `programName`, `programUpdatedAt`, `startDate`, `goals`, `resumeNote`, `weekOverrides`, `equipment`, `updatedAt`).
   - Completely omits `logs`, `bodyWeightLogs`, and other local tracking arrays from active program cloud nodes.
   - Enforces `JSON.parse(JSON.stringify(raw))` recursive sanitization to guarantee that any accidental `undefined` values are stripped from the payload prior to calling RTDB `.set()`.
   - Replaced `undefined` fallbacks in log creation (`distance: log.distance != null ? Number(log.distance) : null`).

2. **Concurrent Dual-Path Writes via `Promise.allSettled` (`dispatchDualPathProgramWrite`)**:
   Instead of fragile sequential `await`s, writes dispatch concurrently across all configured cloud targets:
   - `gym_users/${profileId}/active_program/current`
   - `gym_users/${profileId}/plateplan/current`
   - `households/${pin}/${profileId}`
   A rejection on one path (e.g. security permissions or network timeout) does not abort the other paths.

3. **Dual-Path Real-Time Cloud Listeners**:
   In `PlatePlanSyncEngine.subscribe`, real-time listeners attach to both `gym_users` and `households`. Updates received on either endpoint trigger immediate local state reconciliation via `shouldAcceptRemoteProgram`.

4. **Live RTDB Wire Diagnostics Modal (`SyncDiagnosticsModal`)**:
   Added an on-screen diagnostics dashboard accessible via the header cloud badge or settings:
   - Probes live Google Auth status (email, UID, verification status).
   - Probes live `.info/connected` RTDB socket status.
   - Probes both `gym_users` and `households` paths, displaying program names, timestamps, and raw wire errors (e.g., `PERMISSION_DENIED`).
   - Provides on-demand `🚀 Force Push Routine to Cloud (Dual-Path)` and `📥 Force Pull from Cloud into Device` with full feedback banners.

## Why This Works
By separating routine specifications from exercise tracking logs and enforcing recursive JSON stripping, payloads sent to Firebase RTDB are guaranteed free of `undefined` values. Dispatching writes across dual paths with `Promise.allSettled` prevents permission mismatches or path deprecations from silently halting updates, while the wire diagnostics modal exposes raw database responses directly to the user.

## Prevention
- **Automated Tests**:
  - `U13`: Cloud payload sanitization strips undefined properties to prevent RTDB fatal exceptions.
  - `U24`: `selectBestRemoteProgramCandidate` picks the valid candidate with highest timestamp or named routine.
  - `U25`: `dispatchDualPathProgramWrite` dispatches to multiple endpoints concurrently via `Promise.allSettled` and does not abort on single failure.
  - `U26`: `buildCleanActiveProgramPayload` strips logs and all undefined properties.
- **Rule of Thumb**:
  - Never pass raw state objects containing tracking logs into active routine database nodes.
  - Never allow `undefined` in objects intended for Firebase Realtime Database; use `null` or prune keys.
