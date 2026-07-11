import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export const connectDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        long_url TEXT NOT NULL,
        delete_token VARCHAR(64),
        clicks INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Lightweight migration path for pre-existing tables from earlier versions
    await pool.query(`ALTER TABLE urls ADD COLUMN IF NOT EXISTS delete_token VARCHAR(64);`);
    await pool.query(`ALTER TABLE urls ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE urls ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_urls_expires_at ON urls (expires_at);`);

    console.log('PostgreSQL connected and table ready');
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    process.exit(1);
  }
};