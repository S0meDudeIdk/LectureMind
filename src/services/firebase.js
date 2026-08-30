import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '';
const extractedProjFromAuth = authDomain ? authDomain.replace(/\.firebaseapp\.com$/, '').replace(/\.web\.app$/, '') : '';

let rawProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || '';
// Auto-correct if user entered an app name instead of the actual GCP project ID
if (extractedProjFromAuth && (!rawProjectId || rawProjectId === 'lecturemind-airiser' || rawProjectId !== extractedProjFromAuth)) {
  console.info(`[Firebase Config] Using authenticated Project ID from authDomain: "${extractedProjFromAuth}" (overriding "${rawProjectId}")`);
  rawProjectId = extractedProjFromAuth;
}

const rawBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '';
let sanitizedBucket = rawBucket 
  ? rawBucket.replace(/^gs:\/\//, '').replace(/^https?:\/\//, '').replace(/\/$/, '') 
  : '';

if (!sanitizedBucket || sanitizedBucket.includes('lecturemind-airiser')) {
  sanitizedBucket = rawProjectId ? `${rawProjectId}.firebasestorage.app` : '';
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: authDomain || (rawProjectId ? `${rawProjectId}.firebaseapp.com` : undefined),
  projectId: rawProjectId,
  storageBucket: sanitizedBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

// Check if valid Firebase configuration is present
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== '' && 
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== ''
);

// Check if Firebase Storage bucket is explicitly configured
export const isStorageConfigured = Boolean(
  isFirebaseConfigured &&
  firebaseConfig.storageBucket &&
  firebaseConfig.storageBucket !== ''
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

    if (isStorageConfigured) {
      try {
        storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
        if (storage) {
          // Allow up to 5 minutes for large video/audio uploads
          storage.maxUploadRetryTime = 300000;
          storage.maxOperationRetryTime = 120000;
        }
      } catch (storageErr) {
        console.warn("Firebase storage initialization failed:", storageErr);
        storage = null;
      }
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
