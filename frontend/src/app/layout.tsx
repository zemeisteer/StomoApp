import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { ClientLayout } from './ClientLayout';
import { brandCssText } from '../lib/brandTheme';
import { BRAND_REVALIDATE_SECONDS, getClinicBrandServer } from '../lib/clinicServer';

// Branding (colors, logo, clinic name) is rendered on the server and refreshed periodically.
export const revalidate = BRAND_REVALIDATE_SECONDS;

const DEFAULT_TITLE = 'Zamonaviy stomatologiya klinikasi';
const DEFAULT_DESCRIPTION =
  "Og'riqsiz tish davolash, dental implantatsiya, breketlar va professional gigiyena. Onlayn qabulga yozilish.";

export async function generateMetadata(): Promise<Metadata> {
  const clinic = await getClinicBrandServer();
  const name = clinic?.name || 'DentaCare';
  const title = (clinic?.metaTitleUz as string) || `${name} — ${DEFAULT_TITLE}`;
  return {
    title: { default: title, template: `%s | ${name}` },
    description: (clinic?.metaDescriptionUz as string) || DEFAULT_DESCRIPTION,
    applicationName: name,
    icons: clinic?.logo ? { icon: clinic.logo, apple: clinic.logo } : { icon: '/favicon.ico' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const clinic = await getClinicBrandServer();

  return (
    <html lang="uz" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        {/* Per-clinic palette; values are generated from validated #RRGGBB colors only. */}
        <style id="brand-theme" dangerouslySetInnerHTML={{ __html: brandCssText(clinic || {}) }} />
      </head>
      <body className="bg-canvas text-ink antialiased selection:bg-brand-600 selection:text-white" suppressHydrationWarning>
        <ClientLayout initialClinic={clinic}>{children}</ClientLayout>
      </body>
    </html>
  );
}
