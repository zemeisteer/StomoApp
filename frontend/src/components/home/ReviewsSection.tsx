'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatClinicDate } from '../../lib/dateFormat';
import { Section, SectionError, SectionHeading, SkeletonCards } from '../site/primitives';

interface ReviewsSectionProps {
  reviews: any[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Patient words in plain quotes; rating is a small detail, not the headline. */
export const ReviewsSection: React.FC<ReviewsSectionProps> = ({ reviews, isLoading = false, error = null, onRetry }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const list = reviews.slice(0, 6);
  const average = list.length ? list.reduce((s, r) => s + (r.rating || 5), 0) / list.length : 0;

  return (
    <Section id="reviews" className="bg-canvas">
      <SectionHeading
        index="04"
        eyebrow={t.reviews.title}
        title={L('Bemorlarimiz nima deydi', 'Что говорят наши пациенты')}
        lead={
          list.length
            ? L(`O‘rtacha baho ${average.toFixed(1)} / 5`, `Средняя оценка ${average.toFixed(1)} / 5`)
            : undefined
        }
        action={{ href: '/reviews', label: L('Barcha fikrlar', 'Все отзывы') }}
      />

      {isLoading && <SkeletonCards count={3} />}
      {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}
      {!isLoading && !error && list.length === 0 && (
        <p className="text-sm text-ink-muted">{L('Hozircha fikrlar yo‘q. Birinchi bo‘ling!', 'Отзывов пока нет. Будьте первым!')}</p>
      )}

      {!isLoading && !error && list.length > 0 && (
        <div className="columns-1 gap-6 md:columns-2 lg:columns-3 [&>*]:mb-6">
          {list.map((r) => (
            <figure key={r.id} className="break-inside-avoid rounded-3xl border border-line bg-white p-8">
              <div className="flex gap-0.5 text-amber-500" aria-label={`${r.rating || 5} / 5`}>
                {Array.from({ length: Math.min(5, Math.max(1, r.rating || 5)) }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                ))}
              </div>
              <blockquote className="mt-5 text-[17px] leading-relaxed text-ink">&ldquo;{r.text}&rdquo;</blockquote>
              <figcaption className="mt-6 flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{r.authorName}</span>
                {r.createdAt && <span className="text-ink-subtle">{formatClinicDate(r.createdAt, isRu ? 'ru' : 'uz')}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Section>
  );
};
