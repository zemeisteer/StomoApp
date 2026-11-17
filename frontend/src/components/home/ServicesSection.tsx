'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { SERVICE_CATEGORIES, serviceCategoryLabel } from '../../lib/serviceCategories';
import { SITE_PHOTOS } from '../../lib/sitePhotos';
import { Container, SectionError, TextLink, formatSom } from '../site/primitives';
import { Photo } from '../site/moments';

interface ServicesSectionProps {
  services: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** services-list: one row per service (name, time, price from) beside one tall photograph of the work. */
export const ServicesSection: React.FC<ServicesSectionProps> = ({ services, isLoading, error, onRetry }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  // Until the clinic adds its services, the rows name the kinds of care the system knows.
  const rows =
    services.length > 0
      ? services.slice(0, 6).map((s) => ({
          key: s.id,
          href: `/services/${s.slug}`,
          name: isRu && s.nameRu ? s.nameRu : s.nameUz,
          meta: serviceCategoryLabel(s.category, language),
          price: s.priceFrom ? `${L('dan', 'от')} ${formatSom(s.priceFrom)} ${t.common.uzs}` : '',
          time: s.durationMinutes ? `${s.durationMinutes} ${L('daq', 'мин')}` : '',
        }))
      : SERVICE_CATEGORIES.filter((c) => c.value !== 'OTHER')
          .slice(0, 6)
          .map((c) => ({ key: c.value, href: '/services', name: isRu ? c.ru : c.uz, meta: '', price: '', time: '' }));

  return (
    <section id="services" className="screen bg-white py-20 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p className="mb-4 text-sm font-medium text-brand-700">{t.nav.services}</p>
            <h2 className="max-w-xl text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">
              {L('Davolash, implant va breketlar bir klinikada', 'Лечение, импланты и брекеты в одной клинике')}
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
              {L('Har bir xizmatning boshlang‘ich narxi saytda turibdi. Aniq narx ko‘rikdan keyin rejada yoziladi.', 'Цена «от» указана у каждой услуги. Точную сумму врач пишет в плане после осмотра.')}
            </p>

            {isLoading && (
              <ul className="mt-10 border-t border-line" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="border-b border-line py-6">
                    <div className="h-5 w-1/2 animate-pulse rounded bg-canvas" />
                  </li>
                ))}
              </ul>
            )}
            {!isLoading && error && (
              <div className="mt-10">
                <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />
              </div>
            )}
            {!isLoading && !error && (
              <ul className="mt-10 border-t border-line">
                {rows.map((r) => (
                  <li key={r.key} className="border-b border-line">
                    <Link
                      href={r.href}
                      className="group grid min-h-[72px] grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 transition-colors sm:grid-cols-[1fr_auto_auto]"
                    >
                      <span>
                        <span className="block text-lg font-medium tracking-[-0.01em] text-ink transition-colors group-hover:text-brand-700 sm:text-xl">
                          {r.name}
                        </span>
                        {r.meta && <span className="mt-0.5 block text-sm text-ink-subtle">{r.meta}</span>}
                      </span>
                      <span className="hidden text-right text-sm tabular-nums text-ink-muted sm:block">
                        {r.price}
                        {r.time && <span className="block text-ink-subtle">{r.time}</span>}
                      </span>
                      <ArrowUpRight
                        className="h-5 w-5 text-ink-subtle transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8">
              <TextLink href="/services">{L('Barcha xizmatlarni ko‘rish', 'Смотреть все услуги')}</TextLink>
            </div>
          </div>

          <div className="photo-zoom relative min-h-[420px] overflow-hidden rounded-3xl bg-canvas lg:col-span-5">
            <Photo photo={SITE_PHOTOS.tools} lang={language} sizes="(min-width: 1024px) 40vw, 100vw" position="50% 55%" className="absolute inset-0" />
          </div>
        </div>
      </Container>
    </section>
  );
};
