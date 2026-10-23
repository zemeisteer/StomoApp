'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Search,
  DollarSign,
  Clock,
  ShieldCheck,
  Building2,
  User,
  ArrowUpDown,
  Filter,
  X,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { CustomSelect } from '../../components/CustomSelect';

type PriceSortOption = 'default' | 'asc' | 'desc';

export default function PricesPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const [services, setServices] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceSort, setPriceSort] = useState<PriceSortOption>('default');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setIsLoading(true);
        const [servicesData, branchesData, doctorsData] = await Promise.all([
          api.getServices(),
          api.getBranches().catch(() => []),
          api.getDoctors().catch(() => []),
        ]);

        if (isMounted) {
          setServices(servicesData || []);
          setBranches((branchesData || []).filter((b: any) => b.isActive !== false));
          setDoctors((doctorsData || []).filter((d: any) => d.isActive !== false));
        }
      } catch (e) {
        console.error('Failed to load prices or filters', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Extract all unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [services]);

  // Doctors filtered by selected branch
  const filteredDoctorsList = useMemo(() => {
    if (!selectedBranchId) return doctors;
    return doctors.filter((doc) => {
      const worksInBranch =
        (Array.isArray(doc.branches) && doc.branches.some((b: any) => (b.branchId || b.id) === selectedBranchId)) ||
        (Array.isArray(doc.schedules) && doc.schedules.some((s: any) => s.branchId === selectedBranchId && s.isActive !== false));
      return worksInBranch;
    });
  }, [doctors, selectedBranchId]);

  // Multi-dimensional filtering & sorting logic
  const filteredAndSortedServices = useMemo(() => {
    let result = services.filter((s) => {
      // 1. Text Search
      const name = (isRu && s.nameRu ? s.nameRu : s.nameUz).toLowerCase();
      const cat = (s.category || '').toLowerCase();
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || name.includes(q) || cat.includes(q);
      if (!matchesSearch) return false;

      // 2. Category Filter
      if (selectedCategory && s.category !== selectedCategory) {
        return false;
      }

      // 3. Doctor Filter (Service must be in doctor's qualified services)
      if (selectedDoctorId) {
        const doc = doctors.find((d) => d.id === selectedDoctorId);
        if (doc && Array.isArray(doc.services) && doc.services.length > 0) {
          const docHasService = doc.services.some((ds: any) => ds.serviceId === s.id);
          if (!docHasService) return false;
        }
      }

      // 4. Branch Filter (At least one doctor in this branch provides the service, or service is universal)
      if (selectedBranchId && !selectedDoctorId) {
        const branchDoctors = doctors.filter((doc) => {
          return (
            (Array.isArray(doc.branches) && doc.branches.some((b: any) => (b.branchId || b.id) === selectedBranchId)) ||
            (Array.isArray(doc.schedules) && doc.schedules.some((s: any) => s.branchId === selectedBranchId && s.isActive !== false))
          );
        });

        // If there are doctors in this branch with defined service specialties, check them
        if (branchDoctors.length > 0) {
          const isOfferedByAnyBranchDoctor = branchDoctors.some(
            (doc) => !Array.isArray(doc.services) || doc.services.length === 0 || doc.services.some((ds: any) => ds.serviceId === s.id)
          );
          if (!isOfferedByAnyBranchDoctor) return false;
        }
      }

      return true;
    });

    // 5. Price Sorting (Low to High / High to Low)
    if (priceSort === 'asc') {
      result = [...result].sort((a, b) => (a.priceFrom || 0) - (b.priceFrom || 0));
    } else if (priceSort === 'desc') {
      result = [...result].sort((a, b) => (b.priceFrom || 0) - (a.priceFrom || 0));
    }

    return result;
  }, [services, search, selectedCategory, selectedDoctorId, selectedBranchId, doctors, priceSort, isRu]);

  const hasActiveFilters = Boolean(
    search || selectedBranchId || selectedDoctorId || selectedCategory || priceSort !== 'default'
  );

  const resetFilters = () => {
    setSearch('');
    setSelectedBranchId('');
    setSelectedDoctorId('');
    setSelectedCategory('');
    setPriceSort('default');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <DollarSign className="w-3.5 h-3.5" />
          <span>{t.nav.prices}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Shaffof va qat\'iy narxlar ro\'yxati' : 'Shaffof va qat\'iy narxlar ro\'yxati'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Абсолютно прозрачные цены без скрытых платежей. Стоимость рассчитывается до начала лечения.'
            : 'Hech qanday yashirin to\'lovlarsiz — har bir muolaja narxi va davomiyligi oldindan belgilanadi.'}
        </p>
      </div>

      {/* Filter Controls Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#d8e5e2] shadow-[0_4px_24px_rgba(21,47,52,0.04)] space-y-6">
        {/* Row 1: Search & Price Sort */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Bar */}
          <div className="md:col-span-7">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-[#52696e]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isRu ? 'Поиск процедуры или услуги...' : 'Muolaja yoki xizmat nomini qidiring...'}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-[#d8e5e2] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-[#f9fcfa] focus:bg-white text-[#152f34] transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-3.5 text-[#52696e] hover:text-[#152f34]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Price Sorting Toggle (Low to High / High to Low) */}
          <div className="md:col-span-5 flex items-center justify-between sm:justify-end gap-2">
            <span className="text-xs font-semibold text-[#52696e] flex items-center gap-1 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#167b78]" />
              <span>{isRu ? 'Сортировка:' : 'Narx bo\'yicha:'}</span>
            </span>

            <div className="inline-flex rounded-2xl p-1 bg-[#f0f6f4] border border-[#d8e5e2] text-xs font-bold text-[#152f34]">
              <button
                type="button"
                onClick={() => setPriceSort('default')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  priceSort === 'default'
                    ? 'bg-white text-[#167b78] shadow-sm font-extrabold'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                {isRu ? 'Обычный' : 'Barchasi'}
              </button>
              <button
                type="button"
                id="filter-price-asc"
                onClick={() => setPriceSort('asc')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  priceSort === 'asc'
                    ? 'bg-[#167b78] text-white shadow-sm font-extrabold'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
                title="Low to High"
              >
                {isRu ? 'Сначала дешевые ↑' : 'Arzondan ↑'}
              </button>
              <button
                type="button"
                id="filter-price-desc"
                onClick={() => setPriceSort('desc')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  priceSort === 'desc'
                    ? 'bg-[#167b78] text-white shadow-sm font-extrabold'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
                title="High to Low"
              >
                {isRu ? 'Сначала дорогие ↓' : 'Qimmatdan ↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Branch & Doctor Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 pt-2 border-t border-[#d8e5e2]/80">
          {/* Branch Filter */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block text-xs font-bold text-[#152f34] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#167b78]" />
              <span>{isRu ? 'Фильтр по филиалу:' : 'Filial bo\'yicha:'}</span>
            </label>
            <CustomSelect
              id="prices-filter-branch"
              value={selectedBranchId}
              onChange={(val) => {
                setSelectedBranchId(val);
                if (val && selectedDoctorId) {
                  const doc = doctors.find((d) => d.id === selectedDoctorId);
                  const stillWorks =
                    (Array.isArray(doc?.branches) && doc.branches.some((b: any) => (b.branchId || b.id) === val)) ||
                    (Array.isArray(doc?.schedules) && doc.schedules.some((s: any) => s.branchId === val && s.isActive !== false));
                  if (!stillWorks) setSelectedDoctorId('');
                }
              }}
              placeholder={isRu ? 'Все филиалы клиники' : 'Barcha filiallar'}
              options={[
                { value: '', label: isRu ? 'Все филиалы клиники' : 'Barcha filiallar' },
                ...branches.map((b) => ({
                  value: b.id,
                  label: isRu && b.nameRu ? b.nameRu : b.nameUz,
                })),
              ]}
              locale={isRu ? 'ru' : 'uz'}
            />
          </div>

          {/* Doctor Filter */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block text-xs font-bold text-[#152f34] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#167b78]" />
              <span>{isRu ? 'Фильтр по врачу:' : 'Doktor bo\'yicha:'}</span>
            </label>
            <CustomSelect
              id="prices-filter-doctor"
              value={selectedDoctorId}
              onChange={(val) => setSelectedDoctorId(val)}
              placeholder={isRu ? 'Все врачи' : 'Barcha shifokorlar'}
              options={[
                { value: '', label: isRu ? 'Все врачи' : 'Barcha shifokorlar' },
                ...filteredDoctorsList.map((d) => ({
                  value: d.id,
                  label: `${isRu ? `Д-р ${d.firstNameRu || d.firstNameUz} ${d.lastNameRu || d.lastNameUz}` : `Dr. ${d.firstNameUz} ${d.lastNameUz}`} — ${(isRu && d.titleRu ? d.titleRu : d.titleUz) || 'Stomatolog'}`,
                })),
              ]}
              locale={isRu ? 'ru' : 'uz'}
            />
          </div>

          {/* Reset Filters Button */}
          <div className="lg:col-span-2 flex items-end">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="w-full py-2.5 px-3 bg-[#eaf5f2] hover:bg-[#d8ebe7] text-[#167b78] text-xs font-bold rounded-2xl border border-[#d8e5e2] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isRu ? 'Сбросить' : 'Tozalash'}</span>
              </button>
            ) : (
              <div className="hidden lg:block w-full py-2.5 px-3 text-center text-[11px] text-[#52696e]">
                {filteredAndSortedServices.length} {isRu ? 'услуг' : 'ta muolaja'}
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Category Pills */}
        {categories.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                !selectedCategory
                  ? 'bg-[#167b78] text-white shadow-sm'
                  : 'bg-[#f0f6f4] text-[#52696e] hover:bg-[#eaf5f2] hover:text-[#167b78] border border-[#d8e5e2]'
              }`}
            >
              {isRu ? 'Все категории' : 'Barcha toifalar'}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#167b78] text-white shadow-sm'
                    : 'bg-[#f0f6f4] text-[#52696e] hover:bg-[#eaf5f2] hover:text-[#167b78] border border-[#d8e5e2]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price Table Card */}
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(21,47,52,0.04)] border border-[#d8e5e2] overflow-hidden">
        {/* Results summary header */}
        <div className="px-6 py-4 bg-[#f8fbfa] border-b border-[#d8e5e2] flex items-center justify-between text-xs font-semibold text-[#52696e]">
          <span>
            {isRu ? 'Найдено процедур:' : 'Topilgan muolajalar:'}{' '}
            <strong className="text-[#152f34] font-bold">{filteredAndSortedServices.length}</strong>
          </span>
          {priceSort !== 'default' && (
            <span className="text-[#167b78] font-bold">
              {priceSort === 'asc'
                ? (isRu ? 'По возрастанию цены' : 'Narx: Arzondan qimmatga')
                : (isRu ? 'По убыванию цены' : 'Narx: Qimmatdan arzonga')}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-[#52696e] text-sm">
            <div className="inline-block w-6 h-6 border-2 border-[#167b78] border-t-transparent rounded-full animate-spin mb-2" />
            <p>{t.common.loading}</p>
          </div>
        ) : filteredAndSortedServices.length === 0 ? (
          <div className="p-16 text-center text-[#52696e] text-sm space-y-3">
            <p className="font-bold text-[#152f34] text-base">
              {isRu ? 'Процедуры по заданным фильтрам не найдены.' : 'Tanlangan filtrlar bo\'yicha xizmatlar topilmadi.'}
            </p>
            <p className="text-xs text-[#52696e]">
              {isRu
                ? 'Попробуйте изменить параметры поиска или сбросить фильтры.'
                : 'Qidiruv so\'zini o\'zgartiring yoki filtrlarni tozalang.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-2 px-5 py-2 bg-[#167b78] text-white rounded-xl text-xs font-bold"
              >
                {isRu ? 'Сбросить фильтры' : 'Filtrlarni tozalash'}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#d8e5e2]">
            {filteredAndSortedServices.map((s) => {
              const name = isRu && s.nameRu ? s.nameRu : s.nameUz;
              const priceFromFormatted = (s.priceFrom / 100).toLocaleString('uz-UZ');
              const priceToFormatted = s.priceTo ? (s.priceTo / 100).toLocaleString('uz-UZ') : null;

              return (
                <div
                  key={s.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f4f9f8] transition-colors group"
                >
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#167b78] bg-[#eaf5f2] px-2.5 py-0.5 rounded-full inline-block border border-[#d8e5e2]">
                        {s.category || 'Xizmat'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#52696e]">
                        <Clock className="w-3 h-3 text-[#167b78]" />
                        <span>{s.durationMinutes} {isRu ? 'мин' : 'daqiqa'}</span>
                      </span>
                    </div>

                    <Link href={`/services/${s.slug}`}>
                      <h3 className="text-base sm:text-lg font-bold text-[#152f34] group-hover:text-[#167b78] transition-colors leading-snug">
                        {name}
                      </h3>
                    </Link>

                    {s.descriptionUz && (
                      <p className="text-xs text-[#52696e] line-clamp-1 max-w-xl">
                        {isRu && s.descriptionRu ? s.descriptionRu : s.descriptionUz}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#d8e5e2]/60">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] text-[#52696e] block uppercase font-bold tracking-wider">
                        {t.common.price}
                      </span>
                      <span className="text-base sm:text-lg font-black text-[#152f34]">
                        {priceToFormatted
                          ? `${priceFromFormatted} - ${priceToFormatted} ${t.common.uzs}`
                          : `${priceFromFormatted} ${t.common.uzs}`}
                      </span>
                    </div>

                    <Link
                      href={`/booking?serviceId=${s.id}${selectedBranchId ? `&branchId=${selectedBranchId}` : ''}${selectedDoctorId ? `&doctorId=${selectedDoctorId}` : ''}`}
                      className="px-4 sm:px-5 py-2.5 bg-[#167b78] hover:bg-[#126462] text-white rounded-xl text-xs font-bold shadow-md shadow-[#167b78]/20 transition-all flex items-center gap-1.5 cursor-pointer transform active:scale-95"
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
      <div className="p-5 bg-[#eaf5f2] rounded-3xl border border-[#d8e5e2] text-xs sm:text-sm text-[#52696e] flex items-center gap-3.5">
        <ShieldCheck className="w-6 h-6 text-[#167b78] shrink-0" />
        <p className="leading-relaxed">
          {isRu
            ? 'Все цены указаны в национальной валюте (сум) и включают консультацию, анестезию и расходные материалы.'
            : 'Barcha narxlar milliy valyuta (so\'m)da ko\'rsatilgan va birlamchi ko\'rik, anesteziya hamda original materiallarni o\'z ichiga oladi.'}
        </p>
      </div>
    </div>
  );
}
