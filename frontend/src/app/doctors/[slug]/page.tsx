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
  User,
} from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

export default function DoctorDetailPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const params = useParams();
  const slug = params?.slug as string;

  const [doctor, setDoctor] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDoctor() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const doc = await api.getDoctorBySlug(slug);
        if (isMounted) setDoctor(doc);
      } catch (err: any) {
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadDoctor();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-32 text-center text-[#52696e] font-semibold text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (notFound || !doctor) {
    return (
      <div className="max-w-md mx-auto py-32 text-center space-y-4 px-4">
        <div className="w-16 h-16 bg-[#eaf5f2] text-[#167b78] rounded-full flex items-center justify-center mx-auto">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-[#152f34]">
          {isRu ? 'Врач не найден' : 'Shifokor topilmadi'}
        </h1>
        <p className="text-xs text-[#52696e]">
          {isRu
            ? 'Профиль данного специалиста не найден или деактивирован.'
            : 'Ushbu mutaxassis profili mavjud emas yoki faol emas.'}
        </p>
        <Link
          href="/doctors"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#167b78] text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isRu ? 'Все врачи' : 'Barcha shifokorlar'}</span>
        </Link>
      </div>
    );
  }

  const fullName = isRu && doctor.firstNameRu
    ? `Dr. ${doctor.firstNameRu} ${doctor.lastNameRu}`
    : `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`;

  const title = isRu && doctor.titleRu ? doctor.titleRu : (doctor.titleUz || (isRu ? 'Стоматолог' : 'Stomatolog'));
  const bio = isRu && doctor.bioRu ? doctor.bioRu : doctor.bioUz;
  const education = isRu && doctor.educationRu ? doctor.educationRu : doctor.educationUz;
  const initials = `${doctor.firstNameUz?.[0] || 'D'}${doctor.lastNameUz?.[0] || ''}`.toUpperCase();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#52696e]">
        <Link href="/" className="hover:text-[#167b78] transition-colors">
          {t.nav.home}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/doctors" className="hover:text-[#167b78] transition-colors">
          {t.nav.doctors}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-semibold text-[#152f34]">{fullName}</span>
      </nav>

      {/* Doctor Header Profile Card */}
      <div className="bg-white rounded-3xl border border-[#d8e5e2] p-6 sm:p-10 shadow-[0_4px_20px_rgba(21,47,52,0.03)] flex flex-col md:flex-row gap-8 items-start">
        {/* Photo or Initials */}
        <div className="w-44 h-52 sm:w-56 sm:h-64 rounded-2xl overflow-hidden bg-gradient-to-tr from-[#eaf5f2] to-[#d8e5e2] shrink-0 border border-[#d8e5e2] shadow-inner">
          {doctor.photoUrl ? (
            <img src={doctor.photoUrl} alt={fullName} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#167b78] text-3xl font-extrabold p-4">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-2">
                {initials}
              </div>
              <span className="text-xs font-semibold text-[#52696e]">
                {isRu ? 'Врач клиники' : 'Klinika shifokori'}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {doctor.specialties?.map((sp: any) => (
                <span
                  key={sp.specialtyId || sp.specialty?.id}
                  className="px-3 py-1 bg-[#eaf5f2] text-[#167b78] rounded-full text-xs font-bold border border-[#d8e5e2]"
                >
                  {isRu ? sp.specialty?.nameRu : (sp.specialty?.nameUz || sp.nameUz)}
                </span>
              ))}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">{fullName}</h1>
            <p className="text-sm font-semibold text-[#167b78] mt-1">{title}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2] flex items-center gap-3">
              <Award className="w-5 h-5 text-[#167b78] shrink-0" />
              <div>
                <span className="text-[11px] text-[#52696e] block font-medium">
                  {isRu ? 'Опыт работы' : 'Tajriba'}
                </span>
                <span className="text-xs font-bold text-[#152f34]">
                  {doctor.experienceYears} {isRu ? 'лет' : 'yil'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2] flex items-center gap-3">
              <Languages className="w-5 h-5 text-[#167b78] shrink-0" />
              <div>
                <span className="text-[11px] text-[#52696e] block font-medium">
                  {isRu ? 'Языки приема' : 'Qabul tillari'}
                </span>
                <span className="text-xs font-bold text-[#152f34]">
                  {doctor.languages?.join(', ').toUpperCase() || 'UZ, RU'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2] flex items-center gap-3 col-span-2 sm:col-span-1">
              <Building2 className="w-5 h-5 text-[#167b78] shrink-0" />
              <div>
                <span className="text-[11px] text-[#52696e] block font-medium">
                  {isRu ? 'Филиал' : 'Filial'}
                </span>
                <span className="text-xs font-bold text-[#152f34] truncate block max-w-[130px]">
                  {isRu && doctor.branches?.[0]?.branch?.nameRu
                    ? doctor.branches[0].branch.nameRu
                    : (doctor.branches?.[0]?.branch?.nameUz || (isRu ? 'Все филиалы' : 'Barcha filiallar'))}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href={`/booking?doctorId=${doctor.id}`}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#167b78] hover:bg-[#116460] text-white rounded-2xl font-bold text-sm shadow-md shadow-[#167b78]/20 transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>{isRu ? 'Записаться к этому врачу' : 'Ushbu shifokorga yozilish'}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Biography & Education Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        <div className="bg-white rounded-3xl border border-[#d8e5e2] p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-[#152f34] border-b border-[#d8e5e2] pb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-[#167b78]" />
            <span>{isRu ? 'О специалисте' : 'Mutaxassis haqida'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#52696e] leading-relaxed whitespace-pre-line">
            {bio || (isRu ? 'Информация уточняется.' : 'Ma\'lumot kiritilmagan.')}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-[#d8e5e2] p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-[#152f34] border-b border-[#d8e5e2] pb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-[#167b78]" />
            <span>{isRu ? 'Образование и квалификация' : 'Ta\'lim va malaka'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#52696e] leading-relaxed whitespace-pre-line">
            {education || (isRu ? 'Высшее медицинское образование.' : 'Oliy tibbiy ma\'lumot.')}
          </p>
        </div>
      </div>

      {/* Services Provided by Doctor */}
      {doctor.services && doctor.services.length > 0 && (
        <div className="bg-white rounded-3xl border border-[#d8e5e2] p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[#152f34] flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-[#167b78]" />
            <span>{isRu ? 'Оказываемые услуги' : 'Ko\'rsatiladigan xizmatlar'}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctor.services.map((ds: any) => {
              const s = ds.service;
              if (!s) return null;
              const sName = isRu && s.nameRu ? s.nameRu : s.nameUz;
              const sPrice = s.priceFrom ? `${(s.priceFrom > 1000000 ? s.priceFrom / 100 : s.priceFrom).toLocaleString('uz-UZ')} ${t.common.uzs}` : '';

              return (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl border border-[#d8e5e2] bg-[#f4f9f7] hover:bg-white hover:border-[#167b78]/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-[#152f34] mb-1">{sName}</h4>
                    <span className="text-[11px] text-[#52696e] block">{s.durationMinutes} {isRu ? 'минут' : 'daqiqa'}</span>
                  </div>
                  {sPrice && (
                    <div className="pt-2 mt-2 border-t border-[#d8e5e2] flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#167b78]">{sPrice}</span>
                      <Link
                        href={`/booking?doctorId=${doctor.id}&serviceId=${s.id}`}
                        className="text-[11px] font-bold text-[#167b78] hover:underline"
                      >
                        {isRu ? 'Записаться →' : 'Yozilish →'}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
