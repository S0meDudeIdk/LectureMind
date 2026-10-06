import { getIdToken, getAppCheckToken } from './auth';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

function getBaseUrl() {
  const configured = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (!configured) return '';
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(configured, window.location.href);
      if (url.origin === window.location.origin) return '';
      if (window.location.protocol === 'https:' && url.protocol === 'http:') return '';
      const isTargetLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
      if (isTargetLocal) return '';
      return configured;
    } catch {
      return '';
    }
  }
  return configured;
}

export async function apiFetch(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path.');
  let token = await getIdToken();
  const appCheck = await getAppCheckToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (appCheck) headers.set('X-Firebase-AppCheck', appCheck);
  const baseUrl = getBaseUrl();
  let response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (response.status === 401) {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === 'INVALID_TOKEN') {
      try {
        const refreshedToken = await getIdToken(true);
        if (refreshedToken && refreshedToken !== token) {
          token = refreshedToken;
          headers.set('Authorization', `Bearer ${token}`);
          response = await fetch(`${baseUrl}${path}`, { ...options, headers });
        }
      } catch {}
    }
  }
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('text/html')) {
      throw new ApiError('The server is currently warming up or restarting. Please retry in a moment.', response.status, 'SERVER_WARMUP');
    }
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error || `Request failed (${response.status}).`, response.status, body?.code);
  }
  return response;
}
export async function apiJson(path, body, options = {}) {
  const response = await apiFetch(path, { method: 'POST', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new ApiError('The server is currently warming up or restarting. Please retry in a moment.', response.status, 'SERVER_WARMUP');
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('The server returned an invalid response. Please retry in a moment.', 502, 'INVALID_RESPONSE');
  }
}
