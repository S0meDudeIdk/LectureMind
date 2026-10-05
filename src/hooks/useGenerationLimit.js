import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../services/apiClient';

/** Informational only: the backend atomically reserves and enforces quota. */
export function useGenerationLimit(user) {
  const [quota, setQuota] = useState(null);
  const refresh = useCallback(async () => {
    if (!user?.uid) { setQuota(null); return; }
    try { setQuota(await (await apiFetch('/api/quota')).json()); }
    catch { setQuota(null); }
  }, [user?.uid, user?.isAnonymous]);
  useEffect(() => { refresh(); }, [refresh]);
  return { count: quota?.count || 0, canGenerate: quota ? quota.remaining > 0 : true, increment: refresh, reset: refresh, refresh, quota };
}
