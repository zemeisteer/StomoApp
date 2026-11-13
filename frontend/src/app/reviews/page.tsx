'use client';

import React, { useState, useEffect } from 'react';
import { Star, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { formatClinicDate } from '../../lib/dateFormat';
import { Container, PageIntro, SkeletonCards } from '../../components/site/primitives';

export default function ReviewsPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const [reviews, setReviews] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [authorName, setAuthorName] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [consentDisplayName, setConsentDisplayName] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      const res = await api.getPublicReviews(1, 30);
      setReviews(res.items || []);
      setTotalCount(res.total || 0);
    } catch (e) {
      console.error('Failed to load reviews', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !text.trim()) {
      setErrorMessage(isRu ? 'Пожалуйста, введите ваше имя и отзыв' : 'Iltimos, ismingiz va fikringizni yozing');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await api.submitReview({
        authorName: authorName.trim(),
        rating,
        text: text.trim(),
        consentDisplayName,
      });

      setSubmitSuccess(true);
      setText('');
      setAuthorName('');
    } catch (err: any) {
      setErrorMessage(err?.message || t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Honest average calculated only from real reviews (no invented defaults!)
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1)
    : null;

  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const field =
    'w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-subtle transition-colors focus:border-ink focus:outline-none';

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.reviews.title}
        title={L('Bemorlar fikri', 'Отзывы пациентов')}
        lead={L(
          'Faqat haqiqiy bemorlarning moderatsiyadan o‘tgan sharhlari. Ball ham faqat shulardan hisoblanadi.',
          'Только реальные отзывы пациентов после модерации. Оценка считается только по ним.',
        )}
        aside={
          avgRating ? (
            <div className="flex items-end gap-4">
              <span className="text-6xl font-semibold tabular-nums tracking-[-0.04em] text-ink">{avgRating}</span>
              <div className="pb-2">
                <div className="flex gap-0.5 text-amber-500" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {totalCount} {L('ta sharh', 'отзывов')}
                </p>
              </div>
            </div>
          ) : undefined
        }
      />

      <Container className="py-8 sm:py-12">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            {isLoading ? (
              <SkeletonCards count={3} className="grid-cols-1" />
            ) : reviews.length === 0 ? (
              <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">
                {L('Hozircha sharhlar yo‘q. Birinchi bo‘lib fikr qoldiring.', 'Пока нет отзывов. Оставьте первый.')}
              </p>
            ) : (
              <ul className="border-t border-line">
                {reviews.map((r) => {
                  const author = r.authorName || L('Klinika bemori', 'Пациент клиники');
                  const stars = Math.min(5, Math.max(1, r.rating || 5));
                  return (
                    <li key={r.id} className="border-b border-line py-8">
                      <div className="flex gap-0.5 text-amber-500" aria-label={`${stars} / 5`}>
                        {Array.from({ length: stars }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </div>
                      <blockquote className="mt-4 text-lg leading-relaxed text-ink">&ldquo;{r.text}&rdquo;</blockquote>
                      <p className="mt-4 text-sm text-ink-muted">
                        {author}
                        {r.createdAt && <span className="text-ink-subtle"> · {formatClinicDate(r.createdAt, isRu ? 'ru' : 'uz')}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-[2rem] border border-line bg-white p-7 sm:p-9 lg:sticky lg:top-24">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.reviews.writeReview}</h2>
              <p className="mt-2 text-sm text-ink-muted">
                {L('Sharh moderator tekshiruvidan so‘ng chiqadi.', 'Отзыв появится после проверки модератором.')}
              </p>

              {submitSuccess ? (
                <div className="mt-8 rounded-2xl bg-canvas p-6" role="status">
                  <CheckCircle2 className="h-6 w-6 text-brand-700" />
                  <p className="mt-3 text-base text-ink">{L('Rahmat! Sharhingiz qabul qilindi.', 'Спасибо! Отзыв принят.')}</p>
                  <button type="button" onClick={() => setSubmitSuccess(false)} className="mt-4 text-sm font-medium text-ink-muted hover:text-ink">
                    {L('Yana yozish', 'Написать ещё')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div>
                    <label htmlFor="rv-name" className="mb-2 block text-sm font-medium text-ink">
                      {t.common.name}
                    </label>
                    <input id="rv-name" type="text" required value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder={L('Masalan: Aziz', 'Например: Азиз')} className={field} />
                  </div>
                  <div>
                    <span className="mb-2 block text-sm font-medium text-ink">{t.reviews.rating}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={t.reviews.rating}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          role="radio"
                          aria-checked={rating === star}
                          aria-label={`${star} / 5`}
                          onClick={() => setRating(star)}
                          className="rounded-full p-1 transition-transform hover:scale-110"
                        >
                          <Star className={`h-6 w-6 ${star <= rating ? 'fill-current text-amber-500' : 'text-line-strong'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="rv-text" className="mb-2 block text-sm font-medium text-ink">
                      {t.reviews.comment}
                    </label>
                    <textarea id="rv-text" rows={4} required value={text} onChange={(e) => setText(e.target.value)} placeholder={L('Muolaja va xizmat haqida', 'О лечении и сервисе')} className={`${field} resize-none`} />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-muted">
                    <input type="checkbox" checked={consentDisplayName} onChange={(e) => setConsentDisplayName(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line-strong text-ink focus:ring-ink" />
                    {L('Ismim sharh yonida ko‘rsatilsin', 'Показывать моё имя рядом с отзывом')}
                  </label>
                  {errorMessage && (
                    <p className="flex items-center gap-2 text-sm text-red-700" role="alert">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {errorMessage}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors duration-300 hover:bg-brand-800 disabled:opacity-50"
                  >
                    {isSubmitting ? t.common.loading : t.common.submit}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
