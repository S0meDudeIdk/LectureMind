import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  GoogleAuthProvider, 
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

const DRIVE_TOKEN_KEY = 'lecturemind_drive_access_token';

/**
 * Get cached Google Drive OAuth access token
 */
export function getStoredDriveToken() {
  return sessionStorage.getItem(DRIVE_TOKEN_KEY) || localStorage.getItem(DRIVE_TOKEN_KEY) || null;
}

/**
 * Set cached Google Drive OAuth access token
 */
export function setStoredDriveToken(token) {
  if (token) {
    sessionStorage.setItem(DRIVE_TOKEN_KEY, token);
    localStorage.setItem(DRIVE_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(DRIVE_TOKEN_KEY);
    localStorage.removeItem(DRIVE_TOKEN_KEY);
  }
}

/**
 * Sign in with Google using Firebase Authentication & Google Drive Scope
 */
export async function signInWithGoogle() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase Authentication is not configured in .env.');
  }

  const provider = new GoogleAuthProvider();
  // Request scope to create and manage files in Google Drive
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;

  if (token) {
    setStoredDriveToken(token);
  }

  return { user: result.user, token };
}

/**
 * Sign out of current user session
 */
export async function signOutUser() {
  setStoredDriveToken(null);
  if (auth) {
    await firebaseSignOut(auth);
  }
}

/**
 * React Hook for Firebase User & Auth State
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => isFirebaseConfigured && Boolean(auth));
  const [driveToken, setDriveToken] = useState(getStoredDriveToken);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setStoredDriveToken(null);
        setDriveToken(null);
      } else {
        setDriveToken(getStoredDriveToken());
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const { user: loggedInUser, token } = await signInWithGoogle();
      setUser(loggedInUser);
      setDriveToken(token);
      return loggedInUser;
    } catch (err) {
      console.error('[Auth] Google Sign-In failed:', err);
      throw err;
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    setDriveToken(null);
  };

  return {
    user,
    loading,
    driveToken,
    signInWithGoogle: handleSignIn,
    signOut: handleSignOut,
    isConfigured: isFirebaseConfigured,
  };
}
