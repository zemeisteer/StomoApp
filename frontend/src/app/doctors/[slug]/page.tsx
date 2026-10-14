'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  Award,
  Languages,
  Building2,
  Stethoscope,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  User,
} from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

export default function DoctorDetailPage() {
  const { t, language } = useI18n();
  const params = useParams();
  const slug = params?.slug as string;

  const [doctor, setDoctor] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadDoctor() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const doc = await api.getDoctorBySlug(slug);
        setDoctor(doc);
      } catch (err: any) {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadDoctor();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-32 text-center text-slate-400 font-semibold text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (notFound || !doctor) {
    return (
      <div className="max-w-md mx-auto py-32 text-center space-y-4 px-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {language === 'uz' ? 'Shifokor topilmadi' : 'Врач не найден'}
        </h1>
        <p className="text-xs text-slate-500">
          {language === 'uz'
            ? 'Ushbu mutaxassis profili mavjud emas yoki faol emas.'
            : 'Профиль данного специалиста не найден или деактивирован.'}
        </p>
        <Link
          href="/doctors"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'uz' ? 'Barcha shifokorlar' : 'Все врачи'}</span>
        </Link>
      </div>
    );
  }

  const fullName =
    language === 'uz'
      ? `${doctor.firstNameUz} ${doctor.lastNameUz}`
      : `${doctor.firstNameRu || doctor.firstNameUz} ${doctor.lastNameRu || doctor.lastNameUz}`;

  const title = language === 'uz' ? doctor.titleUz : doctor.titleRu || doctor.titleUz;
  const bio = language === 'uz' ? doctor.bioUz : doctor.bioRu || doctor.bioUz;
  const education = language === 'uz' ? doctor.educationUz : doctor.educationRu || doctor.educationUz;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-teal-700">
            {t.nav.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/doctors" className="hover:text-teal-700">
            {t.nav.doctors}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800">{fullName}</span>
        </nav>

        {/* Doctor Header Profile Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-sm flex flex-col md:flex-row gap-8 items-start">
          <div className="w-44 h-52 sm:w-56 sm:h-64 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 shadow-inner">
            {doctor.photoUrl ? (
              <img src={doctor.photoUrl} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300">
                <User className="w-16 h-16" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {doctor.specialties?.map((sp: any) => (
                  <span
                    key={sp.specialtyId || sp.specialty?.id}
                    className="px-3 py-1 bg-teal-50 text-teal-800 rounded-full text-xs font-bold border border-teal-200"
                  >
                    {language === 'uz' ? sp.specialty?.nameUz : sp.specialty?.nameRu || sp.specialty?.nameUz}
                  </span>
                ))}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{fullName}</h1>
              <p className="text-sm font-semibold text-teal-700 mt-1">{title}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                <Award className="w-5 h-5 text-teal-700 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">
                    {language === 'uz' ? 'Tajriba' : 'Опыт'}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {doctor.experienceYears} {language === 'uz' ? 'yil' : 'лет'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                <Languages className="w-5 h-5 text-teal-700 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">
                    {language === 'uz' ? 'Tillar' : 'Языки'}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {doctor.languages?.join(', ') || 'UZ, RU'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 col-span-2 sm:col-span-1">
                <Building2 className="w-5 h-5 text-teal-700 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">
                    {language === 'uz' ? 'Filial' : 'Филиал'}
                  </span>
                  <span className="text-xs font-bold text-slate-800 truncate block max-w-[120px]">
                    {doctor.branches?.[0]?.branch?.nameUz || 'Barcha filiallar'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href={`/booking?doctorId=${doctor.id}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs shadow-md shadow-teal-700/20 transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>{language === 'uz' ? 'Ushbu shifokorga yozilish' : 'Записаться к этому врачу'}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Biography & Education */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Mutaxassis haqida' : 'О специалисте'}</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {bio || (language === 'uz' ? 'Ma\'lumot kiritilmagan.' : 'Информация не указана.')}
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Ta\'lim va malaka' : 'Образование и квалификация'}</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {education || (language === 'uz' ? 'Oliy tibbiy ta\'lim va xalqaro malaka oshirish kurslari.' : 'Высшее медицинское образование и курсы повышения квалификации.')}
            </p>
          </div>
        </div>

        {/* Provided Services */}
        {doctor.services && doctor.services.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Ko\'rsatiladigan xizmatlar' : 'Оказываемые услуги'}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctor.services.map((ds: any) => {
                const s = ds.service;
                if (!s) return null;
                return (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-teal-200 transition-all flex flex-col justify-between space-y-2"
                  >
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">
                        {language === 'uz' ? s.nameUz : s.nameRu || s.nameUz}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {language === 'uz' ? s.descriptionUz : s.descriptionRu}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/50">
                      <span className="text-xs font-extrabold text-teal-800">
                        {s.priceFrom ? `${s.priceFrom.toLocaleString()} so'm` : 'Kelishuv asosida'}
                      </span>
                      <Link
                        href={`/services/${s.slug}`}
                        className="text-[11px] font-bold text-teal-700 hover:underline"
                      >
                        {language === 'uz' ? 'Batafsil' : 'Подробнее'}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
