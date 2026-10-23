'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, HelpCircle, Calendar, Phone } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function FaqPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [faqs, setFaqs] = useState<any[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>FAQ</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Часто задаваемые вопросы' : 'Ko\'p beriladigan savollar'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Ответы на самые популярные вопросы о лечении, гарантиях, записи и подготовке к приему.'
            : 'Davolanish, to\'lovlar, kafolatlar va tayyorgarlik bo\'yicha eng dolzarb javoblar.'}
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-[#52696e] text-sm">{t.common.loading}</div>
      ) : faqs.length === 0 ? (
        <div className="p-16 text-center text-[#52696e] text-sm bg-white rounded-3xl border border-dashed border-[#d8e5e2]">
          {isRu ? 'Вопросы не найдены.' : 'Savollar topilmadi.'}
        </div>
      ) : (
        <div className="space-y-3.5">
          {faqs.map((faq, idx) => {
            const question = isRu && faq.questionRu ? faq.questionRu : faq.questionUz;
            const answer = isRu && faq.answerRu ? faq.answerRu : faq.answerUz;
            const isOpen = openIndex === idx;

            return (
              <div
                key={faq.id}
                className="bg-white rounded-2xl border border-[#d8e5e2] shadow-[0_2px_8px_rgba(21,47,52,0.02)] overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-bold text-[#152f34] hover:text-[#167b78] transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base">{question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#167b78] shrink-0 transition-transform duration-200 ${
                      isOpen ? 'transform rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 pt-1 text-xs sm:text-sm text-[#52696e] leading-relaxed border-t border-[#d8e5e2]/60 animate-fade-in">
                    {answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CTA Box */}
      <div className="p-8 sm:p-10 bg-[#eaf5f2] border border-[#d8e5e2] rounded-3xl text-center space-y-4">
        <h3 className="text-xl font-bold text-[#152f34]">
          {isRu ? 'Не нашли ответ на свой вопрос?' : 'O\'zingizni qiziqtirgan savolga javob topmadingizmi?'}
        </h3>
        <p className="text-xs sm:text-sm text-[#52696e] max-w-md mx-auto">
          {isRu
            ? 'Свяжитесь с нами или запишитесь на прием — наши специалисты подробно проконсультируют вас.'
            : 'Biz bilan bog\'laning yoki qabulga yoziling — mutaxassislarimiz barcha savollaringizga batafsil javob berishadi.'}
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/booking"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#167b78] text-white rounded-xl text-xs font-bold shadow-md shadow-[#167b78]/20 hover:bg-[#116460] transition-colors"
          >
            <Calendar className="w-4 h-4" />
            <span>{t.common.bookAppointment}</span>
          </Link>
          <Link
            href="/contacts"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-[#152f34] border border-[#d8e5e2] rounded-xl text-xs font-bold hover:bg-[#f0f7f5] transition-colors"
          >
            <Phone className="w-4 h-4 text-[#167b78]" />
            <span>{t.nav.contacts}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
