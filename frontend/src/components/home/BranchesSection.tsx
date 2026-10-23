'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Clock, Phone, ExternalLink, Calendar, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatWorkingHours } from '../../lib/dateFormat';

interface BranchesSectionProps {
  branches: any[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const BranchesSection: React.FC<BranchesSectionProps> = ({
  branches,
  isLoading,
  error,
  onRetry,
}) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  return (
    <section id="branches" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider mb-2">
          <MapPin className="w-3.5 h-3.5" />
          <span>{t.common.branches}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
          {isRu ? 'Наши филиалы в Ташкенте' : 'Sizga yaqin filialimizga tashrif buyuring'}
        </h2>
        <p className="text-sm text-[#52696e] mt-2">
          {isRu
            ? 'Выберите удобный адрес и запишитесь на прием в ближайший филиал.'
            : 'O\'zingizga eng qulay manzilni tanlang va qabulga oldindan yoziling.'}
        </p>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-white rounded-3xl p-7 sm:p-8 border border-[#d8e5e2] animate-pulse space-y-4 shadow-sm"
            >
              <div className="flex justify-between items-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-[#eaf5f2]" />
                <div className="h-4 w-20 bg-slate-100 rounded" />
              </div>
              <div className="h-7 w-3/5 bg-slate-100 rounded" />
              <div className="h-4 w-4/5 bg-slate-100 rounded mb-4" />
              <div className="h-20 w-full bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]" />
              <div className="h-12 w-full bg-slate-100 rounded-2xl pt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="text-center py-12 bg-white rounded-3xl border border-rose-200 p-8 shadow-sm">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-rose-600 text-sm font-semibold mb-4">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              {t.common.retry}
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && branches.length === 0 && (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-[#d8e5e2] p-8">
          <p className="text-[#52696e] text-sm">
            {isRu ? 'Филиалы временно недоступны.' : 'Filiallar ma\'lumotlari hozircha mavjud emas.'}
          </p>
        </div>
      )}

      {/* Branches Grid */}
      {!isLoading && !error && branches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {branches.map((b) => {
            const name = isRu && b.nameRu ? b.nameRu : b.nameUz;
            const address = isRu && b.addressRu ? b.addressRu : b.addressUz;
            const phone = b.phone;
            const mapUrl = b.mapUrl;
            const hoursDisplay = formatWorkingHours(b.workingHours, language) || b.openingHours || '';

            return (
              <div
                key={b.id}
                className="bg-white rounded-3xl p-7 sm:p-8 border border-[#d8e5e2] shadow-[0_2px_12px_rgba(21,47,52,0.03)] hover:shadow-lg hover:border-[#167b78]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78]">
                      <MapPin className="w-6 h-6" />
                    </div>
                    {mapUrl && (
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#167b78] hover:underline"
                      >
                        <span>{isRu ? 'На карте' : 'Xaritada ko\'rish'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-[#152f34] mb-2">{name}</h3>
                  <p className="text-sm text-[#52696e] mb-6 leading-relaxed">{address}</p>

                  <div className="space-y-3 text-xs text-[#52696e] mb-8 bg-[#f4f9f7] p-4 rounded-2xl border border-[#d8e5e2]">
                    {hoursDisplay && (
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-4 h-4 text-[#167b78] shrink-0 mt-0.5" />
                        <span className="leading-snug">{hoursDisplay}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-[#167b78] shrink-0" />
                        <a
                          href={`tel:${phone.replace(/\s+/g, '')}`}
                          className="font-semibold text-[#152f34] hover:text-[#167b78] transition-colors"
                        >
                          {phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Booking to this Branch */}
                <Link
                  href={`/booking?branchId=${b.id}`}
                  className="w-full py-3.5 bg-[#167b78] hover:bg-[#116460] text-white text-sm font-bold rounded-2xl text-center transition-all shadow-md shadow-[#167b78]/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{isRu ? 'Записаться в этот филиал' : 'Ushbu filialga yozilish'}</span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
