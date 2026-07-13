import { Copy, QrCode, Trash2, Clock, MousePointerClick, Lock, Pencil, Check, X, Share2 } from 'lucide-react';
import { useState } from 'react';
import { FRONTEND_BASE, API_URL } from '../config/constants.js';
import { removeFromHistory } from '../utils/history.js';
import { getFaviconUrl, getHostname } from '../utils/linkPreview.js';
import { validateUrl } from '../utils/validation.js';
import { canWebShare, webShare } from '../utils/share.js';
import { useToast } from './Toast.jsx';

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'Never expires';
  const d = new Date(expiresAt);
  return `Expires ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ResultCard({ slug, deleteToken, expiresAt, hasPassword, longUrl, onDeleted }) {
  const full = `${FRONTEND_BASE}/${slug}`;
  const [showQr, setShowQr] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(longUrl || '');
  const [currentUrl, setCurrentUrl] = useState(longUrl || '');
  const showToast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      showToast('Copied to clipboard', { tone: 'success' });
    } catch {
      showToast('Could not copy — copy it manually', { tone: 'error' });
    }
  };

  const share = async () => {
    const ok = await webShare({ title: 'Aliasly link', url: full });
    if (!ok) showToast('Could not open the share sheet', { tone: 'error' });
  };

  const del = async () => {
    if (!deleteToken) return;
    try {
      const res = await fetch(`${API_URL}/api/urls/${slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      removeFromHistory(slug);
      setDeleted(true);
      showToast('Link deleted', { tone: 'success' });
      onDeleted?.(slug);
    } catch (err) {
      showToast(err.message, { tone: 'error' });
    }
  };

  const saveEdit = async () => {
    if (!validateUrl(editValue)) {
      showToast('Please enter a valid http(s) URL', { tone: 'error' });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/urls/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteToken, longUrl: editValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setCurrentUrl(editValue);
      setEditing(false);
      showToast('Destination updated', { tone: 'success' });
    } catch (err) {
      showToast(err.message, { tone: 'error' });
    }
  };

  if (deleted) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(full)}`;
  const favicon = getFaviconUrl(currentUrl);

  return (
    <div className="case-file">
      <div className="case-file-top">
        <div>
          <span className="redact-bar">CASE FILE // NEW LINK</span>
          <div className="slug-line">{full}</div>
          {currentUrl && (
            <div className="long-url" style={{ marginTop: 6 }}>
              {favicon && <img src={favicon} alt="" width={14} height={14} className="favicon" />}
              <span>{getHostname(currentUrl) || currentUrl}</span>
            </div>
          )}
        </div>
        <div className="stamp-stack">
          <span className="stamp live">Live</span>
          {hasPassword && <span className="stamp locked"><Lock size={11} /> Locked</span>}
        </div>
      </div>

      {editing && (
        <div className="edit-row" style={{ marginTop: 10 }}>
          <input
            type="url"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="https://new-destination.com"
          />
          <button className="icon-btn" title="Save" onClick={saveEdit}><Check size={14} /></button>
          <button className="icon-btn" title="Cancel" onClick={() => setEditing(false)}><X size={14} /></button>
        </div>
      )}

      <div className="case-file-meta">
        <span><Clock size={13} /> {formatExpiry(expiresAt)}</span>
        <span><MousePointerClick size={13} /> 0 clicks so far</span>
      </div>

      <div className="case-file-actions">
        <button className="ghost" onClick={copy}><Copy size={14} /> Copy</button>
        {canWebShare() && (
          <button className="ghost" onClick={share}><Share2 size={14} /> Share</button>
        )}
        <button className="ghost" onClick={() => setShowQr((v) => !v)}>
          <QrCode size={14} /> {showQr ? 'Hide QR' : 'Show QR'}
        </button>
        {deleteToken && !editing && (
          <button className="ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
        )}
        {deleteToken && (
          <button className="ghost" onClick={del}><Trash2 size={14} /> Delete</button>
        )}
      </div>

      {showQr && (
        <div className="qr-wrap">
          <img src={qrUrl} alt={`QR code for ${full}`} width={140} height={140} />
          <span className="hint-label">Scan to open this link</span>
        </div>
      )}
    </div>
  );
}
