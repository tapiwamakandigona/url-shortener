/**
 * The defect this whole rewrite exists for: links used to live in a Map, so an Appwrite
 * container recycle wiped them. Proof that they no longer do — create a link in one process,
 * kill it, start a fresh one, and resolve the link there. Run against the real database.
 *
 *   APPWRITE_PROJECT_ID=voltzw APPWRITE_API_KEY=$(cat /work/.secrets/.voltzw_key) \
 *   node server/restart.check.mjs
 */
import { spawn } from 'child_process';
import process from 'process';

const PORT = 3400 + Math.floor(Math.random() * 150);
const ADMIN = 'restart-check-key';
const TARGET = 'https://tapiwa.me/zldc/';

function start() {
  // Spawn the binary directly, in its own process group: killing `npx` leaves the real server
  // alive as a grandchild, which keeps the port bound and fakes the restart this test is about.
  const p = spawn('./node_modules/.bin/tsx', ['server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), ADMIN_API_KEY: ADMIN, IP_HASH_SALT: 'check-salt' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  return {
    proc: p,
    ready: new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 40000);
      const iv = setInterval(() => {
        if (/URL Shortener on port/.test(log)) {
          clearTimeout(t); clearInterval(iv); resolve(log.trim());
        }
      }, 300);
    }),
  };
}

const api = async (path, opt = {}) => {
  const r = await fetch(`http://localhost:${PORT}${path}`, opt);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
  return { status: r.status, body, headers: r.headers };
};

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

const first = start();
console.log('process 1:', await first.ready);

const made = await api('/api/shorten', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: TARGET, alias: `check-${Date.now().toString(36)}` }),
});
check('create link', made.status === 201, `status ${made.status}`);
const code = made.body.shortCode;

const hit1 = await api(`/${code}`, { redirect: 'manual' });
check('redirect in process 1', hit1.status === 302 && hit1.headers.get('location') === TARGET);
await new Promise((r) => setTimeout(r, 900));   // let the click write land

process.kill(-first.proc.pid, 'SIGKILL');   // the whole group
await new Promise((r) => setTimeout(r, 1200));
const gone = await api(`/${code}`).catch(() => ({ status: 'connection refused' }));
check('process 1 is really dead', gone.status === 'connection refused', String(gone.status));

const second = start();
console.log('process 2:', await second.ready);

const hit2 = await api(`/${code}`, { redirect: 'manual' });
check('SAME LINK RESOLVES AFTER RESTART', hit2.status === 302 && hit2.headers.get('location') === TARGET,
      `status ${hit2.status}`);
await new Promise((r) => setTimeout(r, 900));

const stats = await api(`/api/stats/${code}`);
const today = new Date().toISOString().slice(0, 10);
check('clicks accumulated across both processes', stats.body.clicks === 2, `clicks=${stats.body.clicks}`);
check('clicks-per-day reported', stats.body.clicksByDay?.[today] === 2,
      JSON.stringify(stats.body.clicksByDay));
check('no IP in stats payload', !JSON.stringify(stats.body).includes('127.0.0.1'));

const qr = await fetch(`http://localhost:${PORT}/api/qr/${code}.png`);
const png = Buffer.from(await qr.arrayBuffer());
check('QR png served', qr.status === 200 && png.subarray(1, 4).toString() === 'PNG', `${png.length} bytes`);

const noAuth = await api('/api/urls');
check('admin list rejects an anonymous caller', noAuth.status === 401, `status ${noAuth.status}`);
const withAuth = await api('/api/urls', { headers: { 'x-api-key': ADMIN } });
check('admin list works with the key', withAuth.status === 200 && Array.isArray(withAuth.body));

const del = await api(`/api/urls/${code}`, { method: 'DELETE', headers: { 'x-api-key': ADMIN } });
check('cleanup: link deleted', del.status === 200);
const afterDel = await api(`/api/stats/${code}`);
check('deleted link is gone', afterDel.status === 404);

// deleting a link must take its click history with it — no orphan rows, no retained visitor data
const { Client, Databases, Query } = await import('node-appwrite');
const db = new Databases(new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY));
const leftover = await db.listDocuments(process.env.APPWRITE_DB || 'voltdb', 'link_clicks',
  [Query.equal('code', code), Query.limit(5)]);
check('click history deleted with the link', leftover.total === 0, `${leftover.total} rows left`);

process.kill(-second.proc.pid, 'SIGKILL');
console.log(`\nFAILURES: ${failures}`);
process.exit(failures ? 1 : 0);
