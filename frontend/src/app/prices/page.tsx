'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Search, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function PricesPage() {
  const { t, language } = useI18n();
  const [services, setServices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPrices() {
      try {
        setIsLoading(true);
        const data = await api.getServices();
        setServices(data || []);
      } catch (e) {
        console.error('Failed to load prices', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadPrices();
  }, []);

  const filtered = services.filter((s) => {
    const name = (language === 'ru' && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.prices}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Shaffof va qat&apos;iy narxlar ro&apos;yxati
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Hech qanday yashirin to&apos;lovlarsiz — har bir muolaja narxi oldindan belgilanadi
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-md mx-auto mb-10">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Muolaja yoki xizmat nomini qidiring..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white shadow-sm"
          />
        </div>
      </div>

      {/* Price Table Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-slate-400 text-sm">{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm">Xizmatlar topilmadi.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((s) => {
              const name = language === 'ru' && s.nameRu ? s.nameRu : s.nameUz;
              const priceFromFormatted = (s.priceFrom / 100).toLocaleString('uz-UZ');
              const priceToFormatted = s.priceTo ? (s.priceTo / 100).toLocaleString('uz-UZ') : null;

              return (
                <div
                  key={s.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-teal-50/30 transition-colors"
                >
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full inline-block mb-1">
                      {s.category}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Muolaja davomiyligi: taxminan {s.durationMinutes} daqiqa
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-slate-400 block">{t.common.price}</span>
                      <span className="text-base font-black text-slate-900">
                        {priceToFormatted
                          ? `${priceFromFormatted} - ${priceToFormatted} ${t.common.uzs}`
                          : `${priceFromFormatted} ${t.common.uzs}`}
                      </span>
                    </div>

                    <Link
                      href={`/booking?serviceId=${s.id}`}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5 shrink-0"
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

      <div className="mt-8 p-4 bg-teal-50/70 rounded-2xl border border-teal-100 flex items-start gap-3 text-xs text-teal-900 max-w-2xl mx-auto">
        <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
        <span>
          Barcha muolajalar uchun kafolat taloni taqdim etiladi. Tish o&apos;rnatish va implantlar uchun ishlab chiqaruvchi tomonidan umrbod kafolat beriladi.
        </span>
      </div>
    </div>
  );
}
