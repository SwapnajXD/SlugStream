**Architecture Diagram — SlugStream**

```mermaid
flowchart LR
	subgraph Browser
		A[User Browser / SPA]
	end

	subgraph Web "Static Web Server"
		NG[Nginx (serves built SPA)]
	end

	subgraph API "Backend API (Express)"
		API[Express app (/api, /r)]
		REDIS[Redis cache]
		PG[Postgres]
	end

	A -->|Loads SPA| NG
	A -->|POST /api/shorten & GET /api/resolve/:slug| API
	NG --> API
	API --> REDIS
	API --> PG
	REDIS -- fallback --> PG

	classDef infra fill:#f9f,stroke:#333,stroke-width:1px;
	class NG,API,PG,REDIS infra;
```

**Overview**
- **Purpose:** SlugStream is a lightweight URL shortener. The frontend is a Vite + React SPA; the backend is an Express API that uses Postgres for durable storage and Redis as an optional cache.

**Services (Docker / runtime)**
- **web:** Static SPA served by `nginx` (see [docker-compose.yml](docker-compose.yml)). Built from [client/Dockerfile](client/Dockerfile).
- **api:** Node/Express server running `server/server.js` (app entry at [server/src/app.js](server/src/app.js)). Built from [server/Dockerfile](server/Dockerfile).
- **db:** Postgres 15 (persistent volume `db_data` defined in [docker-compose.yml](docker-compose.yml)).
- **redis:** Redis (optional cache) used by the API; configured via `REDIS_URL` in [docker-compose.yml](docker-compose.yml).

**Client (SPA) - key files**
- **Router:** `client/src/main.jsx` sets up routes `/` and `/:slug`.
- **Create flow:** `client/src/components/LinkForm.jsx` calls `POST ${API_URL}/api/shorten` (API URL comes from [client/src/config/constants.js](client/src/config/constants.js)).
- **Result:** `client/src/components/ResultCard.jsx` shows the short URL (uses `FRONTEND_BASE`).
- **Redirect page:** `client/src/pages/RedirectPage.jsx` fetches `GET ${API_URL}/api/resolve/:slug` and uses `window.location.replace()` to perform the client-side redirect.

**Backend (Express) - key files & endpoints**
- Entry: `server/server.js` loads environment and starts the HTTP server.
- App: `server/src/app.js` implements main logic and routes:
	- `POST /api/shorten` — validate input, check blocked extensions, generate slug with `nanoid`, insert into Postgres, prime Redis with TTL 3600s, return `{ slug }`.
	- `GET /api/resolve/:slug` — Redis-first lookup, fallback to Postgres, backfill Redis, return `{ longUrl, cached }`.
	- `GET /r/:slug` — public redirect endpoint that responds with HTTP redirect to the target URL (Redis-first, then DB fallback).

**Database & Persistence**
- Postgres connection and initialization: [server/src/config/db.js](server/src/config/db.js). The table created:

	- `urls(id SERIAL PRIMARY KEY, slug VARCHAR(100) UNIQUE NOT NULL, long_url TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`

- The app uses `pg` Pool (`pool.query(...)`) for transactions and inserts; unique slug collisions are retried up to 3 times in `POST /api/shorten` (unique_violation code `23505`).

**Cache (Redis)**
- Implemented by [server/src/config/redis.js](server/src/config/redis.js) using `ioredis` when `REDIS_URL` is provided. If `REDIS_URL` is missing, a shim is used so Redis calls are no-ops and the app still functions.
- Redis key pattern: `slug:<slug>` with TTL 3600 seconds (1 hour). Used to speed up `resolve` and `r` redirect endpoints.

**CORS, Validation, and Safety**
- CORS: allow-list behavior in `server/src/app.js` based on `FRONTEND_ORIGINS` environment variable.
- URL validation: both client (`client/src/utils/validation.js`) and server (`isValidHttpUrl` helper in `server/src/app.js`) verify `http`/`https` protocols.
- Blocked file types: `server/src/utils/blockedExtensions.js` contains extensions blocked by the server (e.g., `.exe`, `.apk`, `.zip`). The server rejects blocked or unparseable URLs.

**Data flows (step-by-step)**
- Create short URL (POST /api/shorten):
	1. Client sends `{ longUrl, phrase? }` to `POST /api/shorten`.
 2. Server validates URL and checks blocked extensions.
 3. Server constructs `slug` using sanitized `phrase` + `nanoid(6)`.
 4. Server inserts into Postgres (`pool.query('INSERT INTO urls (slug, long_url) ...')`).
 5. Server primes Redis: `set('slug:<slug>', longUrl, 'EX', 3600)`.
 6. Server responds with `{ slug }`.

- Resolve link (GET /api/resolve/:slug):
	1. Client requests `GET /api/resolve/:slug`.
 2. Server checks Redis first: if found, return `{ longUrl, cached: true }`.
 3. If not in Redis, query Postgres for slug, backfill Redis, then return `{ longUrl, cached: false }`.

- Public redirect (GET /r/:slug):
	1. Request hits `GET /r/:slug` on API host.
	2. Server attempts Redis lookup; if found, `res.redirect(longUrl)`.
	3. Otherwise, fetch from Postgres and redirect; also backfill Redis.

**Deployment and env vars**
- Key env vars in [docker-compose.yml](docker-compose.yml):
	- `DATABASE_URL` e.g. `postgresql://user:password@db:5432/slugstream` (Postgres service `db`).
	- `REDIS_URL` e.g. `redis://redis:6379` (Redis service `redis`).
	- `FRONTEND_ORIGINS` controls CORS allow-list for the API.
	- `VITE_API_URL` and `VITE_PUBLIC_BASE_URL` are build-time args for the SPA (see [client/Dockerfile](client/Dockerfile)).

**Notes, Observations & Recommended fixes**
- There is an unused Mongoose model at [server/src/models/Url.js](server/src/models/Url.js) that references `mongoose` and a different schema shape; however, `mongoose` is not a dependency in `server/package.json` and the rest of the server uses `pg`/Postgres. This file appears leftover and can be removed or reconciled.
- Redis is optional (the code includes a safe shim); the app works without Redis but benefits from caching for hot slugs.

**Where to look for implementation details**
- Server main logic: [server/src/app.js](server/src/app.js)
- DB init: [server/src/config/db.js](server/src/config/db.js)
- Redis client shim: [server/src/config/redis.js](server/src/config/redis.js)
- Frontend routing and redirect behavior: [client/src/main.jsx](client/src/main.jsx) and [client/src/pages/RedirectPage.jsx](client/src/pages/RedirectPage.jsx)
- Client create flow: [client/src/components/LinkForm.jsx](client/src/components/LinkForm.jsx)

**Operational diagram (text summary)**
- Browser loads SPA from the `web` service (Nginx). The SPA performs API calls to the `api` service. The API reads/writes canonical data to Postgres and caches lookups in Redis. Docker Compose wires `web`, `api`, `db`, and `redis` together and exposes ports `8080` (frontend) and `5000` (api).

---

If you'd like, I can also:
- generate a printable SVG/PNG of the above Mermaid diagram, or
- produce a simplified one-page README section summarizing run & env setup steps.


