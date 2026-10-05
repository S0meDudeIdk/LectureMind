import { createContext, createElement, useContext, useSyncExternalStore } from 'react';
import {
  signInWithPopup, signInWithCredential, signInAnonymously, linkWithPopup,
  signOut as firebaseSignOut, GoogleAuthProvider, onAuthStateChanged,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';
export { getAppCheckToken } from './firebase';

const DRIVE_TOKEN_KEY = 'lecturemind_drive_access_token';
const listeners = new Set();
let driveCredential = null;
let observerStarted = false;
let anonymousSignIn;
let snapshot = { user: null, loading: Boolean(isFirebaseConfigured && auth), driveToken: null, error: null };
const AuthContext = createContext(null);

// Remove the historical persistent bearer token, including after an application upgrade.
try { globalThis.localStorage?.removeItem(DRIVE_TOKEN_KEY); } catch {}

function publish(updates) {
  snapshot = { ...snapshot, ...updates };
  for (const listener of listeners) listener();
}

export function getCurrentUser() { return auth?.currentUser || null; }

export function getStoredDriveToken() {
  if (!driveCredential) {
    try { driveCredential = JSON.parse(globalThis.sessionStorage?.getItem(DRIVE_TOKEN_KEY) || 'null'); } catch { driveCredential = null; }
  }
  if (!driveCredential || driveCredential.uid !== getCurrentUser()?.uid || driveCredential.expiresAt <= Date.now()) return null;
  return driveCredential.token;
}

export function clearDriveToken() {
  driveCredential = null;
  try { globalThis.sessionStorage?.removeItem(DRIVE_TOKEN_KEY); globalThis.localStorage?.removeItem(DRIVE_TOKEN_KEY); } catch {}
  publish({ driveToken: null });
}

export function setStoredDriveToken(token) {
  if (!token || !getCurrentUser()) { clearDriveToken(); return; }
  driveCredential = { token, uid: getCurrentUser().uid, expiresAt: Date.now() + 55 * 60 * 1000 };
  try { globalThis.sessionStorage?.setItem(DRIVE_TOKEN_KEY, JSON.stringify(driveCredential)); } catch {}
  publish({ driveToken: token });
}

export async function loginAnonymously() {
  if (!auth) throw new Error('Authentication is unavailable. Local editing is still available.');
  if (auth.currentUser) return auth.currentUser;
  if (!anonymousSignIn) anonymousSignIn = signInAnonymously(auth).then((result) => result.user).finally(() => { anonymousSignIn = null; });
  return anonymousSignIn;
}

function startObserver() {
  if (observerStarted || !auth) return;
  observerStarted = true;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (driveCredential && driveCredential.uid !== user.uid) clearDriveToken();
      publish({ user, loading: false, error: null, driveToken: getStoredDriveToken() });
    } else {
      clearDriveToken();
      publish({ user: null, loading: true });
      loginAnonymously().catch((error) => publish({ user: null, loading: false, error: error.message }));
    }
  }, (error) => publish({ loading: false, error: error.message }));
}

function subscribe(listener) {
  listeners.add(listener);
  startObserver();
  return () => listeners.delete(listener);
}

export async function getIdToken(forceRefresh = false) {
  if (!auth) throw new Error('Generation requires configured authentication. Your local notes remain available.');
  startObserver();
  await auth.authStateReady();
  const user = auth.currentUser || await loginAnonymously();
  return user.getIdToken(forceRefresh);
}

export async function signInWithGoogle() {
  if (!auth || !isFirebaseConfigured) throw new Error('Firebase Authentication is not configured.');
  await auth.authStateReady();
  if (anonymousSignIn) await anonymousSignIn.catch(() => {});
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let result;
  if (auth.currentUser?.isAnonymous) {
    try { result = await linkWithPopup(auth.currentUser, provider); }
    catch (error) {
      if (!['auth/credential-already-in-use', 'auth/email-already-in-use'].includes(error.code)) throw error;
      const credential = GoogleAuthProvider.credentialFromError(error);
      result = credential ? await signInWithCredential(auth, credential) : await signInWithPopup(auth, provider);
      // Switching to an existing account never copies the previous UID's browser records.
    }
  } else result = await signInWithPopup(auth, provider);
  publish({ user: result.user, loading: false, error: null });
  return { user: result.user, token: null };
}

export async function authorizeDrive() {
  if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sign in with Google before authorizing Google Docs.');
  const expectedUid = auth.currentUser.uid;
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ login_hint: auth.currentUser.email || '', prompt: 'consent' });
  const result = await signInWithPopup(auth, provider);
  if (result.user.uid !== expectedUid) {
    clearDriveToken();
    throw new Error('The account changed. Review the selected account and authorize Google Docs again.');
  }
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google did not return a Drive access token. Try authorization again.');
  setStoredDriveToken(token);
  return { token, user: result.user };
}

export async function signOutUser() {
  clearDriveToken();
  if (auth) await firebaseSignOut(auth);
  else publish({ user: null, loading: false });
}

export function AuthProvider({ children }) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const value = { ...state, isConfigured: isFirebaseConfigured, signInWithGoogle, signOut: signOutUser, authorizeDrive, clearDriveToken };
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
