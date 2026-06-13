# 🔗 URL Shortener

A full-stack URL shortener built with **TypeScript**, **React**, and **Express**. Create short links with optional custom aliases, track click analytics, and manage all your URLs from a clean dashboard.

<p>
  <img src="https://img.shields.io/github/languages/top/tapiwamakandigona/url-shortener?style=for-the-badge&color=blue" alt="Top Language" />
  <img src="https://img.shields.io/github/last-commit/tapiwamakandigona/url-shortener?style=for-the-badge&color=green" alt="Last Commit" />
  <img src="https://img.shields.io/github/license/tapiwamakandigona/url-shortener?style=for-the-badge" alt="License" />
</p>

---

## Features

- **Shorten URLs** — generate a unique 6-character short code or choose a custom alias
- **Click Analytics** — every redirect logs timestamp, user agent, referrer, and IP; view aggregated stats by day
- **URL Management** — list all shortened URLs, see click counts, and delete entries
- **Copy to Clipboard** — one-click copy of the generated short link
- **Link Expiration** — optionally set a TTL (in seconds) so links auto-expire
- **Responsive UI** — glassmorphic dark theme with mobile-friendly layout

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express 4, TypeScript |
| Storage | In-memory `Map` (swap with Redis/PostgreSQL for production) |
| Styling | Vanilla CSS (glassmorphism & gradients) |
| Dev Tools | tsx (watch mode), Jest, ts-jest |

## Project Structure

```
url-shortener/
├── client/                # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx        # Main component — form, URL list, clipboard
│   │   ├── App.css        # Dark glassmorphic theme
│   │   └── main.tsx       # React entry point
│   ├── index.html
│   ├── vite.config.ts     # Dev proxy → localhost:3001
│   └── package.json
├── server/
│   ├── index.ts           # Express API — CRUD + redirect + analytics
│   ├── analytics.ts       # Click analytics helpers (parseUserAgent, summarize)
│   ├── qr.ts              # SVG QR code generator (no external deps)
│   └── index.test.ts      # Jest test stubs
├── tsconfig.server.json   # Server TypeScript config
├── package.json           # Root dependencies & scripts
└── ARCHITECTURE.md        # Detailed architecture notes
```

## Quick Start

### Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`)

### 1. Clone

```bash
git clone https://github.com/tapiwamakandigona/url-shortener.git
cd url-shortener
```

### 2. Install Dependencies

```bash
# Root (server + dev tools)
npm install

# Client
cd client && npm install && cd ..
```

### 3. Run in Development

```bash
# Terminal 1 — start the Express API (port 3001)
npm run dev

# Terminal 2 — start the Vite dev server (proxies /api → 3001)
cd client && npm run dev
```

### 4. Build for Production

```bash
npm run build
# Compiles the React app into client/dist/ and the server into dist/
```

### 5. Run Tests

```bash
npm test
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shorten` | Create a short URL. Body: `{ url, alias?, expiresIn? }` |
| `GET` | `/api/urls` | List all shortened URLs (sorted newest first) |
| `GET` | `/api/stats/:code` | Get click analytics for a short code |
| `DELETE` | `/api/urls/:code` | Delete a shortened URL |
| `GET` | `/:code` | Redirect to the original URL (logs click) |

### Example

```bash
# Shorten a URL
curl -X POST http://localhost:3001/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "alias": "demo"}'

# Response
# { "shortUrl": "http://localhost:3001/demo", "shortCode": "demo", "originalUrl": "https://example.com" }
```

## License

[MIT](LICENSE) — Tapiwa Makandigona
