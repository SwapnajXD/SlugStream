import Redis from 'ioredis';
const url = process.env.REDIS_URL || '';
let client;

if (url) {
  client = new Redis(url);
  client.on('error', (e) => console.error('Redis error:', e));
} else {
  // no-op shim so the app still works without Redis
  client = {
    async get() { return null; },
    async set() { return 'OK'; },
    async del() { return 0; }
  };
}

export default client;