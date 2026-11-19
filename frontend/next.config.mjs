const isProdBuild = process.env.NODE_ENV === 'production';

/** Hosts the Next.js image optimizer may fetch from: the API host plus NEXT_PUBLIC_IMAGE_HOSTS (comma list). */
function imageHosts() {
  const hosts = new Set();
  for (const raw of [process.env.NEXT_PUBLIC_API_URL, ...(process.env.NEXT_PUBLIC_IMAGE_HOSTS || '').split(',')]) {
    const value = (raw || '').trim();
    if (!value) continue;
    try {
      hosts.add(new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).hostname);
    } catch {
      // ignore malformed entries
    }
  }
  return [...hosts].filter((h) => h && h !== 'localhost');
}

// Baseline CSP that does not restrict scripts, styles, images or connections (nothing on the site
// breaks), but closes plugins, <base> hijacking, framing by other sites and foreign form targets.
const csp = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  ...(isProdBuild ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Content-Security-Policy', value: csp },
  ...(isProdBuild ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  images: {
    // Never '**': the optimizer would fetch any URL on the internet for anyone (SSRF / open proxy).
    // Clinic photos from the database are rendered with `unoptimized`, so they do not need this list.
    remotePatterns: [
      ...imageHosts().map((hostname) => ({ protocol: 'https', hostname })),
      ...(isProdBuild ? [] : [{ protocol: 'http', hostname: 'localhost' }]),
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The staff panel never appears in search results
      { source: '/admin', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
