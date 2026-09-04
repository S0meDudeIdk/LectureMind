import { useCallback, useState } from 'react';
import { ANONYMOUS_DAILY_GENERATION_LIMIT, isAnonymous } from '../utils/authLimits';

const STORAGE_KEY = 'lm-daily-generations';

/**
 * Build a YYYY-MM-DD string from the given date in local time.
 * Used to reset the anonymous generation counter at midnight local time.
 */
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Read the stored daily generation count from localStorage.
 * Returns a fresh zeroed state if the stored date is stale or localStorage is unavailable.
 */
function readStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const today = getLocalDateString();

    if (!raw) {
      return { date: today, count: 0 };
    }

    const parsed = JSON.parse(raw);
    const storedDate = typeof parsed.date === 'string' ? parsed.date : today;
    const storedCount = Number.isFinite(parsed.count) ? parsed.count : 0;

    if (storedDate !== today) {
      return { date: today, count: 0 };
    }

    return { date: storedDate, count: storedCount };
  } catch {
    return { date: getLocalDateString(), count: 0 };
  }
}

/**
 * Persist the daily generation count to localStorage.
 * Silently fails if localStorage is unavailable (e.g. private mode, SSR).
 */
function writeStoredState(date, count) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, count }));
  } catch {
    // Storage is unavailable; the hook continues to work in-memory only.
  }
}

/**
 * Hook that tracks anonymous daily generation usage against a fixed limit.
 *
 * - Logged-in users are always blocked from generating through this hook
 *   because they have unlimited generations elsewhere.
 * - Anonymous users may generate while their daily count is below the limit.
 * - Count resets automatically at midnight local time.
 * - Falls back to in-memory tracking if localStorage is unavailable.
 *
 * @param {object|null|undefined} user - Firebase/auth user object.
 * @returns {{ count: number, canGenerate: boolean, increment: () => void, reset: () => void }}
 */
export function useGenerationLimit(user) {
  const [state, setState] = useState(() => readStoredState());
  const isUserAnonymous = isAnonymous(user);

  const today = getLocalDateString();
  const count = state.date === today ? state.count : 0;
  // Logged-in users have unlimited generations; anonymous users are capped per day.
  const canGenerate = !isUserAnonymous || count < ANONYMOUS_DAILY_GENERATION_LIMIT;

  const increment = useCallback(() => {
    if (!isUserAnonymous) {
      return;
    }

    setState((prev) => {
      const currentDate = getLocalDateString();
      const nextCount = (prev.date === currentDate ? prev.count : 0) + 1;
      const nextState = { date: currentDate, count: nextCount };
      writeStoredState(nextState.date, nextState.count);
      return nextState;
    });
  }, [isUserAnonymous]);

  const reset = useCallback(() => {
    const currentDate = getLocalDateString();
    const nextState = { date: currentDate, count: 0 };
    writeStoredState(nextState.date, nextState.count);
    setState(nextState);
  }, []);

  return { count, canGenerate, increment, reset };
}
