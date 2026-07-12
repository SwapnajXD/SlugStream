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

# API Endpoints

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

If the phrase is already taken, this returns `409` with
`{ "error": "That phrase is already taken — try another one" }`.

`deleteToken` is required to delete the link later — the app stores it in the
browser's `localStorage` automatically. There's no login system, so anyone who
holds this token can delete the link; keep the response private if that matters
to you.

---

## GET `/api/resolve/:slug`

Returns the original long URL without redirecting, and increments the click
counter. Returns `410` if the link has expired.

---

## GET `/api/urls/:slug/meta`

Returns non-sensitive metadata for a link (`clicks`, `expiresAt`, `expired`) —
used by the frontend to refresh the "Your links on this device" list. Does not
return the delete token.

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
