'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { serviceCategoryLabel } from '../../../lib/serviceCategories';
import { Container, PageIntro, PrimaryLink, SecondaryLink, formatSom } from '../../../components/site/primitives';
import { api } from '../../../lib/api';

export default function ServiceDetailPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const params = useParams();
  const slug = params?.slug as string;

  const [service, setService] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadService() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const res = await api.getServiceBySlug(slug);
        if (isMounted) setService(res);
      } catch (err: any) {
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadService();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  if (isLoading) {
    return (
      <Container className="py-24">
        <div className="h-4 w-32 animate-pulse rounded bg-canvas" />
        <div className="mt-6 h-12 w-2/3 animate-pulse rounded bg-canvas" />
      </Container>
    );
  }

  if (notFound || !service) {
    return (
      <Container className="py-32 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">{L('Xizmat topilmadi', 'Услуга не найдена')}</h1>
        <p className="mt-3 text-ink-muted">{L('Bu xizmat mavjud emas yoki arxivlangan.', 'Эта услуга недоступна или в архиве.')}</p>
        <div className="mt-8 flex justify-center">
          <SecondaryLink href="/services">
            <ArrowLeft className="h-4 w-4" /> {L('Barcha xizmatlar', 'Все услуги')}
          </SecondaryLink>
        </div>
      </Container>
    );
  }

  const name = isRu && service.nameRu ? service.nameRu : service.nameUz;
  const description = isRu && service.descriptionRu ? service.descriptionRu : service.descriptionUz;
  const prep = isRu
    ? service.preparationRu || 'Специальной подготовки не требуется. Рекомендуется легко перекусить за 1 час до приема.'
    : service.preparationUz || "Maxsus tayyorgarlik talab etilmaydi. Qabuldan 1 soat oldin yengil tamaddi qilib kelish tavsiya etiladi.";
  const doctors = (service.doctors || []).map((ds: any) => ds.doctor).filter(Boolean);

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={serviceCategoryLabel(service.category, language)}
        title={name}
        lead={undefined}
        aside={
          <div className="rounded-3xl border border-line bg-white p-6">
            <p className="text-sm text-ink-subtle">{L('Boshlang‘ich narx', 'Цена от')}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.02em] text-ink">
              {service.priceFrom ? `${formatSom(service.priceFrom)} ${t.common.uzs}` : L('Ko‘rikdan keyin', 'После осмотра')}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {service.durationMinutes} {L('daqiqa', 'минут')}
            </p>
            <PrimaryLink href={`/booking?serviceId=${service.id}`} className="mt-6 w-full">
              {L('Shu xizmatga yozilish', 'Записаться на услугу')}
            </PrimaryLink>
          </div>
        }
      />

      <Container className="py-10 sm:py-14">
        <nav className="mb-12 flex items-center gap-2 text-sm text-ink-subtle" aria-label="breadcrumb">
          <Link href="/" className="hover:text-ink">{t.nav.home}</Link>
          <span aria-hidden="true">/</span>
          <Link href="/services" className="hover:text-ink">{t.nav.services}</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-ink-muted">{name}</span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-12">
          <div className="space-y-12 lg:col-span-7">
            {description && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Muolaja haqida', 'О процедуре')}</h2>
                <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-ink">{description}</p>
              </section>
            )}
            <section>
              <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Qabulga tayyorgarlik', 'Подготовка к приёму')}</h2>
              <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-muted">{prep}</p>
            </section>
          </div>

          <aside className="lg:col-span-5">
            {doctors.length > 0 && (
              <section>
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Shifokorlar', 'Врачи')}</h2>
                <ul className="mt-4 border-t border-line">
                  {doctors.map((doc: any) => {
                    const docName = isRu && doc.firstNameRu ? `${doc.firstNameRu} ${doc.lastNameRu}` : `${doc.firstNameUz} ${doc.lastNameUz}`;
                    return (
                      <li key={doc.id} className="border-b border-line">
                        <Link href={`/doctors/${doc.slug}`} className="group flex items-center gap-4 py-4">
                          <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                            {doc.photoUrl ? (
                              <Image src={doc.photoUrl} alt={docName} fill unoptimized sizes="48px" className="object-cover" />
                            ) : (
                              <span className="flex h-full items-center justify-center text-sm text-brand-700">
                                {doc.firstNameUz?.[0]}
                                {doc.lastNameUz?.[0]}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink group-hover:text-brand-700">{docName}</span>
                            <span className="block truncate text-sm text-ink-muted">{isRu && doc.titleRu ? doc.titleRu : doc.titleUz}</span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 text-ink-subtle transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </Container>
    </div>
  );
}
