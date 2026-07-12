import { Copy, QrCode, Trash2, Clock, MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { FRONTEND_BASE, API_URL } from '../config/constants.js';
import { removeFromHistory } from '../utils/history.js';
import { useToast } from './Toast.jsx';

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'Never expires';
  const d = new Date(expiresAt);
  return `Expires ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ResultCard({ slug, deleteToken, expiresAt, onDeleted }) {
  const full = `${FRONTEND_BASE}/${slug}`;
  const [showQr, setShowQr] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const showToast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      showToast('Copied to clipboard', { tone: 'success' });
    } catch {
      showToast('Could not copy — copy it manually', { tone: 'error' });
    }
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

  if (deleted) return null;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(full)}`;

  return (
    <div className="case-file">
      <div className="case-file-top">
        <div>
          <span className="redact-bar">CASE FILE // NEW LINK</span>
          <div className="slug-line">{full}</div>
        </div>
        <span className="stamp live">Live</span>
      </div>

      <div className="case-file-meta">
        <span><Clock size={13} /> {formatExpiry(expiresAt)}</span>
        <span><MousePointerClick size={13} /> 0 clicks so far</span>
      </div>

      <div className="case-file-actions">
        <button className="ghost" onClick={copy}><Copy size={14} /> Copy</button>
        <button className="ghost" onClick={() => setShowQr((v) => !v)}>
          <QrCode size={14} /> {showQr ? 'Hide QR' : 'Show QR'}
        </button>
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
