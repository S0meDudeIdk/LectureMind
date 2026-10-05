import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise the real App, upload hook and native IndexedDB. Transport and views
// are replaced so these tests cannot contact Firebase, Storage, or paid AI.
const views = {
  Layout: `export default function Layout(p){return React.createElement('div',null,p.sidebar,React.createElement('button',{onClick:()=>p.setActiveTab('editor')},'Editor'),React.createElement('button',{onClick:()=>p.setActiveTab('mindmap')},'Mindmap'),p.children);}`,
  Sidebar: `
    import {subscribeToRecentMindmaps} from './src/services/db.js'; import {useAuth} from './src/services/auth.js';
    export default function Sidebar(p){const {user}=useAuth();const [rows,setRows]=React.useState([]);React.useEffect(()=>subscribeToRecentMindmaps(items=>{setRows(items);p.onRecordsChanged?.(items)},100,user),[user?.uid,user?.isAnonymous]);return React.createElement('aside',null,React.createElement('button',{onClick:p.onNew},'New Mindmap'),...rows.map(row=>React.createElement('button',{key:row.id,'data-lecture-id':row.id,onClick:()=>p.onSelectLecture(row)},row.title)));}
  `,
  DropZone: `export default function DropZone(p){return React.createElement('input',{'data-testid':'upload',type:'file',onChange:e=>p.onFileSelect(e.target.files[0])});}`,
  MindmapViewer: `export default function MindmapViewer(p){return React.createElement('div',{'data-testid':'map'},p.markdown);}`,
  MarkdownEditor: `export default function MarkdownEditor(p){return React.createElement('div',null,React.createElement('textarea',{'data-testid':'notes',value:p.notes,onChange:e=>p.onContentChange('',e.target.value)}),React.createElement('button',{onClick:()=>p.onSave(p.notes,p.lectureId)},'Save notes'));}`,
  MindmapAudioWidget: `export default function MindmapAudioWidget(p){return React.createElement('pre',{'data-testid':'playback'},JSON.stringify(p));}`,
  GoogleDocsExportModal: `export default function GoogleDocsExportModal(){return null;}`,
};
const result = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import App from './src/App.jsx';
    import * as records from './src/services/db.js'; import * as media from './src/services/mediaDb.js';
    window.__qa={rows:records,media,plan:{upload:'resolve',analysis:'resolve'},calls:[],held:[],delayed:new Set(),mediaWaiters:new Map(),cancelled:[],
      wait(type,signal,payload){this.calls.push({type,signal,payload});const mode=this.plan[type];if(mode==='error')return Promise.reject(new Error(type+' failure'));if(mode==='hold')return new Promise((resolve,reject)=>this.held.push({type,signal,payload,resolve,reject}));return Promise.resolve(payload);},
      release(type,error=false){const jobs=this.held.filter(job=>job.type===type);this.held=this.held.filter(job=>job.type!==type);for(const job of jobs)error?job.reject(new Error('late '+type+' failure')):job.resolve(job.payload);},
      async fixture(title,options={}){const user=window.__qaAuth.snapshot.user;const row=await records.saveMindmap(title,'# '+title,'1m',{notes:'Notes '+title,transcript:options.transcript||[],isVideo:!!options.video},user);if(options.media)await media.saveMediaToLocalDb(row.id,new Blob([options.media],{type:options.video?'video/mp4':'audio/wav'}),{isVideo:!!options.video,fileName:'same.wav'},user);return row;},
    };
    createRoot(document.getElementById('root')).render(React.createElement(App));
  `, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, format: 'iife', platform: 'browser', write: false, jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'safe-app-fixtures', setup(builder) {
    builder.onResolve({ filter: /services[\\/](auth|firebase|storage|gemini|mediaDb|audioExtractor)(?:\.js)?$/ }, (args) => {
      if (args.namespace === 'fixture' && args.path === './src/services/mediaDb.js') return null;
      const name = args.path.split(/[\\/]/).pop().replace(/\.js$/, '');
      return { path: name, namespace: 'fixture' };
    });
    builder.onResolve({ filter: /utils[\\/]exportUtils(?:\.js)?$/ }, () => ({ path: 'exportUtils', namespace: 'fixture' }));
    builder.onResolve({ filter: /components[\\/](Layout|Sidebar|DropZone|MindmapViewer|MarkdownEditor|MindmapAudioWidget|GoogleDocsExportModal)(?:\.jsx)?$/ }, (args) => ({ path: args.path.split(/[\\/]/).pop().replace(/\.jsx$/, ''), namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
      let contents;
      if (views[path]) contents = `import React from 'react';\n${views[path]}`;
      if (path === 'firebase') contents = 'export const isFirebaseConfigured=false;export const db=null;export const auth=null;';
      if (path === 'auth') contents = `
        import React from 'react';
        const state={snapshot:{user:{uid:'account-a',isAnonymous:false},loading:false},listeners:new Set(),setUser(user){this.snapshot={user,loading:false};for(const fn of this.listeners)fn();}};window.__qaAuth=state;
        export const useAuth=()=>React.useSyncExternalStore(fn=>{state.listeners.add(fn);return()=>state.listeners.delete(fn)},()=>state.snapshot);
      `;
      if (path === 'storage') contents = `
        export async function uploadMediaToCloud(file,id,onProgress,user,options){onProgress?.('Uploading...');return window.__qa.wait('upload',options.signal,{uploadId:'upload-'+id+'-'+options.kind,kind:options.kind,fileType:file.type,fileSize:file.size,owner:user.uid});}
        export async function getMediaPlaybackUrl(id,signal){return window.__qa.wait('playback',signal,'https://fixture.invalid/'+id);}
        export async function deleteMediaFromCloud(){}
      `;
      if (path === 'gemini') contents = `
        export const resolveMimeType=file=>file.type;export const cancelGeneration=id=>window.__qa.cancelled.push(id);
        export async function generateLectureContent(file,onProgress,options){onProgress?.('Analyzing...');return window.__qa.wait('analysis',options.signal,{markdown:'# Generated '+file.name,notes:'Generated notes',transcript:[]});}
      `;
      if (path === 'audioExtractor') contents = 'export async function extractAudioFromVideo(){return new File(["audio"],"derived.wav",{type:"audio/wav"});} export function terminateFfmpeg(){}';
      if (path === 'exportUtils') contents = 'export function exportMindmapAsImage(){} export function exportMarkdownFile(){}';
      if (path === 'mediaDb') contents = `
        import * as real from './src/services/mediaDb.js'; export const saveMediaToLocalDb=real.saveMediaToLocalDb;export const deleteMediaFromLocalDb=real.deleteMediaFromLocalDb;
        export async function getMediaFromLocalDb(id,key,user){const record=await real.getMediaFromLocalDb(id,key,user);if(window.__qa?.delayed.has(id))await new Promise(resolve=>window.__qa.mediaWaiters.set(id,resolve));return record;}
      `;
      return { contents, resolveDir: process.cwd(), loader: 'js' };
    });
  } }],
});
const script = result.outputFiles[0].text;
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><div id="root"></div><script src="/app.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.LECTUREMIND_BROWSER_CHANNEL || 'chrome', headless: true });
const checks = [];
async function scenario(name, work) {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin); await page.getByTestId('upload').waitFor({ timeout: 10000 });
    await work(page);
    assert.deepEqual(errors, [], 'no uncaught application errors'); checks.push(name); console.log(`PASS ${name}`);
  } catch (error) { console.error(name, errors, await page.locator('body').innerText()); throw error; }
  finally { await context.close(); }
}
const upload = page => page.getByTestId('upload').setInputFiles({ name: 'lecture.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVE') });
const playback = page => page.getByTestId('playback').textContent().then(JSON.parse);

try {
  await scenario('new generation uses one stable ID; edited notes persist', async page => {
    await upload(page); await page.getByTestId('map').filter({ hasText: '# Generated lecture.wav' }).waitFor();
    const state = await playback(page); assert.match(state.lectureId, /^[0-9a-f-]{36}$/);
    assert.equal(state.isVideo, false); assert.ok(state.audioUrl?.startsWith('blob:'));
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    await page.getByTestId('notes').fill('Edited newly generated notes'); await page.getByRole('button', { name: 'Save notes', exact: true }).click();
    await page.waitForFunction(async id => (await window.__qa.rows.getMindmapById(id, window.__qaAuth.snapshot.user))?.notes === 'Edited newly generated notes', state.lectureId);
    const rows = await page.evaluate(() => window.__qa.rows.getRecentMindmaps(100, window.__qaAuth.snapshot.user));
    assert.equal(rows.length, 1); assert.equal(rows[0].id, state.lectureId);
  });

  await scenario('lecture with no media/transcript does not inherit previous upload', async page => {
    await upload(page); await page.getByTestId('map').filter({ hasText: '# Generated lecture.wav' }).waitFor();
    const row = await page.evaluate(() => window.__qa.fixture('No recording'));
    await page.locator(`[data-lecture-id="${row.id}"]`).click();
    await page.waitForFunction(id => JSON.parse(document.querySelector('[data-testid=playback]').textContent).lectureId === id && JSON.parse(document.querySelector('[data-testid=playback]').textContent).audioUrl === null, row.id);
    const state = await playback(page); assert.deepEqual(state.transcript, []); assert.equal(state.isVideo, false);
  });

  await scenario('large video keeps original playback while derived audio is analyzed', async page => {
    await page.evaluate(() => {
      const file = new File([new Uint8Array(51 * 1048576)], 'large-video.mp4', { type: 'video/mp4' });
      const transfer = new DataTransfer(); transfer.items.add(file);
      const input = document.querySelector('[data-testid=upload]'); input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByTestId('map').filter({ hasText: '# Generated derived.wav' }).waitFor();
    const state = await playback(page); assert.equal(state.isVideo, true); assert.ok(state.audioUrl?.startsWith('blob:'));
    const media = await page.evaluate(async id => {
      const record = await window.__qa.media.getMediaFromLocalDb(id, '', window.__qaAuth.snapshot.user);
      return { mimeType: record.mimeType, size: record.blob.size, isVideo: record.isVideo };
    }, state.lectureId);
    assert.deepEqual(media, { mimeType: 'video/mp4', size: 51 * 1048576, isVideo: true });
    const uploads = await page.evaluate(() => window.__qa.calls.filter(item => item.type === 'upload').map(item => item.payload));
    assert.equal(uploads.length, 2); assert.equal(uploads[0].kind, 'source'); assert.equal(uploads[0].fileType, 'video/mp4');
    assert.equal(uploads[1].kind, 'processing'); assert.equal(uploads[1].fileType, 'audio/wav');
    const row = await page.evaluate(id => window.__qa.rows.getMindmapById(id, window.__qaAuth.snapshot.user), state.lectureId);
    assert.equal(row.playbackUploadId, uploads[0].uploadId);
  });

  await scenario('out-of-order media lookup never replaces the latest selection', async page => {
    const [first, second] = await page.evaluate(async () => [await window.__qa.fixture('First video', { media: 'one', video: true }), await window.__qa.fixture('Second audio', { media: 'two' })]);
    await page.evaluate(id => window.__qa.delayed.add(id), first.id);
    await page.locator(`[data-lecture-id="${first.id}"]`).click();
    await page.waitForFunction(id => window.__qa.mediaWaiters.has(id), first.id);
    await page.locator(`[data-lecture-id="${second.id}"]`).click();
    await page.waitForFunction(id => { const state=JSON.parse(document.querySelector('[data-testid=playback]').textContent);return state.lectureId===id&&state.audioUrl?.startsWith('blob:'); }, second.id);
    const latest = await playback(page);
    await page.evaluate(id => { window.__qa.delayed.delete(id); window.__qa.mediaWaiters.get(id)(); }, first.id);
    await page.waitForTimeout(100);
    assert.deepEqual(await playback(page), latest); assert.equal(latest.isVideo, false);
  });

  await scenario('reset cancels analysis and ignores its late successful completion', async page => {
    await page.evaluate(() => { window.__qa.plan.analysis = 'hold'; });
    await upload(page); await page.waitForFunction(() => window.__qa.held.some(item => item.type === 'analysis'));
    await page.getByRole('button', { name: 'New Mindmap', exact: true }).click(); await page.getByTestId('upload').waitFor();
    assert.equal(await page.evaluate(() => window.__qa.held.find(item => item.type === 'analysis').signal.aborted), true);
    await page.evaluate(() => window.__qa.release('analysis')); await page.waitForTimeout(100);
    assert.equal(await page.getByTestId('map').count(), 0);
    const rows = await page.evaluate(() => window.__qa.rows.getRecentMindmaps(100, window.__qaAuth.snapshot.user));
    assert.equal(rows[0].generationStatus, 'cancelled'); assert.equal(rows[0].markdown, '');
  });

  await scenario('account switch cancels upload and leaves each account cache isolated', async page => {
    await page.evaluate(() => { window.__qa.plan.upload = 'hold'; });
    await upload(page); await page.waitForFunction(() => window.__qa.held.some(item => item.type === 'upload'));
    await page.evaluate(() => window.__qaAuth.setUser({ uid: 'account-b', isAnonymous: false })); await page.getByTestId('upload').waitFor();
    assert.equal(await page.evaluate(() => window.__qa.held.find(item => item.type === 'upload').signal.aborted), true);
    await page.evaluate(() => window.__qa.release('upload')); await page.waitForTimeout(100);
    assert.equal(await page.getByTestId('map').count(), 0);
    assert.equal((await page.evaluate(() => window.__qa.rows.getRecentMindmaps(100, window.__qaAuth.snapshot.user))).length, 0);
    const former = await page.evaluate(() => window.__qa.rows.getRecentMindmaps(100, { uid: 'account-a', isAnonymous: false }));
    assert.equal(former.length, 1); assert.equal(former[0].generationStatus, 'cancelled');
  });

  await scenario('late ordinary transport error after reset cannot affect the new screen', async page => {
    await page.evaluate(() => { window.__qa.plan.upload = 'hold'; });
    await upload(page); await page.waitForFunction(() => window.__qa.held.some(item => item.type === 'upload'));
    await page.getByRole('button', { name: 'New Mindmap', exact: true }).click(); await page.getByTestId('upload').waitFor();
    await page.evaluate(() => window.__qa.release('upload', true)); await page.waitForTimeout(100);
    assert.equal(await page.getByRole('alert').count(), 0);
  });
  console.log(`App lifecycle checks passed: ${checks.length}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
