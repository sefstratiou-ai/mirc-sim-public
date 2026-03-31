# mIRC Simulator

A fully interactive web-based recreation of the classic **mIRC IRC client** from the late 1990s and early 2000s. Every user in the chat is AI-generated — complete with distinct personalities, typing cadences, and conversational styles — creating an authentic, nostalgic IRC experience entirely in your browser.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [AI Configuration](#ai-configuration)
  - [Option A: Environment Variables](#option-a-environment-variables)
  - [Option B: Admin Stats Dashboard](#option-b-admin-stats-dashboard)
- [Environment Variables Reference](#environment-variables-reference)
- [Admin Stats Dashboard](#admin-stats-dashboard)
- [Deployment](#deployment)
  - [Docker](#docker)
  - [Railway](#railway)
- [Project Structure](#project-structure)
- [Scripts Reference](#scripts-reference)
- [License](#license)

## Features

- **Authentic mIRC 6.x UI** — Windows 98/XP chrome, MDI windows with drag, resize, minimize, maximize, cascade, and tile
- **AI-Powered Conversations** — Multiple AI-generated users with unique personas chat autonomously and respond to you in real time
- **Multiple AI Providers** — Google Gemini, OpenAI, DeepSeek, and LM Studio (local models)
- **Automatic Failover** — Configurable secondary AI preset kicks in automatically after consecutive failures
- **Full IRC Command Support** — Standard slash commands for channels, private messages, nick changes, and more
- **mIRC Color Code Rendering** — Bold, italic, underline, reverse, and the full 16-color mIRC palette
- **Tab Nick Completion** — Tab key cycles through matching nicknames
- **Sound Effects** — Join/part sounds, message alerts, highlights, and an optional modem handshake simulation
- **Channel List Browser** — Browse and join available channels from a dialog
- **Private Message Memory** — AI remembers previous PM conversations across sessions via localStorage
- **Multi-Language Support** — AI detects the conversation language per channel and responds accordingly
- **Real-Time Multi-User** — WebSocket-based broadcasting allows multiple browser clients to share the same simulated server
- **Admin Dashboard** — Server-side stats page with token usage, error logs, and live AI config management
- **Rate Limiting** — Per-IP rate limiting on AI generation requests (30 req/min)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
│  React 19 + TypeScript + Vite                               │
│  ┌──────────┐ ┌────────────────┐ ┌────────────────────────┐ │
│  │ mIRC UI  │ │ IRC Simulation │ │ AI Conversation Engine │ │
│  │ (MDI/CSS)│ │ Engine/Reducer  │ │ Persona Manager        │ │
│  └──────────┘ └────────────────┘ └────────────────────────┘ │
│                         │ HTTP + WebSocket                   │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    Server (Backend)                          │
│  Node.js 20 + Express 5 + TypeScript                        │
│  ┌──────────────┐ ┌────────────┐ ┌────────────────────────┐ │
│  │ AI Proxy     │ │ Config API │ │ Stats / Admin Dashboard│ │
│  │ (multi-model)│ │ (presets)  │ │ (SQLite + HTML)        │ │
│  └──────────────┘ └────────────┘ └────────────────────────┘ │
│                         │                                    │
│              ┌──────────┴──────────┐                         │
│              │  AI Provider APIs   │                         │
│              │  Gemini · OpenAI    │                         │
│              │  DeepSeek · LMStudio│                         │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

The client never communicates directly with AI provider APIs. All AI requests are proxied through the backend, which manages API credentials, enforces rate limits, logs token usage to SQLite, and handles failover.

## Prerequisites

- **Node.js** 20.x or later
- **npm** (bundled with Node.js)
- At least one AI provider API key (or a local LM Studio instance)

## Getting Started

### 1. Install Dependencies

```bash
npm run install:all
```

This installs dependencies for both the client and server workspaces.

### 2. Configure AI (Minimum Viable Setup)

Create a `server/.env` file with at least one AI provider:

```env
GEMINI_API_KEY=your-gemini-api-key
ADMIN_STATS_KEY=a-secret-key-of-your-choice
```

See [AI Configuration](#ai-configuration) for all provider options.

### 3. Start the Development Servers

In two separate terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd server
npm run dev
```

```bash
# Terminal 2 — Frontend (port 3000, proxies API to 3001)
cd client
npm run dev
```

### 4. Open in Browser

Navigate to **http://localhost:3000**, pick a nickname, and connect.

## AI Configuration

The simulator supports four AI providers. You can configure them through environment variables (ideal for initial setup and deployment) or through the admin dashboard at runtime.

### Option A: Environment Variables

Set these in `server/.env` or your hosting platform's environment config. On startup, the server seeds these values into provider presets stored in SQLite.

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key ([get one here](https://makersuite.google.com/app/apikey)) |
| `OPENAI_API_KEY` | OpenAI API key ([get one here](https://platform.openai.com/api-keys)) |
| `DEEPSEEK_API_KEY` | DeepSeek API key ([get one here](https://platform.deepseek.com/)) |
| `LMSTUDIO_URL` | LM Studio endpoint, defaults to `http://localhost:1234` |

If no active config exists when the server starts, it will activate the first available preset (in order: Gemini, OpenAI, DeepSeek, LM Studio).

### Option B: Admin Stats Dashboard

Once the server is running, navigate to:

```
http://localhost:3001/admin/stats?key=YOUR_ADMIN_STATS_KEY
```

The dashboard provides a full configuration interface:

1. **Preset Cards** — Each AI provider has a preset card showing its current model, API key (masked), temperature, and reasoning effort settings
2. **Apply** — Click "Apply" on any preset card to make it the active provider for all clients. The change is broadcast immediately to connected clients via WebSocket
3. **Edit** — Click "Edit" on a preset card to modify its API key, model, temperature, or other settings, then "Save Preset"
4. **Set Secondary** — Designate a preset as the automatic failover. If the active provider fails twice consecutively for a client, the server switches that client to the secondary preset automatically
5. **Clear Secondary** — Remove the failover designation

Changes made through the dashboard persist in the SQLite database and survive server restarts.

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Server listening port |
| `ADMIN_STATS_KEY` | **Yes** | — | Secret key for admin endpoints (`/admin/stats`, `/admin/ai-config`) |
| `STATS_DB_PATH` | No | `./data/stats.db` | Path to the SQLite database file |
| `GEMINI_API_KEY` | No | — | Seeded into the Gemini preset on startup |
| `OPENAI_API_KEY` | No | — | Seeded into the OpenAI preset on startup |
| `DEEPSEEK_API_KEY` | No | — | Seeded into the DeepSeek preset on startup |
| `LMSTUDIO_URL` | No | `http://localhost:1234` | Seeded into the LM Studio preset on startup |
| `VITE_SHOW_AI_SETTINGS` | No | `false` | Show AI provider settings in the client connect dialog (set in client `.env`) |

## Admin Stats Dashboard

Access at `/admin/stats?key=YOUR_ADMIN_STATS_KEY`. The dashboard provides:

- **Token Usage Overview** — Total API calls, input tokens, and output tokens across all providers
- **Usage by Provider** — Breakdown of token consumption and call counts per AI provider
- **Usage by Request Type** — Granular stats for each conversation type (channel messages, PMs, language detection, etc.) with average token counts
- **Active Configuration** — Visual indicator of the currently active AI provider, model, and settings
- **Preset Management** — View, edit, apply, and configure failover for all provider presets
- **Recent Errors** — Last 50 API errors with provider, model, status code, and error details for debugging

The page auto-refreshes every 60 seconds.

## Deployment

### Docker

```bash
docker build -t mirc-sim .
docker run -p 3001:3001 \
  -e ADMIN_STATS_KEY=your-secret-key \
  -e GEMINI_API_KEY=your-gemini-key \
  -v mirc-data:/app/data \
  mirc-sim
```

The Dockerfile uses `node:20-alpine` and includes native build dependencies for `better-sqlite3`. A volume mount at `/app/data` is recommended to persist the SQLite database across container restarts.

### Railway

The project includes a `railway.toml` with the build and deploy configuration pre-set.

**Setup steps:**

1. Create a new Railway project and connect this repository
2. Add a **Volume** mounted at `/data`
3. Set the following environment variables:
   - `ADMIN_STATS_KEY` — your secret admin key
   - `STATS_DB_PATH` — set to `/data/stats.db`
   - `GEMINI_API_KEY` (and/or other provider keys as needed)
4. Deploy — Railway will build and start the app automatically
5. The health check endpoint at `/api/health` is configured for monitoring

## Project Structure

```
├── package.json              Root workspace — orchestrates install & build
├── Dockerfile                Multi-stage Docker build
├── railway.toml              Railway deployment config
│
├── client/                   Frontend (Vite + React + TypeScript)
│   ├── src/
│   │   ├── ai/               AI provider abstraction & conversation engine
│   │   ├── components/       React components (MDI windows, dialogs, UI chrome)
│   │   ├── data/             Static data (servers, personas, topics, favorites)
│   │   ├── engine/           IRC simulation reducer, command parser, color parser, sound
│   │   ├── hooks/            React hooks (useIRC)
│   │   ├── styles/           CSS (mIRC theme, Windows 98 chrome, color codes)
│   │   └── types/            TypeScript type definitions
│   └── public/               Static assets (icons, audio)
│
└── server/                   Backend (Express 5 + WebSocket + SQLite)
    └── src/
        ├── index.ts          Server entry point, Express + WS setup
        ├── aiProxy.ts        Multi-provider AI proxy with token tracking
        ├── configApi.ts      Admin config REST API (presets, active config)
        ├── statsDb.ts        SQLite schema, queries, and data access
        ├── statsPage.ts      Admin HTML dashboard renderer
        ├── rateLimiter.ts    Per-IP rate limiter
        └── utils.ts          Shared utilities
```

## Scripts Reference

| Scope | Command | Description |
|---|---|---|
| Root | `npm run install:all` | Install dependencies for both client and server |
| Root | `npm run build` | Full production build (install + client + server) |
| Root | `npm run build:client` | Build the frontend only |
| Root | `npm run build:server` | Build the backend only |
| Root | `npm start` | Start the production server |
| Client | `npm run dev` | Vite dev server with hot reload (port 3000) |
| Client | `npm run build` | TypeScript check + Vite production build |
| Client | `npm run preview` | Preview production build locally |
| Server | `npm run dev` | Development server with hot reload (tsx watch) |
| Server | `npm run build` | Compile TypeScript to `dist/` |
| Server | `npm start` | Run the compiled production server |

## License

ISC