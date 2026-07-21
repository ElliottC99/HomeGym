// Home Gym Log — Firebase config. Not secret (client keys are meant to be
// public); the real access boundary is the Realtime Database rules, which
// only allow read/write under households/<pin>/... for whoever knows the PIN.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWkL4FZw6-w1-86bjlyysbFD0DtF6Hi0I",
  authDomain: "homegym-745d1.firebaseapp.com",
  databaseURL: "https://homegym-745d1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "homegym-745d1",
  storageBucket: "homegym-745d1.firebasestorage.app",
  messagingSenderId: "146875542389",
  appId: "1:146875542389:web:f39616b321a9718bd3813c",
};
window.HOUSEHOLD_PIN_DEFAULT = "2605";
