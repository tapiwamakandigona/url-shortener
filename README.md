<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=200&section=header&text=URL%20Shortener&fontSize=50&animation=fadeIn&fontAlignY=38&desc=Full-Stack%20Link%20Management%20Platform&descAlignY=51&descAlign=62" />
</div>

<h1 align="center">URL Shortener (TypeScript + React + Express)</h1>

<div align="center">
  <p><strong>A robust, full-stack link management platform. Create custom aliases, track click analytics in real-time, generate QR codes, and monitor geolocational data.</strong></p>
  
  <p>
    <a href="https://tapiwamakandigona.github.io/url-shortener/"><img src="https://img.shields.io/badge/Live_Demo-0A66C2?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo" /></a>
    <img src="https://img.shields.io/github/languages/top/tapiwamakandigona/url-shortener?style=for-the-badge&color=blue" alt="Top Language" />
    <img src="https://img.shields.io/github/last-commit/tapiwamakandigona/url-shortener?style=for-the-badge&color=green" alt="Last Commit" />
  </p>
</div>

---

## ⚡ Architecture Overview

This project showcases a scalable **TypeScript monorepo** architecture. The backend is a lightning-fast Express API that handles redirection logic and stores analytical data, while the React frontend provides a glassmorphic dashboard for users to manage their links.

## 🔗 Key Features

| Feature | Description |
|---------|-------------|
| **Custom Aliases** | Choose memorable, custom slugs for your shortened URLs |
| **Real-Time Analytics** | Track total clicks and visual click-growth over time |
| **QR Code Generation** | Instantly download scannable QR codes for any created link |
| **Glassmorphic UI** | Premium front-end design with animated gradients and blur effects |
| **Full Type Safety** | Shared TypeScript interfaces between the frontend and backend |

---

## 🛠️ Technology Stack

- **Frontend:** React 19, TypeScript
- **Backend:** Node.js, Express, TypeScript
- **Database:** Prisma ORM (SQLite / PostgreSQL)
- **Styling:** Vanilla CSS (Glassmorphism & Gradients)
- **Deployment:** GitHub Pages (Frontend) + Render/Heroku (Backend)

---

## 🚀 Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/tapiwamakandigona/url-shortener.git
cd url-shortener
```

### 2. Start the Backend API

```bash
cd backend
npm install
npm run dev
```

### 3. Start the Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```

---

<div align="center">
  <b>Built by <a href="https://github.com/tapiwamakandigona">Tapiwa Makandigona</a></b>
  <br/>
  <i>⭐ Star this repo if you find this full-stack architecture useful!</i>
</div>
