import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { nanoid } from 'nanoid';
import { pool, connectDB } from './config/db.js';
import redis from './config/redis.js';
import blockedExtensions from './utils/blockedExtensions.js';
import { hashPassword, verifyPassword } from './utils/password.js';
import { checkUrlSafety, verifyTurnstile } from './utils/safety.js';

const log = pino({ name: 'aliasly-api' });
const app = express();

app.set('trust proxy', 1);

/* ----------------------------------------------------------------
   Security headers
----------------------------------------------------------------- */
app.use(helmet());

/* ----------------------------------------------------------------
   CORS: allow-list via env FRONTEND_ORIGINS (comma-separated)
   Examples:
     FRONTEND_ORIGINS=http://localhost:8080,http://localhost:5173
     FRONTEND_ORIGINS=https://fe-1234abcd.ngrok.app
----------------------------------------------------------------- */
const allowList = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = allowList.length
  ? {
      origin: (origin, cb) => {
        // Allow non-browser (no origin) + explicit allowlist matches
        if (!origin || allowList.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked for origin: ${origin}`));
      },
    }
  : { origin: '*' };

app.use(cors(corsOptions));
app.use(express.json());

/* ----------------------------------------------------------------
   Rate limiting
   - Creating links is the expensive/abusable action, so it gets a
     tighter limit than redirects/resolves.
----------------------------------------------------------------- */
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many links created. Please wait a minute and try again.' },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/* ----------------------------------------------------------------
   DB init
----------------------------------------------------------------- */
await connectDB();

/* ----------------------------------------------------------------
   Helpers
----------------------------------------------------------------- */
const isBlocked = (url) => {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();
    return blockedExtensions.some((ext) => pathname.endsWith(ext));
  } catch {
    return true; // block unparseable URLs
  }
};

const isValidHttpUrl = (str) => {
  try {
    const u = new URL(str);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
};

// Allowed TTL presets, in hours. `null` means "never expires".
const TTL_HOURS = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30, never: null };

const ttlToExpiresAt = (ttlKey) => {
  if (!ttlKey || !(ttlKey in TTL_HOURS)) return null;
  const hours = TTL_HOURS[ttlKey];
  if (hours === null) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const isExpired = (expiresAt) => expiresAt && new Date(expiresAt).getTime() <= Date.now();

const passwordGateHtml = (slug) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Password required — Aliasly</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace; background: #ede8d8; color: #211d14;
    display: grid; place-items: center; height: 100vh; margin: 0; }
  .card { max-width: 340px; padding: 24px; border: 1.5px solid #a89c78; border-radius: 6px; background: #fbf9f1; text-align: center; }
  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #a89c78; border-radius: 4px;
    margin-bottom: 10px; font: inherit; background: #fff; }
  button { width: 100%; padding: 10px; border: 0; border-radius: 4px; background: #211d14; color: #d99a1b;
    font: inherit; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; }
  .err { color: #a3271f; font-size: 12px; min-height: 16px; margin-top: 8px; }
  @media (prefers-color-scheme: dark) {
    body { background: #17140f; color: #ece6d4; }
    .card { background: #211d15; border-color: #574e37; }
    input { background: #17140f; color: #ece6d4; border-color: #574e37; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>This link is password protected</h1>
    <form id="f">
      <input type="password" id="pw" placeholder="Password" autofocus required />
      <button type="submit">Unlock</button>
      <div class="err" id="err"></div>
    </form>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const errEl = document.getElementById('err');
      errEl.textContent = '';
      try {
        const res = await fetch('/api/unlock/${slug}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw })
        });
        const data = await res.json();
        if (res.ok && data.longUrl) {
          window.location.href = data.longUrl;
        } else {
          errEl.textContent = data.error || 'Incorrect password';
        }
      } catch {
        errEl.textContent = 'Something went wrong. Please try again.';
      }
    });
  </script>
</body>
</html>`;

/* ----------------------------------------------------------------
   Background cleanup: periodically purge expired links so they
   don't just accumulate forever waiting to be reclaimed on demand.
----------------------------------------------------------------- */
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function cleanupExpiredLinks() {
  try {
    const result = await pool.query(
      'DELETE FROM urls WHERE expires_at IS NOT NULL AND expires_at <= NOW()'
    );
    if (result.rowCount > 0) {
      log.info({ deleted: result.rowCount }, 'cleaned up expired links');
    }
  } catch (e) {
    log.error(e, 'cleanup job failed');
  }
}

const cleanupTimer = setInterval(cleanupExpiredLinks, CLEANUP_INTERVAL_MS);
cleanupExpiredLinks(); // also run once at startup

const shutdown = () => {
  clearInterval(cleanupTimer);
  pool.end().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/* ----------------------------------------------------------------
   Health
----------------------------------------------------------------- */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    database: 'postgresql',
  });
});

/* ----------------------------------------------------------------
   GET /api/available/:phrase
   Returns: { slug, available }
   Lets the UI check before submitting, now that the phrase IS the slug.
----------------------------------------------------------------- */
app.get('/api/available/:phrase', readLimiter, async (req, res) => {
  const safePhrase = String(req.params.phrase || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 30);

  if (!safePhrase) {
    return res.json({ slug: '', available: false });
  }

  try {
    const result = await pool.query('SELECT expires_at FROM urls WHERE slug = $1 LIMIT 1', [safePhrase]);
    const row = result.rows[0];
    const available = !row || isExpired(row.expires_at);
    res.json({ slug: safePhrase, available });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   POST /api/shorten
   Body: { longUrl, phrase, ttl?, password?, turnstileToken? }
   Returns: { slug, deleteToken, expiresAt, hasPassword }
----------------------------------------------------------------- */
app.post('/api/shorten', createLimiter, async (req, res) => {
  try {
    const { longUrl, phrase = '', ttl = 'never', password = '', turnstileToken = '' } = req.body || {};

    // 1) Validate input
    if (!isValidHttpUrl(longUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    if (isBlocked(longUrl)) {
      return res.status(400).json({ error: 'Blocked file type' });
    }
    if (!(ttl in TTL_HOURS)) {
      return res.status(400).json({ error: 'Invalid expiration option' });
    }

    // 1b) CAPTCHA - only enforced if TURNSTILE_SECRET_KEY is configured
    const turnstile = await verifyTurnstile(turnstileToken, req.ip);
    if (turnstile.checked && !turnstile.valid) {
      return res.status(400).json({ error: 'Captcha verification failed — please try again' });
    }

    // 1c) Malicious URL screening - only enforced if GOOGLE_SAFE_BROWSING_API_KEY is configured
    const safety = await checkUrlSafety(longUrl);
    if (safety.checked && !safety.safe) {
      return res.status(400).json({ error: 'This URL was flagged as unsafe and cannot be shortened' });
    }

    // 2) Normalize phrase - this is now the entire slug, so it's required
    const safePhrase = String(phrase)
      .toLowerCase()
      .replace(/[^a-z0-9\-]+/g, '-')
      .replace(/(^-+)|(-+$)/g, '')
      .slice(0, 30);

    if (!safePhrase) {
      return res.status(400).json({ error: 'Please enter a custom phrase for your link' });
    }

    const expiresAt = ttlToExpiresAt(ttl);
    const deleteToken = nanoid(24);
    const slug = safePhrase;
    const passwordHash = password ? await hashPassword(password) : null;

    // 3) Reclaim the slug if it's held by an expired link, then insert.
    // A collision after this means the slug is taken by a still-live link.
    await pool.query('DELETE FROM urls WHERE slug = $1 AND expires_at IS NOT NULL AND expires_at <= NOW()', [slug]);

    try {
      await pool.query(
        'INSERT INTO urls (slug, long_url, delete_token, expires_at, password_hash) VALUES ($1, $2, $3, $4, $5)',
        [slug, longUrl, deleteToken, expiresAt, passwordHash]
      );
    } catch (e) {
      // 23505 = unique_violation
      if (e?.code === '23505') {
        return res.status(409).json({ error: 'That phrase is already taken — try another one' });
      }
      throw e;
    }

    // 4) Prime Redis (1 hour, or less if the link expires sooner) - skip
    // caching the destination for password-protected links, since the
    // cache is keyed only by slug and would let /api/resolve bypass the
    // password check via the cached value.
    if (!passwordHash) {
      const cacheTtlSeconds = expiresAt
        ? Math.max(1, Math.min(3600, Math.floor((expiresAt.getTime() - Date.now()) / 1000)))
        : 3600;
      await redis.set(`slug:${slug}`, longUrl, 'EX', cacheTtlSeconds);
    }

    res.status(201).json({ slug, deleteToken, expiresAt, hasPassword: !!passwordHash });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   GET /api/resolve/:slug
   Returns: { longUrl, cached:boolean } or { passwordRequired: true },
   or 404 / 410
----------------------------------------------------------------- */
app.get('/api/resolve/:slug', readLimiter, async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query(
      'SELECT long_url, expires_at, password_hash FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { long_url: longUrl, expires_at: expiresAt, password_hash: passwordHash } = result.rows[0];

    if (isExpired(expiresAt)) {
      await redis.del(`slug:${slug}`);
      return res.status(410).json({ error: 'This link has expired' });
    }

    if (passwordHash) {
      // Don't reveal the destination or count a click until the password
      // is verified via POST /api/unlock/:slug.
      return res.status(401).json({ passwordRequired: true });
    }

    pool
      .query('UPDATE urls SET clicks = clicks + 1 WHERE slug = $1', [slug])
      .catch((e) => log.error(e, 'click increment failed'));

    const cached = await redis.get(`slug:${slug}`);
    if (cached) {
      return res.json({ longUrl: cached, cached: true });
    }

    await redis.set(`slug:${slug}`, longUrl, 'EX', 3600);
    res.json({ longUrl, cached: false });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   POST /api/unlock/:slug
   Body: { password }
   Verifies a link's password and returns the destination on success.
   Rate limited tightly to slow down brute-force guessing.
----------------------------------------------------------------- */
const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
});

app.post('/api/unlock/:slug', unlockLimiter, async (req, res) => {
  const { slug } = req.params;
  const { password = '' } = req.body || {};

  try {
    const result = await pool.query(
      'SELECT long_url, expires_at, password_hash FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { long_url: longUrl, expires_at: expiresAt, password_hash: passwordHash } = result.rows[0];

    if (isExpired(expiresAt)) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    if (!passwordHash) {
      // Not actually protected - resolve normally
      pool.query('UPDATE urls SET clicks = clicks + 1 WHERE slug = $1', [slug]).catch(() => {});
      return res.json({ longUrl });
    }

    const ok = await verifyPassword(password, passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    pool
      .query('UPDATE urls SET clicks = clicks + 1 WHERE slug = $1', [slug])
      .catch((e) => log.error(e, 'click increment failed'));

    res.json({ longUrl });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   GET /api/urls/:slug/meta?token=<deleteToken>
   Returns metadata for a link, but only to whoever holds its delete
   token - i.e. the browser that created it. This keeps click counts
   and creation dates from being visible to anyone who merely guesses
   or knows the phrase.
----------------------------------------------------------------- */
app.get('/api/urls/:slug/meta', readLimiter, async (req, res) => {
  const { slug } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  try {
    const result = await pool.query(
      'SELECT slug, long_url, clicks, expires_at, created_at, password_hash FROM urls WHERE slug = $1 AND delete_token = $2 LIMIT 1',
      [slug, token]
    );
    if (result.rows.length === 0) {
      // Deliberately generic: don't reveal whether the slug exists at
      // all when the token doesn't match.
      return res.status(403).json({ error: 'Not authorized' });
    }
    const row = result.rows[0];
    res.json({
      slug: row.slug,
      longUrl: row.long_url,
      clicks: row.clicks,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      expired: isExpired(row.expires_at),
      hasPassword: !!row.password_hash,
    });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   PATCH /api/urls/:slug
   Body: { deleteToken, longUrl }
   Lets whoever holds the delete token change where a link points,
   without changing the slug itself.
----------------------------------------------------------------- */
app.patch('/api/urls/:slug', readLimiter, async (req, res) => {
  const { slug } = req.params;
  const { deleteToken, longUrl } = req.body || {};

  if (!deleteToken) {
    return res.status(400).json({ error: 'Missing delete token' });
  }
  if (!isValidHttpUrl(longUrl)) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  if (isBlocked(longUrl)) {
    return res.status(400).json({ error: 'Blocked file type' });
  }

  const safety = await checkUrlSafety(longUrl);
  if (safety.checked && !safety.safe) {
    return res.status(400).json({ error: 'This URL was flagged as unsafe and cannot be used' });
  }

  try {
    const result = await pool.query(
      'UPDATE urls SET long_url = $1 WHERE slug = $2 AND delete_token = $3 RETURNING expires_at, password_hash',
      [longUrl, slug, deleteToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid token or link not found' });
    }

    const { expires_at: expiresAt, password_hash: passwordHash } = result.rows[0];

    // Refresh (or clear) the cache to match the new destination
    if (passwordHash) {
      await redis.del(`slug:${slug}`);
    } else {
      const cacheTtlSeconds = expiresAt
        ? Math.max(1, Math.min(3600, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
        : 3600;
      if (cacheTtlSeconds > 0) {
        await redis.set(`slug:${slug}`, longUrl, 'EX', cacheTtlSeconds);
      }
    }

    res.json({ slug, longUrl });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   DELETE /api/urls/:slug
   Body: { deleteToken }
   Anonymous "auth": whoever holds the token that was returned at
   creation time can delete the link.
----------------------------------------------------------------- */
app.delete('/api/urls/:slug', readLimiter, async (req, res) => {
  const { slug } = req.params;
  const { deleteToken } = req.body || {};

  if (!deleteToken) {
    return res.status(400).json({ error: 'Missing delete token' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM urls WHERE slug = $1 AND delete_token = $2 RETURNING slug',
      [slug, deleteToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid token or link not found' });
    }

    await redis.del(`slug:${slug}`);
    res.json({ deleted: true });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   GET /r/:slug
   Public redirect endpoint (shareable):
   - Use with a single ngrok tunnel exposing the API port (5000)
   Example short link to share:
     https://<your-api>.ngrok.app/r/<slug>
----------------------------------------------------------------- */
app.get('/r/:slug', readLimiter, async (req, res) => {
  const { slug } = req.params;

  try {
    const result = await pool.query(
      'SELECT long_url, expires_at, password_hash FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Short link not found');
    }

    const { long_url: longUrl, expires_at: expiresAt, password_hash: passwordHash } = result.rows[0];

    if (isExpired(expiresAt)) {
      await redis.del(`slug:${slug}`);
      return res.status(410).send('This link has expired');
    }

    if (passwordHash) {
      return res.status(200).type('html').send(passwordGateHtml(slug));
    }

    pool
      .query('UPDATE urls SET clicks = clicks + 1 WHERE slug = $1', [slug])
      .catch((e) => log.error(e, 'click increment failed'));

    const cached = await redis.get(`slug:${slug}`);
    if (cached) return res.redirect(cached);

    await redis.set(`slug:${slug}`, longUrl, 'EX', 3600);
    return res.redirect(longUrl);
  } catch (e) {
    log.error(e);
    return res.status(500).send('Server error');
  }
});

export default app;
