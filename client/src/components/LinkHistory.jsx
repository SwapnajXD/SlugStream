import { useEffect, useState } from 'react';
import { Trash2, MousePointerClick, Clock, FolderClock, Lock, Pencil, Check, X, Share2 } from 'lucide-react';
import { API_URL, FRONTEND_BASE } from '../config/constants.js';
import { removeFromHistory } from '../utils/history.js';
import { getFaviconUrl, getHostname } from '../utils/linkPreview.js';
import { useLinkHistoryMeta } from '../hooks/useLinkHistoryMeta.js';
import { validateUrl } from '../utils/validation.js';
import { canWebShare, webShare } from '../utils/share.js';
import { useToast } from './Toast.jsx';

export default function LinkHistory({ refreshKey, onChanged }) {
  const { entries, meta, loading } = useLinkHistoryMeta(refreshKey);
  const [editingSlug, setEditingSlug] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [localEntries, setLocalEntries] = useState(null);
  const showToast = useToast();

  useEffect(() => {
    setLocalEntries(null);
  }, [refreshKey]);

  const list = localEntries ?? entries;

  const share = async (entry) => {
    const ok = await webShare({ title: 'Aliasly link', url: `${FRONTEND_BASE}/${entry.slug}` });
    if (!ok) showToast('Could not open the share sheet', { tone: 'error' });
  };

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
      setLocalEntries((list ?? entries).filter((e) => e.slug !== entry.slug));
      showToast('Link deleted', { tone: 'success' });
      onChanged?.();
    } catch (err) {
      showToast(err.message, { tone: 'error' });
    }
  };

  const startEdit = (entry) => {
    setEditingSlug(entry.slug);
    setEditValue(entry.longUrl);
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setEditValue('');
  };

  const saveEdit = async (entry) => {
    if (!validateUrl(editValue)) {
      showToast('Please enter a valid http(s) URL', { tone: 'error' });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/urls/${entry.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteToken: entry.deleteToken, longUrl: editValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      const updated = (list ?? entries).map((e) =>
        e.slug === entry.slug ? { ...e, longUrl: editValue } : e
      );
      setLocalEntries(updated);
      showToast('Destination updated', { tone: 'success' });
      cancelEdit();
    } catch (err) {
      showToast(err.message, { tone: 'error' });
    }
  };

  if (!loading && list.length === 0) {
    return (
      <div className="history-empty">
        <FolderClock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        No links yet on this device. Create one above.
      </div>
    );
  }

  return (
    <div>
      {list.map((entry) => {
        const m = meta[entry.slug];
        const expired = m?.expired;
        const isEditing = editingSlug === entry.slug;
        const favicon = getFaviconUrl(entry.longUrl);

        return (
          <div key={entry.slug} className={`history-item ${expired ? 'expired' : ''}`}>
            <div className="history-item-main">
              <div className="slug">
                {FRONTEND_BASE}/{entry.slug}
                {m?.hasPassword && <Lock size={11} className="lock-badge" title="Password protected" />}
              </div>

              {isEditing ? (
                <div className="edit-row">
                  <input
                    type="url"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="https://new-destination.com"
                  />
                  <button className="icon-btn" title="Save" onClick={() => saveEdit(entry)}><Check size={14} /></button>
                  <button className="icon-btn" title="Cancel" onClick={cancelEdit}><X size={14} /></button>
                </div>
              ) : (
                <div className="long-url">
                  {favicon && <img src={favicon} alt="" width={14} height={14} className="favicon" />}
                  <span>{getHostname(entry.longUrl) || entry.longUrl}</span>
                </div>
              )}

              <div className="stats">
                <span><MousePointerClick size={11} /> {m ? m.clicks : '…'} clicks</span>
                <span><Clock size={11} /> {expired ? 'Expired' : (entry.expiresAt ? 'Expires' : 'Never expires')}</span>
              </div>
            </div>
            <div className="history-item-right">
              {!isEditing && (
                <button className="icon-btn" title="Edit destination" onClick={() => startEdit(entry)}>
                  <Pencil size={14} />
                </button>
              )}
              {canWebShare() && (
                <button className="icon-btn" title="Share link" onClick={() => share(entry)}>
                  <Share2 size={14} />
                </button>
              )}
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
