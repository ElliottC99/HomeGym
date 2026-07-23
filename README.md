# Home Gym Log — deploy to your phone

This folder has everything needed for a proper "tap the icon, opens like an app" experience on Android. It's a Progressive Web App (PWA) — not a Play Store listing (that needs a signed native app and a developer account, which isn't achievable here), but functionally very close: home screen icon, full-screen launch, works offline after the first load.

## What's new in this version (v4)

- **Body weight tracking.** New Metrics tab — log weight (+ an optional note) over time, with a running total-change stat and a simple trend line.
- **Daily readiness check-in.** A quick sleep/soreness/motivation log on the Dashboard.
- **Streaks.** A running count of consecutive weeks where every scheduled session was completed.
- **Manual deload.** A "Force a deload this week" toggle on the Dashboard, for when you need to back off before the fixed week-9 slot comes around.
- **Add a run/cardio day.** The Plan tab's "Edit plan" now offers two explicit buttons — "+ Add strength session" and "+ Add run / cardio session" — instead of only ever creating strength sessions.
- **Real push notifications (optional, needs setup).** See `PUSH_SETUP.md` for the one-time deployment steps. Once set up, Settings (⚙) → Notifications lets each phone opt in to a daily reminder at a chosen time.
- Fixed: run sessions weren't logging correctly on some phones — likely a stale cached copy of an older version; the service worker cache version has been bumped so every phone picks up this build cleanly.
- Small accessibility/HIG polish: 16px minimum form-field size (stops iOS's auto-zoom-on-focus), visible keyboard focus rings, safe-area padding for the iPhone home indicator.

## What was new in v3

- **Sync between your phone and Chloe's.** Both phones now share the same data via a small cloud database, gated by a shared PIN (2605 by default — change it any time in the ⚙ Settings modal, both phones need to match). The header shows a small dot: green = synced, amber = connecting, grey = local only (works fine offline, just won't share until back online).
- **Move a session for just one week.** Each session card now has a "this week" day selector — swap Tuesday's Lower Body to Friday just for this week without touching its permanent default. It reverts automatically the following week.
- **Full in-app plan editor.** Plan tab → "Edit plan" reveals add/remove/reorder controls for sessions, groups, exercises, and warm-up/cooldown lists — no more needing to round-trip through an AI chat for structural changes (though that route still works too).
- **Reset a week-1 baseline.** Editing an exercise's starting weight in the plan editor now shifts its whole 8-week block ladder by the same amount, keeping the originally planned progression shape.
- **Free-text weight field.** The weight box in Log Session now accepts a plain number as before, or text like "medium band" or "added 5kg plate" — numbers still drive PRs and the progress chart, text entries just show in your history.

### From v2
Full session plans transcribed from your workout doc (not just a lift list): warm-up/cooldown reference lists, superset grouping, sets+reps+weight logging on every exercise, whole-session day reassignment, target-weight milestones, a rest timer, auto-fill from your last session, and PR flags.

## What's in this folder

- `index.html` — the app shell
- `app.bundle.js` — the compiled app (React + your training logic)
- `manifest.json` — tells Android how to install it (name, icon, colors)
- `sw.js` — service worker, caches the app so it opens offline, and handles push notifications
- `firebase-config.js` — sync configuration (the shared cloud database connection)
- `notifications.js` — registers a device to receive push notifications (needs one-time setup, see `PUSH_SETUP.md`)
- `icon-*.png` — home screen icons

These files need to be deployed together, at the same folder level (don't nest them in a subfolder). `functions/` and `PUSH_SETUP.md` are **not** part of the static site — don't upload them to GitHub Pages; they're only used once, from your own computer, to set up push notifications (optional).

## Deploy with GitHub Pages (free)

1. Go to github.com, sign in (or create a free account), and create a new repository — public is fine, name it anything (e.g. `home-gym-log`). Don't initialize it with a README.
2. On the new repo's page, click **Add file → Upload files**, then drag in all 9 files from this folder. Commit the upload.
3. Go to **Settings → Pages** (left sidebar). Under "Build and deployment", set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. Wait about a minute, then refresh that Settings → Pages screen — it'll show your live URL, something like `https://yourusername.github.io/home-gym-log/`.

## Install it on your phone (and Chloe's)

1. Open that URL in Chrome on your Android phone.
2. Chrome will either show an "Install app" banner automatically, or tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. Confirm. You'll get a Home Gym Log icon that opens full-screen, no browser bar.
4. Send Chloe the same URL to install on her phone too. The PIN (2605, or whatever you change it to in Settings) is already baked in, so both phones sync automatically once both are online — no extra setup needed on her end.

## Worth knowing

- **Sync is casual privacy, not real security.** The PIN gates access by being part of the storage path — anyone who knows it can read/write your data, but there's no login system behind it. Fine for two people sharing workout logs; worth knowing if you'd ever want stronger protection.
- **Offline still works.** If either phone loses signal mid-session, logging still works from local storage and catches up with the other phone once back online.
- **Back it up anyway.** Sync isn't a substitute for a backup — a bad restore or a bug could still affect both copies at once since they're the same data. Use "Export full backup (.json)" in the Plan tab occasionally (email it to yourself, save to a drive).
- **Updating the app later.** Re-upload changed files to the same GitHub repo (overwrite) and bump `CACHE_NAME` in `sw.js` by one so the service worker fetches the new version instead of serving the cached one. Your data (local and synced) isn't affected by an app update — it lives separately from the app files.
