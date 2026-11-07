'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatWorkingHours } from '../../lib/dateFormat';
import { Section, SectionError, SectionHeading, SkeletonCards } from '../site/primitives';

interface BranchesSectionProps {
  branches: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Branches as a simple table-like list: name, address, hours, phone, map and booking link. */
export const BranchesSection: React.FC<BranchesSectionProps> = ({ branches, isLoading, error, onRetry }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <Section id="branches" className="bg-white">
      <SectionHeading
        index="05"
        eyebrow={L('Filiallar', 'Филиалы')}
        title={L('Sizga yaqin manzilda', 'Рядом с вами')}
        lead={L('Qulay filialni tanlang va shu yerning o‘zida yoziling.', 'Выберите удобный филиал и запишитесь прямо здесь.')}
      />

      {isLoading && <SkeletonCards count={2} className="sm:grid-cols-2" />}
      {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}
      {!isLoading && !error && branches.length === 0 && (
        <p className="text-sm text-ink-muted">{L('Filiallar tez orada qo‘shiladi.', 'Филиалы скоро появятся.')}</p>
      )}

      {!isLoading && !error && branches.length > 0 && (
        <ul className="border-t border-line">
          {branches.map((b) => {
            const name = isRu && b.nameRu ? b.nameRu : b.nameUz;
            const address = isRu && b.addressRu ? b.addressRu : b.addressUz;
            const hours = formatWorkingHours(b.workingHours, language) || b.openingHours || '';
            return (
              <li key={b.id} className="grid gap-4 border-b border-line py-8 md:grid-cols-12 md:items-center md:gap-6">
                <div className="md:col-span-4">
                  <p className="text-lg font-medium tracking-[-0.01em] text-ink">{name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{address}</p>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted md:col-span-3">{hours}</p>
                <div className="text-sm md:col-span-2">
                  {b.phone && (
                    <a href={`tel:${b.phone.replace(/\s+/g, '')}`} className="text-ink tabular-nums hover:text-brand-700">
                      {b.phone}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-5 text-sm md:col-span-3 md:justify-end">
                  {b.mapUrl && (
                    <a href={b.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-muted hover:text-ink">
                      {L('Xarita', 'Карта')} <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Link
                    href={`/booking?branchId=${b.id}`}
                    className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 font-medium text-ink transition-colors duration-300 hover:border-ink hover:bg-white"
                  >
                    {L('Yozilish', 'Записаться')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
};
