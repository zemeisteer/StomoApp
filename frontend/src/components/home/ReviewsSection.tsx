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
  const list = reviews.slice(0, 3);

  // Proof only when there is some: no empty section asking to be first.
  if (!isLoading && !error && list.length === 0) return null;

  return (
    <Section id="reviews" className="bg-canvas">
      <SectionHeading
        eyebrow={t.reviews.title}
        title={L('Bemorlarning fikrlari', 'Отзывы пациентов')}
        action={{ href: '/reviews', label: L('Barcha fikrlarni o‘qish', 'Читать все отзывы') }}
      />

      {isLoading && <SkeletonCards count={3} />}
      {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}

      {!isLoading && !error && list.length > 0 && (
        <div className="grid gap-5 md:grid-cols-3">
          {list.map((r) => (
            <figure key={r.id} className="flex flex-col rounded-3xl bg-white p-8">
              <div className="flex gap-0.5 text-amber-500" aria-label={`${r.rating || 5} / 5`}>
                {Array.from({ length: Math.min(5, Math.max(1, r.rating || 5)) }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                ))}
              </div>
              <blockquote className="mt-5 text-[17px] leading-relaxed text-ink">&ldquo;{r.text}&rdquo;</blockquote>
              <figcaption className="mt-auto flex items-center justify-between pt-8 text-sm">
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
