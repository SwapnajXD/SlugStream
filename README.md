# Aliasly — Production-Ready URL Shortener

PostgreSQL + Redis + Node.js (Express) + React (Vite) + Docker + ngrok

A fully containerized, scalable URL Shortener application built with a modern full-stack architecture.

---

## Features

- Custom phrase-based short URLs — the phrase you choose IS the slug, no random ID appended
- Live availability check as you type
- Optional expiration (1 hour / 24 hours / 7 days / 30 days / never)
- Click tracking per link
- Anonymous link history stored in your browser, with delete-by-token support
- QR code for every generated link
- PostgreSQL persistent storage
- Redis caching for fast redirects
- Rate limiting and security headers (helmet) on the API
- Node.js + Express backend
- React + Vite frontend (served via Nginx)
- Docker Compose for local development
- Optional ngrok integration for public/shareable links
- Blocked extension security
- Automatic background cleanup of expired links every 15 minutes

---

## Project Structure

```
Aliasly/
├── docker-compose.yml
├── client/      # React + Vite frontend (served via Nginx)
└── server/      # Express API + PostgreSQL + Redis
```

---

# Prerequisites

- Docker  
- Docker Compose  
- ngrok (optional — required only for public links)

Download ngrok:

https://ngrok.com/download

---

# Running Locally (Development Mode)

Generates local links like:

```
http://localhost:8080/<slug>
```

## 1. Start the Application

From the project root:

```bash
docker compose up --build
```

## 2. Access Services

| Service   | URL                    |
|------------|-----------------------|
| Frontend   | http://localhost:8080 |
| API        | http://localhost:5000 |

## 3. Test the Application

1. Open `http://localhost:8080`
2. Paste a long URL
3. Generate a short link
4. Click the link to verify redirect functionality

---

# Running with ngrok (Public Shareable Links)

This enables public URLs like:

```
https://your-domain.ngrok-free.dev/r/<slug>
```

Only the API (port 5000) needs to be exposed via ngrok.

---

## Step 1 — Start Docker

```bash
docker compose up
```

---

## Step 2 — Start ngrok (Expose Backend Only)

In a new terminal:

```bash
ngrok http 5000
```

You will receive a public HTTPS URL such as:

```
https://example-subdomain.ngrok-free.dev
```

Note: On the free plan, this domain changes every time ngrok restarts.

---

## Step 3 — Update Frontend Build Variables

Open `docker-compose.yml` and update:

```yaml
services:
  web:
    build:
      args:
        VITE_PUBLIC_BASE_URL: "https://<your-ngrok-domain>/r"
        VITE_API_URL: "https://<your-ngrok-domain>"
```

Example:

```yaml
VITE_PUBLIC_BASE_URL: "https://example-subdomain.ngrok-free.dev/r"
VITE_API_URL: "https://example-subdomain.ngrok-free.dev"
```

---

## Step 4 — Rebuild Frontend Only

The frontend must be rebuilt when environment variables change.

```bash
docker compose build web
docker compose up
```

Generated links will now be publicly accessible:

```
https://example-subdomain.ngrok-free.dev/r/my-link-Ab12Cd
```

The backend does not require rebuilding.

---

# When ngrok Domain Changes

Each time ngrok restarts:

1. Copy the new domain  
2. Update in `docker-compose.yml`:
   - `VITE_PUBLIC_BASE_URL`
   - `VITE_API_URL`
3. Rebuild frontend:

```bash
docker compose build web
docker compose up
```

---

# Deploying the Frontend to Vercel

The frontend is a static Vite/React SPA — a natural fit for Vercel. The
backend (Postgres, Redis, and a background cleanup job) is **not** a good fit
for Vercel's serverless functions, which are stateless and short-lived, so
the recommended split is:

- **Frontend** → Vercel (free, zero-config for Vite)
- **Backend** → stays wherever it already runs well (your homelab, a VM,
  Render, Railway, etc.), exposed publicly through a tunnel

## 1. Push the repo to GitHub

Vercel imports directly from a Git provider.

## 2. Import the project in Vercel

- New Project → import your repo
- **Root Directory:** `client` (important — this repo is a monorepo, and
  Vercel needs to know the frontend lives in a subfolder)
- Framework preset: Vite (auto-detected)
- A `client/vercel.json` is already included with the SPA rewrite rule
  needed so routes like `/your-phrase` work correctly on direct visit/refresh,
  not just client-side navigation.

## 3. Set environment variables (Vercel Project Settings → Environment Variables)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your backend's public URL — with Tailscale Funnel (see step 4 below), this looks like `https://your-device.your-tailnet.ts.net` |
| `VITE_PUBLIC_BASE_URL` | Your Vercel production URL, e.g. `https://aliasly.vercel.app` |

Redeploy after setting these — Vite bakes env vars in at build time, so they
won't take effect until the next build.

## 4. Expose your backend with a stable URL

You don't need a domain or a static IP for this — since your homelab is
already on Tailscale, use **Tailscale Funnel**. It's available on the free
Personal plan and gives you a stable `https://your-device.your-tailnet.ts.net`
URL that stays the same across restarts, unlike a free ngrok tunnel.

1. In the [Tailscale admin console](https://login.tailscale.com/admin/acls),
   make sure the `funnel` node attribute is allowed for your machine (it's on
   by default for `autogroup:member` on most tailnets — check under your
   machine's settings if you're unsure).
2. On the homelab machine running the backend container, expose the API's
   port:
   ```bash
   tailscale funnel 5000
   ```
   The CLI will walk you through a one-time consent step the first time you
   run it. Once confirmed, `https://your-device.your-tailnet.ts.net` proxies
   straight to `localhost:5000` — i.e. your `api` container, since
   `docker-compose.yml` already publishes that port to the host.
3. Everything else on your tailnet (the `web`/`db`/`redis` containers, SSH,
   etc.) stays completely private — Funnel only exposes the one port you
   point it at.

Check `tailscale funnel status` any time to confirm what's currently exposed,
and `tailscale funnel 5000 off` to stop sharing it.

If you get a personal domain later, Cloudflare Tunnel is a reasonable
alternative for the same purpose — but Funnel is the more direct fit for
your setup right now since it needs neither.

## 5. Update CORS on the backend

The backend only accepts requests from origins listed in `FRONTEND_ORIGINS`.
Note this is about who can *call* the API — it stays separate from
`VITE_API_URL`, which is the Funnel URL your frontend calls. Add your Vercel
domain in `docker-compose.yml` (or `server/.env`):

```
FRONTEND_ORIGINS=https://aliasly.vercel.app
```

Then restart the backend:

```bash
docker compose up -d api
```

Note: Vercel also creates a random preview URL for every branch/PR deploy
(e.g. `aliasly-git-feature-x.vercel.app`). Those won't be in your CORS
allow-list by default — add them individually if you need preview
deployments to reach the real backend, or just test previews against a local
backend instead.

---



## GET `/api/available/:phrase`

Checks whether a phrase is free before you submit the form.

Response:

```json
{ "slug": "my-link", "available": true }
```

---

## POST `/api/shorten`

Creates a new short URL. Rate limited to 20 requests/minute per IP.
`phrase` is now **required** — there's no random ID appended, so the phrase
you choose becomes the slug directly.

Request:

```json
{
  "longUrl": "https://example.com",
  "phrase": "my-link",
  "ttl": "24h"
}
```

`ttl` is optional and one of `1h`, `24h`, `7d`, `30d`, `never` (default: `never`).

Response:

```json
{
  "slug": "my-link",
  "deleteToken": "a24-character-token",
  "expiresAt": "2026-07-13T10:00:00.000Z"
}
```

If the phrase is already taken by a still-live link, this returns `409` with
`{ "error": "That phrase is already taken — try another one" }`. If the
existing link at that phrase has already expired, its slug is automatically
reclaimed and the new link takes over — no manual deletion needed.

`deleteToken` is required to delete the link later — the app stores it in the
browser's `localStorage` automatically. There's no login system, so anyone who
holds this token can delete the link; keep the response private if that matters
to you.

---

## GET `/api/resolve/:slug`

Returns the original long URL without redirecting, and increments the click
counter. Returns `410` if the link has expired.

---

## GET `/api/urls/:slug/meta?token=<deleteToken>`

Returns metadata for a link (`clicks`, `expiresAt`, `expired`) — used by the
frontend to refresh the "Your links on this device" list. Requires the
`deleteToken` returned at creation time, so only the browser that created a
link can see its stats; anyone else (even with the exact phrase) gets `403`.

---

## DELETE `/api/urls/:slug`

Deletes a link. Requires the `deleteToken` returned at creation time:

```json
{ "deleteToken": "a24-character-token" }
```

---

## GET `/r/:slug`

Public redirect endpoint used for shareable links.

Example:

```
https://<ngrok-domain>/r/my-link-Ab12Cd
```

Redirects to the stored long URL.

---

# Technology Stack

| Layer      | Technology            |
|------------|-----------------------|
| Frontend   | React + Vite + Nginx  |
| Backend    | Node.js + Express     |
| Database   | PostgreSQL            |
| Cache      | Redis                 |
| DevOps     | Docker Compose        |
| Public URL | ngrok (optional)      |

---

# Important Notes

- The frontend must be rebuilt if `VITE_PUBLIC_BASE_URL` changes.
- The API does not require rebuilding when ngrok changes.
- Public redirect path format:

```
/r/<slug>
```

---

# Optional Cleanup

If legacy root files exist:

```bash
rm -f server.js Dockerfile package.json package-lock.json
```

Keep the project structure clean:

```
client/
server/
```

---

# Ready for Use

This URL shortener supports:

- Local development
- Public shareable links
- Redis-powered performance
- Fully containerized deployment
- Clean and production-ready structure
