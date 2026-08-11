/**
 * End-to-end checks against a real server process, one per defect that shipped in v1:
 *   1. links survived only until the container recycled  -> durable store + restart survival
 *   2. admin list/delete answered strangers              -> fail-closed, then key-gated
 *   3. the "QR code" was a decorative grid               -> decode the PNG we serve
 *   4. analytics were recorded and never surfaced        -> clicksByDay comes back per day
 */
import request from 'supertest';
import express from 'express';

process.env.STORE = 'memory';
process.env.NODE_ENV = 'test';

function freshApp(adminKey?: string): express.Express {
  jest.resetModules();
  if (adminKey) process.env.ADMIN_API_KEY = adminKey;
  else delete process.env.ADMIN_API_KEY;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./index').default;
}

describe('creating links', () => {
  const app = freshApp('test-key');

  it('shortens a valid https url and offers QR endpoints', async () => {
    const r = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/' });
    expect(r.status).toBe(201);
    expect(r.body.shortCode).toMatch(/^[A-Za-z0-9_-]{7}$/);
    expect(r.body.qrPng).toContain(`/api/qr/${r.body.shortCode}.png`);
  });

  it('honours a custom alias and rejects a duplicate', async () => {
    const first = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/zldc/', alias: 'zldc-pilot' });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/shorten').send({ url: 'https://example.com/', alias: 'zldc-pilot' });
    expect(second.status).toBe(409);
  });

  it.each([
    ['javascript:alert(1)', 'script url'],
    ['data:text/html,<script>', 'data url'],
    ['file:///etc/passwd', 'file url'],
    ['not a url', 'garbage'],
  ])('rejects %s (%s)', async (url) => {
    const r = await request(app).post('/api/shorten').send({ url });
    expect(r.status).toBe(400);
  });

  it('rejects reserved aliases', async () => {
    for (const alias of ['api', 'admin', 'qr', 'health']) {
      const r = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/', alias });
      expect(r.status).toBe(400);
    }
  });
});

describe('redirect and analytics (defect 4)', () => {
  const app = freshApp('test-key');

  it('redirects, counts the click, and reports clicks per day', async () => {
    const made = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/lanlink/' });
    const code = made.body.shortCode;

    for (let i = 0; i < 3; i++) {
      const hit = await request(app).get(`/${code}`).set('user-agent', 'jest');
      expect(hit.status).toBe(302);
      expect(hit.headers.location).toBe('https://tapiwa.me/lanlink/');
    }
    await new Promise((r) => setTimeout(r, 50));   // clicks are logged after the response

    const stats = await request(app).get(`/api/stats/${code}`);
    expect(stats.status).toBe(200);
    expect(stats.body.clicks).toBe(3);
    const today = new Date().toISOString().slice(0, 10);
    expect(stats.body.clicksByDay[today]).toBe(3);
    expect(stats.body.lastClick).toBeGreaterThan(0);
  });

  it('expires a link and stops resolving it', async () => {
    const made = await request(app).post('/api/shorten')
      .send({ url: 'https://tapiwa.me/', expiresIn: 0.001 });
    await new Promise((r) => setTimeout(r, 40));
    const hit = await request(app).get(`/${made.body.shortCode}`);
    expect(hit.status).toBe(410);
  });

  it('never leaks a visitor IP through the stats endpoint', async () => {
    const made = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/' });
    await request(app).get(`/${made.body.shortCode}`).set('X-Forwarded-For', '41.221.10.7');
    await new Promise((r) => setTimeout(r, 50));
    const stats = await request(app).get(`/api/stats/${made.body.shortCode}`);
    expect(JSON.stringify(stats.body)).not.toContain('41.221.10.7');
  });
});

describe('admin auth (defect 2)', () => {
  it('disables admin endpoints when no key is configured — never opens them', async () => {
    const app = freshApp();
    expect((await request(app).get('/api/urls')).status).toBe(503);
    expect((await request(app).delete('/api/urls/whatever')).status).toBe(503);
  });

  it('requires the key when one is configured', async () => {
    const app = freshApp('s3cret');
    expect((await request(app).get('/api/urls')).status).toBe(401);
    expect((await request(app).get('/api/urls').set('x-api-key', 'wrong')).status).toBe(401);
    expect((await request(app).get('/api/urls').set('x-api-key', 's3cret')).status).toBe(200);
  });

  it('deletes only with the key', async () => {
    const app = freshApp('s3cret');
    const made = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/' });
    const code = made.body.shortCode;
    expect((await request(app).delete(`/api/urls/${code}`)).status).toBe(401);
    expect((await request(app).delete(`/api/urls/${code}`).set('x-api-key', 's3cret')).status).toBe(200);
    expect((await request(app).get(`/api/stats/${code}`)).status).toBe(404);
  });
});

describe('QR codes are real (defect 3)', () => {
  const app = freshApp('test-key');

  it('serves a scannable PNG whose decoded text is the short link', async () => {
    const made = await request(app).post('/api/shorten').send({ url: 'https://tapiwa.me/zimpay/' });
    const code = made.body.shortCode;
    const png = await request(app).get(`/api/qr/${code}.png`);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toContain('image/png');

    // Decode with an independent reader: if a scanner cannot read it, this fails.
    const { PNG } = require('pngjs');
    const jsQR = require('jsqr').default ?? require('jsqr');
    const img = PNG.sync.read(png.body);
    const decoded = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
    expect(decoded).not.toBeNull();
    expect(decoded.data).toMatch(new RegExp(`^https?://[^/]+/${code}$`));
  });

  it('404s a QR for a link that does not exist', async () => {
    expect((await request(app).get('/api/qr/nope.png')).status).toBe(404);
  });
});

describe('startup safety (defect 1)', () => {
  it('refuses to start without a durable store', () => {
    jest.resetModules();
    const { storeFromEnv } = require('./store');
    expect(() => storeFromEnv({})).toThrow(/durable store/i);
    expect(storeFromEnv({ STORE: 'memory' }).driver).toBe('memory');
    expect(storeFromEnv({ APPWRITE_PROJECT_ID: 'p', APPWRITE_API_KEY: 'k' }).driver).toBe('appwrite');
  });
});
