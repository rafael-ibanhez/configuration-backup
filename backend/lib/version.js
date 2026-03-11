/**
 * Semantic version comparison utilities.
 * Versions are dot-separated numeric strings like "2.1.5.3" or "1.0.0".
 * Comparison is done numerically per segment, so "2.1.10.0" > "2.1.9.9".
 */

/** Parse "2.1.5.3" → [2, 1, 5, 3] */
export function parseVer(v) {
  return String(v).split('.').map(n => parseInt(n, 10) || 0);
}

/** Compare two version strings. Returns -1 (a < b), 0 (equal), or 1 (a > b). */
export function cmpVer(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Returns true if version v falls within [from, to].
 * to = null / undefined / '' means open-ended (no upper bound).
 */
export function versionInRange(v, from, to) {
  if (cmpVer(v, from) < 0) return false;
  if (to != null && to !== '' && cmpVer(v, to) > 0) return false;
  return true;
}
