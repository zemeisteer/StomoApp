'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight, Clock, Award, Stethoscope, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface DoctorsSectionProps {
  doctors: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const DoctorsSection: React.FC<DoctorsSectionProps> = ({
  doctors,
  isLoading,
  error = null,
  onRetry,
}) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>({});

  const handleImageError = (id: string) => {
    setFailedImageIds((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section id="doctors" className="bg-[#f4f9f7] border-y border-[#d8e5e2] py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 text-center sm:text-left">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#d8e5e2] text-[#167b78] text-xs font-bold uppercase tracking-wider mb-2 shadow-sm">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>{t.nav.doctors}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
              {isRu ? 'Наши ведущие специалисты' : 'Yetakchi mutaxassislarimiz'}
            </h2>
          </div>

          <Link
            href="/doctors"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#167b78] hover:text-[#116460] group transition-colors"
          >
            <span>{isRu ? 'Все врачи клиники' : 'Barcha shifokorlar'}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl p-5 border border-[#d8e5e2] animate-pulse space-y-3"
              >
                <div className="w-full aspect-[4/5] bg-[#eaf5f2] rounded-xl" />
                <div className="h-5 w-3/4 bg-slate-100 rounded" />
                <div className="h-4 w-1/2 bg-slate-100 rounded" />
                <div className="h-9 w-full bg-slate-100 rounded-xl pt-2" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="text-center py-12 bg-white rounded-2xl border border-rose-200 p-8 shadow-sm">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-rose-600 text-sm font-semibold mb-3">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {t.common.retry}
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && doctors.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-[#d8e5e2] p-8">
            <p className="text-[#52696e] text-sm">
              {isRu ? 'Информация о врачах обновляется.' : 'Shifokorlar ma\'lumotlari yangilanmoqda.'}
            </p>
          </div>
        )}

        {/* Doctors Grid */}
        {!isLoading && !error && doctors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {doctors.map((doc) => {
              const firstName = isRu && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
              const lastName = isRu && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
              const title = isRu && doc.titleRu ? doc.titleRu : (doc.titleUz || (isRu ? 'Стоматолог' : 'Stomatolog'));
              const initials = `${firstName?.[0] || 'D'}${lastName?.[0] || ''}`.toUpperCase();
              const hasBrokenImage = failedImageIds[doc.id];

              // Resolve specialties if array
              const specialtyLabel = doc.specialties && doc.specialties.length > 0
                ? doc.specialties.map((s: any) => isRu && s.specialty?.nameRu ? s.specialty.nameRu : (s.specialty?.nameUz || s.nameUz || '')).filter(Boolean).join(', ')
                : title;

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl p-5 border border-[#d8e5e2] shadow-[0_2px_8px_rgba(21,47,52,0.03)] hover:shadow-lg hover:border-[#167b78]/40 transition-all flex flex-col justify-between group"
                >
                  <div>
                    {/* Doctor Photo or dignified initials avatar */}
                    <Link
                      href={`/doctors/${doc.slug || doc.id}`}
                      className="block w-full aspect-[4/5] rounded-xl overflow-hidden mb-4 bg-gradient-to-tr from-[#eaf5f2] to-[#d8e5e2] relative"
                    >
                      {doc.photoUrl && !hasBrokenImage ? (
                        <img
                          src={doc.photoUrl}
                          alt={`Dr. ${firstName} ${lastName}`}
                          onError={() => handleImageError(doc.id)}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                          <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-[#d8e5e2] flex items-center justify-center text-[#167b78] text-xl font-extrabold mb-2 group-hover:scale-105 transition-transform">
                            {initials}
                          </div>
                          <span className="text-xs font-semibold text-[#52696e]">
                            {isRu ? 'Врач клиники' : 'Klinika shifokori'}
                          </span>
                        </div>
                      )}

                      {doc.experienceYears > 0 && (
                        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-[#152f34] text-[11px] font-bold shadow-sm border border-[#d8e5e2]">
                          <Award className="w-3 h-3 text-[#167b78]" />
                          <span>{doc.experienceYears} {isRu ? 'лет' : 'yil'}</span>
                        </span>
                      )}
                    </Link>

                    {/* Doctor Info */}
                    <Link href={`/doctors/${doc.slug || doc.id}`}>
                      <h3 className="text-base font-bold text-[#152f34] group-hover:text-[#167b78] transition-colors mb-1 leading-snug">
                        Dr. {firstName} {lastName}
                      </h3>
                    </Link>

                    <p className="text-xs text-[#167b78] font-semibold mb-2 line-clamp-1">
                      {specialtyLabel}
                    </p>

                    {doc.experienceYears > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-[#52696e] mb-4">
                        <Clock className="w-3.5 h-3.5 text-[#167b78]" />
                        <span>{doc.experienceYears} {isRu ? 'лет практического опыта' : 'yillik amaliy tajriba'}</span>
                      </div>
                    )}
                  </div>

                  {/* Booking CTA Button */}
                  <Link
                    href={`/booking?doctorId=${doc.id}`}
                    className="w-full py-2.5 bg-[#eaf5f2] hover:bg-[#167b78] text-[#167b78] hover:text-white text-xs font-bold rounded-xl text-center shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{t.common.bookAppointment}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
