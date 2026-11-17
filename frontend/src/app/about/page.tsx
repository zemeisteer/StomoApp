'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sparkles, Heart } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { SITE_PHOTOS } from '../../lib/sitePhotos';
import { BookingClose, Container, PageIntro } from '../../components/site/primitives';
import { Photo } from '../../components/site/moments';

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
    <div className="bg-white">
      <PageIntro
        photo={SITE_PHOTOS.room}
        photoPosition="50% 60%"
        eyebrow={t.nav.about}
        title={`${clinicName} — ${L('ishonchli stomatologiya', 'стоматология, которой доверяют')}`}
        lead={L(
          'Maqsadimiz oddiy: har bir bemorga sifatli, xavfsiz va og‘riqsiz yordam ko‘rsatish — va har bir qadamni oldindan tushuntirish.',
          'Наша цель проста: качественная, безопасная и безболезненная помощь каждому пациенту — и понятное объяснение каждого шага.',
        )}
      />

      <section className="screen py-20 sm:py-28">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <p className="mb-4 text-sm font-medium text-brand-700">{L('Qadriyatlar', 'Принципы')}</p>
              <h2 className="text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">{L('Biz nimaga tayanamiz', 'На чём мы стоим')}</h2>
              <ol className="mt-10 border-t border-line">
                {values.map((v) => {
                  const Icon = v.icon;
                  return (
                    <li key={v.title} className="border-b border-line py-7">
                      <h3 className="flex items-center gap-3 text-xl font-medium tracking-[-0.01em] text-ink">
                        <Icon className="h-5 w-5 text-brand-700" strokeWidth={1.75} /> {v.title}
                      </h3>
                      <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">{v.desc}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="photo-zoom relative aspect-[4/5] overflow-hidden rounded-3xl bg-canvas lg:col-span-5">
              <Photo photo={SITE_PHOTOS.child} lang={language} sizes="(min-width: 1024px) 40vw, 100vw" position="35% 50%" className="absolute inset-0" />
            </div>
          </div>
        </Container>
      </section>

      <section className="screen bg-canvas py-20 sm:py-28">
        <Container>
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium text-brand-700">{L('Texnologiyalar', 'Оснащение')}</p>
            <h2 className="text-3xl font-normal leading-[1.08] tracking-[-0.03em] text-ink sm:text-[2.75rem]">
              {L('Zamonaviy jihozlar va sertifikatlangan materiallar', 'Современное оборудование и сертифицированные материалы')}
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {technologies.map((item) => (
              <div key={item.brand} className="rounded-3xl bg-white p-8 sm:p-10">
                <h3 className="text-xl font-medium tracking-[-0.01em] text-ink">{item.brand}</h3>
                <p className="mt-3 text-base leading-relaxed text-ink-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <BookingClose
        title={L('Birinchi ko‘rikdan boshlang', 'Начните с первого осмотра')}
        lead={L('Xizmat, shifokor va qulay vaqtni onlayn tanlang.', 'Выберите услугу, врача и удобное время онлайн.')}
      />
    </div>
  );
}
