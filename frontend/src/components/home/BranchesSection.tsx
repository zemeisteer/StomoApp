'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Clock, Phone, ExternalLink, Calendar } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface BranchesSectionProps {
  branches: any[];
  isLoading: boolean;
}

export const BranchesSection: React.FC<BranchesSectionProps> = ({ branches, isLoading }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {branches.map((b) => {
          const name = isRu && b.nameRu ? b.nameRu : b.nameUz;
          const address = isRu && b.addressRu ? b.addressRu : b.addressUz;
          const phone = b.phone;
          const mapUrl = b.mapUrl;

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
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-[#167b78] shrink-0" />
                    <span>
                      {isRu
                        ? 'Пн - Сб: 09:00 - 20:00 | Вс: 10:00 - 16:00'
                        : 'Dush - Shan: 09:00 - 20:00 | Yak: 10:00 - 16:00'}
                    </span>
                  </div>
                  {phone && (
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-4 h-4 text-[#167b78] shrink-0" />
                      <a href={`tel:${phone.replace(/\s+/g, '')}`} className="font-semibold text-[#152f34] hover:text-[#167b78]">
                        {phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Direct Booking to this Branch */}
              <Link
                href={`/booking?branchId=${b.id}`}
                className="w-full py-3.5 bg-[#167b78] hover:bg-[#116460] text-white text-sm font-bold rounded-2xl text-center transition-all shadow-md shadow-[#167b78]/20 flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>{isRu ? 'Записаться в этот филиал' : 'Ushbu filialga yozilish'}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
};
