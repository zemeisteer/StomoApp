'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, User, Clock, Building2, Globe, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function DoctorsPage() {
  const { t, language } = useI18n();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDoctors() {
      try {
        setIsLoading(true);
        const data = await api.getDoctors();
        setDoctors(data || []);
      } catch (e) {
        console.error('Failed to load doctors', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadDoctors();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.doctors}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Klinikamiz malakali shifokorlari
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Doimiy xalqaro malaka oshirgan, zamonaviy uskunalar bilan ishlovchi tajribali mutaxassislar
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-sm">{t.common.loading}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {doctors.map((doc) => {
            const firstName = language === 'ru' && doc.firstNameRu ? doc.firstNameRu : doc.firstNameUz;
            const lastName = language === 'ru' && doc.lastNameRu ? doc.lastNameRu : doc.lastNameUz;
            const title = language === 'ru' && doc.titleRu ? doc.titleRu : doc.titleUz;
            const bio = language === 'ru' && doc.bioRu ? doc.bioRu : doc.bioUz;
            const education = language === 'ru' && doc.educationRu ? doc.educationRu : doc.educationUz;

            return (
              <div
                key={doc.id}
                className="bg-white rounded-3xl p-7 shadow-sm border border-slate-100 hover:border-teal-200 hover:shadow-xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                      <User className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        Dr. {firstName} {lastName}
                      </h2>
                      <p className="text-xs text-teal-700 font-semibold mt-0.5">{title}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          {doc.experienceYears}+ yil tajriba
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-teal-600" />
                          {doc.languages?.join(', ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-4 line-clamp-3">
                    {bio}
                  </p>

                  {education && (
                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 mb-4">
                      <strong className="text-slate-700">Ta&apos;lim:</strong> {education}
                    </div>
                  )}

                  {doc.branches && doc.branches.length > 0 && (
                    <div className="text-xs text-slate-500 mb-6 flex items-center gap-1.5 flex-wrap">
                      <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Filiallar:</span>
                      {doc.branches.map((b: any) => (
                        <span
                          key={b.branchId}
                          className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-semibold text-[11px]"
                        >
                          {b.branch?.nameUz}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                  <Link
                    href={`/booking?doctorId=${doc.id}`}
                    className="w-full sm:w-auto px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
                  >
                    <Calendar className="w-4 h-4" />
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
