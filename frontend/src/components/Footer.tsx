'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Stethoscope } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useBrand } from '../lib/brand';
import { api } from '../lib/api';
import { formatWorkingHours } from '../lib/dateFormat';

/** Light, quiet footer: brand, navigation, branches and contacts separated by hairlines. */
export const Footer: React.FC = () => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const brand = useBrand();
  const clinicName = brand.clinicName(language);
  const phone = (brand.clinic?.phone as string) || '';
  const email = (brand.clinic?.email as string) || '';
  const telegram = (brand.clinic?.telegramLink as string) || '';
  const instagram = (brand.clinic?.instagramLink as string) || '';
  const [logoError, setLogoError] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .getBranches()
      .then((data) => alive && Array.isArray(data) && setBranches(data.slice(0, 3)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const nav = [
    { href: '/services', label: t.nav.services },
    { href: '/doctors', label: t.nav.doctors },
    { href: '/prices', label: L('Narxlar', 'Цены') },
    { href: '/reviews', label: t.reviews.title },
    { href: '/about', label: t.nav.about },
    { href: '/faq', label: 'FAQ' },
    { href: '/contacts', label: t.nav.contacts },
    ...(process.env.NEXT_PUBLIC_SHOW_PATIENT_CABINET === 'true' ? [{ href: '/kabinet', label: L('Shaxsiy kabinet', 'Личный кабинет') }] : []),
  ];

  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label={clinicName}>
              {brand.logo && !logoError ? (
                <Image src={brand.logo} alt={clinicName} width={160} height={36} unoptimized onError={() => setLogoError(true)} className="h-9 w-auto max-w-[160px] object-contain" />
              ) : (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <Stethoscope className="h-4 w-4" />
                  </span>
                  <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{clinicName}</span>
                </>
              )}
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-muted">
              {L('Zamonaviy stomatologiya: aniq tashxis, tushunarli reja va xotirjam muolaja.', 'Современная стоматология: точный диагноз, понятный план и спокойное лечение.')}
            </p>
          </div>

          <nav className="md:col-span-3" aria-label={L('Sayt bo‘limlari', 'Разделы сайта')}>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Bo‘limlar', 'Разделы')}</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              {nav.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="text-ink-muted transition-colors hover:text-ink">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-3">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Filiallar', 'Филиалы')}</p>
            <ul className="space-y-4 text-sm">
              {branches.map((b) => (
                <li key={b.id}>
                  <p className="text-ink">{isRu && b.nameRu ? b.nameRu : b.nameUz}</p>
                  <p className="mt-0.5 text-ink-muted">{isRu && b.addressRu ? b.addressRu : b.addressUz}</p>
                  {(b.workingHours || b.openingHours) && (
                    <p className="mt-0.5 text-xs text-ink-subtle">{formatWorkingHours(b.workingHours, language) || b.openingHours}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{t.nav.contacts}</p>
            <ul className="space-y-2.5 text-sm">
              {phone && (
                <li>
                  <a href={`tel:${phone.replace(/\s+/g, '')}`} className="tabular-nums text-ink transition-colors hover:text-brand-700">
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a href={`mailto:${email}`} className="break-all text-ink-muted transition-colors hover:text-ink">
                    {email}
                  </a>
                </li>
              )}
              {telegram && (
                <li>
                  <a href={telegram} target="_blank" rel="noopener noreferrer" className="text-ink-muted transition-colors hover:text-ink">
                    Telegram
                  </a>
                </li>
              )}
              {instagram && (
                <li>
                  <a href={instagram} target="_blank" rel="noopener noreferrer" className="text-ink-muted transition-colors hover:text-ink">
                    Instagram
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {clinicName}. {L('Barcha huquqlar himoyalangan.', 'Все права защищены.')}
          </p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition-colors hover:text-ink">
              {L('Maxfiylik siyosati', 'Политика конфиденциальности')}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              {L('Foydalanish shartlari', 'Условия использования')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
