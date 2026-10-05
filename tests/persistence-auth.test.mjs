import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const local = new Map([['lecturemind_drive_access_token', 'old-persistent-token']]);
const session = new Map();
globalThis.localStorage = { getItem: (key) => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) };
globalThis.sessionStorage = { getItem: (key) => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) };
const state = {
  auth: { currentUser: null, async authStateReady() {} }, observers: [], anonymousCalls: 0,
  popupScopes: [], linkFailure: null, popupUid: 'google-user',
  user(uid, anonymous) { return { uid, isAnonymous: anonymous, email: anonymous ? null : 'person@example.test', getIdToken: async () => `id-token:${uid}` }; },
  changed(user) { this.auth.currentUser = user; for (const next of this.observers) next(user); },
};
globalThis.__authTest = state;
const bundled = await build({
  entryPoints: ['src/services/auth.js'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'local-auth', setup(builder) {
    builder.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth-sdk', namespace: 'mock' }));
    builder.onResolve({ filter: /[\/]firebase$/ }, () => ({ path: 'firebase', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => path === 'firebase'
      ? { contents: 'export const auth=globalThis.__authTest.auth; export const isFirebaseConfigured=true; export const getAppCheckToken=async()=>null;' }
      : { contents: `
        const s=globalThis.__authTest;
        export class GoogleAuthProvider {constructor(){this.scopes=[];} addScope(scope){this.scopes.push(scope);} setCustomParameters(){} static credentialFromResult(result){return result.credential||null;} static credentialFromError(error){return error.credential||null;}}
        export function onAuthStateChanged(_auth,next){s.observers.push(next);queueMicrotask(()=>next(s.auth.currentUser));return()=>{};}
        export async function signInAnonymously(){s.anonymousCalls++;await new Promise(resolve=>setTimeout(resolve,5));const user=s.user('anonymous-user',true);s.changed(user);return{user};}
        export async function linkWithPopup(current,provider){s.popupScopes.push(provider.scopes);if(s.linkFailure)throw s.linkFailure;const user=s.user(current.uid,false);s.changed(user);return{user};}
        export async function signInWithPopup(_auth,provider){s.popupScopes.push(provider.scopes);const user=s.user(s.popupUid,false);s.changed(user);return{user,credential:{accessToken:'drive-access-token'}};}
        export async function signInWithCredential(){const user=s.user(s.popupUid,false);s.changed(user);return{user};}
        export async function signOut(){s.changed(null);}
      ` });
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('old permanent Drive token is removed during initialization', () => {
  assert.equal(local.get('lecturemind_drive_access_token'), undefined);
  assert.equal(api.getStoredDriveToken(), null);
});

test('parallel ID token requests share one observer and anonymous identity', async () => {
  const tokens = await Promise.all([api.getIdToken(), api.getIdToken(), api.getIdToken()]);
  assert.deepEqual(tokens, ['id-token:anonymous-user', 'id-token:anonymous-user', 'id-token:anonymous-user']);
  assert.equal(state.observers.length, 1); assert.equal(state.anonymousCalls, 1);
});

test('Google upgrade links an anonymous UID and does not request Drive access', async () => {
  const result = await api.signInWithGoogle();
  assert.equal(result.user.uid, 'anonymous-user'); assert.equal(result.user.isAnonymous, false);
  assert.deepEqual(state.popupScopes.at(-1), []); assert.equal(result.token, null);
});

test('Drive authorization is explicit, account-bound and stored only in the session', async () => {
  state.popupUid = 'anonymous-user';
  const result = await api.authorizeDrive();
  assert.equal(result.token, 'drive-access-token');
  assert.deepEqual(state.popupScopes.at(-1), ['https://www.googleapis.com/auth/drive.file']);
  assert.equal(api.getStoredDriveToken(), result.token);
  assert.equal(local.size, 0); assert.equal(session.size, 1);
  state.auth.currentUser = state.user('other-user', false);
  assert.equal(api.getStoredDriveToken(), null);
  api.clearDriveToken(); assert.equal(session.size, 0);
});

test('expired Drive token is not reused', () => {
  const user = state.user('expiry-user', false); state.auth.currentUser = user;
  session.set('lecturemind_drive_access_token', JSON.stringify({ token: 'expired', uid: user.uid, expiresAt: Date.now() - 1 }));
  assert.equal(api.getStoredDriveToken(), null); api.clearDriveToken();
});

test('existing Google account fallback changes identity instead of claiming guest records', async () => {
  state.auth.currentUser = state.user('second-anonymous', true);
  state.linkFailure = Object.assign(new Error('Already linked'), { code: 'auth/credential-already-in-use', credential: {} });
  state.popupUid = 'existing-google';
  const result = await api.signInWithGoogle();
  assert.equal(result.user.uid, 'existing-google'); assert.notEqual(result.user.uid, 'second-anonymous');
  state.linkFailure = null;
});

test('Drive account mismatch clears the bearer token and reports the switch', async () => {
  state.auth.currentUser = state.user('expected', false); state.popupUid = 'different';
  await assert.rejects(api.authorizeDrive(), /account changed/i);
  assert.equal(api.getStoredDriveToken(), null); assert.equal(session.size, 0);
});

test('sign out removes Drive authorization and starts a new anonymous session', async () => {
  state.auth.currentUser = state.user('google-user', false); api.setStoredDriveToken('token');
  await api.signOutUser();
  assert.equal(session.size, 0);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(state.auth.currentUser.isAnonymous, true);
});
