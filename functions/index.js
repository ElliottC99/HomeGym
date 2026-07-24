// Home Gym Log — scheduled push notifications.
//
// This is a Firebase Cloud Function, NOT part of the static site. It is
// deployed separately via the Firebase CLI (see ../PUSH_SETUP.md) and does
// NOT get uploaded to GitHub Pages.
//
// Runs once an hour. For each household (identified by PIN) and each
// registered device (Elliott's phone, Chloe's phone), it checks whether the
// device's chosen reminder hour matches the current hour in Europe/London.
// If so, it looks at that person's synced session schedule, works out
// what's due today, and sends a single push notification via FCM.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const TIMEZONE = "Europe/London";
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function londonParts(now) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parseInt(parts.hour, 10) % 24;
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return { hour, dateStr, weekday: parts.weekday };
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function effectiveDay(personData, session, mondayStr) {
  const override = personData.weekOverrides && personData.weekOverrides[mondayStr];
  return (override && override[session.id]) || session.day;
}

function buildMessageForToday(personData, todayAbbr, mondayStr) {
  const sessions = (personData.sessions || []).filter(
    (s) => effectiveDay(personData, s, mondayStr) === todayAbbr
  );
  if (sessions.length === 0) return null;
  const names = sessions.map((s) => s.name).join(", ");
  return { title: "Home Gym Log", body: `Today: ${names}` };
}

exports.sendTrainingReminders = functions
  .region("europe-west1")
  .pubsub.schedule("0 * * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const now = new Date();
    const { hour, dateStr, weekday } = londonParts(now);
    const mondayStr = mondayOf(dateStr);

    const db = admin.database();
    const householdsSnap = await db.ref("households").once("value");
    const households = householdsSnap.val() || {};

    const sends = [];

    for (const pin of Object.keys(households)) {
      const household = households[pin];
      const tokens = household.tokens || {};

      for (const personId of Object.keys(tokens)) {
        const tokenEntry = tokens[personId];
        if (!tokenEntry || !tokenEntry.token) continue;
        if (tokenEntry.reminderHour !== hour) continue;

        const personData = household[personId];
        if (!personData || !Array.isArray(personData.sessions)) continue;

        const message = buildMessageForToday(personData, weekday, mondayStr);
        if (!message) continue;

        sends.push(
          admin
            .messaging()
            .send({
              token: tokenEntry.token,
              notification: { title: message.title, body: message.body },
              webpush: {
                fcmOptions: { link: "/" },
                notification: { icon: "/icon-192.png" },
              },
            })
            .catch((err) => {
              console.warn(`Send failed for ${pin}/${personId}:`, err.message);
              // A token that's permanently invalid (app uninstalled, etc.)
              // — clean it up so we stop retrying every hour.
              if (
                err.code === "messaging/registration-token-not-registered" ||
                err.code === "messaging/invalid-registration-token"
              ) {
                return db.ref(`households/${pin}/tokens/${personId}`).remove();
              }
            })
        );
      }
    }

    await Promise.all(sends);
    console.log(`Reminder pass complete: ${sends.length} notification(s) sent.`);
    return null;
  });
