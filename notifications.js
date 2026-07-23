// Home Gym Log — push notification registration.
//
// Requests notification permission, gets an FCM token via the app's existing
// service worker, and stores that token (plus the chosen reminder hour) in
// the shared Realtime Database under households/<pin>/tokens/<personId>.
// A scheduled Cloud Function (see /functions in the project source) reads
// that same path to know who to send each day's reminder to and when.
//
// This file only registers the device to RECEIVE notifications — it doesn't
// send anything itself. See PUSH_SETUP.md for the one-time deployment steps
// needed before this actually works.

(function () {
  // Firebase console → Project settings → Cloud Messaging → Web Push
  // certificates → "Key pair". Paste that key below. Until this is filled
  // in, HG_enableNotifications will fail gracefully with a clear message.
  const VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE";

  window.HG_enableNotifications = async function (personId, reminderHour, pin) {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("Notifications not supported in this browser.");
      return false;
    }
    if (!VAPID_KEY || VAPID_KEY.indexOf("PASTE_") === 0) {
      console.warn("Notifications: VAPID key not configured yet — see PUSH_SETUP.md.");
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;

      if (!window.firebase || !window.FIREBASE_CONFIG) return false;
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      if (!window.firebase.messaging) {
        console.warn("Notifications: firebase-messaging-compat.js wasn't loaded.");
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const messaging = window.firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) return false;

      const effectivePin = pin || window.localStorage.getItem("householdPin") || window.HOUSEHOLD_PIN_DEFAULT || "";
      if (!effectivePin) return false;

      if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
      const db = window.firebase.database();
      await db.ref(`households/${effectivePin}/tokens/${personId}`).set({
        token,
        reminderHour: typeof reminderHour === "number" ? reminderHour : 9,
        updatedAt: Date.now(),
        userAgent: navigator.userAgent,
      });
      return true;
    } catch (err) {
      console.warn("Notification setup failed:", err && err.message);
      return false;
    }
  };
})();
