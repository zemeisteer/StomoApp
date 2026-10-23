'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, Microscope, Award, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface ClinicSectionProps {
  sectionData?: any;
}

export const ClinicSection: React.FC<ClinicSectionProps> = ({ sectionData }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const heading = isRu && sectionData?.titleRu
    ? sectionData.titleRu
    : (sectionData?.titleUz || (isRu ? 'Стоматологическая помощь для всей семьи' : 'Oilaviy stomatologiya va malakali tibbiy xizmat'));

  const description = isRu && sectionData?.contentRu
    ? sectionData.contentRu
    : (sectionData?.contentUz || (isRu
        ? 'Наша клиника предоставляет широкий спектр стоматологических услуг с внимательным отношением к каждому пациенту и прозрачными ценами.'
        : 'Klinikamiz har bir bemorga samimiy e\'tibor, shaffof narxlar va qulay sharoitlarda stomatologik yordam ko\'rsatadi.'));

  // Use administrator-managed benefits from CMS if configured, otherwise neutral factual highlights
  const rawBenefits = sectionData?.data?.benefits || sectionData?.data?.items;
  const benefits = Array.isArray(rawBenefits) && rawBenefits.length > 0
    ? rawBenefits.map((b: any) => ({
        icon: Sparkles,
        title: isRu && b.titleRu ? b.titleRu : (b.titleUz || b.title || ''),
        desc: isRu && b.descRu ? b.descRu : (b.descUz || b.desc || ''),
      }))
    : [
        {
          icon: ShieldCheck,
          title: isRu ? 'Индивидуальный план лечения' : 'Shaxsiy muolaja rejasi',
          desc: isRu
            ? 'Предварительная консультация и подробный расчёт этапов до начала процедур.'
            : 'Muolaja boshlanishidan oldin to\'liq maslahat va har bir bosqichning shaffof hisobi.',
        },
        {
          icon: Award,
          title: isRu ? 'Прозрачность и понятные условия' : 'Shaffoflik va aniq shartlar',
          desc: isRu
            ? 'Все услуги оказываются на основе утвержденного прейскуранта без скрытых платежей.'
            : 'Barcha xizmatlar tasdiqlangan narxlar asosida ko\'rsatiladi, yashirin to\'lovlar mavjud emas.',
        },
        {
          icon: Sparkles,
          title: isRu ? 'Удобная запись и приём' : 'Qulay qabul va yozilish',
          desc: isRu
            ? 'Онлайн-выбор удобного времени и филиала с подтверждением и напоминаниями.'
            : 'Siz uchun mos filial va vaqtni bir necha daqiqada online band qilish imkoniyati.',
        },
        {
          icon: Microscope,
          title: isRu ? 'Забота о вашем комфорте' : 'Bemorlar uchun qulaylik',
          desc: isRu
            ? 'Спокойная обстановка и внимательный персонал для взрослых и детей.'
            : 'Har bir bemor o\'zini xotirjam va qulay his qilishi uchun samimiy jamoa.',
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
              {heading}
            </h2>

            <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
              {description}
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
