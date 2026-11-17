'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '../../lib/i18n';
import { useBrand } from '../../lib/brand';
import { SITE_PHOTOS } from '../../lib/sitePhotos';
import { PrimaryLink } from '../site/primitives';
import { Photo } from '../site/moments';

// three.js loads after the page is interactive, so the hero text never waits for the model.
const Tooth3D = dynamic(() => import('../Tooth3D').then((m) => m.Tooth3D), { ssr: false });

/**
 * Hero: the clinic photograph fills the frame as the background (darkened on the left so the words
 * read), the words on the left, and the 3D tooth in its light panel on the right. Enters once on load.
 */
export const HeroSection: React.FC = () => {
  const { t, language } = useI18n();
  const brand = useBrand();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <section className="hero-enter mx-auto max-w-[1344px] px-3 pb-3 pt-3 sm:px-8 sm:pb-4 sm:pt-4">
      <div className="relative overflow-hidden rounded-[28px] bg-brand-950 lg:h-[calc(100svh-64px-32px)] lg:min-h-[620px]">
        {/* background photograph */}
        <div data-enter-media className="absolute inset-0">
          <Photo photo={SITE_PHOTOS.team} lang={language} sizes="100vw" eager position="62% 40%" />
        </div>
        {/* darkens the left (and the top on a phone) so white words keep their contrast */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-brand-950/90 via-brand-950/80 to-brand-950/60 lg:bg-gradient-to-r lg:from-brand-950/95 lg:via-brand-950/75 lg:to-brand-950/25"
        />

        <div className="relative grid h-full items-center gap-8 p-6 sm:p-10 lg:grid-cols-12 lg:gap-10 lg:p-14">
          <div className="text-white lg:col-span-7">
            <p data-enter-item="1" className="text-sm font-medium text-brand-200">
              {brand.clinicName(language)}
            </p>
            <h1
              data-enter-item="2"
              className="mt-3 max-w-[15ch] text-[2.5rem] font-normal leading-[1.02] tracking-[-0.035em] sm:text-[3.5rem] lg:text-[4.25rem]"
            >
              {L('Kattalar va bolalar uchun stomatologiya', 'Стоматология для взрослых и детей')}
            </h1>
            <p data-enter-item="3" className="mt-5 max-w-[46ch] text-base leading-relaxed text-white/80 sm:text-[17px]">
              {L(
                'Ko‘rik va rentgendan keyin shifokor reja va narxni yozib beradi. Davolash shu reja bo‘yicha boshlanadi, onlayn yozilish 1 daqiqa oladi.',
                'После осмотра и снимка врач даёт письменный план и цену. Лечение идёт по этому плану, онлайн-запись занимает 1 минуту.',
              )}
            </p>
            <div data-enter-item="4" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <PrimaryLink href="/booking" className="!bg-white !text-brand-950 hover:!bg-brand-50">
                {t.common.bookAppointment}
              </PrimaryLink>
              <a href="/prices" className="link-draw inline-flex min-h-[44px] items-center self-start text-[15px] font-medium text-white sm:self-auto">
                {L('Narxlarni ko‘rish', 'Посмотреть цены')}
              </a>
            </div>
          </div>

          {/* the 3D tooth back in its light panel */}
          <div data-enter-item="3" className="lg:col-span-5">
            <div className="relative mx-auto aspect-square w-full max-w-[460px] overflow-hidden rounded-[24px] bg-brand-50 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] lg:aspect-[4/5] lg:max-h-[calc(100svh-64px-32px-112px)]">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(80% 60% at 70% 20%, rgb(var(--brand-100)), transparent 70%), radial-gradient(70% 60% at 20% 90%, rgb(var(--secondary-100)), transparent 70%)',
                }}
              />
              <Tooth3D chromeless className="absolute inset-0 h-full" />
              {/* CC BY 4.0 requires crediting the scan's author */}
              <a
                href={process.env.NEXT_PUBLIC_TOOTH_MODEL_URL || 'https://sketchfab.com/3d-models/mandibular-third-molar-561bb06b3b084b84978163906de1c2b5'}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute left-4 top-3 z-10 max-w-[80%] truncate text-[10px] text-ink-muted hover:text-ink"
              >
                3D: {process.env.NEXT_PUBLIC_TOOTH_MODEL_CREDIT || 'Mandibular Third Molar — University of Dundee, School of Dentistry (CC BY 4.0)'}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
