'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, HelpCircle, Calendar, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface FaqAndCtaSectionProps {
  faqs?: any[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const baselineFaqs = [
  {
    questionUz: "Qabulga oldindan yozilish majburiymi?",
    questionRu: "Обязательна ли предварительная запись на прием?",
    answerUz: "Ha, shifokorlarimiz har bir bemorga individual vaqt ajratishi, to'liq diagnostika o'tkazishi hamda klinikada navbat va kutish vaqtini yo'qotish uchun oldindan yozilish tavsiya etiladi. Shoshilinch tish og'rig'i bilan kelgan bemorlar esa navbatsiz qabul qilinadi.",
    answerRu: "Да, для комфорта каждого пациента и исключения ожидания в очереди мы рекомендуем записываться заранее. Пациенты с острой зубной болью принимаются в приоритетном порядке.",
  },
  {
    questionUz: "Muolajalar og'riqlimi? Anesteziya qanday qo'llaniladi?",
    questionRu: "Болезненны ли процедуры? Какая анестезия используется?",
    answerUz: "Barcha muolajalar maksimal qulaylikda o'tadi. Klinikamizda xalqaro sertifikatlangan zamonaviy anestetiklar (Artikain asosidagi) qo'llaniladi. Inyeksiya joyi oldindan maxsus mevali gel bilan xushbo'y og'riqsizlantiriladi, shuning uchun hatto ukolning o'zi ham sezilmaydi.",
    answerRu: "Все процедуры проходят комфортно и безболезненно. Мы используем современные гипоаллергенные анестетики мирового стандарта, а место укола предварительно обезболивается аппликационным гелем.",
  },
  {
    questionUz: "Implantatsiya va muolajalarga kafolat beriladimi?",
    questionRu: "Предоставляется ли гарантия на имплантацию и лечение?",
    answerUz: "Ha, klinikamiz xalqaro standartdagi implant tizimlari (Janubiy Koreya va Shveysariya) bilan ishlaydi. Implantlarga ishlab chiqaruvchi tomonidan umrbod kafolat, klinikamiz tomonidan esa muolajaga rasmiy kafolat shartnomasi taqdim etiladi.",
    answerRu: "Да, мы работаем исключительно с сертифицированными премиальными системами имплантатов. На имплантаты действует официальная пожизненная гарантия производителя, а на работу клиники предоставляется договорная гарантия.",
  },
  {
    questionUz: "Bolalar bilan qanday ishlanadi va moslashtiriladi?",
    questionRu: "Как проходит прием детей и адаптация к лечению?",
    answerUz: "Bolalar stomatologlarimiz bolalar psixologiyasi bo'yicha maxsus tayyorgarlikdan o'tgan. Birinchi tashrif do'stona o'yin va ko'rik tarzida boshlanadi, multfilmlar qo'yib beriladi va davolash stresssiz amalga oshiriladi.",
    answerRu: "Наши детские стоматологи применяют игровой подход и психологическую адаптацию. Ребенок смотрит любимые мультфильмы, знакомится с врачом в доброжелательной обстановке без страха и боли.",
  },
  {
    questionUz: "Dastlabki ko'rik va diagnostika qanday o'tadi?",
    questionRu: "Как проходит первичный осмотр и консультация?",
    answerUz: "Bemor shifokor qabuliga kelganda og'iz bo'shlig'i to'liq ko'zdan kechiriladi, zarur bo'lsa raqamli 3D rentgen/viziografiya qilinadi va aniq davolash rejasi hamda narxlar smetasi oldindan taqdim etiladi.",
    answerRu: "Врач проводит полный осмотр полости рта, при необходимости выполняется цифровая радиовизиография, после чего составляется детальный план лечения с прозрачным расчетом стоимости.",
  },
  {
    questionUz: "Qanday to'lov turlari mavjud?",
    questionRu: "Какие способы оплаты доступны?",
    answerUz: "Klinikamizda naqd pul, Uzcard, Humo hamda Visa va Mastercard xalqaro bank kartalari orqali to'lovlarni amalga oshirish mumkin. Hech qanday qo'shimcha yoki yashirin to'lovlar olinmaydi.",
    answerRu: "Оплата возможна наличными, картами Uzcard, Humo, а также международными картами Visa и Mastercard без скрытых комиссий.",
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

  // Merge database FAQs with baseline fallbacks if database items are empty or lack Russian text
  const rawList = Array.isArray(faqs) && faqs.length > 0 ? faqs : baselineFaqs;
  const displayFaqs = rawList.map((faq, idx) => {
    const fallback = baselineFaqs[idx] || baselineFaqs[0];
    const qUz = faq.questionUz || faq.qUz || fallback.questionUz;
    const aUz = faq.answerUz || faq.aUz || fallback.answerUz;
    const qRuRaw = faq.questionRu || faq.qRu;
    const aRuRaw = faq.answerRu || faq.aRu;

    // Detect corrupted '???' strings from old seeds and fall back gracefully
    const isCorruptedRu = (str?: string) => !str || str.includes('???') || str.trim().length === 0;
    const qRu = isCorruptedRu(qRuRaw) ? fallback.questionRu : qRuRaw;
    const aRu = isCorruptedRu(aRuRaw) ? fallback.answerRu : aRuRaw;

    return {
      id: faq.id || `faq-${idx}`,
      question: isRu ? qRu : qUz,
      answer: isRu ? aRu : aUz,
    };
  });

  return (
    <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 space-y-20">
      {/* FAQ Accordion Section */}
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 sm:mb-16 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FAQ</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
            {isRu ? 'Часто задаваемые вопросы' : 'Ko\'p beriladigan savollar'}
          </h2>
          <p className="text-sm sm:text-base text-[#52696e] max-w-xl mx-auto leading-relaxed">
            {isRu
              ? 'Ответы на самые важные вопросы о лечении, гарантиях, записи и ценах в нашей клинике.'
              : 'Davolanish, xavfsizlik, narxlar va qabulga tayyorgarlik bo\'yicha eng muhim ma\'lumotlar.'}
          </p>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white rounded-3xl border border-[#d8e5e2] p-7 animate-pulse h-24" />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="text-center py-8 bg-white rounded-3xl border border-rose-200 p-8 shadow-sm mb-6">
            <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2.5" />
            <p className="text-rose-600 text-sm font-semibold mb-3">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-5 py-2 bg-[#167b78] hover:bg-[#126462] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                {t.common.retry}
              </button>
            )}
          </div>
        )}

        {/* FAQ Accordion Items */}
        {!isLoading && (
          <div className="space-y-4 sm:space-y-5">
            {displayFaqs.map((faq, idx) => {
              const isOpen = openIndex === idx;
              const itemNum = String(idx + 1).padStart(2, '0');

              return (
                <div
                  key={faq.id}
                  className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'border-[#167b78] ring-2 ring-[#167b78]/10 shadow-[0_8px_30px_rgba(22,123,120,0.08)] bg-gradient-to-b from-white to-[#f7fbf9]'
                      : 'border-[#d8e5e2] hover:border-[#167b78]/40 shadow-[0_2px_10px_rgba(21,47,52,0.02)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    className="w-full p-6 sm:p-7 text-left flex items-center justify-between gap-4 cursor-pointer group"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center text-xs sm:text-sm font-extrabold shrink-0 transition-colors ${
                          isOpen
                            ? 'bg-[#167b78] text-white shadow-md shadow-[#167b78]/25'
                            : 'bg-[#eaf5f2] text-[#167b78] group-hover:bg-[#167b78]/15'
                        }`}
                      >
                        {itemNum}
                      </div>
                      <span className="font-bold text-base sm:text-lg text-[#152f34] group-hover:text-[#167b78] transition-colors leading-snug">
                        {faq.question}
                      </span>
                    </div>

                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isOpen
                          ? 'bg-[#167b78] text-white rotate-180 shadow-sm'
                          : 'bg-[#f3f8f7] group-hover:bg-[#eaf5f2] text-[#167b78]'
                      }`}
                    >
                      <ChevronDown className="w-5 h-5 transition-transform duration-200" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 sm:px-8 pb-7 pt-1 animate-fade-in">
                      <div className="border-t border-[#d8e5e2]/80 pt-5 pl-13 sm:pl-15">
                        <p className="text-sm sm:text-base text-[#465e64] leading-relaxed">
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
      </div>

      {/* Final Pre-Footer Booking Call To Action Banner */}
      <div className="bg-gradient-to-tr from-[#167b78] to-[#1a8e8b] rounded-3xl p-8 sm:p-14 text-white shadow-xl shadow-[#167b78]/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 text-white backdrop-blur-sm border border-white/20">
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
