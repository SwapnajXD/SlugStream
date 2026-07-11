import { useMemo, useState } from 'react';
import { Link2, Tag, Send, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config/constants.js';
import { validateUrl } from '../utils/validation.js';
import { calculateFreakyScore } from '../utils/freakyCalculator.js';
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
  const showToast = useToast();

  const freaky = useMemo(() => calculateFreakyScore(phrase), [phrase]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateUrl(longUrl)) {
      setError('Please enter a valid http(s) URL');
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
      onCreated({ ...data, longUrl, freaky });
      showToast('Freaky link created', { tone: 'success' });
      setPhrase('');
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
        <label htmlFor="phrase">Freaky phrase (optional)</label>
        <div className="input-row">
          <Tag size={16} />
          <input
            id="phrase"
            type="text"
            placeholder="totally-not-a-virus"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="freaky-meter">
          <div className="freaky-bar">
            <div
              className={`freaky-bar-fill ${freaky.tier}`}
              style={{ width: `${freaky.score}%` }}
            />
          </div>
          <span className="freaky-label">{freaky.label}</span>
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

      <button type="submit" className="primary" disabled={busy}>
        <Send size={15} />
        {busy ? 'Creating…' : 'Create freaky URL'}
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
