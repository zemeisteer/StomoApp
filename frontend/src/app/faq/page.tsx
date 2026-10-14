'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, HelpCircle, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function FaqPage() {
  const { t, language } = useI18n();
  const [faqs, setFaqs] = useState<any[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFaqs() {
      try {
        setIsLoading(true);
        const data = await api.getFaqs();
        setFaqs(data || []);
      } catch (e) {
        console.error('Failed to load faqs', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadFaqs();
  }, []);

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.faq}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Ko&apos;p beriladigan savollar
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Davolanish, to&apos;lovlar, kafolatlar va tayyorgarlik bo&apos;yicha eng dolzarb javoblar
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-sm">{t.common.loading}</div>
      ) : faqs.length === 0 ? (
        <div className="p-16 text-center text-slate-500 text-sm">Savollar topilmadi.</div>
      ) : (
        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const question = language === 'ru' && faq.questionRu ? faq.questionRu : faq.questionUz;
            const answer = language === 'ru' && faq.answerRu ? faq.answerRu : faq.answerUz;
            const isOpen = openIndex === idx;

            return (
              <div
                key={faq.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-bold text-slate-900 hover:text-teal-700 transition-colors"
                >
                  <span className="text-base">{question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${
                      isOpen ? 'transform rotate-180 text-teal-700' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-50 animate-fade-in">
                    {answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CTA Box */}
      <div className="p-8 bg-teal-50/70 border border-teal-100 rounded-3xl text-center space-y-3">
        <h3 className="text-lg font-bold text-slate-900">
          O&apos;zingizni qiziqtirgan savolga javob topmadingizmi?
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Biz bilan bog&apos;laning yoki qabulga yoziling — mutaxassislarimiz barcha savollaringizga batafsil javob berishadi.
        </p>
        <div className="pt-2">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md hover:bg-teal-800 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            <span>{t.common.bookAppointment}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
