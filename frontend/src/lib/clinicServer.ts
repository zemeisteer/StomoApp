import type { PublicClinicBrand } from './brand';

/** Seconds a rendered page may show stale branding after the owner changes it. */
export const BRAND_REVALIDATE_SECONDS = 60;

function backendBaseUrl() {
  const explicit = process.env.INTERNAL_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/+$/, '').replace(/\/api$/, '');
  return 'http://localhost:4000';
}

/**
 * Loads the public clinic profile on the server so branding (colors, logo, name) is part of the
 * first HTML response. Never throws: during `next build` or a backend outage it falls back to
 * the default theme and the page is re-rendered on the next revalidation.
 */
export async function getClinicBrandServer(): Promise<PublicClinicBrand | null> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return null;
  try {
    const res = await fetch(`${backendBaseUrl()}/api/public/clinic`, {
      next: { revalidate: BRAND_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicClinicBrand;
  } catch {
    return null;
  }
}
