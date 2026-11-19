import type { Metadata } from 'next';

const TITLE = 'Boshqaruv paneliga kirish';
const DESCRIPTION = 'DentaCare xodimlari uchun: qabullar kalendari, bemorlar, kassa va hisobotlar.';

// The page itself is a client component, so its link-preview metadata lives here.
// openGraph is replaced (not merged) by child segments, so it is spelled out in full.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'DentaCare',
    locale: 'uz_UZ',
    url: '/admin/login',
    title: `${TITLE} | DentaCare`,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: `${TITLE} | DentaCare`, description: DESCRIPTION },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
