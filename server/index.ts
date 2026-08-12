import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { storeFromEnv, hashIp, CodeTaken, Link } from './store';
import { qrSvg, qrPng } from './qr';

const app = express();
// Behind a reverse proxy (e.g. Appwrite Sites) trust X-Forwarded-* so
// req.protocol / req.ip reflect the real client request.
app.set('trust proxy', true);
app.use(express.json({ limit: '16kb' }));
// --- Security headers -------------------------------------------------------
// A link shortener is a redirect engine, so it is an attractive target for
// clickjacking and injected script. These headers are set before any route so
// they apply to redirects, API responses, QR images and static assets alike.
//
// The CSP is deliberately explicit rather than permissive: it allows the app's
// own bundle, the consent-gated Google tag (which only ever loads after the
// visitor opts in), and nothing else. `object-src 'none'` and
// `frame-ancestors 'none'` remove plugin and framing attack surface.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Only same-origin scripts plus the consent-gated Google tag, which is never
  // fetched unless the visitor opts in. No 'unsafe-inline': the built HTML has
  // no executable inline script, so allowing it would only help an attacker.
  "script-src 'self' https://www.googletagmanager.com",
  // The consent panel styles itself from one injected <style> element and the
  // typefaces come from Google Fonts, so both are allowed here.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  next();
});


// Directory containing the built client (overridable for bundled deploys).
const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');
app.use(express.static(CLIENT_DIST));

const store = storeFromEnv();               // throws rather than start without persistence
const IP_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex');

// Route names that must never be usable as a short code/alias.
const RESERVED_CODES = new Set(['api', 'admin', 'static', 'assets', 'qr', 'health', 'favicon.ico']);
const ALIAS_RE = /^[A-Za-z0-9_-]{1,32}$/;

function generateCode(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 7);
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

/**
 * Admin auth, fail-closed.
 *
 * This used to wave everyone through when ADMIN_API_KEY was unset — and it was unset in
 * production, so anybody could list every link in the database or delete them. A missing key
 * now disables the endpoints entirely instead of unlocking them.
 */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
if (!ADMIN_API_KEY) {
  console.warn('[url-shortener] ADMIN_API_KEY not set — admin endpoints are DISABLED (503).');
}
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: 'Admin API is not configured on this deployment' });
  }
  const given = req.get('x-api-key') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_API_KEY);
  // constant-time compare, so a wrong key cannot be discovered a byte at a time
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

function publicBase(req: express.Request): string {
  const host = req.get('host') || '';
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  // Some reverse proxies terminate TLS upstream and report the internal hop as plain
  // http, so for non-local hosts we always advertise https.
  const protocol = isLocalHost ? req.protocol : 'https';
  return `${protocol}://${host}`;
}

const publicLink = (l: Link) => ({
  code: l.code,
  target: l.target,
  createdAt: l.createdAt,
  expiresAt: l.expiresAt ?? null,
  clicks: l.clicks,
  custom: l.custom,
  lastClick: l.lastClick ?? null,
});

/* ----------------------------------------------------------------- create */

app.post('/api/shorten', async (req, res, next) => {
  try {
    const { url, alias, expiresIn } = req.body ?? {};

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (typeof url !== 'string' || url.length > 2048) {
      return res.status(400).json({ error: 'URL is too long (2048 characters max)' });
    }
    if (!isSafeHttpUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL (only http/https links are allowed)' });
    }
    if (alias !== undefined && alias !== '' &&
        (typeof alias !== 'string' || !ALIAS_RE.test(alias) ||
         RESERVED_CODES.has(alias.toLowerCase()))) {
      return res.status(400).json({
        error: 'Invalid alias (use 1-32 letters, numbers, - or _; some names are reserved)',
      });
    }
    if (expiresIn !== undefined && expiresIn !== null &&
        (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0)) {
      return res.status(400).json({ error: 'Invalid expiresIn' });
    }

    const now = Date.now();
    const link: Link = {
      code: alias || generateCode(),
      target: url,
      createdAt: now,
      expiresAt: expiresIn ? now + expiresIn * 1000 : undefined,
      clicks: 0,
      custom: !!alias,
    };

    // A generated code can collide with an existing one; retry a few times before failing.
    for (let attempt = 0; ; attempt++) {
      try {
        await store.create(link);
        break;
      } catch (err) {
        if (!(err instanceof CodeTaken)) throw err;
        if (alias) return res.status(409).json({ error: 'Alias already taken' });
        if (attempt >= 4) return res.status(503).json({ error: 'Could not allocate a code, try again' });
        link.code = generateCode();
      }
    }

    const base = publicBase(req);
    res.status(201).json({
      shortUrl: `${base}/${link.code}`,
      shortCode: link.code,
      originalUrl: url,
      qrSvg: `${base}/api/qr/${link.code}.svg`,
      qrPng: `${base}/api/qr/${link.code}.png`,
      expiresAt: link.expiresAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ stats */

app.get('/api/stats/:code', async (req, res, next) => {
  try {
    const link = await store.get(req.params.code);
    if (!link) return res.status(404).json({ error: 'Not found' });
    const clicksByDay = await store.clicksByDay(req.params.code);
    res.json({ ...publicLink(link), clicksByDay });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------------- qr */

app.get('/api/qr/:code.:ext(svg|png)', async (req, res, next) => {
  try {
    const { code, ext } = req.params as { code: string; ext: string };
    const link = await store.get(code);
    if (!link) return res.status(404).json({ error: 'Not found' });
    const target = `${publicBase(req)}/${code}`;
    res.set('Cache-Control', 'public, max-age=86400');
    if (ext === 'svg') {
      res.type('image/svg+xml').send(await qrSvg(target));
    } else {
      res.type('image/png').send(await qrPng(target));
    }
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ admin */

app.get('/api/urls', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 100);
    res.json((await store.list(limit)).map(publicLink));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/urls/:code', requireAdmin, async (req, res, next) => {
  try {
    const gone = await store.remove(req.params.code);
    if (!gone) return res.status(404).json({ error: 'Not found' });
    res.json({ status: 'deleted' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', async (_req, res, next) => {
  try {
    const h = await store.health();
    res.status(h.ok ? 200 : 503).json({ ...h, admin: ADMIN_API_KEY ? 'configured' : 'disabled' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- redirect */

app.get('/:code', async (req, res, next) => {
  try {
    const link = await store.get(req.params.code);
    if (!link) return res.status(404).sendFile(path.join(CLIENT_DIST, 'index.html'));

    if (link.expiresAt && Date.now() > link.expiresAt) {
      await store.remove(req.params.code);
      return res.status(410).json({ error: 'Link expired' });
    }
    // Defense in depth: never redirect to a non-http(s) target.
    if (!isSafeHttpUrl(link.target)) {
      return res.status(400).json({ error: 'Unsafe redirect target' });
    }

    // Answer the visitor first; the click is recorded without making them wait, and a
    // logging failure must never break the redirect itself.
    res.redirect(302, link.target);
    store
      .recordClick(req.params.code, {
        ts: Date.now(),
        ua: req.get('user-agent') || '',
        referer: req.get('referer') || '',
        ipHash: hashIp(req.ip || '', IP_SALT),
      })
      .catch((err) => console.error('[url-shortener] click log failed:', err?.message || err));
  } catch (err) {
    next(err);
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[url-shortener]', err?.message || err);
  res.status(500).json({ error: 'Internal error' });
});

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    const h = await store.health();
    console.log(`URL Shortener on port ${PORT} — store: ${h.driver} (${h.ok ? 'ok' : 'FAILING'}: ${h.detail}), ` +
                `admin: ${ADMIN_API_KEY ? 'key required' : 'disabled'}`);
  });
}

export default app;
