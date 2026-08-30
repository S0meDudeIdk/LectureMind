import { domToPng } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

/**
 * Capture high-resolution raster canvas of the real live Mindmap DOM,
 * preserving KaTeX math, node styling, and dot-grid background.
 */
async function captureMindmapCanvas() {
  const isDark = !document.documentElement.classList.contains('light');
  const tabPane = document.getElementById('mindmap-tab-pane');
  const container = document.getElementById('mindmap-viewport-container') || document.querySelector('.markmap')?.parentElement;

  if (!container) {
    throw new Error('Mindmap container not found in DOM.');
  }

  // If in Note Editor tab, temporarily ensure pane is visible for measurement
  const wasInvisible = tabPane?.classList.contains('invisible');
  if (wasInvisible && tabPane) {
    tabPane.classList.remove('invisible');
    tabPane.style.visibility = 'visible';
    tabPane.style.opacity = '1';
    tabPane.style.zIndex = '-99';
    void tabPane.offsetWidth;
  }

  // If the mindmap was hidden (e.g., in the Notes tab), fit it once so it has a
  // valid layout. Otherwise keep the user's current zoom/pan so the export matches
  // exactly what is on screen.
  if (wasInvisible && typeof window.__lecturemind_fit_mindmap === 'function') {
    window.__lecturemind_fit_mindmap();
  }

  // Wait for markmap fit animation, KaTeX math render, and all web fonts
  await new Promise((r) => setTimeout(r, 650));
  await document.fonts.ready;

  // 1. Temporarily save and clear .katex-mathml & raw TeX annotations to prevent duplicate text
  const mathmlElements = container.querySelectorAll('.katex-mathml, math, annotation');
  const savedMathml = [];
  mathmlElements.forEach((el) => {
    savedMathml.push({ el, html: el.innerHTML, display: el.style.display });
    el.innerHTML = '';
    el.style.display = 'none';
  });

  // Save the container's inline styles so we can restore them after capture.
  const savedContainerStyles = {
    position: container.style.position,
    left: container.style.left,
    top: container.style.top,
    width: container.style.width,
    height: container.style.height,
    zIndex: container.style.zIndex,
    overflow: container.style.overflow,
    backgroundColor: container.style.backgroundColor,
    backgroundImage: container.style.backgroundImage,
    backgroundSize: container.style.backgroundSize,
  };

  const savedFoStates = [];
  let savedRootTransform = '';

  try {
    const originalRect = container.getBoundingClientRect();
    // Capture at the same size the user actually sees in the tab pane so the export
    // matches the displayed mindmap. We break out of any parent overflow clipping but
    // keep the original dimensions.
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = `${originalRect.width}px`;
    container.style.height = `${originalRect.height}px`;
    container.style.zIndex = '-9999';
    container.style.overflow = 'visible';
    container.style.backgroundColor = isDark ? '#13131a' : '#ffffff';
    container.style.backgroundImage = `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.055)' : 'rgba(80,70,160,0.07)'} 1px, transparent 1px)`;
    container.style.backgroundSize = '24px 24px';
    void container.offsetWidth;
    await new Promise((r) => setTimeout(r, 100));

    // Read the SVG root transform so we can convert screen pixels to SVG user units.
    const svgEl = container.querySelector('svg.markmap');
    const rootG = svgEl?.querySelector('g');
    const rootTransform = rootG?.getAttribute('transform') || '';
    const transformMatch = rootTransform.match(/translate\(([^,]+)[,\s]+([^)]+)\)\s*scale\(([^)]+)\)/);
    const t = transformMatch
      ? { x: parseFloat(transformMatch[1]), y: parseFloat(transformMatch[2]), scale: parseFloat(transformMatch[3]) }
      : { x: 0, y: 0, scale: 1 };
    savedRootTransform = rootTransform;

    // Markmap's foreignObject viewport is sized for the raw text, but our CSS-styled
    // node cards (padding, borders, KaTeX) can overflow it. Modern-screenshot clips
    // foreignObject contents to the foreignObject's width/height, so we resize each
    // foreignObject to fully enclose its rendered card.
    //
    // The card is kept in the exact same SVG position by adjusting the foreignObject
    // x/y to compensate for the wrapper transform change.
    const M = 30; // px margin on each side of the card
    container.querySelectorAll('.markmap-foreign').forEach((fo) => {
      const wrapper = fo.firstElementChild;
      const card = wrapper?.firstElementChild;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const oldX = parseFloat(fo.getAttribute('x') || 0);
      const oldY = parseFloat(fo.getAttribute('y') || 0);
      const oldWidth = parseFloat(fo.getAttribute('width') || 0);
      const oldHeight = parseFloat(fo.getAttribute('height') || 0);
      const oldWrapperTransform = wrapper.style.transform;

      savedFoStates.push({
        fo,
        oldX,
        oldY,
        oldWidth,
        oldHeight,
        wrapper,
        oldWrapperTransform,
      });

      // Read the actual pixel translate from the rendered wrapper (the stylesheet
      // uses percentages, so getComputedStyle resolves it for us).
      const computedTransform = getComputedStyle(wrapper).transform;
      const matrixMatch = computedTransform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
      const originalWrapperX = matrixMatch ? parseFloat(matrixMatch[5]) : -10;
      const originalWrapperYPx = matrixMatch ? parseFloat(matrixMatch[6]) : 0.42 * cardRect.height;

      // Keep the card at the same SVG user coordinates while surrounding it with margin.
      // oldCardUserX = oldX + originalWrapperX / scale
      // oldCardUserY = oldY + originalWrapperYPx / scale
      // newX + M/scale = oldCardUserX, newY + M/scale = oldCardUserY
      const newX = oldX + (originalWrapperX - M) / t.scale;
      const newY = oldY + (originalWrapperYPx - M) / t.scale;
      const newWidth = (cardRect.width + M * 2) / t.scale;
      const newHeight = (cardRect.height + M * 2) / t.scale;

      fo.setAttribute('x', newX);
      fo.setAttribute('y', newY);
      fo.setAttribute('width', Math.max(1, newWidth));
      fo.setAttribute('height', Math.max(1, newHeight));
      // The stylesheet uses `!important` on the wrapper transform, so we must also
      // use `!important` to override it during capture.
      wrapper.style.setProperty('transform', `translate(${M}px, ${M}px)`, 'important');
    });
    void container.offsetWidth;
    await new Promise((r) => setTimeout(r, 100));

    const dataUrl = await domToPng(container, {
      width: originalRect.width,
      height: originalRect.height,
      scale: 2,
      quality: 0.95,
      backgroundColor: isDark ? '#13131a' : '#ffffff',
      filter: (node) => {
        if (!node) return true;
        if (node.nodeType === 1) {
          if (node.classList?.contains('markmap-zoom-controls')) return false;
          if (node.tagName === 'ASIDE' || node.closest?.('aside') !== null) return false;
          if (node.classList?.contains('katex-mathml') || node.closest?.('.katex-mathml') !== null) return false;
        }
        return true;
      },
    });

    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ canvas, width: canvas.width, height: canvas.height });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  } finally {
    // Restore SVG root group transform
    if (savedRootTransform) {
      const svgEl = container.querySelector('svg.markmap');
      const rootG = svgEl?.querySelector('g');
      if (rootG) rootG.setAttribute('transform', savedRootTransform);
    }

    // Restore foreignObject sizes and wrapper transforms
    savedFoStates.forEach(({ fo, oldX, oldY, oldWidth, oldHeight, wrapper, oldWrapperTransform }) => {
      fo.setAttribute('x', oldX);
      fo.setAttribute('y', oldY);
      fo.setAttribute('width', oldWidth);
      fo.setAttribute('height', oldHeight);
      if (oldWrapperTransform) {
        wrapper.style.setProperty('transform', oldWrapperTransform, 'important');
      } else {
        wrapper.style.removeProperty('transform');
      }
    });

    // Restore container styles
    Object.entries(savedContainerStyles).forEach(([key, value]) => {
      container.style[key] = value;
    });

    // Restore all mathml elements
    savedMathml.forEach(({ el, html, display }) => {
      el.innerHTML = html;
      el.style.display = display;
    });

    // Restore tab pane state if it was hidden
    if (wasInvisible && tabPane) {
      tabPane.classList.add('invisible');
      tabPane.style.visibility = '';
      tabPane.style.opacity = '';
      tabPane.style.zIndex = '';
    }
  }
}

/**
 * Export Mindmap as high-resolution JPG image
 */
export async function exportMindmapAsJpg(title = 'lecture-mindmap') {
  try {
    const { canvas } = await captureMindmapCanvas();
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = jpgUrl;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'mindmap'}.jpg`;
    a.click();
  } catch (err) {
    console.error('Failed to export mindmap as JPG:', err);
    alert('Could not export mindmap as JPG. Please try again.');
  }
}

/**
 * Export Mindmap as PDF document
 */
export async function exportMindmapAsPdf(title = 'lecture-mindmap') {
  try {
    const { canvas, width, height } = await captureMindmapCanvas();
    const pdfWidth = width / 2;
    const pdfHeight = height / 2;

    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    });

    const jpgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(jpgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'mindmap'}.pdf`);
  } catch (err) {
    console.error('Failed to export mindmap as PDF:', err);
    alert('Could not export mindmap as PDF. Please try again.');
  }
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

import { markdownToGoogleDocsHtml } from './googleDocsConverter';

/**
 * Load Google Identity Services (GIS) library dynamically
 */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google);
    const existing = document.getElementById('google-gis-script');
    if (existing) {
      existing.onload = () => resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = (err) => reject(new Error('Failed to load Google Identity Services: ' + err));
    document.head.appendChild(script);
  });
}

/**
 * Helper to upload HTML to Google Drive via multipart REST API
 */
export async function uploadHtmlToGoogleDrive(htmlContent, title, accessToken) {
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
 * Export note to Google Drive as a native Google Doc via Google Drive REST API
 */
export async function exportToGoogleDriveDirect(content, title = 'Lecture Notes', explicitTokenOrClientId = null) {
  const htmlContent = markdownToGoogleDocsHtml(content, title);
  
  // If a valid OAuth access token is already provided or stored in session
  const storedToken = explicitTokenOrClientId?.startsWith?.('ya29.') 
    ? explicitTokenOrClientId 
    : (sessionStorage.getItem('lecturemind_drive_access_token') || localStorage.getItem('lecturemind_drive_access_token'));

  if (storedToken) {
    try {
      return await uploadHtmlToGoogleDrive(htmlContent, title, storedToken);
    } catch (tokenErr) {
      console.warn('[Google Drive] Cached access token invalid/expired, requesting new token...', tokenErr);
    }
  }

  // Fallback to Google Identity Services GIS token client
  const effectiveClientId = (!explicitTokenOrClientId?.startsWith?.('ya29.') && explicitTokenOrClientId) 
    || import.meta.env.VITE_GOOGLE_CLIENT_ID 
    || localStorage.getItem('lecturemind_google_client_id');

  if (!effectiveClientId) {
    throw new Error('Google Client ID is required for direct Google Drive export.');
  }

  const google = await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }

          try {
            const accessToken = tokenResponse.access_token;
            sessionStorage.setItem('lecturemind_drive_access_token', accessToken);
            const result = await uploadHtmlToGoogleDrive(htmlContent, title, accessToken);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });
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
