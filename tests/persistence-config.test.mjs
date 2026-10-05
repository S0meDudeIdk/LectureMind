import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

let instance = 0;
async function loadConfiguration(environment) {
  const state = { config: null, connections: [], appCheck: null };
  globalThis.__configurationTest = state;
  delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
  const result = await build({
    entryPoints: ['src/services/firebase.js'], bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.env': JSON.stringify(environment) },
    plugins: [{ name: 'configuration-only-sdk', setup(builder) {
      builder.onResolve({ filter: /^firebase\// }, ({ path }) => ({ path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
        const state=globalThis.__configurationTest;
        export function initializeApp(config){state.config=config;return{config};} export const getApps=()=>[]; export const getApp=()=>({}); export const setLogLevel=()=>{};
        export const initializeFirestore=()=>({}); export const getFirestore=()=>({}); export const getAuth=()=>({}); export const getStorage=()=>({});
        export const connectAuthEmulator=(_auth,url)=>state.connections.push(['auth',url]);
        export const connectFirestoreEmulator=(_db,host,port)=>state.connections.push(['firestore',host,port]);
        export const connectStorageEmulator=(_db,host,port)=>state.connections.push(['storage',host,port]);
        export class ReCaptchaV3Provider{constructor(siteKey){this.siteKey=siteKey;this.kind='v3';}}
        export class ReCaptchaEnterpriseProvider{constructor(siteKey){this.siteKey=siteKey;this.kind='enterprise';}}
        export const initializeAppCheck=(_app,options)=>{state.appCheck=options;return{};}; export const getToken=async()=>({token:'app-check-token'});
      ` }));
    } }],
  });
  const code = `${result.outputFiles[0].text}\n// configuration instance ${++instance}`;
  const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { state, api };
}

test('explicit project ID and custom auth domain/bucket are preserved', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'explicit-project', VITE_FIREBASE_AUTH_DOMAIN: 'auth.example.test', VITE_FIREBASE_STORAGE_BUCKET: 'gs://custom-bucket/' });
  assert.equal(api.isFirebaseConfigured, true); assert.equal(state.config.projectId, 'explicit-project');
  assert.equal(state.config.authDomain, 'auth.example.test'); assert.equal(state.config.storageBucket, 'custom-bucket');
});

test('custom auth domain does not invent a project ID', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_AUTH_DOMAIN: 'auth.example.test' });
  assert.equal(api.isFirebaseConfigured, false); assert.equal(state.config, null);
});

test('standard Firebase auth domain can supply a missing project ID', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_AUTH_DOMAIN: 'known-project.firebaseapp.com' });
  assert.equal(state.config.projectId, 'known-project'); assert.equal(api.isStorageConfigured, false);
});

test('emulators activate explicitly and do not initialize reCAPTCHA', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'demo-local', VITE_FIREBASE_STORAGE_BUCKET: 'demo-local', VITE_USE_FIREBASE_EMULATORS: 'true', VITE_RECAPTCHA_SITE_KEY: 'fixture-key' });
  assert.equal(state.connections.length, 2); assert.equal(state.appCheck, null); assert.equal(await api.getAppCheckToken(), null);
});

test('production App Check ignores debug token settings and returns its attestation', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'project', VITE_RECAPTCHA_SITE_KEY: 'fixture-site-key', VITE_APP_CHECK_DEBUG_TOKEN: 'unsafe-debug', DEV: false, PROD: true });
  assert.equal(state.appCheck, null, 'App Check is lazy until an API request needs it');
  assert.equal(await api.getAppCheckToken(), 'app-check-token');
  assert.equal(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN, undefined);
  assert.equal(state.appCheck.provider.siteKey, 'fixture-site-key');
});

test('development App Check debug token requires explicit opt-in', async () => {
  const { api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'project', VITE_RECAPTCHA_SITE_KEY: 'fixture-site-key', VITE_APP_CHECK_DEBUG_TOKEN: 'true', DEV: true });
  await api.getAppCheckToken();
  assert.equal(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN, true); delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
});

test('Enterprise site keys use the Enterprise provider', async () => {
  const { state, api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'project', VITE_RECAPTCHA_SITE_KEY: 'enterprise-key', VITE_APP_CHECK_PROVIDER: 'enterprise' });
  assert.equal(await api.getAppCheckToken(), 'app-check-token');
  assert.equal(state.appCheck.provider.kind, 'enterprise');
});

test('unknown App Check provider fails instead of silently using the wrong attestation', async () => {
  const { api } = await loadConfiguration({ VITE_FIREBASE_API_KEY: 'fixture', VITE_FIREBASE_PROJECT_ID: 'project', VITE_RECAPTCHA_SITE_KEY: 'key', VITE_APP_CHECK_PROVIDER: 'invalid' });
  await assert.rejects(api.getAppCheckToken(), /must be v3 or enterprise/);
});
