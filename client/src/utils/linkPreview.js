export function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function getFaviconUrl(url, size = 32) {
  const hostname = getHostname(url);
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(hostname)}`;
}
