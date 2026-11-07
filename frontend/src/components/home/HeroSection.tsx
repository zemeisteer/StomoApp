'use client';

import React from 'react';
import { ArrowRight, CalendarCheck2, ShieldCheck, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBrand } from '../../lib/brand';
import { Container, PrimaryLink, SecondaryLink } from '../site/primitives';

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
    <section className="relative overflow-hidden pb-20 pt-14 sm:pb-28 sm:pt-20">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <p className="mb-6 text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle animate-fade-in">
              {brand.clinicName(language)} · {L('Stomatologiya klinikasi', 'Стоматологическая клиника')}
            </p>
            <h1 className="text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[4.25rem]">
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
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">
              {L(
                'Tajribali shifokorlar, shaffof narxlar va har bir qadamni oldindan tushuntiradigan yondashuv. Qabulga onlayn yoziling — qolganini biz hal qilamiz.',
                'Опытные врачи, прозрачные цены и подход, при котором каждый шаг объясняют заранее. Запишитесь онлайн — остальное мы возьмём на себя.',
              )}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/booking">
                {t.common.bookAppointment}
                <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <SecondaryLink href="/prices">{L('Narxlarni ko‘rish', 'Посмотреть цены')}</SecondaryLink>
            </div>

            <dl className="mt-14 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
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
          <div className="relative hidden lg:col-span-5 lg:block" aria-hidden="true">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-brand-50">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(80% 60% at 70% 20%, rgb(var(--brand-100)), transparent 70%), radial-gradient(70% 60% at 20% 90%, rgb(var(--secondary-100)), transparent 70%)',
                }}
              />
              <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full" fill="none">
                <path
                  d="M120 150c0-40 30-62 80-62s80 22 80 62c0 52-18 84-26 132-8 46-10 92-26 92-18 0-14-70-28-70s-10 70-28 70c-16 0-18-46-26-92-8-48-26-80-26-132z"
                  stroke="rgb(var(--brand-600))"
                  strokeOpacity="0.35"
                  strokeWidth="1.5"
                  className="hero-draw"
                />
                <circle cx="200" cy="250" r="168" stroke="rgb(var(--brand-600))" strokeOpacity="0.08" />
                <circle cx="200" cy="250" r="210" stroke="rgb(var(--brand-600))" strokeOpacity="0.05" />
              </svg>
            </div>
            <div className="absolute -left-4 bottom-16 rounded-2xl border border-line bg-white/90 px-5 py-4 shadow-card backdrop-blur sm:-left-8 hero-float">
              <p className="text-xs text-ink-subtle">{L('Qabulga yozilish', 'Запись на приём')}</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{L('Onlayn, 1 daqiqada', 'Онлайн, за 1 минуту')}</p>
            </div>
            <div className="absolute -right-2 top-10 rounded-2xl border border-line bg-white/90 px-5 py-4 shadow-card backdrop-blur sm:-right-6 hero-float [animation-delay:1.5s]">
              <p className="text-xs text-ink-subtle">{L('Davolash rejasi', 'План лечения')}</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{L('Narxi oldindan aniq', 'Цена известна заранее')}</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};
