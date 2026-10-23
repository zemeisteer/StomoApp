'use client';

import React from 'react';
import Link from 'next/link';
import { Star, MessageSquare, ArrowRight, User } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface ReviewsSectionProps {
  reviews: any[];
}

export const ReviewsSection: React.FC<ReviewsSectionProps> = ({ reviews }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 text-center sm:text-left">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider mb-2">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t.reviews.title}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
            {isRu ? 'Отзывы наших пациентов' : 'Bemorlarimiz bildirgan fikrlar'}
          </h2>
        </div>

        <Link
          href="/reviews"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#167b78] hover:text-[#116460] group transition-colors"
        >
          <span>{t.reviews.writeReview}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Reviews Grid */}
      {reviews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.slice(0, 3).map((r) => {
            const author = r.authorName || (isRu ? 'Пациент клиники' : 'Klinika bemori');
            const dateStr = r.createdAt
              ? new Date(r.createdAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')
              : '';

            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl p-6 sm:p-7 border border-[#d8e5e2] shadow-[0_2px_8px_rgba(21,47,52,0.03)] hover:shadow-lg hover:border-[#167b78]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Restrained Star Rating */}
                  <div className="flex items-center gap-1 text-amber-500 mb-3" aria-label={`Baho: ${r.rating || 5} / 5`}>
                    {[...Array(Math.min(5, Math.max(1, r.rating || 5)))].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>

                  {/* Feedback text */}
                  <p className="text-sm text-[#152f34] leading-relaxed mb-6 italic">
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>

                {/* Author footer */}
                <div className="pt-4 border-t border-[#d8e5e2] flex items-center justify-between text-xs text-[#52696e]">
                  <div className="flex items-center gap-2 font-bold text-[#152f34]">
                    <div className="w-6 h-6 rounded-full bg-[#eaf5f2] flex items-center justify-center text-[#167b78] text-[10px]">
                      <User className="w-3 h-3" />
                    </div>
                    <span>{author}</span>
                  </div>
                  <span>{dateStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-[#d8e5e2] p-8">
          <p className="text-[#52696e] text-sm mb-3">
            {isRu ? 'Отзывы пока отсутствуют. Будьте первыми!' : 'Hozircha sharhlar mavjud emas. Birinchi bo\'lib fikringizni qoldiring!'}
          </p>
          <Link
            href="/reviews"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#167b78] text-white rounded-xl text-xs font-bold"
          >
            {t.reviews.writeReview}
          </Link>
        </div>
      )}
    </section>
  );
};
