import type { Metadata } from 'next';

// The whole staff panel stays out of search engines (next.config also sends X-Robots-Tag).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
