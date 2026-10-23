'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, Microscope, Award, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export const ClinicSection: React.FC = () => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const benefits = [
    {
      icon: Microscope,
      title: isRu ? 'Современная цифровая диагностика' : 'Zamonaviy raqamli diagnostika',
      desc: isRu
        ? 'Цифровое сканирование и точные снимки для безопасного и обоснованного планирования лечения.'
        : 'Xavfsiz va aniq davolash rejasini tuzish uchun raqamli tekshiruv va diagnostika.',
    },
    {
      icon: ShieldCheck,
      title: isRu ? 'Стерильность и инфекционный контроль' : 'Sterillik va sanitariya nazorati',
      desc: isRu
        ? 'Строгие санитарные протоколы автоклавирования и индивидуальные стерильные наборы для каждого пациента.'
        : 'Xalqaro talablar asosidagi avtoklavlash va har bir bemor uchun alohida steril to\'plamlar.',
    },
    {
      icon: Award,
      title: isRu ? 'Квалифицированная команда' : 'Malakali shifokorlar jamoasi',
      desc: isRu
        ? 'Врачи с подтвержденными сертификатами, регулярно проходящие повышение профессиональной квалификации.'
        : 'Doimiy ravishda o\'z ustida ishlaydigan va amaliy bilimlarini oshirib boradigan shifokorlar.',
    },
    {
      icon: Sparkles,
      title: isRu ? 'Комфорт и забота' : 'Qulaylik va e\'tibor',
      desc: isRu
        ? 'Бережная анестезия и спокойная атмосфера для максимального комфорта взрослых и детей.'
        : 'Kattalar va bolalar uchun yoqimli muhit hamda bemorning erkin his qilishini ta\'minlash.',
    },
  ];

  return (
    <section id="clinic" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#d8e5e2] shadow-[0_4px_24px_rgba(21,47,52,0.04)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Summary */}
          <div className="lg:col-span-5 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isRu ? 'О клинике' : 'Klinikamiz haqida'}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34] leading-tight">
              {isRu
                ? 'Высокие стандарты стоматологии для вашего комфорта'
                : 'Salomatligingiz va tabassumingiz uchun sifatli xizmat'}
            </h2>

            <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
              {isRu
                ? 'Наша клиника объединяет современное стоматологическое оснащение и заботливый подход к пациентам. Мы ориентированы на долговечный результат и прозрачность цен.'
                : 'Klinikamiz zamonaviy stomatologiya imkoniyatlari va har bir bemorga samimiy e\'tiborni birlashtiradi. Bizning maqsadimiz — uzoq muddatli sifat va narxlarning to\'liq shaffofligi.'}
            </p>

            <div className="pt-2">
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#167b78] hover:text-[#116460] group transition-colors"
              >
                <span>{isRu ? 'Подробнее о стандартах клиники' : 'Klinika standartlari haqida batafsil'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Right Feature Grid */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {benefits.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  className="bg-[#f4f9f7] rounded-2xl p-6 border border-[#d8e5e2] space-y-3 hover:border-[#167b78]/40 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-[#d8e5e2] flex items-center justify-center text-[#167b78] shrink-0">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#152f34] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#52696e] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
};
