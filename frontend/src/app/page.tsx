'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  ShieldCheck,
  Award,
  Sparkles,
  ArrowRight,
  Star,
  CheckCircle2,
  Clock,
  PhoneCall,
  UserCheck,
  MapPin,
} from 'lucide-react';
import { Tooth3D } from '../components/Tooth3D';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

export default function HomePage() {
  const { t, language } = useI18n();

  const [services, setServices] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      try {
        const [servicesRes, doctorsRes, reviewsRes, branchesRes] = await Promise.all([
          api.getServices().catch(() => []),
          api.getDoctors().catch(() => []),
          api.getPublicReviews(1, 6).catch(() => ({ items: [] })),
          api.getBranches().catch(() => []),
        ]);

        setServices(servicesRes.slice(0, 6));
        setDoctors(doctorsRes.slice(0, 4));
        setReviews(reviewsRes.items || []);
        setBranches(branchesRes || []);
      } catch (e) {
        console.error('Failed to load home data', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadHomeData();
  }, []);

  return (
    <div className="space-y-24 pb-20 overflow-hidden">
      {/* ============================================================ */}
      {/* HERO SECTION WITH 3D INTERACTIVE TOOTH */}
      {/* ============================================================ */}
      <section className="relative pt-8 sm:pt-14 pb-16 lg:pb-24 overflow-hidden bg-gradient-to-b from-teal-50/50 via-white to-transparent">
        {/* Soft background ambient blur spots */}
        <div className="absolute top-12 left-1/4 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-10 w-96 h-96 bg-mint/30 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Hero Copy & CTA */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-100/80 border border-teal-200 text-teal-800 text-xs font-bold tracking-wide uppercase shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>{t.hero.badge}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                {language === 'uz' ? (
                  <>
                    Sog&apos;lom tabassum —{' '}
                    <span className="text-teal-700 bg-clip-text">ishonchli va og&apos;riqsiz</span> muolaja
                  </>
                ) : (
                  <>
                    Здоровая улыбка —{' '}
                    <span className="text-teal-700 bg-clip-text">надежное и безболезненное</span> лечение
                  </>
                )}
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                {t.hero.subtitle}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/booking"
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-base shadow-xl shadow-teal-700/25 hover:shadow-2xl hover:shadow-teal-700/30 transition-all flex items-center justify-center gap-2.5 transform active:scale-95"
                >
                  <Calendar className="w-5 h-5" />
                  <span>{t.hero.ctaBook}</span>
                </Link>

                <Link
                  href="/services"
                  className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-base border border-slate-200 shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>{t.hero.ctaServices}</span>
                  <ArrowRight className="w-4 h-4 text-teal-600" />
                </Link>
              </div>

              {/* Core Feature Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {t.hero.features.experience}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {t.hero.features.guarantee}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {t.hero.features.painless}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {t.hero.features.modern}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Real 3D Interactive Tooth */}
            <div className="lg:col-span-5 relative flex items-center justify-center">
              <div className="w-full max-w-md lg:max-w-none bg-gradient-to-tr from-white via-teal-50/40 to-mint/20 rounded-3xl p-2 sm:p-4 shadow-xl border border-white/60 backdrop-blur-md">
                <Tooth3D />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* POPULAR SERVICES */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12 text-center sm:text-left">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
              {t.nav.services}
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-1">
              Ommabop stomatologik xizmatlar
            </h2>
          </div>
          <Link
            href="/services"
            className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-800 group"
          >
            <span>Barcha xizmatlarni ko&apos;rish</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => {
            const name = language === 'ru' && service.nameRu ? service.nameRu : service.nameUz;
            const desc =
              language === 'ru' && service.descriptionRu
                ? service.descriptionRu
                : service.descriptionUz;
            const priceFromFormatted = (service.priceFrom / 100).toLocaleString('uz-UZ');

            return (
              <div
                key={service.id}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 hover:shadow-xl hover:border-teal-200 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-bold">
                      {service.durationMinutes} daqiqa
                    </span>
                    <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                      {service.category}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors mb-2">
                    {name}
                  </h3>

                  <p className="text-sm text-slate-500 line-clamp-3 mb-6 leading-relaxed">
                    {desc || 'Klinikamizning ilg\'or mutaxassislari tomonidan xavfsiz va og\'riqsiz muolaja.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">{t.common.price}</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {priceFromFormatted} {t.common.uzs}
                    </span>
                  </div>

                  <Link
                    href={`/booking?serviceId=${service.id}`}
                    className="p-3 bg-teal-50 text-teal-700 hover:bg-teal-700 hover:text-white rounded-xl transition-all shadow-sm"
                    title={t.common.bookAppointment}
                  >
                    <Calendar className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* DOCTOR SPOTLIGHTS */}
      {/* ============================================================ */}
      <section className="bg-slate-900 text-white py-20 rounded-3xl max-w-7xl mx-auto px-4 sm:px-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12 text-center sm:text-left">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-teal-400">
              {t.nav.doctors}
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-1">
              Yetakchi shifokorlarimiz
            </h2>
          </div>
          <Link
            href="/doctors"
            className="inline-flex items-center gap-2 text-sm font-bold text-teal-300 hover:text-white group"
          >
            <span>Barcha shifokorlar</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {doctors.map((doc) => {
            const firstName = language === 'ru' && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
            const lastName = language === 'ru' && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
            const title = language === 'ru' && doc.titleRu ? doc.titleRu : doc.titleUz;

            return (
              <div
                key={doc.id}
                className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700 hover:border-teal-500 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-20 h-20 bg-teal-950 rounded-2xl flex items-center justify-center text-teal-400 mx-auto mb-4 border border-teal-800">
                    <UserCheck className="w-10 h-10" />
                  </div>

                  <h3 className="text-lg font-bold text-white text-center">
                    Dr. {firstName} {lastName}
                  </h3>

                  <p className="text-xs text-teal-300 text-center font-medium mt-1 mb-3">
                    {title}
                  </p>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-4">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>{doc.experienceYears}+ yil tajriba</span>
                  </div>
                </div>

                <Link
                  href={`/booking?doctorId=${doc.id}`}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl text-center shadow-md transition-all mt-2"
                >
                  {t.common.bookAppointment}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* REAL REVIEWS */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12 text-center sm:text-left">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
              {t.reviews.title}
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-1">
              Bemorlarimiz ishonchi
            </h2>
          </div>
          <Link
            href="/reviews"
            className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-800 group"
          >
            <span>{t.reviews.writeReview}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.length > 0 ? (
            reviews.map((r) => (
              <div
                key={r.id}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-1 text-amber-400 mb-3">
                    {[...Array(r.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed italic mb-4">
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-slate-800">{r.authorName}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200">
              <p className="text-slate-500 text-sm">Hozircha sharhlar mavjud emas.</p>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* BRANCHES & LOCATION */}
      {/* ============================================================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
            {t.common.branches}
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900 mt-1">
            Sizga eng yaqin klinikamizga tashrif buyuring
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {branches.map((b) => {
            const name = language === 'ru' && b.nameRu ? b.nameRu : b.nameUz;
            const address = language === 'ru' && b.addressRu ? b.addressRu : b.addressUz;

            return (
              <div
                key={b.id}
                className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:border-teal-200 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-700 mb-4">
                    <MapPin className="w-6 h-6" />
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-2">{name}</h3>
                  <p className="text-sm text-slate-600 mb-4 leading-relaxed">{address}</p>

                  <div className="space-y-2 text-xs text-slate-500 mb-6">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-600" />
                      <span>{b.openingHours || 'Dush - Shan: 09:00 - 20:00'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-teal-600" />
                      <span>{b.phone || '+998 71 200 45 45'}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/booking?branchId=${b.id}`}
                  className="w-full py-3 bg-slate-900 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl text-center transition-all shadow-md"
                >
                  Ushbu filialga yozilish
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
