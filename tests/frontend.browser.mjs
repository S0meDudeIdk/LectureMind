import assert from 'node:assert/strict';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { createServer, transformWithEsbuild } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const fixture = `
import React from 'react';
import katex from 'katex';
import '/src/index.css';
window.katex=katex;
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '/src/context/ThemeContext.jsx';
import MarkdownEditor from '/src/components/MarkdownEditor.jsx';
import Player from '/src/components/MindmapAudioWidget.jsx';
import DropZone from '/src/components/DropZone.jsx';
import Layout from '/src/components/Layout.jsx';
import DocsModal from '/src/components/GoogleDocsExportModal.jsx';
import { uploadHtmlToGoogleDrive, getKatexCssForExport } from '/src/utils/exportUtils.js';
import { prepareDocsMathImages } from '/src/utils/docsMathImages.js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { foldedLinesField, toggleFoldEffect, obsidianLivePreviewPlugin } from '/src/services/obsidianLivePreview.js';
import { transformToSimpleMindMap } from '/src/utils/markdown-to-simple-mind-map.js';
import { markdownToGoogleDocsHtml } from '/src/utils/googleDocsConverter.js';
window.qa = { getKatexCssForExport, prepareDocsMathImages, uploadHtmlToGoogleDrive, EditorState, EditorView, foldedLinesField, toggleFoldEffect, obsidianLivePreviewPlugin, transformToSimpleMindMap, markdownToGoogleDocsHtml };
window.saveCalls = [];
const root = createRoot(document.getElementById('root'));
window.renderEditor = (id, text = '# Notes') => root.render(<ThemeProvider><MarkdownEditor lectureId={id} notes={text} onSave={(content, target) => { window.saveCalls.push({content,target}); return new Promise((resolve,reject) => {window.finishSave=resolve; window.failSave=reject;}); }} /></ThemeProvider>);
window.renderPlayer = (id, url) => root.render(<Player lectureId={id} audioUrl={url} transcript={[{startTime:'00:00',textBlock:'First transcript'}]} />);
window.renderUpload = () => root.render(<DropZone onFileSelect={file => {window.selectedFile=file.name;}} />);
window.renderLayout = () => root.render(<ThemeProvider><Layout sidebar={<button id="sidebar-action">Sidebar action</button>} hasContent activeTab="mindmap"><div>Canvas</div></Layout></ThemeProvider>);
window.renderModal = () => root.render(<DocsModal isOpen content="Plain notes" onClose={()=>{window.modalClosed=true;root.render(<button>After dialog</button>);}} />);
window.ready=true;
`;
const server = await createServer({ configFile: false, logLevel: 'error', plugins: [tailwindcss(), {
  name: 'frontend-fixture', enforce: 'pre',
  resolveId(id) {
    if (id === '/__frontend_fixture.jsx') return '\0frontend-fixture.jsx';
    if (id === './auth' || /services\/auth(?:\.js)?$/.test(id)) return '\0frontend-auth.js';
  },
  async load(id) {
    if (id === '\0frontend-auth.js') return `export const getStoredDriveToken=()=>null; export const clearDriveToken=()=>{window.tokenCleared=true;}; export const getIdToken=async()=>"fake-id-token"; export const getAppCheckToken=async()=>null; export const useAuth=()=>({user:{uid:'qa',isAnonymous:true},loading:false,driveToken:null,authorizeDrive:async()=>({token:'ya29.fake-test-token'}),signInWithGoogle:async()=>{},signOut:async()=>{}});`;
    if (id === '\0frontend-fixture.jsx') return (await transformWithEsbuild(fixture, 'fixture.jsx', {loader:'jsx',jsx:'automatic'})).code;
  },
  configureServer(server) { server.middlewares.use((req,res,next) => {
    if (req.url !== '/frontend-test') return next();
    res.setHeader('Content-Type','text/html');
    res.end('<div id="root"></div><script type="module" src="/__frontend_fixture.jsx"></script>');
  }); },
}], server: {host:'127.0.0.1',port:5183,strictPort:true,watch:{ignored:['**/.tmp/**']}} });
await server.listen();
const browser = await chromium.launch({channel: process.env.EXPORT_TEST_BROWSER || 'chrome',headless:true});
const page = await browser.newPage();
page.on('pageerror',error=>console.error(error.message));
const stagedEquations=[];
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/export-asset') {
    const bytes=route.request().postDataBuffer();
    const metadata=await sharp(bytes).metadata();
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let dark=0;for(let i=0;i<data.length;i+=info.channels) if(data[i]<100&&data[i+1]<100&&data[i+2]<100&&data[i+3]>128) dark++;
    stagedEquations.push({signature:bytes.subarray(0,8).toString('hex'),width:metadata.width,height:metadata.height,dark,token:route.request().headers().authorization});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({url:'https://example.test/equation-'+stagedEquations.length+'.png',assetId:'mock-'+stagedEquations.length})});
  }
  if (url.hostname === 'www.googleapis.com') return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{message:'Expired test token'}})});
  return url.origin === 'http://127.0.0.1:5183' || url.protocol === 'data:' ? route.continue() : route.abort();
});
try {
  await page.goto('http://127.0.0.1:5183/frontend-test');
  await page.waitForFunction(() => window.ready);
  const safety = await page.evaluate(async () => {
    const {EditorState,EditorView,foldedLinesField,obsidianLivePreviewPlugin} = qa;
    window.__xss=false;
    const payload='<img src="data:image/png,broken" onerror="window.__xss=true">';
    const docs=['# Above\n\n| Header |\n|---|\n| '+payload+' |', '# Above\n\n[[Target|'+payload+']]', '---\ntags: ['+payload+']\n---\n\nAfter', '# Above\n\n> [!info] '+payload];
    for (const doc of docs) {
      const host=document.createElement('div'); document.body.append(host);
      const state=EditorState.create({doc,selection:{anchor:doc.length},extensions:[foldedLinesField,obsidianLivePreviewPlugin]});
      const view=new EditorView({state,parent:host});
      await new Promise(resolve=>setTimeout(resolve,60)); view.destroy();host.remove();
    }
    return window.__xss;
  });
  assert.equal(safety,false,'preview must reject executable HTML');
  const structure=await page.evaluate(() => {
    const tree=qa.transformToSimpleMindMap('# Test\n- If $x$ equals $x$');
    const div=document.createElement('div');
    div.innerHTML=tree.children[0].data.text;
    const count=div.querySelectorAll('.katex').length;
    let state=qa.EditorState.create({doc:'- Parent\n    - Child',extensions:[qa.foldedLinesField]});
    state=state.update({effects:qa.toggleFoldEffect.of(1)}).state;
    state=state.update({changes:{from:0,insert:'intro\n'}}).state;
    const doc='# Above\n\n```js\nconst s="$$x$$";\n```\nAfter';
    const code=qa.EditorState.create({doc,extensions:[qa.foldedLinesField,qa.obsidianLivePreviewPlugin]});
    const widgets=[];code.field(qa.obsidianLivePreviewPlugin).between(0,doc.length,(_f,_t,d)=>widgets.push(d.spec.widget?.constructor.name));
    const html=qa.markdownToGoogleDocsHtml('Value $x$ and $$x^2$$\n\n```js\n"$x$"\n```','<unsafe>');
    return {count,folded:Array.from(state.field(qa.foldedLinesField)),widgets,html};
  });
  assert.equal(structure.count,2,'independent repeated equations survive');
  assert.deepEqual(structure.folded,[2]);
  assert(!structure.widgets.includes('KatexBlockWidget'),'code examples stay literal');
  const inlineLiteral=await page.evaluate(()=>{const doc='# Before\nLiteral `$$x$$` and `$y$`\nAfter';const state=qa.EditorState.create({doc,selection:{anchor:0},extensions:[qa.foldedLinesField,qa.obsidianLivePreviewPlugin]});const kinds=[];state.field(qa.obsidianLivePreviewPlugin).between(0,doc.length,(_f,_t,d)=>kinds.push(d.spec.widget?.constructor.name));return kinds;});
  assert(!inlineLiteral.includes('KatexBlockWidget')&&!inlineLiteral.includes('KatexInlineWidget'),'inline code stays literal');
  assert(!structure.html.includes('class="katex'),'clipboard export uses readable standalone math');
  const equationImage=await page.evaluate(()=>qa.markdownToGoogleDocsHtml('Math $x$','Image',{mathImages:{x:{url:'https://example.test/signed.png?x=1&sig=test',width:48,height:32}}}));
  assert(equationImage.includes('<img'));
  assert(equationImage.includes('signed.png?x=1&amp;sig=test'));
  assert(equationImage.includes('height="32"'));
  assert(structure.html.includes('&lt;unsafe&gt;'));
  await page.evaluate(()=>renderEditor('a'));
  const editor=page.locator('.cm-content');await editor.waitFor();await editor.click();
  await page.keyboard.press('Control+End');await page.keyboard.type(' changed');
  await page.waitForFunction(()=>window.saveCalls.length===1);
  assert(await page.getByText('Saving...', {exact:true}).isVisible());
  await page.evaluate(()=>finishSave({syncStatus:'pending'}));
  await page.getByText('Saved on this device · cloud pending',{exact:true}).waitFor();
  await page.keyboard.type(' again');
  await page.evaluate(()=>renderEditor('b','# Other'));
  await page.waitForFunction(()=>window.saveCalls.length===2);
  assert.equal(await page.evaluate(()=>saveCalls[1].target),'a','switch flushes previous lecture identity');
  await page.evaluate(()=>finishSave({syncStatus:'pending'}));
  assert.equal(await editor.innerText(),'# Other');
  await editor.click();await page.keyboard.press('Control+End');await page.keyboard.type(' failure');
  await page.waitForFunction(()=>window.saveCalls.length===3);
  await page.evaluate(()=>failSave(new Error('Storage full')));
  await page.getByRole('alert').filter({hasText:'Storage full'}).waitFor();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard denied');}}}));
  await page.getByTitle('Copy Markdown Source').click();
  await page.getByRole('alert').filter({hasText:'Clipboard denied'}).waitFor();
  await page.evaluate(()=>renderPlayer('no-media',null));
  await page.getByText('Recording unavailable',{exact:true}).waitFor();
  assert(await page.getByTitle('Play',{exact:true}).isDisabled());
  await page.evaluate(()=>renderPlayer('media','data:audio/wav,broken'));
  await page.locator('audio').waitFor({state:'attached'});
  await page.evaluate(()=>{ window.originalAudio=document.querySelector('audio'); originalAudio.play=()=>Promise.reject(new Error('Playback denied')); });
  await page.getByTitle('Play',{exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Playback denied'}).waitFor();
  assert(await page.getByTitle('Play',{exact:true}).isVisible());
  await page.getByTitle('Minimize media player & transcript').click();
  assert(await page.evaluate(()=>originalAudio===document.querySelector('audio')));
  await page.getByTitle('Open Media Player & Transcript').click();
  assert(await page.evaluate(()=>originalAudio===document.querySelector('audio')));
  await page.evaluate(()=>renderUpload());
  const upload=page.getByLabel('Upload lecture recording');await upload.focus();
  assert(await upload.evaluate(el=>el===document.activeElement));
  await upload.setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:Buffer.from('test')});
  assert.equal(await page.evaluate(()=>selectedFile),'test.wav');
  await page.evaluate(()=>renderLayout());
  await page.getByTitle('Collapse sidebar').click();
  assert(await page.locator('#lecture-sidebar').evaluate(el=>el.inert));
  await page.setViewportSize({width:320,height:640});
  assert(await page.locator('header').evaluate(el=>el.scrollWidth<=window.innerWidth),'header fits small screens');
  const rendered=await page.evaluate(async()=>{const source=String.raw`Inline $\frac{a}{b}$ and $\sqrt{x}$, literal \`$notmath$\`.`; const images=await qa.prepareDocsMathImages(source);return {images,html:qa.markdownToGoogleDocsHtml(source,'Equations',{mathImages:images})};});
  assert.equal(stagedEquations.length,2,'literal code does not upload equations');
  const fonts=await page.evaluate(async()=>{const css=await qa.getKatexCssForExport();return {faces:(css.match(/@font-face/g)||[]).length,external:/url\((?![\"']?data:)/.test(css)};});
  assert(fonts.faces>=20&&!fonts.external,'equation SVG embeds all KaTeX font assets');
  for(const equation of stagedEquations){assert.equal(equation.signature,'89504e470d0a1a0a');assert(equation.width>20&&equation.height>20);assert(equation.dark>30,'PNG has visible rendered equation ink');assert.equal(equation.token,'Bearer fake-id-token');}
  assert.equal(Object.keys(rendered.images).length,2);
  assert.equal((rendered.html.match(/<img/g)||[]).length,2);
  assert(rendered.html.includes('$notmath$'));
  const expired=await page.evaluate(async()=>{try{await qa.uploadHtmlToGoogleDrive('<p>Test</p>','Test','ya29.fake');}catch(error){return {code:error.code,cleared:window.tokenCleared};}});
  assert.deepEqual(expired,{code:'drive/authorization-expired',cleared:true});
  await page.evaluate(()=>renderModal());
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Close Google Docs export');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Cancel');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.modalClosed);
  console.log('Frontend regression checks passed: XSS, math, folds, saves, media, keyboard upload, sidebar.');
} finally { await browser.close(); await server.close(); }
