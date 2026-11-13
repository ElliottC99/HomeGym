(function () {
  const VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE";

  window.HG_enableNotifications = async function (personId, reminderHour, householdKey) {
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

      const effectiveKey = householdKey || window.localStorage.getItem("householdPin") || "";
      if (!effectiveKey) return false;

      const db = window.firebase.database();
      await db.ref(`households/${effectiveKey}/tokens/${personId}`).set({
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
