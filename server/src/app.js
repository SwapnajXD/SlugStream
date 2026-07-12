import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { nanoid } from 'nanoid';
import { pool, connectDB } from './config/db.js';
import redis from './config/redis.js';
import blockedExtensions from './utils/blockedExtensions.js';

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
    const result = await pool.query('SELECT 1 FROM urls WHERE slug = $1 LIMIT 1', [safePhrase]);
    res.json({ slug: safePhrase, available: result.rows.length === 0 });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   POST /api/shorten
   Body: { longUrl, phrase, ttl? }
   Returns: { slug, deleteToken, expiresAt }
----------------------------------------------------------------- */
app.post('/api/shorten', createLimiter, async (req, res) => {
  try {
    const { longUrl, phrase = '', ttl = 'never' } = req.body || {};

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

    // 3) Insert - since the slug is just the phrase, a collision means the
    // phrase is already taken rather than a random-ID retry situation.
    try {
      await pool.query(
        'INSERT INTO urls (slug, long_url, delete_token, expires_at) VALUES ($1, $2, $3, $4)',
        [slug, longUrl, deleteToken, expiresAt]
      );
    } catch (e) {
      // 23505 = unique_violation
      if (e?.code === '23505') {
        return res.status(409).json({ error: 'That phrase is already taken — try another one' });
      }
      throw e;
    }

    // 4) Prime Redis (1 hour, or less if the link expires sooner)
    const cacheTtlSeconds = expiresAt
      ? Math.max(1, Math.min(3600, Math.floor((expiresAt.getTime() - Date.now()) / 1000)))
      : 3600;
    await redis.set(`slug:${slug}`, longUrl, 'EX', cacheTtlSeconds);

    res.status(201).json({ slug, deleteToken, expiresAt });
  } catch (e) {
    log.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ----------------------------------------------------------------
   GET /api/resolve/:slug
   Returns: { longUrl, cached:boolean } or 404 / 410
----------------------------------------------------------------- */
app.get('/api/resolve/:slug', readLimiter, async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query(
      'SELECT long_url, expires_at FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { long_url: longUrl, expires_at: expiresAt } = result.rows[0];

    if (isExpired(expiresAt)) {
      await redis.del(`slug:${slug}`);
      return res.status(410).json({ error: 'This link has expired' });
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
   GET /api/urls/:slug/meta
   Returns non-sensitive metadata for a link (used to refresh the
   client's local history view). Does NOT return the delete token.
----------------------------------------------------------------- */
app.get('/api/urls/:slug/meta', readLimiter, async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query(
      'SELECT slug, long_url, clicks, expires_at, created_at FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }
    const row = result.rows[0];
    res.json({
      slug: row.slug,
      longUrl: row.long_url,
      clicks: row.clicks,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      expired: isExpired(row.expires_at),
    });
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
      'SELECT long_url, expires_at FROM urls WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Short link not found');
    }

    const { long_url: longUrl, expires_at: expiresAt } = result.rows[0];

    if (isExpired(expiresAt)) {
      await redis.del(`slug:${slug}`);
      return res.status(410).send('This link has expired');
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
