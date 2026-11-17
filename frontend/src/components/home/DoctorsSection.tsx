'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useI18n } from '../../lib/i18n';
import { Section, SectionError, SectionHeading } from '../site/primitives';

interface DoctorsSectionProps {
  doctors: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** people-row on the surface band: large portraits, name, field and years of practice. */
export const DoctorsSection: React.FC<DoctorsSectionProps> = ({ doctors, isLoading, error = null, onRetry }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  // A section with nobody in it says nothing: it waits until the clinic adds its doctors.
  if (!isLoading && !error && doctors.length === 0) return null;

  return (
    <Section id="doctors" className="bg-canvas">
      <SectionHeading
        eyebrow={t.nav.doctors}
        title={L('Sizni davolaydigan shifokorlar', 'Врачи, которые будут вас лечить')}
        lead={L('Har bir shifokorning yo‘nalishi va tajribasi ochiq ko‘rsatilgan.', 'Специализация и опыт каждого врача указаны открыто.')}
        action={{ href: '/doctors', label: L('Barcha shifokorlarni ko‘rish', 'Смотреть всех врачей') }}
      />

      {isLoading && (
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] animate-pulse rounded-3xl bg-white" />
              <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-white" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}

      {!isLoading && !error && doctors.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {doctors.map((doc) => {
            const first = isRu && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
            const last = isRu && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
            const title =
              (isRu ? doc.titleRu || doc.titleUz : doc.titleUz) ||
              (doc.specialties || [])
                .map((s: any) => (isRu && s.specialty?.nameRu ? s.specialty.nameRu : s.specialty?.nameUz || ''))
                .filter(Boolean)
                .join(', ');
            const initials = `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
            return (
              <Link key={doc.id} href={`/doctors/${doc.slug}`} className="group block">
                <div className="card-lift photo-zoom relative aspect-[4/5] overflow-hidden rounded-3xl bg-white">
                  {doc.photoUrl && !failed[doc.id] ? (
                    <Image
                      src={doc.photoUrl}
                      alt={`${first} ${last}`}
                      fill
                      unoptimized
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      onError={() => setFailed((f) => ({ ...f, [doc.id]: true }))}
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-brand-50">
                      <span className="text-5xl font-light tracking-tight text-brand-700/70">{initials}</span>
                    </div>
                  )}
                </div>
                <p className="mt-4 text-lg font-medium text-ink transition-colors group-hover:text-brand-700">
                  {first} {last}
                </p>
                {title && <p className="mt-0.5 text-sm text-ink-muted">{title}</p>}
                {doc.experienceYears > 0 && (
                  <p className="mt-1 text-sm text-ink-subtle">
                    {doc.experienceYears} {L('yillik tajriba', 'лет опыта')}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
};
