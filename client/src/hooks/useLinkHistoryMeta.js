import { useEffect, useState } from 'react';
import { API_URL } from '../config/constants.js';
import { getHistory } from '../utils/history.js';

export function useLinkHistoryMeta(refreshKey) {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState({}); // slug -> { clicks, expired, hasPassword }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getHistory();
    setEntries(stored);
    setMeta({});

    if (stored.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let remaining = stored.length;

    stored.forEach(async (entry) => {
      try {
        const res = await fetch(
          `${API_URL}/api/urls/${entry.slug}/meta?token=${encodeURIComponent(entry.deleteToken)}`
        );
        if (res.ok) {
          const data = await res.json();
          setMeta((prev) => ({
            ...prev,
            [entry.slug]: { clicks: data.clicks, expired: data.expired, hasPassword: data.hasPassword },
          }));
        }
      } catch {
        // offline or backend unreachable - list still renders from localStorage
      } finally {
        remaining -= 1;
        if (remaining <= 0) setLoading(false);
      }
    });
  }, [refreshKey]);

  return { entries, meta, loading };
}
