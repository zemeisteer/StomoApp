import type { Metadata } from 'next';
import { Onest } from 'next/font/google';
import '@fontsource-variable/inter';
import './globals.css';

// Public-site face: Onest covers Latin and Cyrillic (Uzbek and Russian) in one variable file.
const onest = Onest({ subsets: ['latin', 'latin-ext', 'cyrillic'], display: 'swap', variable: '--font-onest' });
import { ClientLayout } from './ClientLayout';
import { brandCssText } from '../lib/brandTheme';
import { BRAND_REVALIDATE_SECONDS, getClinicBrandServer } from '../lib/clinicServer';
import { SITE_URL } from '../lib/siteUrl';

// Branding (colors, logo, clinic name) is rendered on the server and refreshed periodically.
export const revalidate = BRAND_REVALIDATE_SECONDS;


const DEFAULT_TITLE ='Zamonaviy stomatologiya klinikasi';
const DEFAULT_DESCRIPTION =
  "Og'riqsiz tish davolash, dental implantatsiya, breketlar va professional gigiyena. Onlayn qabulga yozilish.";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicBrandServer();
  const name = clinic?.name || 'DentaCare';
  const title = (clinic?.metaTitleUz as string) || `${name} — ${DEFAULT_TITLE}`;
  const description = (clinic?.metaDescriptionUz as string) || DEFAULT_DESCRIPTION;
  return {
    // Absolute base for link previews (og:image must be a full URL for Telegram/WhatsApp).
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${name}` },
    description,
    applicationName: name,
    openGraph: { type: 'website', siteName: name, locale: 'uz_UZ', url: '/', title, description },
    twitter: { card: 'summary_large_image', title, description },
    icons: clinic?.logo ? { icon: clinic.logo, apple: clinic.logo } : { icon: '/favicon.ico' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const clinic = await getClinicBrandServer();

  return (
    <html lang="uz" className={`scroll-smooth ${onest.variable}`} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="page-type" content="service" />
        <meta name="site-kind" content="other" />
        {/* Per-clinic palette; values are generated from validated #RRGGBB colors only. */}
        <style id="brand-theme" dangerouslySetInnerHTML={{ __html: brandCssText(clinic || {}) }} />
      </head>
      <body className="bg-canvas text-ink antialiased selection:bg-brand-600 selection:text-white" suppressHydrationWarning>
        <ClientLayout initialClinic={clinic}>{children}</ClientLayout>
      </body>
    </html>
  );
}
