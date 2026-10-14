'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, Stethoscope, Clock, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ServicesPage() {
  const { t, language } = useI18n();
  const [services, setServices] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadServices() {
      try {
        setIsLoading(true);
        const data = await api.getServices();
        setServices(data || []);
      } catch (e) {
        console.error('Failed to load services', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadServices();
  }, []);

  const categories = [
    { key: 'ALL', label: t.common.all },
    { key: 'THERAPY', label: 'Terapiya' },
    { key: 'ORTHODONTICS', label: 'Ortodontiya (Breketlar)' },
    { key: 'IMPLANTS', label: 'Implantatsiya' },
    { key: 'WHITENING', label: 'Oqartirish' },
    { key: 'PEDIATRIC', label: 'Bolalar stomatologiyasi' },
  ];

  const filteredServices = services.filter((s) => {
    const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
    const name = (language === 'ru' && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
    const matchesSearch = name.includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.services}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Klinikamiz xizmatlari va narxlari
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Ilg&apos;or kompyuter anesteziyasi, zamonaviy mikroskopiya va Germaniya materiallari
        </p>
      </div>

      {/* Category Pills & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {categories.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => setSelectedCategory(c.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                selectedCategory === c.key
                  ? 'bg-teal-700 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.common.search}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
          />
        </div>
      </div>

      {/* Services Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-sm">
          {t.common.loading}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="p-16 text-center text-slate-500 text-sm bg-white rounded-3xl border border-dashed border-slate-200">
          Qidiruv bo&apos;yicha xizmatlar topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => {
            const name = language === 'ru' && service.nameRu ? service.nameRu : service.nameUz;
            const desc =
              language === 'ru' && service.descriptionRu
                ? service.descriptionRu
                : service.descriptionUz;
            const priceFromFormatted = (service.priceFrom / 100).toLocaleString('uz-UZ');

            return (
              <div
                key={service.id}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 hover:border-teal-200 hover:shadow-xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      {service.durationMinutes} daqiqa
                    </span>
                    <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                      {service.category}
                    </span>
                  </div>

                  <Link href={`/services/${service.slug}`}>
                    <h3 className="text-lg font-bold text-slate-900 hover:text-teal-700 transition-colors mb-2">
                      {name}
                    </h3>
                  </Link>
                  <p className="text-sm text-slate-500 line-clamp-3 mb-6 leading-relaxed">
                    {desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">{t.common.price}</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {priceFromFormatted} {t.common.uzs}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/services/${service.slug}`}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                    >
                      {language === 'uz' ? 'Batafsil' : 'Подробнее'}
                    </Link>
                    <Link
                      href={`/booking?serviceId=${service.id}`}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{t.common.bookAppointment}</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
