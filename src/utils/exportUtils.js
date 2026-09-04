import { domToPng } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

/**
 * Capture high-resolution raster canvas of the real live Mindmap DOM,
 * preserving KaTeX math, node styling, and dot-grid background.
 * Guarantees zero node shifting, full diagram coverage, and 100% sharpness for all sizes.
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

  // If the mindmap was hidden (e.g., in the Notes tab), fit it once so it has a valid layout
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

  const svgEl = container.querySelector('svg.markmap');
  const rootG = svgEl?.querySelector('g');
  if (!svgEl || !rootG) {
    throw new Error('SVG markmap root element not found.');
  }

  const savedSvgStyles = {
    width: svgEl.style.width,
    height: svgEl.style.height,
    attrWidth: svgEl.getAttribute('width'),
    attrHeight: svgEl.getAttribute('height'),
    viewBox: svgEl.getAttribute('viewBox'),
  };

  const savedRootTransform = rootG.getAttribute('transform') || '';
  const savedFoStates = [];

  try {
    // Determine the full unscaled bounding box of all content in the mindmap
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // 1. Check Markmap's internal computed tree rect
    const mm = window.__lecturemind_markmap;
    if (mm?.state?.rect) {
      const { x1, y1, x2, y2 } = mm.state.rect;
      if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
        minX = Math.min(minX, x1);
        minY = Math.min(minY, y1);
        maxX = Math.max(maxX, x2);
        maxY = Math.max(maxY, y2);
      }
    }

    // 2. Check root group getBBox (in SVG user space before transform)
    try {
      const bbox = rootG.getBBox();
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
      }
    } catch (e) {
      console.warn('SVG getBBox calculation fallback:', e);
    }

    // 3. Check every node group and its rendered card dimensions
    container.querySelectorAll('g.markmap-node').forEach((nodeG) => {
      const transform = nodeG.getAttribute('transform') || '';
      const match = transform.match(/translate\(([^,]+)[,\s]+([^)]+)\)/);
      if (match) {
        const nx = parseFloat(match[1]);
        const ny = parseFloat(match[2]);
        const card = nodeG.querySelector('.markmap-foreign > div > div');
        const cardW = card ? (card.offsetWidth || card.scrollWidth || 100) : 100;
        const cardH = card ? (card.offsetHeight || card.scrollHeight || 30) : 30;
        const circle = nodeG.querySelector('circle');
        const circleCx = circle ? parseFloat(circle.getAttribute('cx') || 0) : cardW;
        const circleCy = circle ? parseFloat(circle.getAttribute('cy') || 0) : cardH / 2;

        minX = Math.min(minX, nx - 25);
        minY = Math.min(minY, ny - 20);
        maxX = Math.max(maxX, nx + Math.max(cardW, circleCx) + 35);
        maxY = Math.max(maxY, ny + Math.max(cardH + 20, circleCy + 15));
      }
    });

    // Fallback if bounds could not be computed
    if (!isFinite(minX) || !isFinite(maxX) || minX >= maxX) {
      minX = 0;
      minY = 0;
      maxX = container.offsetWidth || 1200;
      maxY = container.offsetHeight || 800;
    }

    const pad = 80; // 80px padding all around
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const exportWidth = Math.ceil(contentWidth + pad * 2);
    const exportHeight = Math.ceil(contentHeight + pad * 2);

    // Frame the content at 1:1 uncompressed scale (scale=1) for 100% sharpness
    const targetTranslateX = pad - minX;
    const targetTranslateY = pad - minY;
    rootG.setAttribute('transform', `translate(${targetTranslateX}, ${targetTranslateY}) scale(1)`);

    // Size container and SVG to fit the complete diagram
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = `${exportWidth}px`;
    container.style.height = `${exportHeight}px`;
    container.style.zIndex = '-9999';
    container.style.overflow = 'visible';
    container.style.backgroundColor = isDark ? '#13131a' : '#ffffff';
    container.style.backgroundImage = `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.055)' : 'rgba(80,70,160,0.07)'} 1px, transparent 1px)`;
    container.style.backgroundSize = '24px 24px';

    svgEl.style.width = `${exportWidth}px`;
    svgEl.style.height = `${exportHeight}px`;
    svgEl.setAttribute('width', `${exportWidth}`);
    svgEl.setAttribute('height', `${exportHeight}`);
    svgEl.setAttribute('viewBox', `0 0 ${exportWidth} ${exportHeight}`);

    // Align each foreignObject without node shifting:
    // In index.css, .markmap-foreign > div has transform: translate(-10px, 42%) !important.
    // In node user space, the card is at (oldX + dx, oldY + dy).
    // By placing foreignObject at (oldX + dx, oldY + dy) and setting wrapper transform to translate(0, 0),
    // the card stays at the exact same visual position relative to circle connectors and links,
    // while foreignObject dimensions fully enclose the card so modern-screenshot never clips it.
    container.querySelectorAll('.markmap-foreign').forEach((fo) => {
      const wrapper = fo.firstElementChild;
      const card = wrapper?.firstElementChild;
      if (!card) return;

      const oldX = parseFloat(fo.getAttribute('x') || 0);
      const oldY = parseFloat(fo.getAttribute('y') || 0);
      const oldWidth = parseFloat(fo.getAttribute('width') || 0);
      const oldHeight = parseFloat(fo.getAttribute('height') || 0);
      const oldOverflow = fo.getAttribute('overflow');
      const oldWrapperTransform = wrapper.style.transform;

      savedFoStates.push({
        fo,
        oldX,
        oldY,
        oldWidth,
        oldHeight,
        oldOverflow,
        wrapper,
        oldWrapperTransform,
      });

      const cardWidth = Math.ceil(card.offsetWidth || card.scrollWidth || oldWidth);
      const cardHeight = Math.ceil(card.offsetHeight || card.scrollHeight || oldHeight);

      const computedTransform = window.getComputedStyle(wrapper).transform;
      let dx = -10;
      let dy = Math.round(0.42 * cardHeight);
      if (computedTransform && computedTransform !== 'none') {
        const matrixMatch = computedTransform.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
        if (matrixMatch) {
          dx = parseFloat(matrixMatch[5]);
          dy = parseFloat(matrixMatch[6]);
        }
      }

      fo.setAttribute('x', oldX + dx);
      fo.setAttribute('y', oldY + dy);
      fo.setAttribute('width', cardWidth + 4);
      fo.setAttribute('height', cardHeight + 4);
      fo.setAttribute('overflow', 'visible');
      fo.style.overflow = 'visible';
      wrapper.style.setProperty('transform', 'translate(0px, 0px)', 'important');
    });

    void container.offsetWidth;
    await new Promise((r) => setTimeout(r, 120));

    // High-resolution capture scale:
    // Base SVG is rendered at 100% natural scale (scale=1).
    // With captureScale = 2, it renders with 2x Retina clarity (zero blur).
    // For extraordinarily large diagrams, cap scale so canvas dimensions stay safe within browser memory limits.
    const maxDim = Math.max(exportWidth, exportHeight);
    let captureScale = 2;
    if (maxDim * captureScale > 10000) {
      captureScale = Math.max(1, 10000 / maxDim);
    }

    const dataUrl = await domToPng(container, {
      width: exportWidth,
      height: exportHeight,
      scale: captureScale,
      quality: 0.98,
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
        resolve({ canvas, width: exportWidth, height: exportHeight, captureScale });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  } finally {
    // Restore SVG root group transform
    if (rootG && savedRootTransform) {
      rootG.setAttribute('transform', savedRootTransform);
    }

    // Restore SVG element styles & attributes
    if (svgEl) {
      svgEl.style.width = savedSvgStyles.width;
      svgEl.style.height = savedSvgStyles.height;
      if (savedSvgStyles.attrWidth !== null) {
        svgEl.setAttribute('width', savedSvgStyles.attrWidth);
      } else {
        svgEl.removeAttribute('width');
      }
      if (savedSvgStyles.attrHeight !== null) {
        svgEl.setAttribute('height', savedSvgStyles.attrHeight);
      } else {
        svgEl.removeAttribute('height');
      }
      if (savedSvgStyles.viewBox !== null) {
        svgEl.setAttribute('viewBox', savedSvgStyles.viewBox);
      } else {
        svgEl.removeAttribute('viewBox');
      }
    }

    // Restore foreignObject sizes and wrapper transforms
    savedFoStates.forEach(({ fo, oldX, oldY, oldWidth, oldHeight, oldOverflow, wrapper, oldWrapperTransform }) => {
      fo.setAttribute('x', oldX);
      fo.setAttribute('y', oldY);
      fo.setAttribute('width', oldWidth);
      fo.setAttribute('height', oldHeight);
      if (oldOverflow !== null) {
        fo.setAttribute('overflow', oldOverflow);
      } else {
        fo.removeAttribute('overflow');
      }
      fo.style.overflow = '';
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
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.98);
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
    const pdfWidth = width;
    const pdfHeight = height;

    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    });

    const jpgData = canvas.toDataURL('image/jpeg', 0.98);
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
