'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, DollarSign, Clock, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function PricesPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [services, setServices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadPrices() {
      try {
        setIsLoading(true);
        const data = await api.getServices();
        if (isMounted) setServices(data || []);
      } catch (e) {
        console.error('Failed to load prices', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadPrices();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = services.filter((s) => {
    const name = (isRu && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <DollarSign className="w-3.5 h-3.5" />
          <span>{t.nav.prices}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Прейскурант и стоимость процедур' : 'Shaffof va qat\'iy narxlar ro\'yxati'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Абсолютно прозрачные цены без скрытых платежей. Стоимость рассчитывается до начала лечения.'
            : 'Hech qanday yashirin to\'lovlarsiz — har bir muolaja narxi va davomiyligi oldindan belgilanadi.'}
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#52696e]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRu ? 'Поиск процедуры или услуги...' : 'Muolaja yoki xizmat nomini qidiring...'}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#d8e5e2] text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34] shadow-sm"
          />
        </div>
      </div>

      {/* Price Table Card */}
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(21,47,52,0.03)] border border-[#d8e5e2] overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-[#52696e] text-sm">{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-[#52696e] text-sm">
            {isRu ? 'Услуги не найдены.' : 'Xizmatlar topilmadi.'}
          </div>
        ) : (
          <div className="divide-y divide-[#d8e5e2]">
            {filtered.map((s) => {
              const name = isRu && s.nameRu ? s.nameRu : s.nameUz;
              const priceFromFormatted = (s.priceFrom / 100).toLocaleString('uz-UZ');
              const priceToFormatted = s.priceTo ? (s.priceTo / 100).toLocaleString('uz-UZ') : null;

              return (
                <div
                  key={s.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f0f7f5] transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#167b78] bg-[#eaf5f2] px-2.5 py-0.5 rounded-full inline-block border border-[#d8e5e2]">
                        {s.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#52696e]">
                        <Clock className="w-3 h-3 text-[#167b78]" />
                        <span>{s.durationMinutes} {isRu ? 'мин' : 'daqiqa'}</span>
                      </span>
                    </div>

                    <Link href={`/services/${s.slug}`}>
                      <h3 className="text-base font-bold text-[#152f34] hover:text-[#167b78] transition-colors">
                        {name}
                      </h3>
                    </Link>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-[#52696e] block uppercase font-semibold">
                        {t.common.price}
                      </span>
                      <span className="text-base sm:text-lg font-black text-[#152f34]">
                        {priceToFormatted
                          ? `${priceFromFormatted} - ${priceToFormatted} ${t.common.uzs}`
                          : `${priceFromFormatted} ${t.common.uzs}`}
                      </span>
                    </div>

                    <Link
                      href={`/booking?serviceId=${s.id}`}
                      className="px-4 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
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
      </div>

      {/* Guarantee note */}
      <div className="p-4 bg-[#eaf5f2] rounded-2xl border border-[#d8e5e2] text-xs text-[#52696e] flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-[#167b78] shrink-0" />
        <p>
          {isRu
            ? 'Все цены указаны в национальной валюте (сум) и включают консультацию, анестезию и расходные материалы.'
            : 'Barcha narxlar milliy valyuta (so\'m)da ko\'rsatilgan va birlamchi ko\'rik, anesteziya hamda original materiallarni o\'z ichiga oladi.'}
        </p>
      </div>
    </div>
  );
}
