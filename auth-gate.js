// Home Gym — Google sign-in gate.
// Loads the app scripts only after the user is signed in with an allowed
// Google account. Database access is enforced by database.rules.json; the
// allow-list below only decides which screen to show and must match the rules.
(function () {
  const ALLOWED_EMAILS = ["ejcallender@gmail.com", "clncarr7@gmail.com"];
  const APP_SCRIPTS = [
    "./notifications.js?v=2.5.14",
    "./physio-engine.js?v=2.5.14",
    "./app.bundle.js?v=2.5.14",
    "./app-redesign.js?v=2.5.14",
    "./data-recovery-inspector.js?v=2.5.14",
  ];

  let started = false;
  function startApp() {
    if (started) return;
    started = true;
    APP_SCRIPTS.reduce((chain, src) => chain.then(() => new Promise(resolve => {
      const el = document.createElement("script");
      el.src = src;
      if (src.includes("physio-engine.js")) {
        el.type = "module";
      }
      el.async = false;
      el.onload = el.onerror = resolve;
      document.body.appendChild(el);
    })), Promise.resolve());
  }

  function showGate(auth, message, user) {
    let gate = document.getElementById("hg-auth-gate");
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "hg-auth-gate";
      gate.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
        "padding:24px;background:#F7F6F2;color:#1c1c1e;font-family:system-ui,sans-serif;z-index:99999;";
      document.body.appendChild(gate);
    }
    gate.innerHTML = "";
    const box = document.createElement("div");
    box.style.cssText = "max-width:340px;text-align:center;";
    const h = document.createElement("h1");
    h.textContent = "HomeGym";
    h.style.cssText = "margin:0 0 8px;font-size:28px;";
    const p = document.createElement("p");
    p.textContent = message;
    p.style.cssText = "margin:0 0 20px;line-height:1.4;";
    const btn = document.createElement("button");
    btn.textContent = user ? "Sign out" : "Sign in with Google";
    btn.style.cssText = "padding:12px 20px;font-size:16px;border-radius:10px;border:1px solid #888;background:#fff;color:#1c1c1e;";
    btn.onclick = async () => {
      if (user) { await auth.signOut(); return showGate(auth, "Signed out.", null); }
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await auth.signInWithPopup(provider);
      } catch (err) {
        const code = err && err.code;
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          auth.signInWithRedirect(provider);
        } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
          showGate(auth, "Sign-in failed: " + (err && err.message || code), null);
        }
      }
    };
    box.append(h, p, btn);
    gate.appendChild(box);
  }

  function hideGate() {
    const gate = document.getElementById("hg-auth-gate");
    if (gate) gate.remove();
  }

  let auth = null;
  try {
    if (window.firebase && window.firebase.auth && window.FIREBASE_CONFIG) {
      if (!window.firebase.apps.length) window.firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = window.firebase.auth();
    }
  } catch (err) {
    console.warn("Firebase auth unavailable:", err && err.message);
  }
  // Firebase scripts unavailable (e.g. first load offline): run from local storage.
  if (!auth) return startApp();

  auth.getRedirectResult().catch(err => console.warn("Redirect sign-in failed:", err && err.message));
  auth.onAuthStateChanged(user => {
    if (!user) return showGate(auth, "Sign in with your Google account to continue.", null);
    const email = (user.email || "").toLowerCase();
    if (ALLOWED_EMAILS.indexOf(email) === -1) {
      return showGate(auth, email + " does not have access to this app.", user);
    }
    hideGate();
    startApp();
  });
})();
