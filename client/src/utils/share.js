export function canWebShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// Returns true on share/cancel (nothing to report), false on a real error
// worth surfacing to the user.
export async function webShare({ title, url }) {
  try {
    await navigator.share({ title, url });
    return true;
  } catch (err) {
    // AbortError just means the user closed the share sheet - not an error
    if (err?.name === 'AbortError') return true;
    return false;
  }
}
