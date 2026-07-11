import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import LinkForm from './components/LinkForm.jsx';
import ResultCard from './components/ResultCard.jsx';
import LinkHistory from './components/LinkHistory.jsx';

export default function App() {
  const [result, setResult] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const handleCreated = (data) => {
    setResult(data);
    setHistoryKey((k) => k + 1);
  };

  const handleDeleted = () => {
    setResult(null);
    setHistoryKey((k) => k + 1);
  };

  return (
    <div className="page">
      <div className="masthead">
        <div className="masthead-badge"><ShieldAlert size={22} /></div>
        <div>
          <h1>SlugStream</h1>
          <span className="tag">Case File // URL Shortener</span>
        </div>
      </div>

      <p className="tagline">
        Make your URLs look <b>freaky</b> with a custom phrase — the redirect itself
        stays clean, deterministic, and safe under the hood.
      </p>

      <LinkForm onCreated={handleCreated} />

      {result && (
        <ResultCard
          slug={result.slug}
          deleteToken={result.deleteToken}
          expiresAt={result.expiresAt}
          freaky={result.freaky}
          onDeleted={handleDeleted}
        />
      )}

      <div className="section-label">Your links on this device</div>
      <LinkHistory refreshKey={historyKey} />
    </div>
  );
}
