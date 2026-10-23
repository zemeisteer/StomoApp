'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, Microscope, Award, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export const ClinicSection: React.FC = () => {
  const { language } = useI18n();
  const isRu = language === 'ru';

  const benefits = [
    {
      icon: Microscope,
      title: isRu ? 'Современная 3D диагностика' : 'Zamonaviy 3D diagnostika',
      desc: isRu
        ? 'Точная компьютерная томография и цифровое сканирование для планирования безопасного лечения.'
        : 'Aniq kompyuter tomografiyasi va xavfsiz davolash rejasini tuzish uchun raqamli skanerlash.',
    },
    {
      icon: ShieldCheck,
      title: isRu ? '100% стерильность и безопасность' : '100% xavfsizlik va sterilizatsiya',
      desc: isRu
        ? 'Трехступенчатая немецкая система дезинфекции и индивидуальные стерильные наборы для каждого визита.'
        : 'Uch bosqichli nemis dezinfeksiya tizimi va har bir tashrif uchun individual steril asboblar.',
    },
    {
      icon: Award,
      title: isRu ? 'Сертифицированные врачи' : 'Sertifikatlangan shifokorlar',
      desc: isRu
        ? 'Врачи высшей категории, регулярно повышающие квалификацию в ведущих клиниках Европы и Азии.'
        : 'Yevropa va Osiyo yetakchi klinikalarida malaka oshirgan yuqori toifali stomatologlar jamoasi.',
    },
    {
      icon: Sparkles,
      title: isRu ? 'Лечение без страха и боли' : 'Og\'riqsiz va qulay muolaja',
      desc: isRu
        ? 'Компьютерная локальная анестезия, исключающая дискомфорт как для взрослых, так и для детей.'
        : 'Kattalar va bolalar uchun hech qanday noqulayliksiz, kompyuterlashgan mahalliy anesteziya.',
    },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#d8e5e2] shadow-[0_4px_24px_rgba(21,47,52,0.04)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Summary */}
          <div className="lg:col-span-5 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isRu ? 'О клинике' : 'Klinikamiz haqida'}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34] leading-tight">
              {isRu
                ? 'Высокие стандарты стоматологии для вашего комфорта'
                : 'Salomatligingiz va tabassumingiz uchun eng yuqori standartlar'}
            </h2>

            <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
              {isRu
                ? 'DentaCare объединяет передовое стоматологическое оборудование и заботливый подход к пациентам. Мы ориентированы на долговечный результат и абсолютную прозрачность цен.'
                : 'DentaCare klinikasi ilg\'or stomatologiya texnologiyalari va har bir bemorga samimiy e\'tiborni birlashtiradi. Bizning maqsadimiz — uzoq muddatli sifat va narxlarning to\'liq shaffofligi.'}
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
