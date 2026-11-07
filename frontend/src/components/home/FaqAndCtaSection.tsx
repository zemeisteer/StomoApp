'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { Container, Section, SectionError, SkeletonCards } from '../site/primitives';

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
    <>
      <Section id="faq" className="bg-canvas">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <p className="mb-4 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
                <span className="tabular-nums text-brand-600">06</span>
                <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
                FAQ
              </p>
              <h2 className="text-3xl font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-4xl">
                {isRu ? 'Ответы на частые вопросы' : 'Ko‘p beriladigan savollar'}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-ink-muted">
                {isRu ? 'Не нашли ответ? Позвоните нам или напишите в Telegram.' : 'Javob topilmadimi? Qo‘ng‘iroq qiling yoki Telegram’da yozing.'}
              </p>
            </div>
          </div>
          <div className="lg:col-span-8">
            {isLoading && <SkeletonCards count={3} className="grid-cols-1" />}
            {!isLoading && error && <SectionError message={error} onRetry={onRetry} retryLabel={t.common.retry} />}
            {!isLoading && !error && (
              <ul className="border-t border-line">
                {displayFaqs.map((faq, idx) => {
                  const open = openIndex === idx;
                  return (
                    <li key={faq.id} className="border-b border-line">
                      <button
                        type="button"
                        onClick={() => toggleFaq(idx)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${idx}`}
                        className="flex w-full items-center justify-between gap-6 py-6 text-left"
                      >
                        <span className="text-lg font-medium tracking-[-0.01em] text-ink">{faq.question}</span>
                        <span
                          className={`relative h-5 w-5 shrink-0 text-ink-subtle transition-transform duration-500 ${open ? 'rotate-45 text-brand-600' : ''}`}
                          aria-hidden="true"
                        >
                          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
                          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
                        </span>
                      </button>
                      <div
                        id={`faq-panel-${idx}`}
                        className={`grid transition-[grid-template-rows] duration-500 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                      >
                        <div className="overflow-hidden">
                          <p className="max-w-2xl pb-7 text-base leading-relaxed text-ink-muted">{faq.answer}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* Closing call to action */}
      <section className="bg-canvas pb-20 sm:pb-28">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-brand-950 px-8 py-16 text-center sm:px-16 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgb(var(--brand-600) / 0.45), transparent 70%)' }}
            />
            <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.025em] text-white sm:text-5xl">
              {isRu ? 'Запишитесь на консультацию' : 'Maslahat uchun yoziling'}
            </h2>
            <p className="relative mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/70">
              {isRu
                ? 'Осмотр, понятный план лечения и честная цена — на первом же визите.'
                : 'Ko‘rik, tushunarli davolash rejasi va halol narx — birinchi tashrifdayoq.'}
            </p>
            <div className="relative mt-10 flex justify-center">
              <Link
                href="/booking"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-medium text-brand-950 transition-colors duration-300 hover:bg-brand-50"
              >
                {t.common.bookAppointment}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
};
