// Re-export from unified services/firebase to ensure singleton initialization
export { default as app, auth, db, storage, isFirebaseConfigured } from '../services/firebase';
export { loginAnonymously } from '../services/auth';
