function sanitizeFilename(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'mindmap';
}

function getMindmapInstance() {
  const mm = window.__lecturemind_markmap;
  if (!mm) {
    throw new Error('Mindmap instance not found.');
  }
  return mm;
}

/**
 * Export Mindmap as JPG image via simple-mind-map's Export plugin.
 */
export async function exportMindmapAsJpg(title = 'lecture-mindmap') {
  try {
    const mm = getMindmapInstance();
    await mm.export('jpg', true, sanitizeFilename(title));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to export mindmap as JPG:', err);
    alert('Could not export mindmap as JPG. Please try again.');
  }
}

/**
 * Export Mindmap as PDF document via simple-mind-map's Export plugin.
 */
export async function exportMindmapAsPdf(title = 'lecture-mindmap') {
  try {
    const mm = getMindmapInstance();
    await mm.export('pdf', true, sanitizeFilename(title));
  } catch (err) {
    // eslint-disable-next-line no-console
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
