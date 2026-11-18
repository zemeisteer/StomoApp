import { OG_SIZE, renderOgCard } from '../lib/ogCard';

export const alt = 'DentaCare: zamonaviy stomatologiya klinikasi';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const runtime = 'edge'; // next/og's bundled font fails to load under the Node runtime on Windows builds

export default function Image() {
  return renderOgCard({
    badge: 'Onlayn qabul',
    title: 'Kattalar va bolalar uchun stomatologiya',
    subtitle: "Og'riqsiz davolash, implant, breketlar va gigiyena. Qabulga 1 daqiqada yoziling.",
    chips: ['Implantatsiya', 'Breketlar', 'Bolalar', 'Oqartirish'],
  });
}
