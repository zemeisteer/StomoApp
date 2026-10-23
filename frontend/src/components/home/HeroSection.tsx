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
              <span>{isRu ? 'Стоматологическая помощь европейского уровня' : 'Toshkentdagi zamonaviy stomatologiya klinikasi'}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#152f34] leading-[1.14]">
              {isRu ? (
                <>
                  Здоровая улыбка —{' '}
                  <span className="text-[#167b78]">надежное и безболезненное</span> лечение
                </>
              ) : (
                <>
                  Sog&apos;lom tabassum —{' '}
                  <span className="text-[#167b78]">ishonchli va og&apos;riqsiz</span> muolaja
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-[#52696e] max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
              {isRu
                ? 'Новейшие стоматологические технологии, сертифицированные специалисты с опытом более 15 лет и индивидуальный подход к каждому пациенту.'
                : 'Eng so\'nggi mikroskopik texnologiyalar, nemis va yapon asbob-uskunalari hamda 15 yildan ortiq tajribaga ega malakali mutaxassislar xizmatingizda.'}
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
                  <span className="text-xs font-bold text-[#152f34] block">15+ yil</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Опытные врачи' : 'Shifokorlar tajribasi'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#152f34] block">100%</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Стерильность' : 'Sterilizatsiya kafolati'}</span>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
                  <HeartPulse className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[#152f34] block">{isRu ? 'Без боли' : 'Og\'riqsiz'}</span>
                  <span className="text-[11px] text-[#52696e] block">{isRu ? 'Компьютерная анестезия' : 'Kompyuter anesteziyasi'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Soft Mint Visual Panel with 3D Interactive Tooth */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="w-full max-w-md lg:max-w-none bg-gradient-to-tr from-[#ffffff] via-[#f4f9f7] to-[#e2f2ed] rounded-3xl p-3 sm:p-5 shadow-sm border border-[#d8e5e2]">
              <Tooth3D />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
