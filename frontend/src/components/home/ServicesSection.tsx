'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { serviceCategoryLabel } from '../../lib/serviceCategories';
import { Section, SectionError, SectionHeading, SkeletonCards } from '../site/primitives';

interface ServicesSectionProps {
  services: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Services as a quiet grid separated by hairlines: name, short note, duration and starting price. */
export const ServicesSection: React.FC<ServicesSectionProps> = ({ services, isLoading, error, onRetry }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <Section id="services" className="bg-white">
      <SectionHeading
        index="01"
        eyebrow={t.nav.services}
        title={L('Kerakli yordamning hammasi bir joyda', 'Вся необходимая помощь в одном месте')}
        lead={L('Profilaktikadan implantatsiyagacha. Narxlar oldindan ko‘rinadi.', 'От профилактики до имплантации. Цены видны заранее.')}
        action={{ href: '/services', label: L('Barcha xizmatlar', 'Все услуги') }}
      />

      {isLoading && <SkeletonCards count={6} />}
      {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}
      {!isLoading && !error && services.length === 0 && (
        <p className="text-sm text-ink-muted">{L("Hozircha xizmatlar ro'yxati mavjud emas.", 'Услуги временно недоступны.')}</p>
      )}

      {!isLoading && !error && services.length > 0 && (
        <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => {
            const name = isRu && service.nameRu ? service.nameRu : service.nameUz;
            const desc = isRu && service.descriptionRu ? service.descriptionRu : service.descriptionUz;
            const price = Math.round((service.priceFrom || 0) / 100).toLocaleString('ru-RU').replace(/ /g, ' ');
            return (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="group relative flex min-h-[240px] flex-col bg-white p-8 transition-colors duration-500 hover:bg-brand-50/50"
              >
                <div className="flex items-center justify-between text-xs text-ink-subtle">
                  <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span className="uppercase tracking-[0.14em]">{serviceCategoryLabel(service.category, language)}</span>
                </div>
                <h3 className="mt-8 text-xl font-medium leading-snug tracking-[-0.01em] text-ink">{name}</h3>
                {desc && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{desc}</p>}
                <div className="mt-auto flex items-end justify-between pt-8">
                  <div className="text-sm">
                    <span className="text-ink-subtle">{L('dan', 'от')} </span>
                    <span className="font-medium tabular-nums text-ink">
                      {price} {t.common.uzs}
                    </span>
                    <span className="ml-2 text-ink-subtle">· {service.durationMinutes} {L('daq', 'мин')}</span>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-ink-subtle transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
};
