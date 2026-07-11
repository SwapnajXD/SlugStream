import { useEffect, useState } from 'react';
import { Trash2, MousePointerClick, Clock, FolderClock } from 'lucide-react';
import { API_URL, FRONTEND_BASE } from '../config/constants.js';
import { getHistory, removeFromHistory } from '../utils/history.js';
import { useToast } from './Toast.jsx';

export default function LinkHistory({ refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState({}); // slug -> { clicks, expired }
  const showToast = useToast();

  useEffect(() => {
    const stored = getHistory();
    setEntries(stored);

    // Best-effort refresh of click counts / expiry state; ignore failures
    // per-entry so one bad fetch doesn't block the rest of the list.
    stored.forEach(async (entry) => {
      try {
        const res = await fetch(`${API_URL}/api/urls/${entry.slug}/meta`);
        if (!res.ok) return;
        const data = await res.json();
        setMeta((prev) => ({ ...prev, [entry.slug]: { clicks: data.clicks, expired: data.expired } }));
      } catch {
        // offline or backend unreachable - history still renders from localStorage
      }
    });
  }, [refreshKey]);

  const del = async (entry) => {
    try {
      const res = await fetch(`${API_URL}/api/urls/${entry.slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteToken: entry.deleteToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      removeFromHistory(entry.slug);
      setEntries((prev) => prev.filter((e) => e.slug !== entry.slug));
      showToast('Link deleted', { tone: 'success' });
    } catch (err) {
      showToast(err.message, { tone: 'error' });
    }
  };

  if (entries.length === 0) {
    return (
      <div className="history-empty">
        <FolderClock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        No links yet on this device. Create one above.
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => {
        const m = meta[entry.slug];
        const expired = m?.expired;
        return (
          <div key={entry.slug} className={`history-item ${expired ? 'expired' : ''}`}>
            <div>
              <div className="slug">{FRONTEND_BASE}/{entry.slug}</div>
              <div className="long-url">{entry.longUrl}</div>
              <div className="stats">
                <span><MousePointerClick size={11} /> {m ? m.clicks : '…'} clicks</span>
                <span><Clock size={11} /> {expired ? 'Expired' : (entry.expiresAt ? 'Expires' : 'Never expires')}</span>
              </div>
            </div>
            <div className="history-item-right">
              <button className="icon-btn" title="Delete link" onClick={() => del(entry)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
