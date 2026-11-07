'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { SERVICE_CATEGORIES, serviceCategoryLabel } from '../../lib/serviceCategories';
import { api } from '../../lib/api';
import { Container, FilterPills, PageIntro, SearchField, SkeletonCards, formatSom } from '../../components/site/primitives';

export default function ServicesPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const [services, setServices] = useState<any[]>([]);
  const [category, setCategory] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .getServices()
      .then((data) => alive && setServices(data || []))
      .catch(() => {})
      .finally(() => alive && setIsLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Only categories that actually have services
  const categories = useMemo(() => {
    const present = new Set(services.map((s) => s.category));
    return [
      { value: 'ALL', label: L('Hammasi', 'Все') },
      ...SERVICE_CATEGORIES.filter((c) => present.has(c.value)).map((c) => ({ value: c.value as string, label: isRu ? c.ru : c.uz })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, isRu]);

  const filtered = services.filter((s) => {
    const name = (isRu && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
    return (category === 'ALL' || s.category === category) && name.includes(query.trim().toLowerCase());
  });

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.services}
        title={L('Xizmatlar va narxlar', 'Услуги и цены')}
        lead={L(
          'Har bir xizmatning davomiyligi va boshlang‘ich narxi ko‘rsatilgan. Aniq narx ko‘rikdan keyin davolash rejasida yoziladi.',
          'Для каждой услуги указаны длительность и цена «от». Точная стоимость фиксируется в плане лечения после осмотра.',
        )}
        aside={<SearchField value={query} onChange={setQuery} placeholder={L('Xizmatni qidirish', 'Поиск услуги')} />}
      />

      <Container className="py-12 sm:py-16">
        <div className="mb-10">
          <FilterPills options={categories} value={category} onChange={setCategory} label={L('Kategoriya', 'Категория')} />
        </div>

        {isLoading ? (
          <SkeletonCards count={6} />
        ) : filtered.length === 0 ? (
          <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">
            {L('Qidiruv bo‘yicha xizmat topilmadi.', 'По запросу ничего не найдено.')}
          </p>
        ) : (
          <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((service) => {
              const name = isRu && service.nameRu ? service.nameRu : service.nameUz;
              const desc = isRu && service.descriptionRu ? service.descriptionRu : service.descriptionUz;
              return (
                <article key={service.id} className="group flex min-h-[260px] flex-col bg-white p-8 transition-colors duration-500 hover:bg-brand-50/40">
                  <p className="text-xs uppercase tracking-[0.14em] text-ink-subtle">{serviceCategoryLabel(service.category, language)}</p>
                  <h2 className="mt-6 text-xl font-medium leading-snug tracking-[-0.01em] text-ink">
                    <Link href={`/services/${service.slug}`} className="after:absolute after:inset-0 relative">
                      {name}
                    </Link>
                  </h2>
                  {desc && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted">{desc}</p>}
                  <div className="mt-auto flex items-end justify-between gap-4 pt-8">
                    <p className="text-sm">
                      <span className="text-ink-subtle">{L('dan', 'от')} </span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatSom(service.priceFrom)} {t.common.uzs}
                      </span>
                      <span className="block text-ink-subtle">
                        {service.durationMinutes} {L('daqiqa', 'минут')}
                      </span>
                    </p>
                    <div className="relative z-10 flex items-center gap-3">
                      <Link
                        href={`/booking?serviceId=${service.id}`}
                        className="inline-flex h-10 items-center rounded-full bg-brand-600 px-4 text-[13px] font-medium text-white transition-colors duration-300 hover:bg-brand-700"
                      >
                        {L('Yozilish', 'Записаться')}
                      </Link>
                      <ArrowUpRight className="h-5 w-5 text-ink-subtle transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden="true" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
