import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shaxsiy kabinet',
  robots: { index: false, follow: false },
};

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
