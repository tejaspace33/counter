Running the app with Docker

This repo includes a simple Socket.IO server in `server/` and a React frontend (Create React App).

Prerequisites
- Docker and Docker Compose installed.

Build and run locally

1. Build and start both services:

```bash
docker-compose up --build
```

2. Open the frontend at `http://localhost:3000`. The client connects to the server at `http://localhost:3001` by default.

Environment
- To use a hosted server, set `REACT_APP_SOCKET_URL` to the server URL before building the frontend (e.g., `REACT_APP_SOCKET_URL=https://your-server.com docker-compose build`).

Deploy options
- Railway / Render: push repo and use their Docker or Node support to run `server/` and serve the frontend from a static host (Vercel) or as a static site from the server.
- Vercel / Netlify: deploy the frontend separately and set `REACT_APP_SOCKET_URL` to the server's public URL.

Notes
- `server/data.json` is a simple file persistence for development. Use a proper DB (Postgres, MongoDB) for production.
- Add TLS and authentication for production use.
