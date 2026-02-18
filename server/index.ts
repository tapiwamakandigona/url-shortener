import express from 'express';
import crypto from 'crypto';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

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

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6);
}

// Create short URL
app.post('/api/shorten', (req, res) => {
  const { url, alias, expiresIn } = req.body;
  
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL' });
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
  
  res.status(201).json({
    shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
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
app.get('/api/urls', (req, res) => {
  const all = Array.from(urls.values()).map(({ clickLog, ...rest }) => rest);
  res.json(all.sort((a, b) => b.createdAt - a.createdAt));
});

// Delete URL
app.delete('/api/urls/:code', (req, res) => {
  if (urls.delete(req.params.code)) {
    res.json({ status: 'deleted' });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Redirect
app.get('/:code', (req, res) => {
  const entry = urls.get(req.params.code);
  
  if (!entry) return res.status(404).sendFile(path.join(__dirname, '../client/dist/index.html'));
  
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    urls.delete(req.params.code);
    return res.status(410).json({ error: 'Link expired' });
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
