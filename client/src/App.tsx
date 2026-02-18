import { useState, useEffect } from 'react';
import './App.css';

interface UrlEntry {
  id: string;
  shortCode: string;
  originalUrl: string;
  clicks: number;
  createdAt: number;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [result, setResult] = useState<{ shortUrl: string } | null>(null);
  const [urls, setUrls] = useState<UrlEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUrls();
  }, []);

  async function fetchUrls() {
    try {
      const res = await fetch('/api/urls');
      if (res.ok) setUrls(await res.json());
    } catch {}
  }

  async function shorten(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, alias: alias || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setUrl('');
      setAlias('');
      fetchUrls();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteUrl(code: string) {
    await fetch(`/api/urls/${code}`, { method: 'DELETE' });
    fetchUrls();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="app">
      <header>
        <h1>\u{1F517} URL Shortener</h1>
        <p>Shorten URLs, track clicks, share anywhere.</p>
      </header>

      <form onSubmit={shorten} className="shorten-form">
        <input type="url" placeholder="Paste your long URL here..." value={url}
          onChange={e => setUrl(e.target.value)} required />
        <input type="text" placeholder="Custom alias (optional)" value={alias}
          onChange={e => setAlias(e.target.value)} pattern="[a-zA-Z0-9-_]+" maxLength={20} />
        <button type="submit" disabled={loading}>
          {loading ? 'Shortening...' : 'Shorten'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
      
      {result && (
        <div className="result">
          <p>Your short URL:</p>
          <div className="result-url">
            <a href={result.shortUrl} target="_blank">{result.shortUrl}</a>
            <button onClick={() => copyToClipboard(result.shortUrl)}>Copy</button>
          </div>
        </div>
      )}

      <section className="url-list">
        <h2>Your URLs ({urls.length})</h2>
        {urls.map(u => (
          <div key={u.id} className="url-row">
            <div className="url-info">
              <span className="short-code">/{u.shortCode}</span>
              <a href={u.originalUrl} className="original-url" target="_blank">{u.originalUrl}</a>
            </div>
            <div className="url-stats">
              <span className="clicks">{u.clicks} clicks</span>
              <span className="date">{new Date(u.createdAt).toLocaleDateString()}</span>
              <button className="delete-btn" onClick={() => deleteUrl(u.shortCode)}>\u{1F5D1}</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
