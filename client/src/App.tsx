import { useState, useEffect, useCallback } from 'react';
import './App.css';

/** A link this browser created. The admin list is key-gated (as it should be), so the page
 *  remembers your own links locally instead of asking the server for everybody's. */
interface Mine {
  code: string;
  shortUrl: string;
  target: string;
  createdAt: number;
}

interface Stats {
  code: string;
  target: string;
  clicks: number;
  createdAt: number;
  expiresAt: number | null;
  lastClick: number | null;
  clicksByDay: Record<string, number>;
}

const STORAGE = 'url.tapiwa.me/mine';

function loadMine(): Mine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function relative(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** 14-day click sparkline, drawn as an inline SVG — analytics were collected from day one
 *  and never shown to anyone. */
function Sparkline({ byDay }: { byDay: Record<string, number> }) {
  const days: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day, n: byDay[day] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  const W = 220, H = 40, gap = 3;
  const bw = (W - gap * (days.length - 1)) / days.length;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`Clicks per day over the last 14 days, peak ${max}`}>
      {days.map((d, i) => {
        const h = d.n === 0 ? 1.5 : Math.max(3, (d.n / max) * H);
        return (
          <rect key={d.day} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5}
                className={d.n ? 'on' : 'off'}>
            <title>{`${d.day}: ${d.n} click${d.n === 1 ? '' : 's'}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Row({ mine, onForget }: { mine: Mine; onForget: (code: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats/${encodeURIComponent(mine.code)}`);
      if (res.status === 404) return setGone(true);
      if (res.ok) setStats(await res.json());
    } catch {
      /* offline is not an error worth shouting about */
    }
  }, [mine.code]);

  useEffect(() => { load(); }, [load]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(mine.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked; the field is selectable anyway */ }
  }

  return (
    <li className={`row${gone ? ' is-gone' : ''}`}>
      <div className="row-main">
        <div className="row-link">
          <a className="code" href={mine.shortUrl} target="_blank" rel="noopener">
            /{mine.code}
          </a>
          <span className="target" title={mine.target}>{mine.target}</span>
        </div>
        <div className="row-meta">
          {gone ? <span className="pill pill-gone">deleted</span> : (
            <>
              <span className="clicks"><strong>{stats?.clicks ?? '—'}</strong> clicks</span>
              <span className="dot" aria-hidden="true">·</span>
              <span className="age">{relative(mine.createdAt)}</span>
            </>
          )}
        </div>
      </div>
      <div className="row-actions">
        <button type="button" onClick={copy} className="ghost">{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="ghost"
                aria-expanded={open}>{open ? 'Hide' : 'Details'}</button>
        <button type="button" onClick={() => onForget(mine.code)} className="ghost quiet"
                title="Remove from this list (the link keeps working)">Forget</button>
      </div>

      {open && (
        <div className="detail">
          <div className="detail-qr">
            <img src={`/api/qr/${encodeURIComponent(mine.code)}.svg`} width={132} height={132}
                 alt={`QR code for ${mine.shortUrl}`} loading="lazy" />
            <a className="ghost" href={`/api/qr/${encodeURIComponent(mine.code)}.png`}
               download={`${mine.code}-qr.png`}>Download PNG</a>
          </div>
          <div className="detail-stats">
            <div className="spark-wrap">
              <span className="spark-label">clicks · last 14 days</span>
              <Sparkline byDay={stats?.clicksByDay ?? {}} />
            </div>
            <dl>
              <div><dt>Total clicks</dt><dd>{stats?.clicks ?? 0}</dd></div>
              <div><dt>Last click</dt><dd>{stats?.lastClick ? relative(stats.lastClick) : 'never'}</dd></div>
              <div><dt>Created</dt><dd>{new Date(mine.createdAt).toLocaleDateString()}</dd></div>
              <div><dt>Expires</dt>
                <dd>{stats?.expiresAt ? new Date(stats.expiresAt).toLocaleString() : 'never'}</dd></div>
            </dl>
            <button type="button" className="ghost" onClick={load}>Refresh</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [expiry, setExpiry] = useState('');
  const [mine, setMine] = useState<Mine[]>(loadMine);
  const [result, setResult] = useState<Mine | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(mine.slice(0, 50)));
  }, [mine]);

  // net.js wires up on DOMContentLoaded, which fires before React has rendered the canvas;
  // NET_BOOT is idempotent, so calling it after mount is what actually lights the field.
  useEffect(() => {
    (window as any).NET_BOOT?.();
  }, []);

  async function shorten(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { url: url.trim() };
      if (alias.trim()) body.alias = alias.trim();
      if (expiry) body.expiresIn = Number(expiry);
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const entry: Mine = {
        code: data.shortCode,
        shortUrl: data.shortUrl,
        target: data.originalUrl,
        createdAt: Date.now(),
      };
      setResult(entry);
      setMine((prev) => [entry, ...prev.filter((m) => m.code !== entry.code)]);
      setUrl(''); setAlias(''); setExpiry('');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const forget = (code: string) => setMine((prev) => prev.filter((m) => m.code !== code));

  return (
    <>
      <div className="stage" aria-hidden="true">
        <canvas data-field="page" data-arch="3,6,4,2" data-seed="17" data-accent="#5db8a6"></canvas>
      </div>

      <header className="nav">
        <a className="brand" href="https://tapiwa.me/">
          <span className="mark" aria-hidden="true">✳</span>Tapiwa Makandigona
        </a>
        <nav>
          <a href="https://tapiwa.me/#work">Work</a>
          <a href="https://github.com/tapiwamakandigona/url-shortener" target="_blank" rel="noopener">Source</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">url.tapiwa.me</p>
          <h1>Short links that<br />keep working.</h1>
          <p className="lede">
            Paste a long link, get a short one — with a real QR code and a click count that
            survives a restart, because the links live in a database, not in memory.
          </p>

          <form onSubmit={shorten} className="card">
            <label className="field">
              <span>Long URL</span>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                     placeholder="https://example.com/a/very/long/path" required
                     autoComplete="off" spellCheck={false} />
            </label>
            <div className="field-pair">
              <label className="field">
                <span>Custom alias <em>optional</em></span>
                <input value={alias} onChange={(e) => setAlias(e.target.value)}
                       placeholder="launch-day" pattern={"[A-Za-z0-9_\\-]{1,32}"}
                       autoComplete="off" spellCheck={false} />
              </label>
              <label className="field">
                <span>Expires <em>optional</em></span>
                <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                  <option value="">Never</option>
                  <option value="3600">In 1 hour</option>
                  <option value="86400">In 1 day</option>
                  <option value="604800">In 1 week</option>
                  <option value="2592000">In 30 days</option>
                </select>
              </label>
            </div>
            <button type="submit" className="primary" disabled={busy || !url.trim()}>
              {busy ? 'Shortening…' : 'Shorten it'}
            </button>
            {error && <p className="error" role="alert">{error}</p>}
          </form>

          {result && (
            <div className="result" role="status">
              <div className="result-text">
                <p className="result-label">Your short link</p>
                <a className="result-url" href={result.shortUrl} target="_blank" rel="noopener">
                  {result.shortUrl.replace(/^https?:\/\//, '')}
                </a>
              </div>
              <img className="result-qr" src={`/api/qr/${encodeURIComponent(result.code)}.svg`}
                   width={104} height={104} alt={`QR code for ${result.shortUrl}`} />
            </div>
          )}
        </section>

        <section className="section">
          <h2>Your links</h2>
          {mine.length === 0 ? (
            <p className="empty">
              Nothing yet. Links you create appear here with their click history — kept in this
              browser, since the full list is behind an admin key.
            </p>
          ) : (
            <ul className="rows">
              {mine.map((m) => <Row key={m.code} mine={m} onForget={forget} />)}
            </ul>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>
          Built by <a href="https://tapiwa.me/">Tapiwa Makandigona</a> · Kwekwe, Zimbabwe 🇿🇼
        </p>
        <p className="fine">
          Clicks are counted with a salted hash of the visitor's IP — never the address itself.
        </p>
      </footer>
    </>
  );
}
