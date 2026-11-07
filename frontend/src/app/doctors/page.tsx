'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { Container, FilterPills, PageIntro } from '../../components/site/primitives';

export default function DoctorsPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('ALL');

  useEffect(() => {
    let alive = true;
    api
      .getDoctors()
      .then((data) => alive && setDoctors(data || []))
      .catch(() => {})
      .finally(() => alive && setIsLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const titleOf = (d: any) => (isRu ? d.titleRu || d.titleUz : d.titleUz) || '';
  const titles = useMemo(() => {
    const set = Array.from(new Set(doctors.map(titleOf).filter(Boolean)));
    return [{ value: 'ALL', label: L('Hammasi', 'Все') }, ...set.map((v) => ({ value: v, label: v }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, isRu]);
  const visible = doctors.filter((d) => title === 'ALL' || titleOf(d) === title);

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.doctors}
        title={L('Bizning shifokorlar', 'Наши врачи')}
        lead={L(
          'Har bir shifokorning yo‘nalishi va tajribasi ochiq. Profilni ochib, to‘g‘ridan-to‘g‘ri shu shifokorga yoziling.',
          'Специализация и опыт каждого врача открыты. Откройте профиль и запишитесь напрямую к этому врачу.',
        )}
      />

      <Container className="py-12 sm:py-16">
        {titles.length > 2 && (
          <div className="mb-10">
            <FilterPills options={titles} value={title} onChange={setTitle} label={L('Yo‘nalish', 'Специализация')} />
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-white" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">
            {L('Shifokorlar ro‘yxati hozircha bo‘sh.', 'Список врачей пока пуст.')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((doc) => {
              const first = isRu && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
              const last = isRu && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
              const bio = isRu && doc.bioRu ? doc.bioRu : doc.bioUz;
              return (
                <article key={doc.id} className="group">
                  <Link href={`/doctors/${doc.slug}`} className="block">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-white">
                      {doc.photoUrl && !failed[doc.id] ? (
                        <Image
                          src={doc.photoUrl}
                          alt={`${first} ${last}`}
                          fill
                          unoptimized
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          onError={() => setFailed((f) => ({ ...f, [doc.id]: true }))}
                          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-b from-brand-50 to-white">
                          <span className="text-5xl font-light tracking-tight text-brand-700/70">
                            {`${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-lg font-medium tracking-[-0.01em] text-ink">
                        <Link href={`/doctors/${doc.slug}`} className="hover:text-brand-700">
                          {first} {last}
                        </Link>
                      </h2>
                      {titleOf(doc) && <p className="text-sm text-ink-muted">{titleOf(doc)}</p>}
                      {doc.experienceYears > 0 && (
                        <p className="mt-1 text-xs text-ink-subtle">
                          {doc.experienceYears} {L('yillik tajriba', 'лет опыта')}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/booking?doctorId=${doc.id}`}
                      className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors duration-300 hover:border-ink hover:bg-white"
                    >
                      {L('Yozilish', 'Записаться')}
                    </Link>
                  </div>
                  {bio && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{bio}</p>}
                </article>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
