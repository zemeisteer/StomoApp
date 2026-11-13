'use client';

import React from 'react';
import { ArrowRight, CalendarCheck2, ShieldCheck, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBrand } from '../../lib/brand';
import dynamic from 'next/dynamic';
import { Container, PrimaryLink, SecondaryLink } from '../site/primitives';

// three.js loads after the page is interactive, so the hero text never waits for the model.
const Tooth3D = dynamic(() => import('../Tooth3D').then((m) => m.Tooth3D), { ssr: false });

/** Calm hero: one strong sentence, two actions, three quiet facts and a soft visual. */
export const HeroSection: React.FC = () => {
  const { t, language } = useI18n();
  const brand = useBrand();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  const facts = [
    { icon: Sparkles, title: L('Raqamli diagnostika', 'Цифровая диагностика'), text: L('Aniq tashxis va reja', 'Точный диагноз и план') },
    { icon: ShieldCheck, title: L('Qat’iy sterilizatsiya', 'Строгая стерилизация'), text: L('Xalqaro me’yorlar', 'Международные нормы') },
    { icon: CalendarCheck2, title: L('Onlayn yozilish', 'Онлайн-запись'), text: L('Bir daqiqada', 'За одну минуту') },
  ];

  return (
    <section className="relative overflow-hidden pb-14 pt-10 sm:pb-20 sm:pt-14">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <p className="mb-6 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle animate-fade-in">
              {brand.clinicName(language)} · {L('Stomatologiya klinikasi', 'Стоматологическая клиника')}
            </p>
            <h1 className="text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">
              {isRu ? (
                <>
                  Спокойное лечение.
                  <br />
                  <span className="text-ink-subtle">Уверенная улыбка.</span>
                </>
              ) : (
                <>
                  Xotirjam davolash.
                  <br />
                  <span className="text-ink-subtle">Ishonchli tabassum.</span>
                </>
              )}
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-ink-muted">
              {L(
                'Tajribali shifokorlar, shaffof narxlar va har bir qadamni oldindan tushuntiradigan yondashuv. Qabulga onlayn yoziling — qolganini biz hal qilamiz.',
                'Опытные врачи, прозрачные цены и подход, при котором каждый шаг объясняют заранее. Запишитесь онлайн — остальное мы возьмём на себя.',
              )}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/booking">
                {t.common.bookAppointment}
                <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <SecondaryLink href="/prices">{L('Narxlarni ko‘rish', 'Посмотреть цены')}</SecondaryLink>
            </div>

            <dl className="mt-10 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
              {facts.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.6} />
                  <div>
                    <dt className="text-sm font-medium text-ink">{title}</dt>
                    <dd className="text-sm text-ink-subtle">{text}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          {/* Soft visual: brand-tinted panel with a quiet line drawing and two floating notes */}
          <div className="relative lg:col-span-5">
            <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] bg-brand-50 sm:aspect-[4/5]">
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
                className="absolute left-4 top-3 z-10 max-w-[70%] truncate text-[10px] text-ink-subtle hover:text-ink"
              >
                3D: {process.env.NEXT_PUBLIC_TOOTH_MODEL_CREDIT || 'Mandibular Third Molar — University of Dundee, School of Dentistry (CC BY 4.0)'}
              </a>
            </div>
            <div className="pointer-events-none absolute -left-4 bottom-16 hidden rounded-2xl sm:block border border-line bg-white/90 px-5 py-4 shadow-card backdrop-blur sm:-left-8 hero-float">
              <p className="text-xs text-ink-subtle">{L('Qabulga yozilish', 'Запись на приём')}</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{L('Onlayn, 1 daqiqada', 'Онлайн, за 1 минуту')}</p>
            </div>
            <div className="pointer-events-none absolute -right-2 top-10 hidden rounded-2xl sm:block border border-line bg-white/90 px-5 py-4 shadow-card backdrop-blur sm:-right-6 hero-float [animation-delay:1.5s]">
              <p className="text-xs text-ink-subtle">{L('Davolash rejasi', 'План лечения')}</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{L('Narxi oldindan aniq', 'Цена известна заранее')}</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
