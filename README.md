# Dashboard for Nexus

## Connect To nexus-control Backend

The dashboard now reads live data from the control REST API:

- `GET /api/health`
- `GET /api/stats`
- `GET /api/logs?page=1&limit=300`

### 1. Configure environment

Create `.env` from `.env.example` and set:

- `VITE_CONTROL_API_TOKEN`: admin token used by `nexus-control` middleware.
- `VITE_CONTROL_API_BASE_URL` (optional): backend base URL when not using same-origin.
- `VITE_DEV_PROXY_TARGET`: local proxy target for Vite dev server (defaults to `http://127.0.0.1:9091`).

### 2. Start backend

Run your Nexus backend and make sure the control REST API is reachable (default `:9091`).

### 3. Start frontend

Run:

```bash
npm run dev
```

When `VITE_CONTROL_API_BASE_URL` is empty, the app calls `/api/*` and Vite proxies to `VITE_DEV_PROXY_TARGET` in development.