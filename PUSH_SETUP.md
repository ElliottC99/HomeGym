# Setting up real push notifications

This is a one-time setup, done from a terminal on your computer (not something I can do for you — it needs your Firebase login and, in one step, your billing decision). Once it's done, both phones can get an actual notification at whatever time you pick, even with the app fully closed.

## What's already in place

- `notifications.js` — asks for notification permission and registers the device with Firebase Cloud Messaging (FCM).
- `sw.js` — already updated to receive and display push notifications (the `push` and `notificationclick` handlers).
- `index.html` — already loads the Firebase Messaging SDK and `notifications.js`.
- The Settings (⚙) modal in the app now has a "Notifications" section — pick a reminder hour and tap "Enable notifications on this phone".
- `functions/index.js` — the scheduled function that actually sends the notification. **Not part of the static site** — don't upload the `functions` folder or `PUSH_SETUP.md` to GitHub Pages, they only matter for this deployment step.

## Step 1 — Get a Web Push (VAPID) key

1. Go to the [Firebase console](https://console.firebase.google.com/), open the `homegym-745d1` project.
2. **Project settings → Cloud Messaging** tab.
3. Under "Web configuration" → "Web Push certificates", click **Generate key pair** if none exists yet.
4. Copy the key.
5. Open `notifications.js` and replace `PASTE_YOUR_VAPID_KEY_HERE` with that key.

## Step 2 — Upgrade to the Blaze plan

Scheduled Cloud Functions require the pay-as-you-go "Blaze" plan (the free "Spark" plan doesn't support them). In the Firebase console: **Project settings → Usage and billing → Details & settings → Modify plan** → choose Blaze and attach a billing account.

This app's usage — two devices, one notification each per day — will sit comfortably inside Cloud Functions' free monthly quota, so realistically this should cost **$0/month**, but Blaze does require a card on file since it's no longer capped for free.

## Step 3 — Install the Firebase CLI and log in

On your computer, in any terminal:

```
npm install -g firebase-tools
firebase login
```

This opens a browser window to sign in with the same Google account that owns the `homegym-745d1` project.

## Step 4 — Deploy the function

From inside the `GitHub HomeGym` folder:

```
cd functions
npm install
cd ..
firebase deploy --only functions --project homegym-745d1
```

The first deploy takes a minute or two. You should see `sendTrainingReminders` listed as deployed when it finishes.

## Step 5 — Redeploy the static site and enable notifications

1. Re-upload the changed files (`index.html`, `sw.js`, `notifications.js`, `app.bundle.js`) to your GitHub Pages repo, overwriting the old ones. (`functions/` and this file don't need to go there.)
2. Open the app on each phone, tap the ⚙ icon, scroll to **Notifications**, pick a reminder time, and tap **Enable notifications on this phone**. Allow the browser's permission prompt when it appears.
3. Because the service worker cache version was bumped, each phone will pick up the new files automatically the next time the app opens (may take one extra reload the very first time).

## How it decides what to send

Every hour, the function checks every registered device's chosen reminder hour (in UK time). If it matches the current hour, it looks at that person's currently synced session schedule (respecting any "just this week" day swaps) and sends one notification listing whatever's due that day. If nothing's scheduled that day, it stays quiet — no notification, no rest day spam.

## Troubleshooting

- **"Couldn't enable notifications" in the app** — usually means the VAPID key isn't filled in yet, or the browser blocked the permission prompt (check the site's notification permission in Chrome's site settings).
- **No notification arrives at the chosen hour** — check the Cloud Function logs: `firebase functions:log --project homegym-745d1`. A common cause is the Blaze plan not being active yet.
- **Costs** — check **Project settings → Usage and billing** occasionally. This workload is tiny, but it's the one part of this app that could in theory cost money if it were heavily modified later.
