import { useEffect, useMemo, useState } from 'react';
import { Link2, Tag, Send, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { API_URL, FRONTEND_BASE } from '../config/constants.js';
import { validateUrl } from '../utils/validation.js';
import { addToHistory } from '../utils/history.js';
import { useToast } from './Toast.jsx';

const TTL_OPTIONS = [
  { key: '1h', label: '1 hour' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'never', label: 'Never' },
];

export default function LinkForm({ onCreated }) {
  const [longUrl, setLongUrl] = useState('');
  const [phrase, setPhrase] = useState('');
  const [ttl, setTtl] = useState('never');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState(null); // null | 'checking' | 'available' | 'taken'
  const showToast = useToast();

  const normalizedPhrase = useMemo(
    () =>
      phrase
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/(^-+)|(-+$)/g, ''),
    [phrase]
  );

  const previewUrl = `${FRONTEND_BASE}/${normalizedPhrase || '…'}`;

  // Debounced live availability check against the backend
  useEffect(() => {
    if (!normalizedPhrase) {
      setAvailability(null);
      return;
    }
    setAvailability('checking');
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/available/${encodeURIComponent(normalizedPhrase)}`);
        const data = await res.json();
        setAvailability(data.available ? 'available' : 'taken');
      } catch {
        setAvailability(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [normalizedPhrase]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateUrl(longUrl)) {
      setError('Please enter a valid http(s) URL');
      return;
    }
    if (!normalizedPhrase) {
      setError('Please enter a custom phrase for your link');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longUrl, phrase, ttl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to shorten');

      addToHistory({ slug: data.slug, longUrl, deleteToken: data.deleteToken, expiresAt: data.expiresAt });
      onCreated({ ...data, longUrl });
      showToast('Link created', { tone: 'success' });
      setPhrase('');
      setAvailability(null);
    } catch (err) {
      setError(err.message);
      showToast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="link-form">
      <div className="field">
        <label htmlFor="longUrl">Long URL</label>
        <div className="input-row">
          <Link2 size={16} />
          <input
            id="longUrl"
            type="url"
            placeholder="https://example.com/very/long/path"
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="phrase">Custom phrase</label>
        <div className="input-row">
          <Tag size={16} />
          <input
            id="phrase"
            type="text"
            placeholder="my-project-launch"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="url-preview">
          {previewUrl} <span className="url-preview-count">({previewUrl.length} chars)</span>
          {availability === 'checking' && <span className="availability checking">checking…</span>}
          {availability === 'available' && (
            <span className="availability available"><CheckCircle2 size={13} /> available</span>
          )}
          {availability === 'taken' && (
            <span className="availability taken"><XCircle size={13} /> already taken</span>
          )}
        </div>
      </div>

      <div className="field">
        <label>Expires</label>
        <div className="ttl-row">
          {TTL_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.key}
              className={`ttl-chip ${ttl === opt.key ? 'active' : ''}`}
              onClick={() => setTtl(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="primary" disabled={busy || availability === 'taken'}>
        <Send size={15} />
        {busy ? 'Creating…' : 'Create short link'}
      </button>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
