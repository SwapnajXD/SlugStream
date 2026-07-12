import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowRight, Clock, SearchX, ShieldAlert } from 'lucide-react';
import { API_URL } from '../config/constants.js';

const STATES = {
  loading: { icon: Loader2, spin: true, title: 'Resolving link…' },
  redirecting: { icon: ArrowRight, spin: false, title: 'Redirecting…' },
  expired: { icon: Clock, spin: false, title: 'This link has expired' },
  notfound: { icon: SearchX, spin: false, title: 'Link not found' },
  error: { icon: ShieldAlert, spin: false, title: 'Something went wrong' },
};

export default function RedirectPage() {
  const { slug } = useParams();
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');

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

  const { icon: Icon, spin, title } = STATES[state];
  const showHomeLink = state === 'expired' || state === 'notfound' || state === 'error';

  return (
    <div className="page redirect-screen">
      <div>
        <Icon size={32} className={spin ? 'spin' : ''} />
        <h2>{title}</h2>
        {message && <p className="hint-label">{message}</p>}
        {showHomeLink && (
          <Link to="/" className="ghost-link">Create a new short link</Link>
        )}
      </div>
    </div>
  );
}