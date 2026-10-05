import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const cwd = path.join(root, '.tmp', 'production-smoke');
await mkdir(path.join(cwd, 'dist', 'public'), { recursive: true });
await writeFile(path.join(cwd, 'dist', 'public', 'index.html'), '<!doctype html><title>Production fixture</title>');
const port = 5187;
// A separate cwd has no application .env or credentials; no request reaches cloud APIs.
const env = { ...process.env, NODE_ENV: 'production', PORT: String(port),
  GOOGLE_CLOUD_PROJECT: 'demo-lecturemind', VITE_FIREBASE_PROJECT_ID: 'demo-lecturemind',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-lecturemind.firebasestorage.app',
  ALLOWED_ORIGINS: `http://127.0.0.1:${port}`, QUOTA_HASH_SECRET: 'production-smoke-only-32-characters-long' };
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GCP_SERVICE_ACCOUNT_KEY']) delete env[key];
const child = spawn(process.execPath, [path.join(root, 'dist/server/server.cjs'), '--production'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode != null) throw new Error(`Production process exited: ${output}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, output);
  assert.match(output, /port 5187/);
  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/quota`);
  assert.equal(unauthorized.status, 401);
  for (const resource of ['/server.cjs', '/server.cjs.map', '/server.ts', '/.env', '/service-account-key.json']) {
    const response = await fetch(`http://127.0.0.1:${port}${resource}`);
    assert(!/createProductionDependencies|PRIVATE KEY|process\.env|QUOTA_HASH_SECRET/.test(await response.text()), resource);
  }
  const publicFiles = await readdir(path.join(root, 'dist/public'), { recursive: true });
  assert(!publicFiles.some(name => /server\.(?:cjs|ts)|\.map$/.test(name)));
  const bundle = await readFile(path.join(root, 'dist/server/server.cjs'), 'utf8');
  assert(!/require\("vite"\)/.test(bundle), 'production must not eagerly require Vite');
  console.log('PASS production process honors PORT, denies anonymous API requests, isolates backend artifacts and starts without Vite initialization/cloud calls');
} catch (error) { console.error(output); throw error; }
finally {
  child.kill();
  await new Promise(resolve => { if (child.exitCode != null) resolve(); else child.once('exit', resolve); });
}
