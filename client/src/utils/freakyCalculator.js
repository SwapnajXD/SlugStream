// Purely cosmetic "suspicion score" for the phrase the user types.
// Nothing here affects validation or routing - it's just the app's
// signature bit of personality: the freakier the phrase looks, the
// higher the score.

const SUSPICIOUS_WORDS = [
  'virus', 'hack', 'free', 'prize', 'winner', 'urgent', 'click',
  'verify', 'account', 'suspended', 'password', 'gift', 'crypto',
  'airdrop', 'refund', 'invoice', 'unclaimed', 'bonus', 'limited',
  'act-now', 'scam', 'totally-not', 'definitely-not', 'trust-me',
];

const SCARY_PUNCTUATION = /[!]{1,}/g;
const ALL_CAPS_WORD = /\b[A-Z]{3,}\b/;

export function calculateFreakyScore(rawPhrase) {
  const phrase = String(rawPhrase || '').trim();

  if (!phrase) {
    return { score: 0, label: 'Plain and boring', tier: 'none' };
  }

  let score = 0;
  const lower = phrase.toLowerCase();

  // Suspicious vocabulary
  const hits = SUSPICIOUS_WORDS.filter((w) => lower.includes(w));
  score += hits.length * 18;

  // Length: longer freaky phrases read as more "extra"
  score += Math.min(20, Math.floor(phrase.length / 3));

  // Hyphen density (freaky-url-style phrases chain a lot of words)
  const hyphens = (phrase.match(/-/g) || []).length;
  score += Math.min(15, hyphens * 4);

  // Shouting
  if (ALL_CAPS_WORD.test(rawPhrase || '')) score += 12;
  score += Math.min(10, ((rawPhrase || '').match(SCARY_PUNCTUATION) || []).length * 5);

  // Numbers mixed into words (l33t-speak reads as freakier)
  if (/[a-z]\d|\d[a-z]/i.test(phrase)) score += 8;

  score = Math.max(0, Math.min(100, score));

  let label;
  let tier;
  if (score === 0) {
    label = 'Plain and boring';
    tier = 'none';
  } else if (score < 25) {
    label = 'Mildly suspicious';
    tier = 'low';
  } else if (score < 55) {
    label = 'Pretty freaky';
    tier = 'medium';
  } else if (score < 80) {
    label = 'Extremely sus';
    tier = 'high';
  } else {
    label = 'Do not click this';
    tier = 'max';
  }

  return { score, label, tier };
}
