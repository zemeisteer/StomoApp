import type { MetadataRoute } from 'next';
import { backendBaseUrl } from '../lib/clinicServer';
import { SITE_URL } from '../lib/siteUrl';

export const revalidate = 3600;

const STATIC_PAGES = ['', '/services', '/doctors', '/prices', '/booking', '/reviews', '/articles', '/faq', '/about', '/contacts', '/privacy', '/terms'];

/** Slugs of one public list; an unreachable API (e.g. during `next build`) just means no extra URLs. */
async function slugs(path: string): Promise<string[]> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return [];
  try {
    const res = await fetch(`${backendBaseUrl()}${path}`, { next: { revalidate }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const body = await res.json();
    const rows: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.items) ? body.items : [];
    return rows
      .map((r) => (r as { slug?: unknown })?.slug)
      .filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]+$/i.test(s));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [doctors, services, articles] = await Promise.all([
    slugs('/api/public/doctors'),
    slugs('/api/public/services'),
    slugs('/api/articles'),
  ]);
  const now = new Date();
  return [
    ...STATIC_PAGES.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 })),
    ...doctors.map((s) => ({ url: `${SITE_URL}/doctors/${s}`, lastModified: now })),
    ...services.map((s) => ({ url: `${SITE_URL}/services/${s}`, lastModified: now })),
    ...articles.map((s) => ({ url: `${SITE_URL}/articles/${s}`, lastModified: now })),
  ];
}
