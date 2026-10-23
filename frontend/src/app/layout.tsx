import type { Metadata } from 'next';
import './globals.css';
import { ClientLayout } from './ClientLayout';

export const metadata: Metadata = {
  title: 'DentaCare — Zamonaviy stomatologiya klinikasi | Toshkent',
  description: 'Og\'riqsiz tish davolash, dental implantatsiya, breketlar va professional gigiyena. Germaniya va Yaponiya texnologiyalari asosida 15 yildan ortiq tajriba.',
  keywords: 'stomatologiya, tish davolash, toshkent stomatologiya, implantatsiya, breketlar, dentacare, tish shifokori',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className="bg-[var(--app-bg)] text-[var(--text)] antialiased selection:bg-[#167b78] selection:text-white"
        suppressHydrationWarning
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
