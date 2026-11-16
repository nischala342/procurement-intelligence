import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from './api';
import type { HealthReport } from './types';

export function useHealth(pollMs = 15_000) {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await fetchHealth());
      setError(null);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { health, error, loading, refresh };
}
