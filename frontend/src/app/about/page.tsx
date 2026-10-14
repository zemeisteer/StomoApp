'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Award, Sparkles, CheckCircle2, Heart, Users, Calendar } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.about}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          DentaCare — Ishonchli stomatologiya standarti
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Bizning asosiy maqsadimiz — har bir bemorga xalqaro standartdagi og&apos;riqsiz, sifatli va estetik stomatologik yordam ko&apos;rsatishdir.
        </p>
      </div>

      {/* Values Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-100 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">100% Xavfsizlik va Sterilizatsiya</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Bizda har bir asbob Yevropa B-sinf avtoklavlarida ko&apos;p bosqichli kimyoviy va termik ishlovdan o&apos;tadi. Har bir bemor uchun faqat yakka tartibdagi steril paketlar ochiladi.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-100 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Mikroskopik Aniqlik</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Murakkab tish kanallarini davolash maxsus stomatologik mikroskoplar yordamida 25 barobar kattalashtirilgan holda amalga oshiriladi, bu esa tishni 100% saqlab qolish imkonini beradi.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-100 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700">
            <Heart className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Psixologik Qulaylik</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Klinikamizda har bir bemorga alohida g&apos;amxo&apos;rlik ko&apos;rsatiladi. Ayniqsa, tish shifokoridan qo&apos;rqadigan bolalar va kattalar uchun yumshoq, og&apos;riqsiz kompyuter anesteziyasi qo&apos;llaniladi.
          </p>
        </div>
      </div>

      {/* Facilities & Equipment Section */}
      <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-slate-100 space-y-8">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
            Texnologiyalar
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Zamonaviy uskunalar va original materiallar
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Biz faqat xalqaro sertifikatga ega yetakchi jahon brendlari bilan hamkorlik qilamiz.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Kavo va Sirona (Germaniya)</strong>
              <p className="text-xs text-slate-500 mt-0.5">
                Bemor qulayligi uchun ergonomik kreslolar va vibratsiyasiz asboblar.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Straumann & Osstem</strong>
              <p className="text-xs text-slate-500 mt-0.5">
                Shveytsariya va Janubiy Koreya implantlari bilan umrbod kafolat.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Zoom 4 WhiteSpeed (AQSH)</strong>
              <p className="text-xs text-slate-500 mt-0.5">
                Tish emaliga zarar yetkazmasdan 8 tonnagacha xavfsiz oqartirish.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <strong>Dentsply Sirona 3D Tomografiya</strong>
              <p className="text-xs text-slate-500 mt-0.5">
                Minimal nurlanish bilan yuqori aniqlikdagi uch o&apos;lchamli kompyuter diagnostikasi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Booking CTA Banner */}
      <div className="bg-gradient-to-tr from-teal-800 to-teal-950 text-white rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-xl">
        <h2 className="text-2xl sm:text-3xl font-extrabold">
          Sog&apos;lom tabassumingizni bugunoq bizga ishonib topshiring
        </h2>
        <p className="text-sm text-teal-200 max-w-xl mx-auto">
          Birinchi maslahat qabulida shifokorlarimiz sizga individual davolanish rejasini tuzib berishadi.
        </p>
        <div className="pt-2">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-teal-900 font-bold text-sm rounded-xl hover:bg-teal-50 shadow-lg transition-all"
          >
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>{t.common.bookAppointment}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
