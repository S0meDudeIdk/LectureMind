import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Check if valid Firebase configuration is present
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.trim() !== '' && 
  firebaseConfig.projectId && 
  firebaseConfig.projectId.trim() !== ''
);

// Initialize Firebase safely
let app = null;
let db = null;
let storage = null;
let auth = null;

if (isFirebaseConfigured) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    
    // Force long-polling to bypass ad blocker WebChannel / WebSocket restrictions
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });

    try {
      storage = getStorage(app);
    } catch (storageErr) {
      console.warn("Firebase storage initialization failed:", storageErr);
    }

    try {
      auth = getAuth(app);
    } catch (authErr) {
      console.warn("Firebase auth initialization failed:", authErr);
    }
  } catch (err) {
    console.warn("Firebase initialization skipped/failed:", err);
  }
}

export { db, storage, auth };
export default app;
