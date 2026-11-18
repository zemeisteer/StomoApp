import { OG_SIZE, renderOgCard } from '../../../lib/ogCard';

export const alt = 'DentaCare boshqaruv paneli';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const runtime = 'edge'; // see src/app/opengraph-image.tsx

export default function Image() {
  return renderOgCard({
    badge: 'Boshqaruv paneli',
    title: 'Klinikani bitta paneldan boshqaring',
    subtitle: 'Qabullar kalendari, bemorlar kartasi, kassa va hisobotlar. Xodimlar uchun kirish.',
    chips: ['Kalendar', 'Bemorlar', 'Kassa', 'Hisobotlar'],
    dark: true,
  });
}
