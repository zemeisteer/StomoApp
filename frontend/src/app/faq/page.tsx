'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, HelpCircle, Calendar, Phone, Search } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { baselineFaqs } from '../../components/home/FaqAndCtaSection';

export default function FaqPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [faqs, setFaqs] = useState<any[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadFaqs() {
      try {
        setIsLoading(true);
        const data = await api.getFaqs();
        if (isMounted) setFaqs(data || []);
      } catch (e) {
        console.error('Failed to load faqs', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadFaqs();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  const rawList = Array.isArray(faqs) && faqs.length > 0 ? faqs : baselineFaqs;
  const normalizedFaqs = rawList.map((faq, idx) => {
    const fallback = baselineFaqs[idx] || baselineFaqs[0];
    const qUz = faq.questionUz || faq.qUz || fallback.questionUz;
    const aUz = faq.answerUz || faq.aUz || fallback.answerUz;
    const qRuRaw = faq.questionRu || faq.qRu;
    const aRuRaw = faq.answerRu || faq.aRu;

    const isCorruptedRu = (str?: string) => !str || str.includes('???') || str.trim().length === 0;
    const qRu = isCorruptedRu(qRuRaw) ? fallback.questionRu : qRuRaw;
    const aRu = isCorruptedRu(aRuRaw) ? fallback.answerRu : aRuRaw;

    return {
      id: faq.id || `faq-${idx}`,
      question: isRu ? qRu : qUz,
      answer: isRu ? aRu : aUz,
    };
  });

  const filteredFaqs = normalizedFaqs.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-50 text-brand-600 text-xs font-bold uppercase tracking-wider">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>FAQ</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          {isRu ? 'Часто задаваемые вопросы' : 'Ko\'p beriladigan savollar'}
        </h1>
        <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
          {isRu
            ? 'Ответы на самые популярные вопросы о лечении, гарантиях, записи и подготовке к приему.'
            : 'Davolanish, to\'lovlar, kafolatlar va tayyorgarlik bo\'yicha eng dolzarb javoblar.'}
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRu ? 'Поиск по вопросам...' : 'Savollar bo\'yicha qidiruv...'}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-line text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white text-ink shadow-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white rounded-3xl border border-line p-7 animate-pulse h-24" />
          ))}
        </div>
      ) : filteredFaqs.length === 0 ? (
        <div className="p-16 text-center text-ink-muted text-sm bg-white rounded-3xl border border-dashed border-line">
          {isRu ? 'Вопросы не найдены.' : 'Savollar topilmadi.'}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            const itemNum = String(idx + 1).padStart(2, '0');

            return (
              <div
                key={faq.id}
                className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-200 overflow-hidden ${
                  isOpen
                    ? 'border-brand-600 ring-2 ring-brand-600/10 shadow-[0_8px_30px_rgb(var(--brand-600)/0.08)] bg-gradient-to-b from-white to-canvas'
                    : 'border-line hover:border-brand-600/40 shadow-[0_2px_10px_rgba(21,47,52,0.02)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(idx)}
                  className="w-full p-6 sm:p-7 text-left flex items-center justify-between gap-4 cursor-pointer group"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center text-xs sm:text-sm font-extrabold shrink-0 transition-colors ${
                        isOpen
                          ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                          : 'bg-brand-50 text-brand-600 group-hover:bg-brand-600/15'
                      }`}
                    >
                      {itemNum}
                    </div>
                    <span className="font-bold text-base sm:text-lg text-ink group-hover:text-brand-600 transition-colors leading-snug">
                      {faq.question}
                    </span>
                  </div>

                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      isOpen
                        ? 'bg-brand-600 text-white rotate-180 shadow-sm'
                        : 'bg-canvas group-hover:bg-brand-50 text-brand-600'
                    }`}
                  >
                    <ChevronDown className="w-5 h-5 transition-transform duration-200" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 sm:px-8 pb-7 pt-1 animate-fade-in">
                    <div className="border-t border-line/80 pt-5 pl-13 sm:pl-15">
                      <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CTA Box */}
      <div className="p-8 sm:p-12 bg-gradient-to-tr from-brand-600 to-brand-500 rounded-3xl text-white text-center space-y-5 shadow-xl shadow-brand-600/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-xl mx-auto space-y-4">
          <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isRu ? 'Не нашли ответ на свой вопрос?' : 'O\'zingizni qiziqtirgan savolga javob topmadingizmi?'}
          </h3>
          <p className="text-sm sm:text-base text-white/90 leading-relaxed font-normal">
            {isRu
              ? 'Свяжитесь с нами или запишитесь на прием — наши специалисты подробно проконсультируют вас.'
              : 'Biz bilan bog\'laning yoki qabulga yoziling — mutaxassislarimiz barcha savollaringizga batafsil javob berishadi.'}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link
              href="/booking"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-brand-600 hover:bg-canvas font-bold text-sm rounded-2xl shadow-lg transition-all transform active:scale-95"
            >
              <Calendar className="w-4 h-4 text-brand-600" />
              <span>{t.common.bookAppointment}</span>
            </Link>
            <Link
              href="/contacts"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-2xl border border-white/30 transition-all"
            >
              <Phone className="w-4 h-4 text-white" />
              <span>{t.nav.contacts}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
