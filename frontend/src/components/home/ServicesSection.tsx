'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight, Clock, Sparkles } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

interface ServicesSectionProps {
  services: any[];
  isLoading: boolean;
  error?: string | null;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({ services, isLoading, error }) => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 text-center sm:text-left">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.nav.services}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#152f34]">
            {isRu ? 'Популярные стоматологические услуги' : 'Ommabop stomatologik xizmatlar'}
          </h2>
        </div>

        <Link
          href="/services"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#167b78] hover:text-[#116460] group transition-colors"
        >
          <span>{isRu ? 'Все услуги клиники' : 'Barcha xizmatlarni ko\'rish'}</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl p-6 border border-[#d8e5e2] animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="h-6 w-20 bg-[#eaf5f2] rounded-full" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
              <div className="h-6 w-3/4 bg-slate-100 rounded" />
              <div className="space-y-2">
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 w-5/6 bg-slate-100 rounded" />
              </div>
              <div className="pt-4 border-t border-[#d8e5e2] flex justify-between items-center">
                <div className="h-6 w-24 bg-slate-100 rounded" />
                <div className="h-9 w-9 bg-slate-100 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="text-center py-12 bg-white rounded-2xl border border-rose-200 p-6">
          <p className="text-rose-600 text-sm font-medium mb-3">{error}</p>
          <Link
            href="/services"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#167b78] text-white rounded-xl text-xs font-bold"
          >
            {t.common.retry}
          </Link>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && services.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-[#d8e5e2] p-8">
          <p className="text-[#52696e] text-sm">
            {isRu ? 'Услуги временно недоступны.' : 'Hozircha xizmatlar ro\'yxati mavjud emas.'}
          </p>
        </div>
      )}

      {/* Service Cards Grid */}
      {!isLoading && !error && services.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => {
            const name = isRu && service.nameRu ? service.nameRu : service.nameUz;
            const desc = isRu && service.descriptionRu ? service.descriptionRu : service.descriptionUz;
            const priceFromFormatted = (service.priceFrom / 100).toLocaleString('uz-UZ');

            return (
              <div
                key={service.id}
                className="bg-white rounded-2xl p-6 sm:p-7 border border-[#d8e5e2] shadow-[0_2px_8px_rgba(21,47,52,0.03)] hover:shadow-lg hover:border-[#167b78]/40 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{service.durationMinutes} {isRu ? 'мин' : 'daqiqa'}</span>
                    </span>
                    <span className="text-[11px] font-bold text-[#52696e] uppercase tracking-wider">
                      {service.category}
                    </span>
                  </div>

                  <Link href={`/services/${service.slug}`}>
                    <h3 className="text-lg font-bold text-[#152f34] group-hover:text-[#167b78] transition-colors mb-2 leading-snug">
                      {name}
                    </h3>
                  </Link>

                  <p className="text-sm text-[#52696e] line-clamp-2 mb-6 leading-relaxed">
                    {desc || (isRu ? 'Безопасное и безболезненное лечение от ведущих специалистов.' : 'Klinikamiz mutaxassislari tomonidan xavfsiz va og\'riqsiz muolaja.')}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#d8e5e2] flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-[#52696e] block uppercase font-semibold">
                      {t.common.price}
                    </span>
                    <span className="text-base font-extrabold text-[#152f34]">
                      {priceFromFormatted} {t.common.uzs}
                    </span>
                  </div>

                  <Link
                    href={`/booking?serviceId=${service.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#eaf5f2] text-[#167b78] hover:bg-[#167b78] hover:text-white rounded-xl transition-all font-semibold text-xs shadow-sm"
                    title={t.common.bookAppointment}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Записаться' : 'Yozilish'}</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
