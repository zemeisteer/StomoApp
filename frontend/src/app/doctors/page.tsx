'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Clock, Building2, Globe, Stethoscope, ArrowRight, Award } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function DoctorsPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadDoctors() {
      try {
        setIsLoading(true);
        const data = await api.getDoctors();
        if (isMounted) setDoctors(data || []);
      } catch (e) {
        console.error('Failed to load doctors', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadDoctors();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <Stethoscope className="w-3.5 h-3.5" />
          <span>{t.nav.doctors}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Врачи и специалисты клиники' : 'Klinikamiz malakali shifokorlari'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Сертифицированные стоматологи с многолетним опытом работы, регулярно проходящие повышение квалификации.'
            : 'Xalqaro malaka oshirgan, zamonaviy uskunalar bilan ishlovchi 15 yildan ortiq tajribaga ega shifokorlar jamoasi.'}
        </p>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white rounded-3xl p-6 border border-[#d8e5e2] animate-pulse space-y-4">
              <div className="flex gap-4">
                <div className="w-24 h-28 bg-[#eaf5f2] rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-3/4 bg-slate-100 rounded" />
                  <div className="h-4 w-1/2 bg-slate-100 rounded" />
                  <div className="h-4 w-1/3 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-12 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-[#d8e5e2] p-8">
          <p className="text-[#52696e] text-sm">
            {isRu ? 'Список врачей временно недоступен.' : 'Shifokorlar ro\'yxati mavjud emas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {doctors.map((doc) => {
            const firstName = isRu && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
            const lastName = isRu && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
            const title = isRu && doc.titleRu ? doc.titleRu : (doc.titleUz || (isRu ? 'Стоматолог' : 'Stomatolog'));
            const bio = isRu && doc.bioRu ? doc.bioRu : doc.bioUz;
            const initials = `${firstName?.[0] || 'D'}${lastName?.[0] || ''}`.toUpperCase();

            return (
              <div
                key={doc.id}
                className="bg-white rounded-3xl p-7 border border-[#d8e5e2] shadow-[0_2px_12px_rgba(21,47,52,0.03)] hover:shadow-lg hover:border-[#167b78]/40 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start gap-5 mb-5">
                    {/* Doctor Photo or dignified initials avatar */}
                    <Link
                      href={`/doctors/${doc.slug}`}
                      className="w-24 h-28 rounded-2xl overflow-hidden bg-gradient-to-tr from-[#eaf5f2] to-[#d8e5e2] shrink-0 relative block"
                    >
                      {doc.photoUrl ? (
                        <img
                          src={doc.photoUrl}
                          alt={`Dr. ${firstName} ${lastName}`}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#167b78] font-bold text-2xl">
                          {initials}
                        </div>
                      )}
                    </Link>

                    {/* Basic Info */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/doctors/${doc.slug}`}>
                        <h2 className="text-xl font-bold text-[#152f34] group-hover:text-[#167b78] transition-colors leading-snug">
                          Dr. {firstName} {lastName}
                        </h2>
                      </Link>
                      <p className="text-xs text-[#167b78] font-semibold mt-1 mb-2.5">
                        {title}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-[#52696e] flex-wrap">
                        {doc.experienceYears > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#167b78]" />
                            {doc.experienceYears}+ {isRu ? 'лет опыта' : 'yil tajriba'}
                          </span>
                        )}
                        {doc.languages && doc.languages.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-[#167b78]" />
                            {doc.languages.join(', ').toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  {bio && (
                    <p className="text-xs sm:text-sm text-[#52696e] leading-relaxed mb-4 line-clamp-3">
                      {bio}
                    </p>
                  )}

                  {/* Branches */}
                  {doc.branches && doc.branches.length > 0 && (
                    <div className="text-xs text-[#52696e] mb-6 flex items-center gap-1.5 flex-wrap bg-[#f4f9f7] px-3.5 py-2 rounded-xl border border-[#d8e5e2]">
                      <Building2 className="w-3.5 h-3.5 text-[#167b78] shrink-0" />
                      <span className="font-semibold text-[#152f34]">{isRu ? 'Филиалы:' : 'Filiallar:'}</span>
                      <span>
                        {doc.branches
                          .map((b: any) => (isRu && b.branch?.nameRu ? b.branch.nameRu : (b.branch?.nameUz || b.nameUz)))
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-4 border-t border-[#d8e5e2] flex items-center justify-between gap-3">
                  <Link
                    href={`/doctors/${doc.slug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#52696e] hover:text-[#167b78] transition-colors"
                  >
                    <span>{isRu ? 'Подробнее о враче' : 'Shifokor haqida'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    href={`/booking?doctorId=${doc.id}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#167b78] hover:bg-[#116460] text-white text-xs font-bold rounded-xl text-center shadow-md shadow-[#167b78]/20 transition-all"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{t.common.bookAppointment}</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
