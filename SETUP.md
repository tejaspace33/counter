# Setup & Deployment Guide

## Local Development

### Prerequisites
- Node.js 16+
- npm or yarn

### Install Dependencies

```bash
# Install client deps
npm install

# Install server deps
cd server
npm install
cd ..
```

### Run Locally

**Terminal 1 - Start Socket.IO server:**
```bash
cd server
npm start
```
Server runs on `http://localhost:3001`

**Terminal 2 - Start React dev server:**
```bash
npm start
```
App runs on `http://localhost:3000`

Both should be running. Open http://localhost:3000, join a room, and test with a friend locally.

---

## Deploy to Production

### 1. Push to GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Deploy Server to Railway

1. Go to [railway.app](https://railway.app) and sign up.
2. Click **+ New Project** → **Deploy from GitHub** → select your repo.
3. Railway auto-detects Node.js and deploys the server.
4. In the Railway dashboard:
   - Click **Variables** and add:
     ```
     PORT=3001
     NODE_ENV=production
     ```
   - View the public URL (e.g., `https://your-app.up.railway.app`)

### 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up.
2. Click **+ New Project** → **Import Git Repository** → select your repo.
3. Add environment variable:
   ```
   REACT_APP_SOCKET_URL=https://your-app.up.railway.app
   ```
   (Replace with your actual Railway URL from step 2)
4. Click **Deploy**.
5. Vercel gives you a public URL (e.g., `https://your-app.vercel.app`).

### 4. Share with Friends

Send them `https://your-app.vercel.app`. They join the same room ID and can chat in real-time!

---

## Database

Messages are stored in SQLite (`server/chat.db`). For production, migrate to PostgreSQL:

1. In Railway dashboard, create a PostgreSQL service.
2. Railway sets `DATABASE_URL` env var automatically.
3. Update `server/index.js` to use PostgreSQL client (e.g., `pg` npm package).

---

## GitHub Actions Auto-Deployment (Optional)

Add `RAILWAY_TOKEN` and `VERCEL_TOKEN` to GitHub Secrets for auto-deploy on push:

1. Go to **GitHub Repo Settings** → **Secrets and Variables** → **Actions**.
2. Add:
   - `RAILWAY_TOKEN` (from Railway account settings)
   - `VERCEL_TOKEN` (from Vercel account settings)
3. Push to main branch and it auto-deploys!

---

## Troubleshooting

- **Messages not persisting?** Check `server/chat.db` exists or Railway PostgreSQL is connected.
- **Client can't connect to server?** Check `REACT_APP_SOCKET_URL` env var matches your server URL.
- **Socket errors?** Check CORS is enabled in server and frontend URL is whitelisted.

---

## Next Steps

- Add user authentication (email/OAuth).
- Add image/file sharing via cloud storage (AWS S3, Cloudinary).
- Add typing indicators and presence status.
- Scale to PostgreSQL or MongoDB for multi-room support.
