/**
 * Links and image sources built from database values (clinic social links, map links, logo,
 * photos, article links) go through this. Allowed: `https://…` or a same-site path that starts
 * with a single `/`. Everything else (javascript:, data:, http:, `//host`, `/\host`, whitespace or
 * control characters) returns null, so the caller renders no link at all.
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > 2048) return null;
  // Whitespace and control characters inside a URL are a classic filter bypass (java\tscript:)
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v)) return null;
  if (v.startsWith('/')) {
    // "//host" and "/\host" are protocol-relative: they leave the site
    return v[1] === '/' || v[1] === '\\' ? null : v;
  }
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}
