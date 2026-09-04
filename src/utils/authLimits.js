/** @file Auth-aware limits and helpers for anonymous vs logged-in users. */

export const ANONYMOUS_DAILY_GENERATION_LIMIT = 5;
export const ANONYMOUS_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const LOGGED_IN_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/**
 * Determine whether a user is anonymous (not signed in).
 * Firebase user objects expose a `uid` string; null/undefined mean anonymous.
 * @param {object|null|undefined} user
 * @returns {boolean}
 */
export function isAnonymous(user) {
  return !user || typeof user.uid !== 'string' || user.uid.length === 0;
}

/**
 * Return the maximum upload file size (in bytes) allowed for the given user.
 * @param {object|null|undefined} user
 * @returns {number}
 */
export function getMaxFileSizeBytes(user) {
  return isAnonymous(user) ? ANONYMOUS_MAX_FILE_SIZE_BYTES : LOGGED_IN_MAX_FILE_SIZE_BYTES;
}

/**
 * Format a byte count into a human-readable string.
 * Uses 1024-based units (displayed as KB, MB, GB) with one decimal place for values < 10.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0 || bytes == null || Number.isNaN(bytes)) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const magnitude = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))));
  const value = bytes / Math.pow(1024, magnitude);

  return `${value < 10 && magnitude > 0 ? value.toFixed(1) : Math.round(value)} ${units[magnitude]}`;
}
