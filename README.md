# NexusWAF — Operator Dashboard

**Advanced Web Application Firewall · Group AA3 · Frontend Operations Console**

---

## Overview

This directory contains the React/Vite control dashboard for NexusWAF. It connects to the protected `nexus-control` REST API, visualises live gateway activity, and gives operators UI access to logs, rules, GPS synthesis, configuration snapshots, and RL policy operations.

**Frontend:** React 18 + Vite + TypeScript  
**UI Stack:** shadcn/ui + Tailwind + Recharts  
**Data Source:** `nexus-core` REST control plane (`/api/*`)  
**Operator Views:** Dashboard · Logs · Policy · Rules · Config

---

## Directory Structure

```text
nexus-dashboard/
├── src/
│   ├── components/
│   │   ├── dashboard/          # Metric cards, chart shells, status indicators
│   │   ├── ui/                 # shadcn/ui building blocks
│   │   ├── Topbar.tsx          # Shared navbar
│   │   └── ApiErrorAlert.tsx   # Consistent backend error display
│   ├── lib/
│   │   └── control-api.ts      # Typed REST client for nexus-control
│   ├── pages/
│   │   ├── Index.tsx           # Main dashboard
│   │   ├── Logs.tsx            # Attack/config/slack views
│   │   ├── Policy.tsx          # RL policy status + manual training + JSONL tail
│   │   ├── Rules.tsx           # Ruleset + GPS synthesis
│   │   ├── Config.tsx          # Sanitised config snapshot
│   │   └── NotFound.tsx
│   ├── App.tsx                 # Route registration
│   └── main.tsx                # Frontend bootstrap
├── public/
├── .env.example
├── package.json
└── vite.config.ts
```

---

## Quick Start (3 steps)

### Prerequisites

- Node.js 18+
- `nexus-core` running with the REST control plane enabled
- Valid admin token for protected REST endpoints

```bash
cd nexus-dashboard/
npm install
```

### Step 1 — Configure environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set these values:

- `VITE_CONTROL_API_TOKEN`: admin token used by `nexus-control` auth middleware
- `VITE_CONTROL_API_BASE_URL`: optional when dashboard and backend are on different origins
- `VITE_DEV_PROXY_TARGET`: Vite dev proxy target, default `http://127.0.0.1:9091`

Example:

```env
VITE_CONTROL_API_BASE_URL=
VITE_CONTROL_API_TOKEN=replace-with-your-admin-token
VITE_DEV_PROXY_TARGET=http://127.0.0.1:9091
```

### Step 2 — Start the backend

Make sure the `nexus-core` REST API is reachable. Default local endpoints:

- Health: `http://127.0.0.1:9091/api/health`
- Protected REST: `http://127.0.0.1:9091/api/*`

If you want the `Policy` page to be fully live, also start the RL policy service from `nexus-ml`.

### Step 3 — Start the frontend

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

When `VITE_CONTROL_API_BASE_URL` is empty, the app calls `/api/*` and Vite proxies those requests to `VITE_DEV_PROXY_TARGET` during local development.

---

## Available Pages

### Dashboard

High-level gateway summary:

- total requests
- rate-limited count
- blocked percentage
- config version
- policy service state
- ML circuit state
- upstream health

### Logs

Operator log views:

- attack log stream
- rule/config reload activity
- derived Slack alert feed

### Policy

RL policy operations:

- policy service health snapshot
- replay size and loss visibility
- manual online training trigger
- latest JSONL feedback tail

### Rules

Rules management:

- current ruleset content
- rule version history
- GPS synthesis preview/apply flow

### Config

Sanitised current config from `nexus-core`.

---

## API Endpoints Used

The dashboard reads from these `nexus-control` endpoints:

- `GET /api/health`
- `GET /api/stats`
- `GET /api/logs`
- `GET /api/rules`
- `GET /api/rules/versions`
- `POST /api/rules/synthesize`
- `GET /api/config`
- `GET /api/config/logs`
- `GET /api/policy`
- `GET /api/policy/events`
- `POST /api/policy/train`

All protected routes require the bearer token configured in `VITE_CONTROL_API_TOKEN`.

---

## Scripts

```bash
npm run dev         # start local Vite dev server
npm run build       # production build
npm run preview     # preview production build locally
npm run lint        # ESLint
npm run test        # Vitest
npm run test:watch  # Vitest watch mode
```

---

## Integration Notes

- The dashboard is intentionally thin: it does not own firewall logic, only operator workflows.
- `ML Circuit` and `Policy Service` are shown separately so the UI stays aligned with the current `nexus-ml` model-learning guide.
- If the RL policy service is temporarily unavailable, the dashboard now fails open on policy-event listing and keeps the rest of the UI usable.
