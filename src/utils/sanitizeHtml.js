import DOMPurify from 'dompurify';

// Rich math needs SVG and inline geometry styles. Untrusted notes never need
// executable elements, event handlers, embeds, or external stylesheet rules.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html ?? ''), {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['srcdoc'],
  });
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}
