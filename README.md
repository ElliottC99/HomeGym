# Home Gym Log — deploy to your phone

This folder has everything needed for a proper "tap the icon, opens like an app" experience on Android. It's a Progressive Web App (PWA) — not a Play Store listing (that needs a signed native app and a developer account, which isn't achievable here), but functionally very close: home screen icon, full-screen launch, works offline after the first load.

## What's new in this version

Rebuilt around full session plans (transcribed from your workout doc) instead of a simplified lift list:

- Every session (Lower Body, Upper Body, Full Body, Run) now includes its actual warm-up and cool-down/stretch list, shown as reference on the session card.
- Supersets are grouped visually the way your plan writes them (Superset A, B, Finisher, etc).
- Every exercise is loggable — sets + reps (or seconds for holds like planks/wall sits) + an always-optional weight field, so bodyweight and banded moves log cleanly too.
- Reassigning a day now moves the whole session at once (Plan tab), not one exercise at a time.
- Optional target-weight + target-date milestones per exercise, with pacing shown in Progress (ahead/on-track/behind).
- A rest timer using each exercise's plan rest time, auto-filled weight/reps from your last session for that exercise, and a PR flag when you log a new best.
- The plan export now documents the full schema so a future AI-regenerated plan can be pasted straight back in.

## What's in this folder

- `index.html` — the app shell
- `app.bundle.js` — the compiled app (React + your training logic)
- `manifest.json` — tells Android how to install it (name, icon, colors)
- `sw.js` — service worker, caches the app so it opens offline
- `icon-*.png` — home screen icons

All 8 files need to be deployed together, at the same folder level (don't nest them in a subfolder).

## Deploy with GitHub Pages (free)

1. Go to github.com, sign in (or create a free account), and create a new repository — public is fine, name it anything (e.g. `home-gym-log`). Don't initialize it with a README.
2. On the new repo's page, click **Add file → Upload files**, then drag in all 8 files from this folder. Commit the upload.
3. Go to **Settings → Pages** (left sidebar). Under "Build and deployment", set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. Wait about a minute, then refresh that Settings → Pages screen — it'll show your live URL, something like `https://yourusername.github.io/home-gym-log/`.

## Install it on your phone

1. Open that URL in Chrome on your Android phone.
2. Chrome will either show an "Install app" banner automatically, or tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. Confirm. You'll get a Home Gym Log icon that opens full-screen, no browser bar.

## Worth knowing

- **Your data stays on your phone.** All the logged sessions, weights, and plan live in this device's local storage — GitHub Pages only serves the static app files, never sees your training data. That also means it's single-device: logging on your phone won't show up if you open the same URL on a laptop, and vice versa.
- **Back it up.** Use the "Export full backup (.json)" button in the Plan tab occasionally (email it to yourself, save to a drive) — if you ever clear your phone's browser data or switch phones, that file is the only way to get your history back.
- **Updating the app later.** If you want changes to the code down the line, re-upload the updated files to the same GitHub repo (overwrite) and bump `CACHE_NAME` in `sw.js` by one so the service worker knows to fetch the new version instead of serving the cached one.
