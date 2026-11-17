'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n';
import { SITE_PHOTOS } from '../../lib/sitePhotos';
import { Container } from '../site/primitives';
import { DevelopingPhoto, Photo } from '../site/moments';

interface ClinicSectionProps {
  sectionData?: any;
}

/**
 * About the clinic: one large photograph that develops once (the dealt picture-develops moment)
 * beside the clinic's own words from the CMS, with four short points under them.
 */
export const ClinicSection: React.FC<ClinicSectionProps> = ({ sectionData }) => {
  const { language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  const heading =
    isRu && sectionData?.titleRu
      ? sectionData.titleRu
      : sectionData?.titleUz || L('Oilaviy stomatologiya: bolalar ham, kattalar ham', 'Семейная стоматология: и дети, и взрослые');

  const description =
    isRu && sectionData?.contentRu
      ? sectionData.contentRu
      : sectionData?.contentUz ||
        L(
          'Bolalarning birinchi tashrifi o‘yin va tanishuvdan boshlanadi. Kattalar uchun esa har bir bosqich oldindan tushuntiriladi.',
          'Первый визит ребёнка начинается со знакомства и игры. Взрослым каждый этап объясняют заранее.',
        );

  // Administrator-managed points from the CMS when configured, otherwise plain facts of how the clinic works.
  const rawBenefits = sectionData?.data?.benefits || sectionData?.data?.items;
  const benefits: Array<{ title: string; desc: string }> =
    Array.isArray(rawBenefits) && rawBenefits.length > 0
      ? rawBenefits.map((b: any) => ({
          title: isRu && b.titleRu ? b.titleRu : b.titleUz || b.title || '',
          desc: isRu && b.descRu ? b.descRu : b.descUz || b.desc || '',
        }))
      : [
          { title: L('Shaxsiy muolaja rejasi', 'Индивидуальный план лечения'), desc: L('Bosqichlar va narx muolajadan oldin yoziladi.', 'Этапы и цена записываются до начала лечения.') },
          { title: L('Yashirin to‘lovlarsiz', 'Без скрытых платежей'), desc: L('Faqat tasdiqlangan narxlar ro‘yxati bo‘yicha.', 'Только по утверждённому прейскуранту.') },
          { title: L('Bolalar shifokorlari', 'Детские врачи'), desc: L('Qo‘rquvsiz, o‘yin orqali moslashtirish.', 'Адаптация через игру, без страха.') },
          { title: L('Eslatmalar', 'Напоминания'), desc: L('Qabul va keyingi ko‘rik haqida xabar beramiz.', 'Напомним о приёме и следующем осмотре.') },
        ];

  return (
    <section id="clinic" className="screen bg-white py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <DevelopingPhoto className="aspect-[4/3] rounded-3xl bg-canvas lg:col-span-6">
            <Photo photo={SITE_PHOTOS.child} lang={language} sizes="(min-width: 1024px) 45vw, 100vw" position="35% 50%" />
          </DevelopingPhoto>

          <div className="lg:col-span-6">
            <p className="mb-4 text-sm font-medium text-brand-700">{L('Klinika haqida', 'О клинике')}</p>
            <h2 className="text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">{heading}</h2>
            <p className="mt-5 text-base leading-relaxed text-ink-muted sm:text-lg">{description}</p>
            <dl className="mt-10 grid gap-x-8 gap-y-6 border-t border-line pt-8 sm:grid-cols-2">
              {benefits.slice(0, 4).map((item) => (
                <div key={item.title}>
                  <dt className="text-base font-medium text-ink">{item.title}</dt>
                  {item.desc && <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{item.desc}</dd>}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </section>
  );
};
