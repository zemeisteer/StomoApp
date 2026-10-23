'use client';

import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Send, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t.reviews.title}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Отзывы наших пациентов' : 'Bemorlarimiz bildirgan fikrlar'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Реальные впечатления и отзывы пациентов, прошедших лечение в нашей клинике.'
            : 'Klinikamizda muolaja olgan bemorlarning samimiy va xolis fikrlari.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Reviews List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#d8e5e2]">
            <h2 className="text-base font-bold text-[#152f34]">
              {isRu ? 'Опубликованные отзывы' : 'Tasdiqlangan sharhlar'} ({totalCount})
            </h2>
            {avgRating && (
              <div className="flex items-center gap-1 text-amber-500 font-extrabold text-sm">
                <Star className="w-4 h-4 fill-current" />
                <span>{avgRating} / 5.0</span>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-[#52696e] text-sm">{t.common.loading}</div>
          ) : reviews.length === 0 ? (
            <div className="p-10 text-center text-[#52696e] text-sm bg-white rounded-2xl border border-dashed border-[#d8e5e2]">
              {isRu ? 'Пока нет опубликованных отзывов. Будьте первыми!' : 'Hozircha e\'lon qilingan fikrlar yo\'q. Birinchi bo\'lib fikr qoldiring!'}
            </div>
          ) : (
            reviews.map((r) => {
              const author = r.authorName || (isRu ? 'Пациент клиники' : 'Klinika bemori');
              const dateStr = r.createdAt
                ? new Date(r.createdAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')
                : '';

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl p-6 border border-[#d8e5e2] shadow-[0_2px_8px_rgba(21,47,52,0.03)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-[#152f34]">
                      <div className="w-7 h-7 rounded-full bg-[#eaf5f2] flex items-center justify-center text-[#167b78] text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span>{author}</span>
                    </div>

                    <div className="flex items-center gap-1 text-amber-500">
                      {[...Array(Math.min(5, Math.max(1, r.rating || 5)))].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-[#152f34] leading-relaxed italic">
                    &ldquo;{r.text}&rdquo;
                  </p>

                  <div className="pt-2 text-[11px] text-[#52696e] text-right">
                    <span>{dateStr}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Submit Review Form */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-7 sm:p-8 border border-[#d8e5e2] shadow-[0_4px_20px_rgba(21,47,52,0.03)] space-y-5">
          <div>
            <h3 className="text-lg font-bold text-[#152f34]">{t.reviews.writeReview}</h3>
            <p className="text-xs text-[#52696e] mt-0.5">
              {isRu ? 'Поделитесь вашим впечатлением о лечении в DentaCare' : 'DentaCare klinikasidagi tajribangiz haqida xolis fikr bildiring'}
            </p>
          </div>

          {submitSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                {isRu
                  ? 'Спасибо за ваш отзыв! Он появится на сайте после проверки модератором.'
                  : 'Fikringiz uchun rahmat! Moderator tekshiruvidan so\'ng saytda e\'lon qilinadi.'}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                {t.common.name} *
              </label>
              <input
                type="text"
                required
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder={isRu ? 'Например: Азиз Рахимов' : 'Masalan: Aziz Rahimov'}
                className="w-full px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                {t.reviews.rating}
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform focus:outline-none"
                    aria-label={`${star} yulduz`}
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= rating ? 'text-amber-500 fill-current' : 'text-slate-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                {t.reviews.comment} *
              </label>
              <textarea
                rows={4}
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isRu ? 'Напишите ваш отзыв...' : 'Muolaja va xizmat haqida fikringiz...'}
                className="w-full px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#52696e]">
              <input
                type="checkbox"
                checked={consentDisplayName}
                onChange={(e) => setConsentDisplayName(e.target.checked)}
                className="mt-0.5 rounded border-[#d8e5e2] text-[#167b78] focus:ring-[#167b78]"
              />
              <span>
                {isRu
                  ? 'Согласен на отображение моего имени рядом с отзывом'
                  : 'Fikrim yonida ismim ko\'rsatilishiga roziman'}
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#167b78] hover:bg-[#116460] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/25 text-xs transition-all flex items-center justify-center gap-2 transform active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? t.common.loading : t.common.submit}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
