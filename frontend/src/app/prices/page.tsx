'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { serviceCategoryLabel } from '../../lib/serviceCategories';
import { api } from '../../lib/api';
import { CustomSelect } from '../../components/CustomSelect';
import { Container, FilterPills, PageIntro, SearchField, SkeletonCards, formatSom } from '../../components/site/primitives';

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

  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const categoryOptions = [
    { value: '', label: L('Hammasi', 'Все') },
    ...categories.map((c) => ({ value: c, label: serviceCategoryLabel(c, language) })),
  ];
  const sortOptions: Array<{ value: PriceSortOption; label: string }> = [
    { value: 'default', label: L('Tartib bo‘yicha', 'По порядку') },
    { value: 'asc', label: L('Arzonroq', 'Дешевле') },
    { value: 'desc', label: L('Qimmatroq', 'Дороже') },
  ];
  // Group the visible list by category so the price list reads like a menu
  const groups: Array<[string, any[]]> = [];
  for (const s of filteredAndSortedServices) {
    const g = groups.find(([k]) => k === s.category);
    if (g) g[1].push(s);
    else groups.push([s.category, [s]]);
  }
  const grouped = priceSort === 'default';

  const row = (s: any) => {
    const name = isRu && s.nameRu ? s.nameRu : s.nameUz;
    return (
      <li key={s.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-b border-line py-5 sm:grid-cols-[1fr_8rem_11rem_auto]">
        <div className="min-w-0">
          <Link href={`/services/${s.slug}`} className="text-base font-medium text-ink hover:text-brand-700">
            {name}
          </Link>
          {!grouped && <p className="text-xs text-ink-subtle">{serviceCategoryLabel(s.category, language)}</p>}
        </div>
        <span className="hidden text-sm text-ink-subtle sm:block">
          {s.durationMinutes} {L('daqiqa', 'мин')}
        </span>
        <span className="text-right text-base tabular-nums text-ink sm:text-left">
          {s.priceTo ? (
            <>
              {formatSom(s.priceFrom)} – {formatSom(s.priceTo)}
            </>
          ) : (
            <>
              <span className="text-sm text-ink-subtle">{L('dan', 'от')} </span>
              {formatSom(s.priceFrom)}
            </>
          )}{' '}
          <span className="text-sm text-ink-subtle">{t.common.uzs}</span>
        </span>
        <Link
          href={`/booking?serviceId=${s.id}${selectedDoctorId ? `&doctorId=${selectedDoctorId}` : ''}${selectedBranchId ? `&branchId=${selectedBranchId}` : ''}`}
          className="col-span-2 inline-flex h-9 w-max items-center rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors duration-300 hover:border-ink hover:bg-white sm:col-span-1"
        >
          {L('Yozilish', 'Записаться')}
        </Link>
      </li>
    );
  };

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.prices}
        title={L('Narxlar', 'Цены')}
        lead={L(
          'Yashirin to‘lovlarsiz. Ko‘rikdan keyin davolash rejasida aniq summa yoziladi va siz rozilik bermaguningizcha o‘zgarmaydi.',
          'Без скрытых платежей. После осмотра точная сумма фиксируется в плане лечения и не меняется без вашего согласия.',
        )}
        aside={<SearchField value={search} onChange={setSearch} placeholder={L('Muolajani qidirish', 'Поиск процедуры')} />}
      />

      <Container className="py-12 sm:py-16">
        <div className="mb-10 space-y-5">
          <FilterPills options={categoryOptions} value={selectedCategory} onChange={setSelectedCategory} label={L('Kategoriya', 'Категория')} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <CustomSelect
              label={L('Filial', 'Филиал')}
              locale={language === 'ru' ? 'ru' : 'uz'}
              value={selectedBranchId}
              onChange={(v) => {
                setSelectedBranchId(v);
                setSelectedDoctorId('');
              }}
              options={[
                { value: '', label: L('Barcha filiallar', 'Все филиалы') },
                ...branches.map((b) => ({ value: b.id, label: isRu && b.nameRu ? b.nameRu : b.nameUz })),
              ]}
            />
            <CustomSelect
              label={L('Shifokor', 'Врач')}
              locale={language === 'ru' ? 'ru' : 'uz'}
              value={selectedDoctorId}
              onChange={setSelectedDoctorId}
              options={[
                { value: '', label: L('Barcha shifokorlar', 'Все врачи') },
                ...filteredDoctorsList.map((d) => ({
                  value: d.id,
                  label: isRu && d.firstNameRu ? `${d.firstNameRu} ${d.lastNameRu}` : `${d.firstNameUz} ${d.lastNameUz}`,
                })),
              ]}
            />
            <div className="flex h-11 items-center rounded-full border border-line bg-white p-1" role="group" aria-label={L('Saralash', 'Сортировка')}>
              {sortOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={priceSort === o.value}
                  onClick={() => setPriceSort(o.value)}
                  className={`h-full rounded-full px-3.5 text-[13px] font-medium transition-colors ${priceSort === o.value ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-ink-subtle">
            <span>
              {filteredAndSortedServices.length} {L('ta muolaja', 'процедур')}
            </span>
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className="font-medium text-ink hover:text-brand-700">
                {L('Filtrlarni tozalash', 'Сбросить фильтры')}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonCards count={4} className="grid-cols-1" />
        ) : filteredAndSortedServices.length === 0 ? (
          <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">
            {L('Mos muolaja topilmadi.', 'Подходящих процедур не найдено.')}
          </p>
        ) : grouped ? (
          <div className="space-y-14">
            {groups.map(([cat, list]) => (
              <section key={cat}>
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">{serviceCategoryLabel(cat, language)}</h2>
                <ul className="mt-3 border-t border-line">{list.map(row)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="border-t border-line">{filteredAndSortedServices.map(row)}</ul>
        )}

        <p className="mt-14 max-w-2xl text-sm leading-relaxed text-ink-subtle">
          {L(
            'Narxlar “dan” ko‘rinishida: yakuniy summa tishlar soni va murakkablikka bog‘liq. Birinchi ko‘rikda shifokor reja va smeta tuzib beradi.',
            'Цены указаны «от»: итог зависит от количества зубов и сложности. На первом осмотре врач составит план и смету.',
          )}
        </p>
      </Container>
    </div>
  );
}
