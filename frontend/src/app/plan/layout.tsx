import type { Metadata } from 'next';

// Private approval links must never be indexed or leak through the Referer header.
export const metadata: Metadata = {
  title: 'Davolash rejasi',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
