'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, HelpCircle, Calendar, ArrowRight, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface FaqAndCtaSectionProps {
  faqs?: any[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const fallbackFaqs = [
  {
    questionUz: 'Dastlabki ko\'rik va maslahat qanday o\'tadi?',
    questionRu: 'Как проходит первичный осмотр и консультация?',
    answerUz: 'Shifokor tishlaringiz holatini ko\'zdan kechiradi, kerak bo\'lsa raqamli diagnostika o\'tkazadi va individual davolash rejasi hamda aniq narx smetasini taqdim etadi.',
    answerRu: 'Врач проводит детальный визуальный осмотр, при необходимости делает цифровой снимок и составляет персональный план лечения с прозрачной стоимостью.',
  },
  {
    questionUz: 'Muolaja vaqtida og\'riq seziladimi?',
    questionRu: 'Чувствуется ли боль во время лечения?',
    answerUz: 'Klinikamizda zamonaviy mahalliy anesteziya usullari qo\'llaniladi, muolaja maksimal darajada qulay va og\'riqsiz o\'tishi ta\'minlanadi.',
    answerRu: 'Мы применяем современные препараты местной анестезии, что обеспечивает максимальный комфорт и безболезненность лечения.',
  },
  {
    questionUz: 'Qabulga qanday yozilish mumkin?',
    questionRu: 'Как записаться на прием?',
    answerUz: 'Saytimiz orqali onlayn qabulga yozilishingiz mumkin: filial, shifokor, sana va vaqtni tanlang. Shuningdek telefon orqali ham bog\'lanishingiz mumkin.',
    answerRu: 'Вы можете записаться онлайн на сайте, выбрав подходящий филиал, врача, дату и время, или позвонить в клинику.',
  },
  {
    questionUz: 'To\'lov turlari qanday?',
    questionRu: 'Какие способы оплаты доступны?',
    answerUz: 'Klinikamizda naqd pul hamda Uzcard, Humo va xalqaro bank kartalari orqali to\'lovlarni qabul qilamiz.',
    answerRu: 'Мы принимаем наличные, а также банковские карты Uzcard, Humo и международные платежные карты.',
  },
];

export const FaqAndCtaSection: React.FC<FaqAndCtaSectionProps> = ({
  faqs,
  isLoading = false,
  error = null,
  onRetry,
}) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  const displayFaqs = (faqs && faqs.length > 0) ? faqs : fallbackFaqs;

  return (
    <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
      {/* FAQ Accordion Section */}
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FAQ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
            {isRu ? 'Часто задаваемые вопросы' : 'Ko\'p beriladigan savollar'}
          </h2>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-2xl border border-[#d8e5e2] p-5 animate-pulse h-16" />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="text-center py-8 bg-white rounded-2xl border border-rose-200 p-6 shadow-sm mb-4">
            <AlertCircle className="w-6 h-6 text-rose-500 mx-auto mb-2" />
            <p className="text-rose-600 text-xs font-semibold mb-2">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-1.5 bg-[#167b78] text-white rounded-lg text-xs font-bold"
              >
                {t.common.retry}
              </button>
            )}
          </div>
        )}

        {/* FAQ Accordion Items */}
        {!isLoading && (
          <div className="space-y-3.5">
            {displayFaqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              const q = isRu
                ? (faq.questionRu || faq.qRu)
                : (faq.questionUz || faq.qUz);
              const a = isRu
                ? (faq.answerRu || faq.aRu)
                : (faq.answerUz || faq.aUz);

              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-[#d8e5e2] overflow-hidden transition-all shadow-[0_2px_6px_rgba(21,47,52,0.02)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-4.5 text-left font-bold text-sm sm:text-base text-[#152f34] flex items-center justify-between gap-4 hover:text-[#167b78] transition-colors cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <span>{q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#167b78] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-sm text-[#52696e] leading-relaxed border-t border-[#d8e5e2]/60 animate-fade-in">
                      <p>{a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Final Pre-Footer Booking Call To Action Banner */}
      <div className="bg-gradient-to-tr from-[#167b78] to-[#1a8e8b] rounded-3xl p-8 sm:p-12 text-white shadow-xl shadow-[#167b78]/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-5">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 text-white backdrop-blur-sm border border-white/20">
            <Calendar className="w-3.5 h-3.5" />
            <span>{isRu ? 'Онлайн-запись 24/7' : '24/7 Onlayn navbat'}</span>
          </span>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
            {isRu
              ? 'Запишитесь на прием к стоматологу прямо сейчас'
              : 'Stomatolog qabuliga hoziroq onlayn yoziling'}
          </h2>

          <p className="text-sm sm:text-base text-white/90 leading-relaxed max-w-xl mx-auto font-normal">
            {isRu
              ? 'Выберите удобную дату, врача и филиал. Мы перезвоним или пришлем подтверждение визита.'
              : 'O\'zingizga mos sana, mutaxassis va qulay filialni tanlang. Qabul vaqtingizni bir necha daqiqada tasdiqlaymiz.'}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link
              href="/booking"
              className="w-full sm:w-auto px-8 py-4 bg-white text-[#167b78] hover:bg-[#f3f8f7] font-bold text-base rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-95"
            >
              <Calendar className="w-5 h-5 text-[#167b78]" />
              <span>{t.common.bookAppointment}</span>
            </Link>

            <Link
              href="/contacts"
              className="w-full sm:w-auto px-7 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold text-base rounded-2xl border border-white/30 transition-all flex items-center justify-center gap-2"
            >
              <span>{t.nav.contacts}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
