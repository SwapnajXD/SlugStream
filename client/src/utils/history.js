const STORAGE_KEY = 'slugstream:history';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage can throw in private-browsing / storage-full cases;
    // history is a nice-to-have, so fail silently.
  }
}

export function getHistory() {
  // Newest first
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function addToHistory(entry) {
  const entries = readAll();
  entries.push({
    slug: entry.slug,
    longUrl: entry.longUrl,
    deleteToken: entry.deleteToken,
    expiresAt: entry.expiresAt || null,
    createdAt: new Date().toISOString(),
  });
  writeAll(entries);
}

export function removeFromHistory(slug) {
  writeAll(readAll().filter((e) => e.slug !== slug));
}
