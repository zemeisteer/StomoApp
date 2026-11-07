'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { Container, PrimaryLink, SecondaryLink, formatSom } from '../../../components/site/primitives';

export default function DoctorDetailPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const params = useParams();
  const slug = params?.slug as string;

  const [doctor, setDoctor] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDoctor() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const doc = await api.getDoctorBySlug(slug);
        if (isMounted) setDoctor(doc);
      } catch (err: any) {
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadDoctor();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  if (isLoading) {
    return (
      <Container className="py-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="aspect-[4/5] animate-pulse rounded-3xl bg-canvas lg:col-span-5" />
          <div className="space-y-4 lg:col-span-7">
            <div className="h-10 w-2/3 animate-pulse rounded bg-canvas" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-canvas" />
          </div>
        </div>
      </Container>
    );
  }

  if (notFound || !doctor) {
    return (
      <Container className="py-32 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">{L('Shifokor topilmadi', 'Врач не найден')}</h1>
        <p className="mt-3 text-ink-muted">{L('Bu profil mavjud emas yoki faol emas.', 'Профиль недоступен или неактивен.')}</p>
        <div className="mt-8 flex justify-center">
          <SecondaryLink href="/doctors">
            <ArrowLeft className="h-4 w-4" /> {L('Barcha shifokorlar', 'Все врачи')}
          </SecondaryLink>
        </div>
      </Container>
    );
  }

  const first = isRu && doctor.firstNameRu ? doctor.firstNameRu : doctor.firstNameUz;
  const last = isRu && doctor.lastNameRu ? doctor.lastNameRu : doctor.lastNameUz;
  const title = isRu && doctor.titleRu ? doctor.titleRu : doctor.titleUz;
  const bio = isRu && doctor.bioRu ? doctor.bioRu : doctor.bioUz;
  const education = isRu && doctor.educationRu ? doctor.educationRu : doctor.educationUz;
  const branches = (doctor.branches || [])
    .map((b: any) => (isRu ? b.branch?.nameRu || b.branch?.nameUz : b.branch?.nameUz))
    .filter(Boolean);
  const services = (doctor.services || []).map((ds: any) => ds.service).filter(Boolean);
  const facts: Array<[string, string]> = [];
  if (doctor.experienceYears > 0) facts.push([L('Tajriba', 'Опыт'), `${doctor.experienceYears} ${L('yil', 'лет')}`]);
  facts.push([L('Qabul tillari', 'Языки приёма'), (doctor.languages || ['uz', 'ru']).join(', ').toUpperCase()]);
  if (branches.length) facts.push([L('Filial', 'Филиал'), branches.join(', ')]);

  return (
    <div className="bg-canvas">
      <Container className="pb-16 pt-10 sm:pt-14">
        <nav className="mb-10 flex items-center gap-2 text-sm text-ink-subtle" aria-label="breadcrumb">
          <Link href="/" className="hover:text-ink">
            {t.nav.home}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/doctors" className="hover:text-ink">
            {t.nav.doctors}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-ink-muted">
            {first} {last}
          </span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-white">
              {doctor.photoUrl ? (
                <Image src={doctor.photoUrl} alt={`${first} ${last}`} fill unoptimized sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-b from-brand-50 to-white">
                  <span className="text-7xl font-light tracking-tight text-brand-700/70">{`${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            {title && <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">{title}</p>}
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-5xl">
              {first} {last}
            </h1>

            <dl className="mt-10 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-[0.14em] text-ink-subtle">{k}</dt>
                  <dd className="mt-1.5 text-base text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10">
              <PrimaryLink href={`/booking?doctorId=${doctor.id}`}>
                {L('Shu shifokorga yozilish', 'Записаться к этому врачу')} <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
            </div>

            {bio && (
              <section className="mt-14">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Shifokor haqida', 'О враче')}</h2>
                <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-ink">{bio}</p>
              </section>
            )}
            {education && (
              <section className="mt-10">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{L('Ta’lim', 'Образование')}</h2>
                <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-muted">{education}</p>
              </section>
            )}
          </div>
        </div>
      </Container>

      {services.length > 0 && (
        <section className="border-t border-line bg-white py-16 sm:py-20">
          <Container>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">{L('Ko‘rsatadigan xizmatlari', 'Услуги врача')}</h2>
            <ul className="mt-8 border-t border-line">
              {services.map((s: any) => (
                <li key={s.id} className="flex flex-col gap-3 border-b border-line py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/services/${s.slug}`} className="text-base font-medium text-ink hover:text-brand-700">
                      {isRu && s.nameRu ? s.nameRu : s.nameUz}
                    </Link>
                    <p className="text-sm text-ink-subtle">
                      {s.durationMinutes} {L('daqiqa', 'минут')}
                    </p>
                  </div>
                  <div className="flex items-center gap-5">
                    {s.priceFrom > 0 && (
                      <span className="text-sm tabular-nums text-ink">
                        <span className="text-ink-subtle">{L('dan', 'от')} </span>
                        {formatSom(s.priceFrom)} {t.common.uzs}
                      </span>
                    )}
                    <Link
                      href={`/booking?doctorId=${doctor.id}&serviceId=${s.id}`}
                      className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors duration-300 hover:border-ink"
                    >
                      {L('Yozilish', 'Записаться')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}
    </div>
  );
}
