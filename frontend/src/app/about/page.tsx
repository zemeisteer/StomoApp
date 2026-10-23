'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Award, Sparkles, CheckCircle2, Heart, Calendar } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-14">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <Award className="w-3.5 h-3.5" />
          <span>{t.nav.about}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {clinicName} — {isRu ? 'стандарты современной стоматологии' : 'Ishonchli stomatologiya xizmati'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Наша главная цель — предоставить каждому пациенту качественную, безопасную и эстетичную стоматологическую помощь.'
            : 'Bizning asosiy maqsadimiz — har bir bemorga sifatli, xavfsiz va qulay stomatologik yordam ko\'rsatishdir.'}
        </p>
      </div>

      {/* Values Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {values.map((v, i) => {
          const IconComp = v.icon;
          return (
            <div
              key={i}
              className="bg-white rounded-3xl p-7 border border-[#d8e5e2] shadow-[0_2px_12px_rgba(21,47,52,0.03)] space-y-3 hover:border-[#167b78]/40 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78]">
                <IconComp className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#152f34]">{v.title}</h3>
              <p className="text-xs sm:text-sm text-[#52696e] leading-relaxed">
                {v.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Facilities & Equipment Section */}
      <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#d8e5e2] shadow-[0_4px_20px_rgba(21,47,52,0.04)] space-y-8">
        <div className="max-w-2xl space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-[#167b78]">
            {isRu ? 'Оснащение' : 'Texnologiyalar'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
            {isRu ? 'Современное оснащение и сертифицированные материалы' : 'Zamonaviy jihozlar va sertifikatlangan materiallar'}
          </h2>
          <p className="text-xs sm:text-sm text-[#52696e]">
            {isRu
              ? 'В работе используются проверенные клинические методики и надежные сертифицированные материалы.'
              : 'Faoliyatimizda faqat xalqaro talablarga javob beradigan sinovdan o\'tgan usullar va materiallar qo\'llaniladi.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#152f34]">
          {technologies.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3.5 p-5 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
              <CheckCircle2 className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold text-[#152f34] block mb-1">
                  {item.brand}
                </strong>
                <p className="text-xs text-[#52696e] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick CTA */}
      <div className="text-center py-6">
        <Link
          href="/booking"
          className="inline-flex items-center gap-2 px-8 py-4 bg-[#167b78] hover:bg-[#116460] text-white font-bold text-base rounded-2xl shadow-lg shadow-[#167b78]/25 transition-all"
        >
          <Calendar className="w-5 h-5" />
          <span>{t.common.bookAppointment}</span>
        </Link>
      </div>
    </div>
  );
}
