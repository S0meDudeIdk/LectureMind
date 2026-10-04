import { markdownToGoogleDocsHtml } from './googleDocsConverter';
import katexCss from 'katex/dist/katex.min.css?inline';
import { downloadFile, readBlob } from 'simple-mind-map/src/utils/index.js';
import { getMindmapNodeColors } from './markdown-to-simple-mind-map';

const activeExports = new WeakSet();
let embeddedKatexCss;

function sanitizeFilename(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'mindmap';
}

// SVG images cannot fetch external fonts. Embed one WOFF2 source per face and
// cache only successful loads; a network failure must remain retryable.
function getKatexCssForExport() {
  if (!embeddedKatexCss) {
    embeddedKatexCss = (async () => {
      let css = katexCss.replace(/src:([^;}]+)/g, (rule, sources) => {
        const woff2 = sources.match(/url\([^)]*\)\s*format\(["']?woff2["']?\)/);
        return woff2 ? `src:${woff2[0]}` : rule;
      });
      const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]))];
      const fonts = await Promise.all(urls.map(async url => {
        if (url.startsWith('data:')) return [url, url];
        const response = await fetch(new URL(url, document.baseURI), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Could not load math fonts. Please retry the export.');
        return [url, await readBlob(await response.blob())];
      }));
      const dataUrls = new Map(fonts);
      css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (_, url) => `url("${dataUrls.get(url)}")`);
      // Match the app's math sizing so the measured foreignObjects don't clip.
      return css + '\n.smm-richtext-node-wrap .katex{font-size:1.06em;vertical-align:middle}';
    })().catch(error => {
      embeddedKatexCss = null;
      throw new Error('Could not load math fonts. Please retry the export.', { cause: error });
    });
  }
  return embeddedKatexCss;
}

function waitForRender(mm) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      mm.off('node_tree_render_end', finish);
      mm.off('beforeDestroy', destroyed);
    };
    const finish = () => { cleanup(); resolve(); };
    const destroyed = () => { cleanup(); reject(new Error('The mindmap was closed during export.')); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The mindmap is still rendering. Please try again.'));
    }, 10000);
    mm.on('node_tree_render_end', finish);
    mm.on('beforeDestroy', destroyed);
    try {
      mm.render();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/** Export the whole diagram; only the cloned SVG receives export styling. */
export async function exportMindmapAsImage(title = 'lecture-mindmap', format = 'jpg', opts = {}) {
  const mm = window.__lecturemind_markmap;
  if (!mm?.doExport || !mm.el?.isConnected) throw new Error('The mindmap is not ready to export.');
  if (!['jpg', 'png', 'pdf'].includes(format)) throw new Error('Unsupported export format.');
  if (activeExports.has(mm)) throw new Error('An export is already in progress.');
  const { theme = 'auto', transparent = false } = opts;
  if (!['auto', 'light', 'dark'].includes(theme)) throw new Error('Unsupported export theme.');
  const dark = theme === 'auto' ? !document.documentElement.classList.contains('light') : theme === 'dark';
  // JPEG has no alpha channel, even if a caller requests transparency.
  const clearBackground = transparent && format !== 'jpg';
  activeExports.add(mm);
  let previousHook;
  let exportHook;

  try {
    const css = await getKatexCssForExport();
    await document.fonts.ready;
    if (!mm.el?.isConnected) throw new Error('The mindmap was closed during export.');
    await waitForRender(mm);
    previousHook = mm.opt.handleBeingExportSvg;
    exportHook = (svg) => {
      if (previousHook) svg = previousHook(svg);
      const ns = 'http://www.w3.org/2000/svg';
      const style = document.createElementNS(ns, 'style');
      style.textContent = css;
      svg.node.prepend(style);
      const nodes = svg.node.querySelectorAll('.smm-richtext-node-wrap[data-depth]');
      if (!nodes.length) throw new Error('The mindmap has no rendered nodes. Please try again.');
      for (const wrapper of nodes) {
        const colors = getMindmapNodeColors(wrapper.dataset.branchColor, Number(wrapper.dataset.depth), dark);
        wrapper.style.color = colors.text;
        const shape = wrapper.closest('.smm-node')?.querySelector('.smm-node-shape');
        if (shape) {
          shape.setAttribute('fill', colors.bg);
          shape.setAttribute('stroke', colors.border);
        }
      }
      for (const line of svg.node.querySelectorAll('.smm-line-container path')) {
        line.setAttribute('stroke', dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)');
      }
      if (!clearBackground) {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('fill', dark ? '#0f0f1a' : '#ffffff');
        svg.node.prepend(rect);
      }
      // The installed rasterizer clamps the canvas without scaling its drawing.
      // Scale the clone first so large maps retain every node inside that limit.
      const width = svg.width();
      const height = svg.height();
      const dpr = Math.max(window.devicePixelRatio, mm.opt.minExportImgCanvasScale);
      const scale = Math.min(1, mm.opt.maxCanvasSize / (Math.max(width, height) * dpr));
      if (scale < 1) {
        svg.viewbox(0, 0, width, height);
        svg.size(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
      }
      return svg;
    };
    mm.opt.handleBeingExportSvg = exportHook;
    const name = sanitizeFilename(title);
    // Call the plugin directly so failures reject (mm.export swallows them).
    // Its jpg() uses the unsupported image/jpg MIME; use its shared rasterizer
    // with image/jpeg instead. Our SVG rect owns the background in every format.
    let result = format === 'jpg'
      ? await mm.doExport._image('image/jpeg', name, true)
      : await mm.doExport.export(format, false, name, true);
    // ExportPDF creates an untyped Blob. Normalize only verified PDF bytes.
    if (format === 'pdf' && /^data:application\/octet-stream;base64,JVBERi0/.test(result)) {
      result = result.replace('application/octet-stream', 'application/pdf');
    }
    const mime = { jpg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' }[format];
    if (!result?.startsWith(`data:${mime};`)) throw new Error('The export did not produce a valid file.');
    downloadFile(result, `${name}.${format}`);
    return result;
  } finally {
    if (exportHook && mm.opt.handleBeingExportSvg === exportHook) mm.opt.handleBeingExportSvg = previousHook;
    activeExports.delete(mm);
  }
}

/** Legacy wrappers */
export async function exportMindmapAsJpg(title = 'lecture-mindmap') {
  return exportMindmapAsImage(title, 'jpg');
}

export async function exportMindmapAsPdf(title = 'lecture-mindmap') {
  return exportMindmapAsImage(title, 'pdf');
}

/**
 * Export Markdown file (.md)
 */
export function exportMarkdownFile(content, title = 'lecture-notes') {
  const blob = new Blob([content || ''], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'lecture-notes'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that a value looks like a Google OAuth access token.
 * This does not guarantee the token is active, only that it is present and well-formed.
 */
function isValidAccessToken(token) {
  return typeof token === 'string' && token.length > 0 && token.startsWith('ya29.');
}

/**
 * Helper to upload HTML to Google Drive via multipart REST API
 */
export async function uploadHtmlToGoogleDrive(htmlContent, title, accessToken) {
  if (!isValidAccessToken(accessToken)) {
    throw new Error('A valid Google Drive access token is required for upload.');
  }

  const metadata = {
    name: title || 'LectureMind Notes',
    mimeType: 'application/vnd.google-apps.document',
  };

  const boundary = '-------LectureMindExportBoundary' + Date.now();
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelim = '\r\n--' + boundary + '--';

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    htmlContent +
    closeDelim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Google Drive API error: ${res.statusText}`);
  }

  const data = await res.json();
  const docUrl = `https://docs.google.com/document/d/${data.id}/edit`;
  window.open(docUrl, '_blank');
  return { id: data.id, url: docUrl };
}

/**
 * Export note to Google Drive as a native Google Doc via Google Drive REST API.
 * Requires a valid Google Drive access token. The caller is responsible for
 * ensuring the user is authenticated before invoking this function.
 */
export async function exportToGoogleDriveDirect(content, title = 'Lecture Notes', accessToken = null) {
  const htmlContent = markdownToGoogleDocsHtml(content, title);

  const storedToken = sessionStorage.getItem('lecturemind_drive_access_token') || localStorage.getItem('lecturemind_drive_access_token');
  const effectiveToken = isValidAccessToken(accessToken) ? accessToken : storedToken;

  if (!isValidAccessToken(effectiveToken)) {
    throw new Error('You must be signed in with Google to export directly to Google Drive.');
  }

  return await uploadHtmlToGoogleDrive(htmlContent, title, effectiveToken);
}

/**
 * 1-Click Instant Export to Google Docs (Rich Text Clipboard + docs.new)
 */
export async function exportToDocsViaClipboard(content, title = 'Lecture Notes') {
  const html = markdownToGoogleDocsHtml(content, title);
  try {
    const textBlob = new Blob([content || ''], { type: 'text/plain' });
    const htmlBlob = new Blob([html || ''], { type: 'text/html' });
    
    // Write rich formatted HTML to OS clipboard for native Google Docs paste
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      }),
    ]);
  } catch {
    // Fallback standard copy if ClipboardItem not supported
    await navigator.clipboard.writeText(content || '');
  }

  // Automatically open new blank Google Doc in browser
  window.open('https://docs.new', '_blank');
}

/**
 * Universal Export to Google Docs router
 */
export async function exportToGoogleDocs(content, title = 'Lecture Notes') {
  const storedToken = sessionStorage.getItem('lecturemind_drive_access_token') || localStorage.getItem('lecturemind_drive_access_token');
  if (storedToken) {
    try {
      await exportToGoogleDriveDirect(content, title, storedToken);
      return;
    } catch (err) {
      console.warn('Direct Google Drive token export failed, falling back to clipboard:', err);
    }
  }
  
  // Instant 1-click fallback
  await exportToDocsViaClipboard(content, title);
}
