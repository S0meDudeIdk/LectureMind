import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/services/audioExtractor.js'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{
  name: 'mock-ffmpeg', setup(builder) {
    builder.onResolve({ filter: /^@ffmpeg\// }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path.endsWith('/ffmpeg') ? `
      export class FFmpeg {
        constructor(){globalThis.__workers.push(this);}
        async load(){this.loaded=true;}
        terminate(){this.terminated=true;}
      }` : 'export async function fetchFile(file){return new Uint8Array(await file.arrayBuffer());}' }));
  },
}] });
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64');

test('cancel during processor asset loading aborts fetch and does not resurrect worker', async () => {
  globalThis.__workers = [];
  const previous = globalThis.fetch;
  let started, signal;
  const ready = new Promise(resolve => started = resolve);
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal; signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }); started();
  });
  const module = await import(moduleUrl + '#cancel');
  try {
    const pending = module.initFfmpeg(); await ready; module.terminateFfmpeg();
    await assert.rejects(pending, { name: 'AbortError' });
    assert(signal.aborted); assert(__workers[0].terminated); assert(!__workers[0].loaded);
  } finally { globalThis.fetch = previous; module.terminateFfmpeg(); }
});

test('failed initialization retries cleanly and successful shared worker can be terminated', async () => {
  globalThis.__workers = [];
  const previous = globalThis.fetch;
  const module = await import(moduleUrl + '#retry');
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(module.initFfmpeg(), /503/);
    assert(__workers[0].terminated);
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
    const worker = await module.initFfmpeg();
    assert(worker.loaded); assert.equal(await module.initFfmpeg(), worker);
    module.terminateFfmpeg(); assert(worker.terminated);
    assert.equal(__workers.length, 2);
  } finally { globalThis.fetch = previous; module.terminateFfmpeg(); }
});
