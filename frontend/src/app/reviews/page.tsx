'use client';

import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ReviewsPage() {
  const { t } = useI18n();

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
      setErrorMessage('Iltimos, ismingiz va fikringizni yozing');
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.reviews.title}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Bemorlarimiz taassurotlari
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Haqiqiy davolangan insonlarning xolis va samimiy fikrlari
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Reviews List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-800">
              Sharhlar ({totalCount})
            </h2>
            <div className="flex items-center gap-1 text-amber-500 font-extrabold text-sm">
              <Star className="w-4 h-4 fill-current" />
              <span>4.9 / 5.0</span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-slate-400 text-sm">{t.common.loading}</div>
          ) : reviews.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm bg-white rounded-2xl border border-dashed border-slate-200">
              Hozircha e&apos;lon qilingan fikrlar yo&apos;q. Birinchi bo&apos;lib fikr bildiring!
            </div>
          ) : (
            reviews.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{r.authorName}</span>
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[...Array(r.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed italic">
                  &ldquo;{r.text}&rdquo;
                </p>

                <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-50">
                  <span>{r.doctor ? `Dr. ${r.doctor.firstNameUz} ${r.doctor.lastNameUz}` : 'DentaCare klinikasi'}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Submission Form */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-100 sticky top-28">
            <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-700" />
              <span>{t.reviews.writeReview}</span>
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Davolanish tajribangiz haqida bo&apos;lishing va boshqalarga to&apos;g&apos;ri tanlov qilishga yordam bering.
            </p>

            {submitSuccess && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-1 animate-fade-in">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Fikringiz qabul qilindi!</span>
                </div>
                <p>{t.reviews.pendingApproval}</p>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.reviews.authorName} *
                </label>
                <input
                  type="text"
                  required
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Ismingiz va familiyangiz"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.reviews.rating}
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= rating
                            ? 'text-amber-400 fill-current'
                            : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-600 ml-2">
                    {rating} / 5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.reviews.comment} *
                </label>
                <textarea
                  rows={4}
                  required
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Muolaja qanday o'tdi? Shifokor va xodimlar muomalasi haqida..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* Consent for display name */}
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consentDisplayName}
                  onChange={(e) => setConsentDisplayName(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-teal-700 rounded border-slate-300 focus:ring-teal-600"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  {t.reviews.displayNameConsent}
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? t.common.loading : t.common.submit}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
