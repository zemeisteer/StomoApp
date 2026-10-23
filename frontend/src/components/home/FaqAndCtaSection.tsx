'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, HelpCircle, Calendar, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface FaqItem {
  qUz: string;
  qRu: string;
  aUz: string;
  aRu: string;
}

const defaultFaqs: FaqItem[] = [
  {
    qUz: 'Dastlabki ko\'rik va maslahat qanday o\'tadi?',
    qRu: 'Как проходит первичный осмотр и консультация?',
    aUz: 'Shifokor tishlaringiz holatini ko\'zdan kechiradi, kerak bo\'lsa 3D raqamli rentgen/diagnostika o\'tkazadi va individual davolash rejasi hamda aniq narx smetasini taqdim etadi.',
    aRu: 'Врач проводит детальный визуальный осмотр, при необходимости делает цифровой 3D-снимок и составляет персональный план лечения с прозрачной стоимостью.',
  },
  {
    qUz: 'Muolaja vaqtida og\'riq bo\'ladimi?',
    qRu: 'Будет ли больно во время лечения?',
    aUz: 'Yo\'q, klinikamizda og\'riqsiz kompyuter anesteziyasi texnologiyasidan foydalaniladi. Siz hech qanday og\'riq yoki noqulaylik sezmaysiz.',
    aRu: 'Нет, мы применяем современную компьютерную анестезию. Лечение проходит абсолютно безболезненно и комфортно.',
  },
  {
    qUz: 'Qabulga qanday yozilish mumkin?',
    qRu: 'Как записаться на прием?',
    aUz: 'Saytimiz orqali 24/7 onlayn qabulga yozilishingiz mumkin. O\'zingizga qulay filial, shifokor va vaqtni tanlang. Shuningdek telefon orqali ham bog\'lanishingiz mumkin.',
    aRu: 'Вы можете записаться онлайн на сайте 24/7, выбрав удобный филиал, врача и время. Также доступна запись по телефону.',
  },
  {
    qUz: 'To\'lov turlari va kafolat bormi?',
    qRu: 'Какие способы оплаты и предоставляется ли гарантия?',
    aUz: 'Barcha to\'lov turlari (naqd, Uzcard, Humo, Visa) qabul qilinadi. Barcha xizmatlarimizga rasmiy kafolat taqdim etiladi.',
    aRu: 'Мы принимаем все виды платежей (наличные, Uzcard, Humo, Visa). На все выполненные работы предоставляется официальная гарантия.',
  },
];

export const FaqAndCtaSection: React.FC = () => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
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

        <div className="space-y-3.5">
          {defaultFaqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            const q = isRu ? faq.qRu : faq.qUz;
            const a = isRu ? faq.aRu : faq.aUz;

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-[#d8e5e2] overflow-hidden transition-all shadow-[0_2px_6px_rgba(21,47,52,0.02)]"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-4.5 text-left font-bold text-sm sm:text-base text-[#152f34] flex items-center justify-between gap-4 hover:text-[#167b78] transition-colors"
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
      </div>

      {/* Warm Final Invitation Banner */}
      <div className="bg-gradient-to-r from-[#12353b] via-[#167b78] to-[#2bb49c] rounded-3xl p-8 sm:p-12 text-white shadow-xl shadow-[#167b78]/15 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-8">
        <div className="space-y-3 max-w-xl">
          <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isRu
              ? 'Готовы сделать шаг к здоровой улыбке?'
              : 'Sog\'lom va go\'zal tabassum sari birinchi qadamni tashlang'}
          </h3>
          <p className="text-sm sm:text-base text-white/90 leading-relaxed">
            {isRu
              ? 'Запишитесь на прием прямо сейчас в удобное для вас время. Мы позаботимся о вашем комфорте!'
              : 'Qabulga hoziroq onlayn yoziling. Qulay vaqt, tajribali shifokor va og\'riqsiz muolaja kafolatlanadi.'}
          </p>
        </div>

        <div className="shrink-0 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link
            href="/booking"
            className="w-full sm:w-auto px-8 py-4 bg-white text-[#167b78] hover:bg-[#eaf5f2] rounded-2xl font-extrabold text-sm shadow-lg transition-all text-center flex items-center justify-center gap-2 transform active:scale-95"
          >
            <Calendar className="w-4 h-4" />
            <span>{t.common.bookAppointment}</span>
          </Link>
          <Link
            href="/contacts"
            className="w-full sm:w-auto px-6 py-4 bg-transparent border border-white/40 hover:bg-white/10 text-white rounded-2xl font-bold text-sm transition-all text-center flex items-center justify-center gap-2"
          >
            <span>{t.nav.contacts}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};
