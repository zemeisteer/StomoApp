'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ServicesPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [services, setServices] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadServices() {
      try {
        setIsLoading(true);
        const data = await api.getServices();
        if (isMounted) setServices(data || []);
      } catch (e) {
        console.error('Failed to load services', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadServices();
    return () => {
      isMounted = false;
    };
  }, []);

  const categories = [
    { key: 'ALL', label: isRu ? 'Все услуги' : 'Barcha xizmatlar' },
    { key: 'PREVENTIVE', label: isRu ? 'Профилактика и гигиена' : 'Profilaktika va gigiyena' },
    { key: 'THERAPY', label: isRu ? 'Терапия и кариес' : 'Terapiya va karies' },
    { key: 'ORTHODONTICS', label: isRu ? 'Ортодонтия (Брекеты)' : 'Ortodontiya (Breketlar)' },
    { key: 'IMPLANTS', label: isRu ? 'Имплантация' : 'Implantatsiya' },
    { key: 'PEDIATRIC', label: isRu ? 'Детская стоматология' : 'Bolalar stomatologiyasi' },
  ];

  const filteredServices = services.filter((s) => {
    const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
    const name = (isRu && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
    const matchesSearch = name.includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
      {/* Page Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.nav.services}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Стоматологические услуги и цены' : 'Klinikamiz xizmatlari va narxlari'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Передовые технологии безболезненного лечения, 3D компьютерная томография и качественные европейские материалы.'
            : 'Ilg\'or kompyuter anesteziyasi, zamonaviy mikroskopiya va Germaniya materiallari asosida sifatli muolaja.'}
        </p>
      </div>

      {/* Category Pills & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {categories.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => setSelectedCategory(c.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                selectedCategory === c.key
                  ? 'bg-[#167b78] text-white shadow-sm'
                  : 'bg-white text-[#152f34] border border-[#d8e5e2] hover:bg-[#f0f7f5]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#52696e]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRu ? 'Поиск услуги...' : 'Xizmat nomini qidirish...'}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#d8e5e2] text-xs font-medium text-[#152f34] focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white shadow-sm"
          />
        </div>
      </div>

      {/* Services Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-white rounded-2xl p-6 border border-[#d8e5e2] animate-pulse space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-6 w-20 bg-[#eaf5f2] rounded-full" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
              <div className="h-6 w-3/4 bg-slate-100 rounded" />
              <div className="h-10 bg-slate-100 rounded" />
              <div className="pt-4 border-t border-[#d8e5e2] flex justify-between">
                <div className="h-6 w-24 bg-slate-100 rounded" />
                <div className="h-8 w-24 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-[#d8e5e2] p-8">
          <p className="text-[#52696e] text-sm">
            {isRu ? 'По вашему запросу услуг не найдено.' : 'Qidiruv bo\'yicha mos xizmatlar topilmadi.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => {
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
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold">
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

                  <p className="text-sm text-[#52696e] line-clamp-3 mb-6 leading-relaxed">
                    {desc || (isRu ? 'Профессиональное лечение от ведущих специалистов клиники.' : 'Klinikamiz mutaxassislari tomonidan xavfsiz va og\'riqsiz muolaja.')}
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

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/services/${service.slug}`}
                      className="px-3 py-2 text-xs font-semibold text-[#167b78] hover:bg-[#eaf5f2] rounded-xl transition-colors"
                    >
                      {t.common.viewDetails}
                    </Link>

                    <Link
                      href={`/booking?serviceId=${service.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl transition-all font-semibold text-xs shadow-sm"
                      title={t.common.bookAppointment}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{isRu ? 'Записаться' : 'Yozilish'}</span>
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
