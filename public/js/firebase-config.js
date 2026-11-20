import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase web app: Shugharh's Girly Hub Web.
const firebaseConfig = {
  apiKey: "AIzaSyBP_l5KNueOV1XirMSENaVM9B-xQayQ13c",
  authDomain: "charity-web-a533b.firebaseapp.com",
  projectId: "charity-web-a533b",
  storageBucket: "charity-web-a533b.firebasestorage.app",
  messagingSenderId: "113975949799",
  appId: "1:113975949799:web:cb22038fd3faee99116542"
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId &&
  firebaseConfig.storageBucket && firebaseConfig.appId
);
const app = isFirebaseConfigured ? (getApps()[0] || initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
