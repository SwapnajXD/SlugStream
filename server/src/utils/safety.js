// Both checks are OPT-IN: if the relevant env var isn't set, the check is
// skipped entirely (returns "pass"). This keeps local/dev setups working
// without requiring API keys, while letting a public deployment turn on
// real protection just by setting the env vars.

const FETCH_TIMEOUT_MS = 4000;

export async function checkUrlSafety(longUrl) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) return { safe: true, checked: false };

  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'aliasly', clientVersion: '1.0.0' },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url: longUrl }],
          },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) return { safe: true, checked: false }; // fail open on API errors
    const data = await res.json();
    const flagged = Array.isArray(data.matches) && data.matches.length > 0;
    return { safe: !flagged, checked: true };
  } catch {
    return { safe: true, checked: false }; // fail open on network/timeout errors
  }
}

export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { valid: true, checked: false };
  if (!token) return { valid: false, checked: true };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = await res.json();
    return { valid: !!data.success, checked: true };
  } catch {
    // Fail closed for CAPTCHA specifically - if verification is configured
    // but unreachable, don't silently let bots through.
    return { valid: false, checked: true };
  }
}
