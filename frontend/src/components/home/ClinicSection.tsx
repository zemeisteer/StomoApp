'use client';

import React from 'react';
import Link from 'next/link';
import { Award, Microscope, ShieldCheck, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { Section } from '../site/primitives';

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
    <Section id="clinic" className="bg-white">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <p className="mb-4 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
            <span className="tabular-nums text-brand-600">03</span>
            <span className="h-px w-8 bg-line-strong" aria-hidden="true" />
            {isRu ? 'О клинике' : 'Klinika haqida'}
          </p>
          <h2 className="text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-3xl">{heading}</h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-muted">{description}</p>
        </div>
        <ol className="lg:col-span-7 lg:pt-10">
          {benefits.map((item, i) => (
            <li key={item.title} className="grid grid-cols-[3rem_1fr] gap-x-4 border-t border-line py-7 last:border-b">
              <span className="pt-0.5 text-sm tabular-nums text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <p className="text-lg font-medium tracking-[-0.01em] text-ink">{item.title}</p>
                {item.desc && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.desc}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
};
