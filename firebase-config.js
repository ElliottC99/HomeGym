// Home Gym — Firebase client configuration. Client keys are public by design.
// Household data is addressed by a private, randomly generated key stored
// locally on Elliott's and Chloe's phones; no household key is shipped here.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWkL4FZw6-w1-86bjlyysbFD0DtF6Hi0I",
  authDomain: "homegym-745d1.firebaseapp.com",
  databaseURL: "https://homegym-745d1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "homegym-745d1",
  storageBucket: "homegym-745d1.firebasestorage.app",
  messagingSenderId: "146875542389",
  appId: "1:146875542389:web:f39616b321a9718bd3813c",
};
window.HOUSEHOLD_PIN_DEFAULT = "a0c90dc277095620d5289a740773fd3a";
// Firestore sync stays off until a Firestore database exists in the project
// (none does today) and its rules are deployed. Realtime Database is the live backend.
window.HG_ENABLE_FIRESTORE = false;
