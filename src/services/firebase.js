import { initializeApp, getApps, getApp, setLogLevel } from 'firebase/app';
import { initializeFirestore, getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

try { setLogLevel('error'); } catch {}

const environment = import.meta.env;
const authDomain = environment.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '';
const domainProject = /^(.*?)\.(?:firebaseapp\.com|web\.app)$/.exec(authDomain)?.[1] || '';
const projectId = environment.VITE_FIREBASE_PROJECT_ID?.trim() || domainProject;
const configuredBucket = environment.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '';
const storageBucket = configuredBucket.replace(/^gs:\/\//, '').replace(/\/$/, '');
const firebaseConfig = {
  apiKey: environment.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: authDomain || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId, storageBucket: storageBucket || undefined,
  messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: environment.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: environment.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && projectId);
export const isStorageConfigured = Boolean(isFirebaseConfigured && storageBucket);
export const useFirebaseEmulators = environment.VITE_USE_FIREBASE_EMULATORS === 'true';
let app = null;
let db = null;
let storage = null;
let auth = null;
let appCheck = null;
let appCheckPromise;

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try { db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); }
  catch (error) { if (error.code !== 'failed-precondition') throw error; db = getFirestore(app); }
  auth = getAuth(app);
  // Recording transport uses the authenticated backend, not the browser Storage SDK.
  if (useFirebaseEmulators) {
    const host = environment.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:${environment.VITE_FIREBASE_AUTH_EMULATOR_PORT || '9099'}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, Number(environment.VITE_FIRESTORE_EMULATOR_PORT || 8080));
  }
}

export async function getAppCheckToken(forceRefresh = false) {
  const siteKey = environment.VITE_RECAPTCHA_SITE_KEY?.trim();
  if (!app || !siteKey || useFirebaseEmulators) return null;
  if (!appCheckPromise) {
    appCheckPromise = import('firebase/app-check').then((sdk) => {
      if (environment.DEV && environment.VITE_APP_CHECK_DEBUG_TOKEN) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = environment.VITE_APP_CHECK_DEBUG_TOKEN === 'true' ? true : environment.VITE_APP_CHECK_DEBUG_TOKEN;
      const providerName = environment.VITE_APP_CHECK_PROVIDER || 'v3';
      if (!['v3', 'enterprise'].includes(providerName)) throw new Error('VITE_APP_CHECK_PROVIDER must be v3 or enterprise.');
      const Provider = providerName === 'enterprise' ? sdk.ReCaptchaEnterpriseProvider : sdk.ReCaptchaV3Provider;
      const baseProvider = new Provider(siteKey);

      const rawGetToken = typeof baseProvider.getToken === 'function' ? baseProvider.getToken.bind(baseProvider) : null;
      let lastFailure = 0;
      const safeTokenHandler = async () => {
        if (Date.now() - lastFailure < 60000) {
          return { token: '', expireTimeMillis: Date.now() + 60000 };
        }
        try {
          if (rawGetToken) {
            const tokenResult = await rawGetToken();
            if (tokenResult?.token) return tokenResult;
          }
          return { token: '', expireTimeMillis: Date.now() + 60000 };
        } catch {
          lastFailure = Date.now();
          return { token: '', expireTimeMillis: Date.now() + 60000 };
        }
      };
      if (rawGetToken) {
        baseProvider.getToken = safeTokenHandler;
        baseProvider.getLimitedUseToken = safeTokenHandler;
      }

      appCheck = sdk.initializeAppCheck(app, { provider: baseProvider, isTokenAutoRefreshEnabled: false });
      return sdk;
    }).catch((error) => { appCheckPromise = undefined; throw error; });
  }
  const sdk = await appCheckPromise;
  try {
    const result = await sdk.getToken(appCheck, forceRefresh);
    return result?.token || null;
  } catch {
    return null;
  }
}

export { db, storage, auth, appCheck };
export default app;
