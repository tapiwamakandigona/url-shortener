# Architecture

## Overview

Full-stack URL shortener with Express backend and React frontend.

## Backend (`server/`)

```
Express app
├── POST /api/shorten    # Create short URL
├── GET /api/stats/:code # Click analytics
├── GET /api/urls        # List all URLs
├── DELETE /api/urls/:code
└── GET /:code           # Redirect (301)
```

### Storage
In-memory Map. Replace with Redis or PostgreSQL for production.

### Analytics
Each click logs: timestamp, user agent, referer, IP.
Stats endpoint aggregates clicks by day.

## Frontend (`client/`)

React + Vite SPA with:
- URL input form with custom alias
- Result display with copy-to-clipboard
- URL list with click counts
- Delete functionality

## Proxy

Vite dev server proxies `/api` to Express (port 3001).
