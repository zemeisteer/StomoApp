import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin/', '/kabinet', '/plan/', '/booking/status/', '/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
