# 🔗 URL Shortener

A full-stack URL shortener built with **TypeScript**, **React** and **Express**, running on Appwrite Sites at **[url.tapiwa.me](https://url.tapiwa.me/)**. Short links with optional custom aliases, real scannable QR codes, per-day click analytics, and storage that survives a restart.

<p>
  <img src="https://img.shields.io/github/languages/top/tapiwamakandigona/url-shortener?style=for-the-badge&color=blue" alt="Top Language" />
  <img src="https://img.shields.io/github/last-commit/tapiwamakandigona/url-shortener?style=for-the-badge&color=green" alt="Last Commit" />
  <img src="https://img.shields.io/github/license/tapiwamakandigona/url-shortener?style=for-the-badge" alt="License" />
</p>

---

## Features

- **Shorten URLs** — a unique 7-character code, or your own alias
- **Durable links** — stored in an Appwrite database, so a container recycle no longer wipes them
- **Real QR codes** — `/api/qr/:code.svg` and `.png`, verified in the test suite by decoding the image
- **Click analytics** — total clicks, last click, and a 14-day per-day breakdown, shown in the UI
- **Privacy** — the click log keeps a salted hash of the visitor's IP, never the address
- **Link expiry** — optional TTL, after which the link stops resolving and is removed
- **Admin endpoints that fail closed** — list/delete require `ADMIN_API_KEY`; unset means disabled, not open
- **Responsive UI** — cream canvas, serif headline and one WebGL field, matching tapiwa.me

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express 4, TypeScript |
| Storage | Appwrite Databases (`links`, `link_clicks`); `STORE=memory` for local dev |
| Styling | Vanilla CSS, shared design system with tapiwa.me |
| Dev Tools | tsx (watch mode), Jest, ts-jest |

## Project Structure

```
url-shortener/
├── client/                # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx        # Form, your-links list, QR + analytics detail
│   │   ├── App.css        # Cream/serif theme shared with tapiwa.me
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
