import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import LinkForm from './components/LinkForm.jsx';
import ResultCard from './components/ResultCard.jsx';
import LinkHistory from './components/LinkHistory.jsx';
import Dashboard from './components/Dashboard.jsx';

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
          <h1>Aliasly</h1>
          <span className="tag">Custom Short Links // Case File</span>
        </div>
      </div>

      <p className="tagline">
        Give your links a <b>custom short alias</b> — pick a memorable phrase,
        and the redirect stays clean, deterministic, and safe under the hood.
      </p>

      <LinkForm onCreated={handleCreated} />

      {result && (
        <ResultCard
          slug={result.slug}
          deleteToken={result.deleteToken}
          expiresAt={result.expiresAt}
          hasPassword={result.hasPassword}
          longUrl={result.longUrl}
          onDeleted={handleDeleted}
        />
      )}

      <Dashboard refreshKey={historyKey} />

      <div className="section-label">Your links on this device</div>
      <LinkHistory refreshKey={historyKey} onChanged={() => setHistoryKey((k) => k + 1)} />
    </div>
  );
}
