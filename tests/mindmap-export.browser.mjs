/**
 * Browser regression check. Requires Playwright (Chrome) and Sharp on Node's
 * module path; Codex's bundled runtime supplies both without app dependencies.
 * Run: node tests/mindmap-export.browser.mjs
 * Set EXPORT_TEST_PRODUCTION=1 to build and test production assets as well.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build, createServer, preview } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const { PDFDocument, PDFName } = require('pdf-lib');
const production = process.env.EXPORT_TEST_PRODUCTION === '1';
const output = `.tmp/export-qa/${production ? 'production' : 'development'}`;
await mkdir(output, { recursive: true });
if (production) await build({ logLevel: 'error', build: { outDir: '.tmp/export-test-build' } });
const server = production
  ? await preview({ logLevel: 'error', build: { outDir: '.tmp/export-test-build' }, preview: { host: '127.0.0.1', port: 5180, strictPort: true } })
  : await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 5179, strictPort: true, watch: { ignored: ['**/.tmp/**'] } } });
if (!production) await server.listen();
const baseURL = `http://127.0.0.1:${production ? 5180 : 5179}`;
const browser = await chromium.launch({ channel: process.env.EXPORT_TEST_BROWSER || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
// No AI calls, cloud writes, sign-in, or dependency on external font services.
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.origin === new URL(baseURL).origin || url.protocol === 'data:' ? route.continue() : route.abort();
});
const markdown = String.raw`# Export Regression
## Calculus
- $\frac{1}{2\pi\sigma^2} \int_0^{\infty} e^{-x^2} dx$
- $\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}$
## Algebra
- $\sqrt{x^2+y^2} \approx \alpha + \beta$
- $\begin{pmatrix}a & b\\c & d\end{pmatrix}$
## Colored formula
- $\textcolor{red}{x} + y$
`;
await context.addInitScript(({ markdown }) => {
  localStorage.setItem('lm-theme', 'dark');
  localStorage.setItem('lecturemind_db_initialized_v6', 'true');
  localStorage.setItem('lecturemind_auth_nudge_dismissed', 'true');
  localStorage.setItem('lecturemind_saved_mindmaps', JSON.stringify([{ id: 'sample-export', title: 'Export Regression', markdown, notes: markdown, transcript: [] }]));
}, { markdown });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => { pageErrors.push(error.message); console.error('Browser error:', error.message); });
const exportButton = () => page.getByRole('button', { name: 'Export', exact: true });
const formatButton = format => page.getByRole('button', { name: `Download as ${format.toUpperCase()} (.${format})`, exact: true });
const ready = () => page.waitForFunction(() => {
  const mm = window.__lecturemind_markmap;
  return mm && !mm.renderer.isRendering && document.querySelectorAll('.smm-richtext-node-wrap .katex').length >= 5;
});
async function openOptions(theme, transparent) {
  if (!await formatButton('png').isVisible()) await exportButton().click();
  await page.getByRole('button', { name: theme, exact: true }).click();
  await page.getByRole('checkbox', { name: 'Transparent background' }).setChecked(transparent);
  assert.equal(await page.getByRole('button', { name: theme, exact: true }).getAttribute('aria-pressed'), 'true');
}
async function snapshot() {
  return page.evaluate(() => {
    const mm = window.__lecturemind_markmap;
    return {
      theme: mm.getTheme(), data: mm.getData(), view: mm.view.getTransformData(),
      fills: [...mm.svg.node.querySelectorAll('.smm-node-shape')].map(e => e.getAttribute('fill')),
      colors: [...mm.svg.node.querySelectorAll('.smm-richtext-node-wrap')].map(e => e.style.color),
      light: document.documentElement.classList.contains('light'),
    };
  });
}
async function verifyRaster(bytes, dark, transparent, format) {
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, format);
  assert(metadata.width > 300 && metadata.height > 100);
  const pixel = await sharp(bytes).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  if (transparent) assert.equal(pixel[3], 0, 'transparent PNG corner must have zero alpha');
  else {
    assert.equal(pixel[3], 255);
    const expected = dark ? [15, 15, 26] : [255, 255, 255];
    expected.forEach((value, i) => assert(Math.abs(pixel[i] - value) <= (format === 'jpeg' ? 3 : 0), `wrong ${format} background ${pixel}`));
  }
}
async function downloadAndCheck(live, theme, format, transparent, suffix = '') {
  console.log(`Checking ${live}/${theme}/${format}/${transparent ? 'transparent' : 'solid'}${suffix}`);
  await openOptions(theme, transparent);
  const before = await snapshot();
  const downloaded = page.waitForEvent('download', { timeout: 45000 });
  await formatButton(format).click();
  const download = await Promise.race([
    downloaded,
    page.getByRole('alert').waitFor({ state: 'visible', timeout: 45000 }).then(async () => {
      throw new Error(await page.getByRole('alert').innerText());
    }),
  ]);
  assert.equal(download.suggestedFilename(), `export_regression.${format}`);
  const path = `${output}/${live}-${theme}-${transparent ? 'clear' : 'solid'}${suffix}.${format}`;
  await download.saveAs(path);
  await exportButton().waitFor();
  const bytes = await readFile(path);
  const dark = (theme === 'auto' ? live : theme) === 'dark';
  if (format === 'pdf') {
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert(pdf.getPage(0).getWidth() > 300);
    if (transparent) {
      assert(pdf.context.enumerateIndirectObjects().some(([, object]) => object.dict?.has(PDFName.of('SMask'))), 'transparent PDF must embed alpha mask');
    }
    const png = await page.evaluate(() => window.__lastPdfPng);
    await verifyRaster(Buffer.from(png.split(',')[1], 'base64'), dark, transparent, 'png');
  } else await verifyRaster(bytes, dark, transparent && format === 'png', format === 'jpg' ? 'jpeg' : 'png');
  assert.deepEqual(await snapshot(), before, 'export changed live theme, data, fills, or view');
  const svgCheck = await page.evaluate(() => {
    const doc = new DOMParser().parseFromString(window.__exportSvg, 'image/svg+xml');
    return {
      errors: doc.querySelectorAll('parsererror').length,
      fonts: (window.__exportSvg.match(/data:[^;]+;base64/g) || []).length,
      externalFonts: /url\(["']?(?!data:)[^)]*\.woff/.test(window.__exportSvg),
      fontStyles: [...doc.querySelectorAll('style')].filter(el => el.textContent.includes('@font-face')).length,
      colorPreserved: [...doc.querySelectorAll('.katex [style]')].some(el => el.style.color === 'red'),
      hookRestored: window.__lecturemind_markmap.opt.handleBeingExportSvg === window.__priorExportHook,
      priorHookApplied: doc.documentElement.getAttribute('data-prior-hook') === 'preserved',
      renderWaiters: window.__renderWaiters.size,
    };
  });
  assert.equal(svgCheck.errors, 0);
  assert(svgCheck.fonts >= 20);
  assert.equal(svgCheck.externalFonts, false);
  assert.equal(svgCheck.fontStyles, 1);
  assert.equal(svgCheck.colorPreserved, true);
  assert.equal(svgCheck.hookRestored, true);
  assert.equal(svgCheck.priorHookApplied, true);
  assert.equal(svgCheck.renderWaiters, 0);
  return path;
}
try {
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Recover previous local lectures' }).click();
  await page.getByRole('button', { name: 'Import Export Regression', exact: true }).click();
  await ready();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700); // let the existing viewer's font fallback render settle
  await page.evaluate(() => {
    const mm = window.__lecturemind_markmap;
    const exportFile = mm.doExport.export.bind(mm.doExport);
    mm.doExport.export = async (...args) => {
      const result = await exportFile(...args);
      window.__exportResultPrefix = String(result).slice(0, 80);
      return result;
    };
    window.__priorExportHook = svg => { svg.node.setAttribute('data-prior-hook', 'preserved'); return svg; };
    mm.opt.handleBeingExportSvg = window.__priorExportHook;
    const getSvgData = mm.doExport.getSvgData.bind(mm.doExport);
    mm.doExport.getSvgData = async (...args) => {
      const result = await getSvgData(...args);
      window.__exportSvg = result.str;
      return result;
    };
    const png = mm.doExport.png.bind(mm.doExport);
    mm.doExport.png = async (...args) => (window.__lastPdfPng = await png(...args));
    window.__renderWaiters = new Set();
    const on = mm.on.bind(mm), off = mm.off.bind(mm);
    mm.on = (event, handler) => { if (event === 'node_tree_render_end') window.__renderWaiters.add(handler); return on(event, handler); };
    mm.off = (event, handler) => { if (event === 'node_tree_render_end') window.__renderWaiters.delete(handler); return off(event, handler); };
  });
  // Failure before capture: a font fetch must surface an error and be retryable.
  await page.route('**/*KaTeX*.woff2*', route => route.abort());
  await openOptions('light', false);
  await formatButton('png').click();
  await page.getByRole('alert').filter({ hasText: 'Could not load math fonts' }).waitFor();
  assert.equal(await formatButton('png').isEnabled(), true);
  await page.unroute('**/*KaTeX*.woff2*');
  console.log('PASS font failure surfaced; controls unlocked for retry');
  let exports = 0;
  for (const live of ['dark', 'light']) {
    if (live === 'light') {
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await page.waitForFunction(() => window.__lecturemind_markmap.getTheme() === 'lecturemind-light' && !window.__lecturemind_markmap.renderer.isRendering);
    }
    for (const theme of ['auto', 'light', 'dark']) {
      for (const transparent of [false, true]) {
        for (const format of ['png', 'jpg', 'pdf']) {
          await downloadAndCheck(live, theme, format, transparent);
          exports++;
        }
      }
    }
    console.log(`PASS ${live} live theme: 18 format/theme/transparency combinations`);
  }
  // PDF rasterization failure: error visible, hook restored, next export succeeds.
  await page.evaluate(() => {
    const exporter = window.__lecturemind_markmap.doExport;
    window.__originalPdf = exporter.pdf;
    exporter.pdf = async () => { throw new Error('Forced PDF failure'); };
  });
  const beforeFailure = await snapshot();
  await openOptions('dark', false);
  await formatButton('pdf').click();
  await page.getByRole('alert').filter({ hasText: 'Forced PDF failure' }).waitFor();
  assert.deepEqual(await snapshot(), beforeFailure);
  assert.equal(await page.evaluate(() => window.__lecturemind_markmap.opt.handleBeingExportSvg === window.__priorExportHook), true);
  await page.evaluate(() => { window.__lecturemind_markmap.doExport.pdf = window.__originalPdf; });
  await downloadAndCheck('light', 'dark', 'pdf', false, '-retry');
  console.log('PASS PDF failure, cleanup, retry');
  // Export is also available from the hidden-but-mounted mindmap on the notes tab.
  await page.getByRole('button', { name: 'Note Editor', exact: true }).click();
  await downloadAndCheck('light', 'auto', 'png', false, '-notes-tab');
  console.log('PASS export from notes tab');
  await page.getByRole('button', { name: 'Mindmap', exact: true }).click();
  // Validate the exported standalone SVG layout without application CSS.
  const svg = await page.evaluate(() => window.__exportSvg);
  await writeFile(`${output}/standalone.svg`, svg);
  const inspection = await context.newPage();
  await inspection.setContent(svg);
  await inspection.evaluate(() => document.fonts.ready);
  const overflow = await inspection.evaluate(() => [...document.querySelectorAll('.smm-richtext-node-wrap .katex')].flatMap(math => {
    const bounds = math.getBoundingClientRect();
    const box = math.closest('foreignObject').getBoundingClientRect();
    return bounds.right > box.right + 1 || bounds.bottom > box.bottom + 1 || bounds.left < box.left - 1 || bounds.top < box.top - 1 ? [{ text: math.textContent, bounds: bounds.toJSON(), box: box.toJSON() }] : [];
  }));
  assert.deepEqual(overflow, [], 'math overflows exported node');
  await inspection.close();
  // Exercise the canvas boundary without allocating a huge diagram.
  await page.evaluate(() => {
    const mm = window.__lecturemind_markmap;
    window.__canvasLimit = mm.opt.maxCanvasSize;
    mm.opt.maxCanvasSize = 512;
  });
  await openOptions('auto', false);
  const scaledDownload = page.waitForEvent('download');
  await formatButton('png').click();
  const scaledPath = `${output}/canvas-limit.png`;
  await (await scaledDownload).saveAs(scaledPath);
  await exportButton().waitFor();
  const scaledMeta = await sharp(scaledPath).metadata();
  assert(scaledMeta.width <= 512 && scaledMeta.height <= 512);
  const expectedScaled = await sharp(`${output}/light-auto-solid.png`).resize(scaledMeta.width, scaledMeta.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const actualScaled = await sharp(scaledPath).removeAlpha().raw().toBuffer();
  const meanDifference = actualScaled.reduce((sum, byte, index) => sum + Math.abs(byte - expectedScaled[index]), 0) / actualScaled.length;
  assert(meanDifference < 8, `diagram was cropped at canvas limit (mean pixel difference ${meanDifference})`);
  await page.evaluate(() => { window.__lecturemind_markmap.opt.maxCanvasSize = window.__canvasLimit; });
  console.log('PASS canvas size boundary preserves full diagram');
  // Keep the user's zoom, pan, and collapsed branches through export.
  await page.evaluate(() => new Promise(resolve => {
    const mm = window.__lecturemind_markmap;
    const finish = () => { mm.off('node_tree_render_end', finish); resolve(); };
    mm.on('node_tree_render_end', finish);
    mm.execCommand('SET_NODE_EXPAND', mm.renderer.root.children[0], false);
  }));
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.evaluate(() => {
    const mm = window.__lecturemind_markmap;
    const view = mm.view.getTransformData();
    view.transform.translateX += 37;
    view.state.x += 37;
    mm.view.setTransformData(view);
  });
  await downloadAndCheck('light', 'dark', 'png', false, '-collapsed-zoom-pan');
  console.log('PASS collapsed branches, zoom and pan preserved');
  // UI prevents a second export while a real raster operation is pending.
  await page.evaluate(() => {
    const exporter = window.__lecturemind_markmap.doExport;
    const png = exporter.png.bind(exporter);
    exporter.png = (...args) => new Promise(resolve => {
      window.__releaseExport = () => { exporter.png = png; resolve(png(...args)); };
    });
  });
  await openOptions('auto', false);
  const pendingDownload = page.waitForEvent('download');
  await formatButton('png').click();
  await page.waitForFunction(() => typeof window.__releaseExport === 'function');
  for (const format of ['png', 'jpg', 'pdf']) assert.equal(await formatButton(format).isDisabled(), true);
  assert.equal(await page.getByRole('checkbox', { name: 'Transparent background' }).isDisabled(), true);
  if (!production) {
    const duplicate = await page.evaluate(async () => {
      const { exportMindmapAsImage } = await import('/src/utils/exportUtils.js');
      try { await exportMindmapAsImage('duplicate', 'png'); return 'unexpected success'; }
      catch (error) { return error.message; }
    });
    assert.equal(duplicate, 'An export is already in progress.');
  }
  await page.evaluate(() => window.__releaseExport());
  await (await pendingDownload).saveAs(`${output}/concurrent.png`);
  await exportButton().waitFor();
  console.log('PASS busy controls and concurrent export guard');
  if (!production) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await page.waitForFunction(() => window.__lecturemind_markmap.getTheme() === 'lecturemind-dark' && !window.__lecturemind_markmap.renderer.isRendering);
    const defaultDownload = page.waitForEvent('download');
    await page.evaluate(async () => {
      const { exportMindmapAsImage } = await import('/src/utils/exportUtils.js');
      await exportMindmapAsImage('default-options', 'png');
    });
    await (await defaultDownload).saveAs(`${output}/default-options.png`);
    await verifyRaster(await readFile(`${output}/default-options.png`), true, false, 'png');
    // A stalled render must reject, release its listener, and allow retry.
    const timeout = await page.evaluate(async () => {
      const { exportMindmapAsImage } = await import('/src/utils/exportUtils.js');
      const mm = window.__lecturemind_markmap;
      const render = mm.render;
      mm.render = () => {};
      try { await exportMindmapAsImage('stalled-render', 'png'); return 'unexpected success'; }
      catch (error) { return error.message; }
      finally { mm.render = render; }
    });
    assert.equal(timeout, 'The mindmap is still rendering. Please try again.');
    assert.equal(await page.evaluate(() => window.__renderWaiters.size), 0);
    await downloadAndCheck('dark', 'auto', 'png', false, '-after-timeout');
    console.log('PASS omitted options follow live dark theme; render timeout cleanup and retry');
  }
  await page.screenshot({ path: `${output}/live-after-exports.png` });
  assert.deepEqual(pageErrors, []);
  console.log(`PASS ${exports} matrix exports; MIME signatures, pixels, PDF pages/alpha, embedded fonts, math bounds, formula colors, live state, and listener cleanup (${production ? 'production' : 'development'})`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error(await page.locator('[role=alert]').allTextContents());
  console.error('Export result:', await page.evaluate(() => window.__exportResultPrefix));
  throw error;
} finally {
  await browser.close();
  if (production) await new Promise(resolve => server.httpServer.close(resolve));
  else await server.close();
}
