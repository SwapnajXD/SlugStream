import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowRight, Clock, SearchX, ShieldAlert, Lock } from 'lucide-react';
import { API_URL } from '../config/constants.js';

const STATES = {
  loading: { icon: Loader2, spin: true, title: 'Resolving link…' },
  redirecting: { icon: ArrowRight, spin: false, title: 'Redirecting…' },
  password: { icon: Lock, spin: false, title: 'This link is password protected' },
  expired: { icon: Clock, spin: false, title: 'This link has expired' },
  notfound: { icon: SearchX, spin: false, title: 'Link not found' },
  error: { icon: ShieldAlert, spin: false, title: 'Something went wrong' },
};

export default function RedirectPage() {
  const { slug } = useParams();
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/resolve/${slug}`);
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.longUrl) {
          setState('redirecting');
          window.location.replace(data.longUrl);
        } else if (res.status === 401 && data.passwordRequired) {
          setState('password');
        } else if (res.status === 410) {
          setState('expired');
        } else if (res.status === 404) {
          setState('notfound');
        } else {
          setState('error');
          setMessage(data.error || '');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const unlock = async (e) => {
    e.preventDefault();
    setMessage('');
    setUnlocking(true);
    try {
      const res = await fetch(`${API_URL}/api/unlock/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.longUrl) {
        window.location.replace(data.longUrl);
      } else {
        setMessage(data.error || 'Incorrect password');
      }
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  const { icon: Icon, spin, title } = STATES[state];
  const showHomeLink = state === 'expired' || state === 'notfound' || state === 'error';

  return (
    <div className="page redirect-screen">
      <div>
        <Icon size={32} className={spin ? 'spin' : ''} />
        <h2>{title}</h2>

        {state === 'password' && (
          <form onSubmit={unlock} className="unlock-form">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button type="submit" className="primary" disabled={unlocking}>
              {unlocking ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        )}

        {message && <p className="hint-label">{message}</p>}
        {showHomeLink && (
          <Link to="/" className="ghost-link">Create a new short link</Link>
        )}
      </div>
    </div>
  );
}