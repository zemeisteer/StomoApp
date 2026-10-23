'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight, ShieldCheck, Award, HeartPulse } from 'lucide-react';
import { Tooth3D } from '../Tooth3D';
import { useI18n } from '../../lib/i18n';

export const HeroSection: React.FC = () => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  return (
    <section className="relative pt-6 sm:pt-12 pb-14 sm:pb-20 overflow-hidden bg-gradient-to-b from-[#eaf5f2]/60 via-white to-transparent">
      {/* Subtle ambient light glow */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#2bb49c]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Clear, Welcoming Heading, Subtitle & Primary Actions */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Small subtle clinic badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#eaf5f2] border border-[#d8e5e2] text-[#167b78] text-xs font-bold tracking-wide">
              <HeartPulse className="w-4 h-4 text-[#167b78]" />
              <span>{isRu ? 'Современная стоматологическая помощь' : 'Toshkentdagi zamonaviy stomatologiya klinikasi'}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#152f34] leading-[1.14]">
              {isRu ? (
                <>
                  Здоровая улыбка —{' '}
                  <span className="text-[#167b78]">надежное и комфортное</span> лечение
                </>
              ) : (
                <>
                  Sog&apos;lom tabassum —{' '}
                  <span className="text-[#167b78]">ishonchli va sifatli</span> muolaja
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-[#52696e] max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
              {isRu
                ? 'Современная цифровая диагностика, сертифицированные специалисты и бережный индивидуальный подход к каждому пациенту.'
                : 'Zamonaviy raqamli diagnostika, tajribali stomatologlar va har bir bemorga samimiy, individual yondashuv.'}
            </p>

            {/* Primary & Secondary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
              <Link
                href="/booking"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#167b78] hover:bg-[#116460] text-white font-bold text-base shadow-lg shadow-[#167b78]/25 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78]"
              >
                <Calendar className="w-5 h-5" />
                <span>{t.common.bookAppointment}</span>
              </Link>

              <Link
                href="/services"
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white hover:bg-[#f0f7f5] text-[#152f34] font-semibold text-base border border-[#d8e5e2] shadow-sm hover:border-[#167b78]/40 transition-all flex items-center justify-center gap-2"
              >
                <span>{isRu ? 'Наши услуги' : 'Xizmatlarimiz'}</span>
                <ArrowRight className="w-4 h-4 text-[#167b78]" />
              </Link>
            </div>

            {/* Clean Key Highlights */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-[#d8e5e2]/80">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#152f34] block">{isRu ? 'Опытные врачи' : 'Malakali shifokorlar'}</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Сертифицированные специалисты' : 'Katta tajribaga ega jamoa'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#152f34] block">{isRu ? 'Безопасность' : 'Xavfsizlik'}</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Строгая стерилизация' : 'Qat\'iy sterilizatsiya me\'yori'}</span>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
                  <HeartPulse className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#152f34] block">{isRu ? 'Комфорт' : 'Qulaylik'}</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Бережное лечение' : 'Bemorga samimiy e\'tibor'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Interactive Tooth Model */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl bg-white/70 backdrop-blur-md p-4 sm:p-6 border border-[#d8e5e2] shadow-[0_8px_30px_rgba(22,123,120,0.06)] relative flex items-center justify-center">
              <Tooth3D />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
