import { getIdToken, getAppCheckToken } from './auth';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}
export async function apiFetch(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path.');
  const token = await getIdToken();
  const appCheck = await getAppCheckToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (appCheck) headers.set('X-Firebase-AppCheck', appCheck);
  const configured = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, '') || '';
  const response = await fetch(`${configured}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error || `Request failed (${response.status}).`, response.status, body?.code);
  }
  return response;
}
export async function apiJson(path, body, options = {}) {
  const response = await apiFetch(path, { method: 'POST', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
  return response.json();
}
