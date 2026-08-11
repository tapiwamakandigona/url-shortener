/**
 * Persistence for the shortener.
 *
 * The original build kept links in `new Map()`. On Appwrite Sites the SSR container is
 * recycled whenever it goes idle or redeploys, so every link created before the recycle
 * silently stopped resolving — a link shortener that forgets its links. Links now live in
 * an Appwrite database, and the process refuses to start in production without one.
 */
import crypto from 'crypto';
import { Client, Databases, ID, Query } from 'node-appwrite';

export interface Link {
  code: string;
  target: string;
  createdAt: number;          // epoch ms
  expiresAt?: number;
  clicks: number;
  custom: boolean;
  lastClick?: number;
}

export interface Click {
  ts: number;
  ua: string;
  referer: string;
  ipHash: string;
}

export class CodeTaken extends Error {
  constructor(code: string) {
    super(`code already in use: ${code}`);
    this.name = 'CodeTaken';
  }
}

export interface Store {
  readonly driver: string;
  create(link: Link): Promise<void>;
  get(code: string): Promise<Link | null>;
  remove(code: string): Promise<boolean>;
  list(limit?: number): Promise<Link[]>;
  recordClick(code: string, click: Click): Promise<void>;
  clicksByDay(code: string, days?: number): Promise<Record<string, number>>;
  health(): Promise<{ driver: string; ok: boolean; detail: string }>;
}

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ Appwrite */

const LINKS = 'links';
const CLICKS = 'link_clicks';

export class AppwriteStore implements Store {
  readonly driver = 'appwrite';
  private db: Databases;
  private dbId: string;

  constructor(opts: { endpoint: string; project: string; apiKey: string; database: string }) {
    const client = new Client()
      .setEndpoint(opts.endpoint)
      .setProject(opts.project)
      .setKey(opts.apiKey);
    this.db = new Databases(client);
    this.dbId = opts.database;
  }

  /** The row id *is* the short code, so uniqueness is enforced by the database
   *  rather than by a check-then-write that two concurrent requests can both pass. */
  async create(link: Link): Promise<void> {
    try {
      await this.db.createDocument(this.dbId, LINKS, link.code, {
        target: link.target,
        createdAt: new Date(link.createdAt).toISOString(),
        expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
        clicks: 0,
        custom: link.custom,
      });
    } catch (err: any) {
      if (err?.code === 409) throw new CodeTaken(link.code);
      throw err;
    }
  }

  async get(code: string): Promise<Link | null> {
    try {
      const d: any = await this.db.getDocument(this.dbId, LINKS, code);
      return {
        code,
        target: d.target,
        createdAt: Date.parse(d.createdAt),
        expiresAt: d.expiresAt ? Date.parse(d.expiresAt) : undefined,
        clicks: d.clicks ?? 0,
        custom: !!d.custom,
        lastClick: d.lastClick ? Date.parse(d.lastClick) : undefined,
      };
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }

  async remove(code: string): Promise<boolean> {
    try {
      await this.db.deleteDocument(this.dbId, LINKS, code);
    } catch (err: any) {
      if (err?.code === 404) return false;
      throw err;
    }
    // Deleting a link deletes its click history with it: no orphan rows accumulating
    // forever, and no retained visitor data for a link its owner has thrown away.
    try {
      for (let page = 0; page < 50; page++) {
        const res: any = await this.db.listDocuments(this.dbId, CLICKS, [
          Query.equal('code', code), Query.limit(100),
        ]);
        if (!res.documents.length) break;
        await Promise.all(res.documents.map((d: any) =>
          this.db.deleteDocument(this.dbId, CLICKS, d.$id)));
        if (res.documents.length < 100) break;
      }
    } catch (err: any) {
      console.error('[url-shortener] click history cleanup failed:', err?.message || err);
    }
    return true;
  }

  async list(limit = 100): Promise<Link[]> {
    const res: any = await this.db.listDocuments(this.dbId, LINKS, [
      Query.orderDesc('createdAt'),
      Query.limit(Math.min(limit, 100)),
    ]);
    return res.documents.map((d: any) => ({
      code: d.$id,
      target: d.target,
      createdAt: Date.parse(d.createdAt),
      expiresAt: d.expiresAt ? Date.parse(d.expiresAt) : undefined,
      clicks: d.clicks ?? 0,
      custom: !!d.custom,
      lastClick: d.lastClick ? Date.parse(d.lastClick) : undefined,
    }));
  }

  /** Two writes, neither of which reads the counter first: the increment is atomic
   *  server-side, so simultaneous clicks cannot overwrite each other's total. */
  async recordClick(code: string, click: Click): Promise<void> {
    await Promise.all([
      this.db.incrementDocumentAttribute(this.dbId, LINKS, code, 'clicks', 1),
      this.db.updateDocument(this.dbId, LINKS, code, {
        lastClick: new Date(click.ts).toISOString(),
      }),
      this.db.createDocument(this.dbId, CLICKS, ID.unique(), {
        code,
        ts: new Date(click.ts).toISOString(),
        day: dayKey(click.ts),
        ua: click.ua.slice(0, 512),
        referer: click.referer.slice(0, 512),
        ipHash: click.ipHash,
      }),
    ]);
  }

  async clicksByDay(code: string, days = 30): Promise<Record<string, number>> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const out: Record<string, number> = {};
    let cursor: string | undefined;
    // Paginate: a popular link has more click rows than one page can hold.
    for (let page = 0; page < 20; page++) {
      const q = [Query.equal('code', code), Query.greaterThanEqual('ts', since),
                 Query.orderDesc('ts'), Query.limit(100)];
      if (cursor) q.push(Query.cursorAfter(cursor));
      const res: any = await this.db.listDocuments(this.dbId, CLICKS, q);
      for (const d of res.documents) out[d.day] = (out[d.day] || 0) + 1;
      if (res.documents.length < 100) break;
      cursor = res.documents[res.documents.length - 1].$id;
    }
    return out;
  }

  async health() {
    try {
      await this.db.listDocuments(this.dbId, LINKS, [Query.limit(1)]);
      return { driver: this.driver, ok: true, detail: `database ${this.dbId}` };
    } catch (err: any) {
      return { driver: this.driver, ok: false, detail: err?.message || String(err) };
    }
  }
}

/* -------------------------------------------------------------------- memory */

/** Development and tests only. Selecting it requires STORE=memory, so it can never be
 *  reached by accident in production — which is how the data loss happened before. */
export class MemoryStore implements Store {
  readonly driver = 'memory';
  private links = new Map<string, Link>();
  private clicks = new Map<string, Click[]>();

  async create(link: Link) {
    if (this.links.has(link.code)) throw new CodeTaken(link.code);
    this.links.set(link.code, { ...link, clicks: 0 });
  }
  async get(code: string) {
    return this.links.get(code) ?? null;
  }
  async remove(code: string) {
    this.clicks.delete(code);
    return this.links.delete(code);
  }
  async list(limit = 100) {
    return [...this.links.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async recordClick(code: string, click: Click) {
    const link = this.links.get(code);
    if (!link) return;
    link.clicks++;
    link.lastClick = click.ts;
    const log = this.clicks.get(code) ?? [];
    log.push(click);
    this.clicks.set(code, log);
  }
  async clicksByDay(code: string, days = 30) {
    const since = Date.now() - days * 86_400_000;
    const out: Record<string, number> = {};
    for (const c of this.clicks.get(code) ?? []) {
      if (c.ts >= since) out[dayKey(c.ts)] = (out[dayKey(c.ts)] || 0) + 1;
    }
    return out;
  }
  async health() {
    return { driver: this.driver, ok: true, detail: `${this.links.size} links in this process only` };
  }
}

/* ------------------------------------------------------------------- factory */

export function hashIp(ip: string, salt: string): string {
  if (!ip) return '';
  // Store a salted hash, never the address: click counts per visitor without keeping
  // anybody's IP lying around in a database.
  return crypto.createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

export function storeFromEnv(env = process.env): Store {
  if (env.STORE === 'memory') return new MemoryStore();

  const project = env.APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!project || !apiKey) {
    throw new Error(
      'No durable store configured. Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY ' +
      '(or STORE=memory for local development). Refusing to start with storage that ' +
      'loses every link when the container recycles.'
    );
  }
  return new AppwriteStore({
    endpoint: env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
    project,
    apiKey,
    database: env.APPWRITE_DB || 'voltdb',
  });
}
