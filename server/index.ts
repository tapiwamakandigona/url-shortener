import express from 'express';
import crypto from 'crypto';
import path from 'path';

const app = express();
// Behind a reverse proxy (e.g. Appwrite Sites) trust X-Forwarded-* so
// req.protocol / req.ip reflect the real client request.
app.set('trust proxy', true);
app.use(express.json());

// Directory containing the built client (overridable for bundled deploys).
const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));

interface ShortenedUrl {
  id: string;
  originalUrl: string;
  shortCode: string;
  customAlias?: string;
  clicks: number;
  clickLog: Array<{ timestamp: number; userAgent: string; referer: string; ip: string }>;
  createdAt: number;
  expiresAt?: number;
}

const urls = new Map<string, ShortenedUrl>();

// Route names that must never be usable as a short code/alias.
const RESERVED_CODES = new Set(['api', 'admin', 'static', 'assets']);
const ALIAS_RE = /^[A-Za-z0-9_-]{1,32}$/;

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6);
}

// Only allow real web links as redirect targets — blocks javascript:, data:,
// vbscript:, file:, etc. which could be used for XSS / phishing.
function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Optional admin auth for list/delete. If ADMIN_API_KEY is set, those endpoints
// require a matching X-API-Key header; otherwise they stay open (with a warning).
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
if (!ADMIN_API_KEY) {
  console.warn('[url-shortener] ADMIN_API_KEY not set — /api/urls list & delete are unauthenticated.');
}
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_API_KEY) return next();
  if (req.get('x-api-key') === ADMIN_API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Create short URL
app.post('/api/shorten', (req, res) => {
  const { url, alias, expiresIn } = req.body;
  
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  if (!isSafeHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL (only http/https links are allowed)' });
  }

  if (alias !== undefined && alias !== '' && (!ALIAS_RE.test(alias) || RESERVED_CODES.has(String(alias).toLowerCase()))) {
    return res.status(400).json({ error: 'Invalid alias (use 1-32 letters, numbers, - or _; some names are reserved)' });
  }

  if (expiresIn !== undefined && (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0)) {
    return res.status(400).json({ error: 'Invalid expiresIn' });
  }

  const shortCode = alias || generateCode();
  
  if (urls.has(shortCode)) {
    return res.status(409).json({ error: 'Alias already taken' });
  }
  
  const entry: ShortenedUrl = {
    id: crypto.randomUUID(),
    originalUrl: url,
    shortCode,
    customAlias: alias,
    clicks: 0,
    clickLog: [],
    createdAt: Date.now(),
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };
  
  urls.set(shortCode, entry);
  
  // Build the public short URL. Some reverse proxies (e.g. Appwrite Sites)
  // terminate TLS upstream and report the internal hop as plain http, so for
  // non-local hosts we always advertise https.
  const host = req.get('host') || '';
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = isLocalHost ? req.protocol : 'https';

  res.status(201).json({
    shortUrl: `${protocol}://${host}/${shortCode}`,
    shortCode,
    originalUrl: url,
  });
});

// Get URL stats
app.get('/api/stats/:code', (req, res) => {
  const entry = urls.get(req.params.code);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  
  const { clickLog, ...stats } = entry;
  const clicksByDay = clickLog.reduce((acc, click) => {
    const day = new Date(click.timestamp).toISOString().split('T')[0];
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  res.json({ ...stats, clicksByDay });
});

// List all URLs
app.get('/api/urls', requireAdmin, (req, res) => {
  const all = Array.from(urls.values()).map(({ clickLog, ...rest }) => rest);
  res.json(all.sort((a, b) => b.createdAt - a.createdAt));
});

// Delete URL
app.delete('/api/urls/:code', requireAdmin, (req, res) => {
  if (urls.delete(req.params.code)) {
    res.json({ status: 'deleted' });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Redirect
app.get('/:code', (req, res) => {
  const entry = urls.get(req.params.code);
  
  if (!entry) return res.status(404).sendFile(path.join(CLIENT_DIST, 'index.html'));
  
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    urls.delete(req.params.code);
    return res.status(410).json({ error: 'Link expired' });
  }
  
  // Defense in depth: never redirect to a non-http(s) target.
  if (!isSafeHttpUrl(entry.originalUrl)) {
    return res.status(400).json({ error: 'Unsafe redirect target' });
  }

  entry.clicks++;
  entry.clickLog.push({
    timestamp: Date.now(),
    userAgent: req.get('user-agent') || '',
    referer: req.get('referer') || '',
    ip: req.ip || '',
  });
  
  res.redirect(301, entry.originalUrl);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`URL Shortener running on port ${PORT}`));
