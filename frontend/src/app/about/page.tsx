'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, Heart, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { Container, PageIntro } from '../../components/site/primitives';

export default function AboutPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [clinicName, setClinicName] = useState('DentaCare');

  useEffect(() => {
    let isMounted = true;
    api.getClinicInfo()
      .then((info) => {
        if (!isMounted) return;
        if (info?.name) setClinicName(info.name);
        else if (info?.clinicName) setClinicName(info.clinicName);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const values = [
    {
      icon: ShieldCheck,
      title: isRu ? 'Стерильность и безопасность' : 'Xavfsizlik va sterilizatsiya',
      desc: isRu
        ? 'Строгие протоколы автоклавирования и индивидуальные стерильные пакеты для каждого пациента.'
        : 'Ko\'p bosqichli tozalash va zararsizlantirish me\'yorlari. Har bir bemor uchun faqat yakka tartibdagi steril to\'plamlar.',
    },
    {
      icon: Sparkles,
      title: isRu ? 'Точность и современные стандарты' : 'Aniq va sifatli davolash',
      desc: isRu
        ? 'Цифровое планирование и бережная обработка тканей позволяют бережно сохранить естественные зубы.'
        : 'Raqamli rejalashtirish va ehtiyotkorlik bilan muolaja qilish orqali tabiiy tishlarni asrab qolish.',
    },
    {
      icon: Heart,
      title: isRu ? 'Психологический комфорт' : 'Bemor qulayligi va g\'amxo\'rlik',
      desc: isRu
        ? 'Забота и деликатное отношение. Современная анестезия обеспечивает спокойствие и комфорт во время визита.'
        : 'Har bir bemorga samimiy e\'tibor. Bolalar va kattalar uchun yumshoq, og\'riqsiz zamonaviy anesteziya qo\'llaniladi.',
    },
  ];

  const technologies = [
    {
      brand: isRu ? 'Эргономичные стоматологические установки' : 'Ergonomik stomatologiya kreslolari',
      desc: isRu
        ? 'Комфортное пребывание в кресле и бережные инструменты для точных манипуляций.'
        : 'Bemorning qulay joylashishi va muolaja vaqtida erkin his qilishi uchun zamonaviy sharoit.',
    },
    {
      brand: isRu ? 'Современные системы имплантации' : 'Zamonaviy implantatsiya tizimlari',
      desc: isRu
        ? 'Сертифицированные биосовместимые материалы для надежной эстетической и функциональной реставрации.'
        : 'Tabassum go\'zalligi va chaynash funksiyasini to\'liq tiklash uchun sertifikatlangan materiallar.',
    },
    {
      brand: isRu ? 'Безопасное профессиональное отбеливание' : 'Xavfsiz professional tish oqartirish',
      desc: isRu
        ? 'Бережные клинические протоколы осветления эмали без риска для здоровья зубов.'
        : 'Tish emaliga zarar yetkazmasdan estetik jihatdan chiroyli va tabiiy oqlik baxsh etish.',
    },
    {
      brand: isRu ? 'Цифровая 3D диагностика' : 'Raqamli 3D diagnostika',
      desc: isRu
        ? 'Точная визуализация зубочелюстной системы для объективного планирования лечения.'
        : 'Aniq tashxis qo\'yish va davolash rejasini xavfsiz tuzish uchun raqamli tekshiruv.',
    },
  ];

  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.about}
        title={`${clinicName} — ${L('ishonchli stomatologiya', 'стоматология, которой доверяют')}`}
        lead={L(
          'Maqsadimiz oddiy: har bir bemorga sifatli, xavfsiz va og‘riqsiz yordam ko‘rsatish — va har bir qadamni oldindan tushuntirish.',
          'Наша цель проста: качественная, безопасная и безболезненная помощь каждому пациенту — и понятное объяснение каждого шага.',
        )}
      />

      <section className="bg-white py-16 sm:py-24">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl lg:col-span-4">
              {L('Biz nimaga tayanamiz', 'На чём мы стоим')}
            </h2>
            <ol className="border-t border-line lg:col-span-8">
              {values.map((v, i) => {
                const Icon = v.icon;
                return (
                  <li key={v.title} className="grid gap-4 border-b border-line py-8 sm:grid-cols-[4rem_1fr]">
                    <span className="text-sm tabular-nums text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="flex items-center gap-2.5 text-xl font-medium tracking-[-0.01em] text-ink">
                        <Icon className="h-5 w-5 text-brand-700" strokeWidth={1.75} /> {v.title}
                      </h3>
                      <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">{v.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">{L('Texnologiyalar', 'Оснащение')}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              {L('Zamonaviy jihozlar va sertifikatlangan materiallar', 'Современное оборудование и сертифицированные материалы')}
            </h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {technologies.map((item) => (
              <div key={item.brand} className="bg-white p-7 sm:p-9">
                <h3 className="text-lg font-medium tracking-[-0.01em] text-ink">{item.brand}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-brand-950 py-16 sm:py-20">
        <Container className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            {L('Birinchi ko‘rikdan boshlang', 'Начните с первого осмотра')}
          </h2>
          <Link
            href="/booking"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink transition-colors duration-300 hover:bg-brand-50"
          >
            {t.common.bookAppointment} <ArrowRight className="h-4 w-4" />
          </Link>
        </Container>
      </section>
    </div>
  );
}
