/** Verify the DEPLOYED preview: create, redirect, analytics, QR decode, admin fail-closed.
 *  Cleans up after itself so the database is left as it was found. */
const BASE = process.argv[2];
const ADMIN = process.env.PREVIEW_ADMIN;
let fails = 0;
const check = (label, ok, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`); };
const api = async (p, o = {}) => { const r = await fetch(BASE + p, o); const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 120); } return { status: r.status, body: b, headers: r.headers }; };

const alias = `preview-${Date.now().toString(36)}`;
const made = await api('/api/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://tapiwa.me/zldc/', alias }) });
check('create link on the deployed site', made.status === 201, `status ${made.status}`);
const code = made.body.shortCode;

const hit = await fetch(`${BASE}/${code}`, { redirect: 'manual' });
check('redirect works', hit.status === 302 && hit.headers.get('location') === 'https://tapiwa.me/zldc/', `status ${hit.status}`);
await new Promise(r => setTimeout(r, 2500));

const stats = await api(`/api/stats/${code}`);
check('click counted in the database', stats.body.clicks >= 1, `clicks=${stats.body.clicks}`);
const today = new Date().toISOString().slice(0, 10);
check('per-day analytics returned', !!stats.body.clicksByDay?.[today], JSON.stringify(stats.body.clicksByDay));

const png = await fetch(`${BASE}/api/qr/${code}.png`);
const buf = Buffer.from(await png.arrayBuffer());
const { PNG } = await import('pngjs');
const jsQRmod = await import('jsqr');
const jsQR = jsQRmod.default ?? jsQRmod;
const img = PNG.sync.read(buf);
const decoded = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
check('QR from the deployed site decodes', !!decoded, decoded ? decoded.data : 'no decode');
check('QR points at the short link', decoded?.data?.endsWith(`/${code}`), decoded?.data);

const anon = await api('/api/urls');
check('admin list rejects anonymous', anon.status === 401, `status ${anon.status}`);
const authed = await api('/api/urls', { headers: { 'x-api-key': ADMIN } });
check('admin list works with the key', authed.status === 200 && Array.isArray(authed.body), `status ${authed.status}`);

const del = await api(`/api/urls/${code}`, { method: 'DELETE', headers: { 'x-api-key': ADMIN } });
check('cleanup: deleted', del.status === 200);
console.log(`\nFAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
