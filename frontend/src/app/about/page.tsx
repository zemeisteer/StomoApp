'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Award, Sparkles, CheckCircle2, Heart, Calendar } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export default function AboutPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const values = [
    {
      icon: ShieldCheck,
      title: isRu ? '100% безопасность и стерильность' : '100% xavfsizlik va sterilizatsiya',
      desc: isRu
        ? 'Многоступенчатая автоклавная обработка класса B по европейским протоколам и индивидуальные стерильные пакеты для каждого пациента.'
        : 'Yevropa B-sinf avtoklavlarida ko\'p bosqichli kimyoviy va termik ishlov. Har bir bemor uchun faqat yakka tartibdagi steril paketlar.',
    },
    {
      icon: Sparkles,
      title: isRu ? 'Микроскопическая точность' : 'Mikroskopik aniqlik',
      desc: isRu
        ? 'Лечение сложных корневых каналов под стоматологическим микроскопом с увеличением до 25 крат позволяет сохранить зуб.'
        : 'Murakkab tish kanallarini davolash maxsus mikroskoplar yordamida 25 barobar kattalashtirilgan holda amalga oshiriladi.',
    },
    {
      icon: Heart,
      title: isRu ? 'Психологический комфорт' : 'Psixologik qulaylik',
      desc: isRu
        ? 'Забота и деликатное отношение. Компьютерная анестезия обеспечивает полное отсутствие боли и страха перед процедурой.'
        : 'Har bir bemorga samimiy g\'amxo\'rlik. Bolalar va kattalar uchun yumshoq, mutlaqo og\'riqsiz kompyuter anesteziyasi qo\'llaniladi.',
    },
  ];

  const technologies = [
    {
      brand: isRu ? 'Kavo и Sirona (Германия)' : 'Kavo va Sirona (Germaniya)',
      desc: isRu
        ? 'Эргономичные кресла и бесшумные микромоторы для комфортного пребывания в кресле.'
        : 'Bemor qulayligi uchun ergonomik kreslolar va vibratsiyasiz asboblar.',
    },
    {
      brand: 'Straumann & Osstem',
      desc: isRu
        ? 'Швейцарские и южнокорейские импланты премиум-класса с высоким процентом приживаемости.'
        : 'Shveytsariya va Janubiy Koreya implantlari bilan yuqori sifatli restavratsiya.',
    },
    {
      brand: isRu ? 'Zoom 4 WhiteSpeed (США)' : 'Zoom 4 WhiteSpeed (AQSH)',
      desc: isRu
        ? 'Безопасное профессиональное отбеливание без повреждения эмали.'
        : 'Tish emaliga zarar yetkazmasdan xavfsiz va samarali oqartirish texnologiyasi.',
    },
    {
      brand: isRu ? '3D Компьютерная томография' : '3D Kompyuter tomografiyasi',
      desc: isRu
        ? 'Сверхточная цифровая диагностика челюстно-лицевой области с минимальной лучевой нагрузкой.'
        : 'Minimal nurlanish yuklamasi bilan aniq raqamli 3D diagnostika.',
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
          {isRu ? 'DentaCare — европейские стандарты стоматологии' : 'DentaCare — Ishonchli stomatologiya standarti'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Наша главная цель — предоставить каждому пациенту безболезненную, качественную и эстетичную стоматологическую помощь.'
            : 'Bizning asosiy maqsadimiz — har bir bemorga xalqaro standartdagi og\'riqsiz, sifatli va estetik stomatologik yordam ko\'rsatishdir.'}
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
            {isRu ? 'Оборудование' : 'Texnologiyalar'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
            {isRu ? 'Передовое оборудование и сертифицированные материалы' : 'Zamonaviy uskunalar va original materiallar'}
          </h2>
          <p className="text-xs sm:text-sm text-[#52696e]">
            {isRu
              ? 'Мы сотрудничаем только с признанными мировыми лидерами стоматологической индустрии.'
              : 'Biz faqat xalqaro sertifikatga ega yetakchi jahon brendlari materiallari bilan ishlaymiz.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#152f34]">
          {technologies.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3.5 p-5 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
              <CheckCircle2 className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm font-bold block mb-1">{item.brand}</strong>
                <p className="text-xs text-[#52696e] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final Booking Invitation */}
      <div className="text-center p-8 bg-[#eaf5f2] rounded-3xl border border-[#d8e5e2] space-y-4">
        <h3 className="text-xl sm:text-2xl font-extrabold text-[#152f34]">
          {isRu ? 'Запишитесь на консультацию прямо сейчас' : 'Birinchi ko\'rikka hoziroq yoziling'}
        </h3>
        <p className="text-xs sm:text-sm text-[#52696e] max-w-xl mx-auto">
          {isRu
            ? 'Опытный врач проведет осмотр, ответит на все вопросы и предложит оптимальный план лечения.'
            : 'Malakali shifokorimiz ko\'rik o\'tkazib, barcha savollaringizga javob beradi va eng maqbul davolash rejasini tuzadi.'}
        </p>
        <div className="pt-2">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#167b78] hover:bg-[#116460] text-white rounded-2xl font-bold text-sm shadow-md shadow-[#167b78]/20 transition-all"
          >
            <Calendar className="w-4 h-4" />
            <span>{t.common.bookAppointment}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
