'use client';

import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Clock,
  DollarSign,
  RefreshCw,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  History,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

const CATEGORIES = [
  { value: 'THERAPY', label: 'Terapiya' },
  { value: 'ORTHODONTICS', label: 'Ortodontiya' },
  { value: 'IMPLANTS', label: 'Implantatsiya' },
  { value: 'WHITENING', label: 'Oqartirish' },
  { value: 'PEDIATRIC', label: 'Bolalar stomatologiyasi' },
  { value: 'SURGERY', label: 'Jarrohlik' },
  { value: 'HYGIENE', label: 'Gigiyena' },
];

export default function AdminServicesPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'legacy'>('catalog');
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Catalog Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nameUz: '',
    nameRu: '',
    slug: '',
    category: 'THERAPY',
    durationMinutes: 30,
    priceFrom: 150000,
    priceTo: 0,
    descriptionUz: '',
    descriptionRu: '',
    preparationUz: '',
    preparationRu: '',
    requiresConsultation: false,
    isActive: true,
  });

  // Legacy Review State
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyPage, setLegacyPage] = useState(1);
  const [legacyLimit] = useState(10);
  const [legacyData, setLegacyData] = useState<{
    unresolvedCount: number;
    verifiedHistoricalCount: number;
    total: number;
    page: number;
    totalPages: number;
    records: any[];
  } | null>(null);

  // Reconciliation Action Modal State
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [reconcileAction, setReconcileAction] = useState<'RESOLVE_TO_SERVICE' | 'KEEP_AMBIGUOUS_BUNDLE'>('RESOLVE_TO_SERVICE');
  const [targetServiceId, setTargetServiceId] = useState('');
  const [reconcileReason, setReconcileReason] = useState('');
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileSuccessMsg, setReconcileSuccessMsg] = useState<string | null>(null);
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAllServicesAdmin().catch(() => api.getServices());
      setServices(data || []);
    } catch (e) {
      console.error('Failed to load services', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLegacyReview = async (page = legacyPage) => {
    try {
      setLegacyLoading(true);
      setReconcileError(null);
      const report = await api.getLegacyReviewReport(page, legacyLimit);
      setLegacyData(report);
      setLegacyPage(page);
    } catch (err: any) {
      console.error('Failed to load legacy review report', err);
    } finally {
      setLegacyLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
    loadLegacyReview(1);
  }, []);

  const openCreateModal = () => {
    setEditingService(null);
    setFormData({
      nameUz: '',
      nameRu: '',
      slug: '',
      category: 'THERAPY',
      durationMinutes: 30,
      priceFrom: 150000,
      priceTo: 0,
      descriptionUz: '',
      descriptionRu: '',
      preparationUz: '',
      preparationRu: '',
      requiresConsultation: false,
      isActive: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (service: any) => {
    setEditingService(service);
    setFormData({
      nameUz: service.nameUz || '',
      nameRu: service.nameRu || '',
      slug: service.slug || '',
      category: service.category || 'THERAPY',
      durationMinutes: service.durationMinutes || 30,
      priceFrom: service.priceFrom ? service.priceFrom / 100 : 0,
      priceTo: service.priceTo ? service.priceTo / 100 : 0,
      descriptionUz: service.descriptionUz || '',
      descriptionRu: service.descriptionRu || '',
      preparationUz: service.preparationUz || '',
      preparationRu: service.preparationRu || '',
      requiresConsultation: service.requiresConsultation || false,
      isActive: service.isActive !== undefined ? service.isActive : true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setFormError(null);

      const payload = {
        ...formData,
        priceFrom: Math.round(Number(formData.priceFrom) * 100),
        priceTo: formData.priceTo ? Math.round(Number(formData.priceTo) * 100) : undefined,
        durationMinutes: Number(formData.durationMinutes),
      };

      if (editingService) {
        await api.updateServiceAdmin(editingService.id, payload);
      } else {
        await api.createServiceAdmin(payload);
      }

      setIsModalOpen(false);
      await loadServices();
    } catch (err: any) {
      setFormError(err?.message || 'Xizmatni saqlashda xatolik yuz berdi');
    } finally {
      setIsSaving(false);
    }
  };

  const openReconcileModal = (item: any, action: 'RESOLVE_TO_SERVICE' | 'KEEP_AMBIGUOUS_BUNDLE') => {
    setSelectedItem(item);
    setReconcileAction(action);
    setTargetServiceId(item.originalServiceId || '');
    setReconcileReason('');
    setReconcileError(null);
    setReconcileModalOpen(true);
  };

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    if (!reconcileReason.trim() || reconcileReason.trim().length < 5) {
      setReconcileError('Qaror sababi (reason) kamida 5 ta belgidan iborat bo\'lishi shart');
      return;
    }

    if (reconcileAction === 'RESOLVE_TO_SERVICE' && !targetServiceId) {
      setReconcileError('Iltimos, bog\'lash uchun katalog xizmatini tanlang');
      return;
    }

    try {
      setIsSubmittingReconcile(true);
      setReconcileError(null);

      await api.reconcileLegacyRecord({
        itemId: selectedItem.id,
        action: reconcileAction,
        serviceId: reconcileAction === 'RESOLVE_TO_SERVICE' ? targetServiceId : undefined,
        reason: reconcileReason.trim(),
      });

      setReconcileSuccessMsg(`"${selectedItem.serviceNameUz}" muvaffaqiyatli muvofiqlashtirildi.`);
      setTimeout(() => setReconcileSuccessMsg(null), 4000);

      setReconcileModalOpen(false);
      await loadLegacyReview(legacyPage);
    } catch (err: any) {
      setReconcileError(err?.message || 'Muvofiqlashtirishda xatolik yuz berdi');
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  const filteredServices = services.filter((s) => {
    const matchesSearch =
      !search ||
      s.nameUz?.toLowerCase().includes(search.toLowerCase()) ||
      s.nameRu?.toLowerCase().includes(search.toLowerCase()) ||
      s.slug?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = !selectedCategory || s.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'EDITOR']}>
      <div className="space-y-6">
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Xizmatlar va narxlar boshqaruvi
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Stomatologik xizmatlar ro&apos;yxati, standart davomiylik, toifalar va tarixiy ma&apos;lumotlar taftishi
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'catalog' && (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Yangi xizmat</span>
              </button>
            )}

            <button
              onClick={() => {
                if (activeTab === 'catalog') loadServices();
                else loadLegacyReview(legacyPage);
              }}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 gap-4">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`pb-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'catalog'
                ? 'border-teal-700 text-teal-700'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Xizmatlar katalogi</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
              {services.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('legacy');
              loadLegacyReview(1);
            }}
            className={`pb-3 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'legacy'
                ? 'border-teal-700 text-teal-700'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Tarixiy yozuvlar taftishi (Legacy Review)</span>
            {legacyData?.unresolvedCount !== undefined && legacyData.unresolvedCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold animate-pulse">
                {legacyData.unresolvedCount} ta noaniq
              </span>
            )}
          </button>
        </div>

        {reconcileSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{reconcileSuccessMsg}</span>
          </div>
        )}

        {/* TAB 1: CATALOG */}
        {activeTab === 'catalog' && (
          <>
            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Xizmat nomi yoki slug bo'yicha qidirish..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-teal-600 font-medium"
              >
                <option value="">Barcha toifalar</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Services Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
              ) : filteredServices.length === 0 ? (
                <div className="p-16 text-center text-slate-500 text-sm">Xizmatlar topilmadi.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-6">Xizmat nomi</th>
                        <th className="py-3.5 px-6">Kategoriya</th>
                        <th className="py-3.5 px-6">Davomiyligi</th>
                        <th className="py-3.5 px-6">Boshlang&apos;ich narx</th>
                        <th className="py-3.5 px-6">Holat</th>
                        <th className="py-3.5 px-6 text-right">Amallar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredServices.map((service) => (
                        <tr key={service.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900">{service.nameUz}</div>
                            <div className="text-[11px] text-slate-400">{service.nameRu}</div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-800">
                              {CATEGORIES.find((c) => c.value === service.category)?.label || service.category}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{service.durationMinutes} daqiqa</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900">
                              {(service.priceFrom / 100).toLocaleString()} UZS
                            </div>
                            {service.priceTo ? (
                              <div className="text-[10px] text-slate-400">
                                gacha {(service.priceTo / 100).toLocaleString()} UZS
                              </div>
                            ) : null}
                          </td>
                          <td className="py-4 px-6">
                            {service.isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Faol</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                                <XCircle className="w-3 h-3" />
                                <span>Nofaol</span>
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => openEditModal(service)}
                              className="p-2 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Tahrirlash"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: LEGACY REVIEW */}
        {activeTab === 'legacy' && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">
                    {legacyData?.unresolvedCount ?? 0}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    Noaniq yoki ko&apos;p xizmatli bandlar (Ko&apos;rib chiqish talab etiladi)
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">
                    {legacyData?.verifiedHistoricalCount ?? 0}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    Avtomatik tasdiqlangan yagona xizmatlar (VERIFIED_SINGLE)
                  </div>
                </div>
              </div>
            </div>

            {/* Legacy Records Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {legacyLoading ? (
                <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
              ) : !legacyData?.records || legacyData.records.length === 0 ? (
                <div className="p-16 text-center text-slate-500 text-sm">
                  Ko&apos;rib chiqish uchun noaniq tarixiy yozuvlar mavjud emas. Barcha bandlar tekshirilgan!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 px-6">Qabul sanasi & Bemor</th>
                        <th className="py-3.5 px-6">Shifokor</th>
                        <th className="py-3.5 px-6">Tarixiy xizmat nomi</th>
                        <th className="py-3.5 px-6">Davomiylik & Narx</th>
                        <th className="py-3.5 px-6">Holat (Provenance)</th>
                        <th className="py-3.5 px-6 text-right">Muvofiqlashtirish amallari</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {legacyData.records.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900">
                              {item.appointment?.patient?.fullName || 'Noma\'lum bemor'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.appointment?.startTime
                                ? new Date(item.appointment.startTime).toLocaleString('uz-UZ')
                                : 'Sana yo\'q'}
                            </div>
                            <div className="text-[10px] text-slate-300">ID: {item.id}</div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-slate-800 font-semibold">
                              {item.appointment?.doctor
                                ? `${item.appointment.doctor.firstNameUz} ${item.appointment.doctor.lastNameUz}`
                                : 'Biriktirilmagan'}
                            </div>
                          </td>
                          <td className="py-4 px-6 max-w-[260px]">
                            <div className="font-bold text-slate-900 break-words">
                              {item.serviceNameUz}
                            </div>
                            {item.serviceNameRu && (
                              <div className="text-[11px] text-slate-400 break-words">
                                {item.serviceNameRu}
                              </div>
                            )}
                            {item.serviceNameUz?.includes(',') && (
                              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Ko&apos;p xizmatli matn (vergul mavjud)
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-slate-700 font-semibold">
                              {item.durationMinutes} daqiqa
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.priceFrom ? `${(item.priceFrom / 100).toLocaleString()} UZS` : 'Narx yo\'q'}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              {item.legacyProvenance || (item.isLegacyBundle ? 'AMBIGUOUS_BUNDLE' : 'NO_SERVICE')}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openReconcileModal(item, 'RESOLVE_TO_SERVICE')}
                                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                              >
                                Bog&apos;lash
                              </button>

                              <button
                                onClick={() => openReconcileModal(item, 'KEEP_AMBIGUOUS_BUNDLE')}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                              >
                                Paket deb saqlash
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls */}
              {legacyData && legacyData.totalPages > 1 && (
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <div>
                    Jami: {legacyData.total} ta band, Sahifa {legacyData.page} / {legacyData.totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadLegacyReview(Math.max(1, legacyPage - 1))}
                      disabled={legacyPage <= 1 || legacyLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg flex items-center gap-1 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Oldingi</span>
                    </button>

                    <button
                      onClick={() => loadLegacyReview(Math.min(legacyData.totalPages, legacyPage + 1))}
                      disabled={legacyPage >= legacyData.totalPages || legacyLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg flex items-center gap-1 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <span>Keyingi</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RECONCILE MODAL */}
      {reconcileModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h2 className="text-lg font-black text-slate-900 mb-1">
              {reconcileAction === 'RESOLVE_TO_SERVICE'
                ? 'Katalog xizmatiga muvofiqlashtirish'
                : 'Ko\'p xizmatli paket deb saqlash'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Tarixiy yozuvning asl ma&apos;lumotlari va narxlari o&apos;zgarmay saqlanadi. Qaror audit jurnaliga yoziladi.
            </p>

            {reconcileError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{reconcileError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl mb-4 space-y-1 text-xs">
              <div>
                <span className="text-slate-400 font-semibold">Tarixiy yozuv:</span>{' '}
                <span className="font-bold text-slate-900">{selectedItem.serviceNameUz}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold">Qabul sanasi:</span>{' '}
                <span className="font-medium text-slate-700">
                  {selectedItem.appointment?.startTime
                    ? new Date(selectedItem.appointment.startTime).toLocaleString('uz-UZ')
                    : 'Noma\'lum'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold">Davomiylik / Narx:</span>{' '}
                <span className="font-medium text-slate-700">
                  {selectedItem.durationMinutes} daqiqa / {(selectedItem.priceFrom / 100).toLocaleString()} UZS
                </span>
              </div>
            </div>

            <form onSubmit={handleReconcileSubmit} className="space-y-4 text-xs">
              {reconcileAction === 'RESOLVE_TO_SERVICE' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bog&apos;lanadigan katalog xizmati *
                  </label>
                  <select
                    value={targetServiceId}
                    onChange={(e) => setTargetServiceId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600 text-xs font-medium"
                  >
                    <option value="">-- Xizmatni tanlang --</option>
                    {services
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nameUz} ({s.durationMinutes} daqiqa)
                        </option>
                      ))}
                  </select>
                  {selectedItem.serviceNameUz?.includes(',') && (
                    <div className="mt-1 text-[11px] text-amber-700 flex items-center gap-1 font-medium">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        Diqqat: Ushbu bandda bir nechta xizmat mavjud bo&apos;lsa, uni bitta xizmatga majburan bog&apos;lab bo&apos;lmaydi.
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ko&apos;rib chiqish qarorining sababi (Audit reason) *
                </label>
                <textarea
                  rows={3}
                  value={reconcileReason}
                  onChange={(e) => setReconcileReason(e.target.value)}
                  placeholder="Masalan: Tarixiy kartochkasi tekshirildi, ushbu qabulda faqat tish tozalash muolajasi o'tkazilganligi tasdiqlandi..."
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600 text-xs"
                />
                <div className="text-[10px] text-slate-400 mt-0.5">Kamida 5 ta belgi.</div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReconcileModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReconcile}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmittingReconcile ? 'Saqlanmoqda...' : 'Tasdiqlash va saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT SERVICE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 shadow-2xl border border-slate-200 my-8">
            <h2 className="text-xl font-extrabold text-slate-900 mb-4">
              {editingService ? 'Xizmatni tahrirlash' : 'Yangi xizmat qo\'shish'}
            </h2>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Xizmat nomi (O&apos;zbekcha) *</label>
                  <input
                    type="text"
                    required
                    value={formData.nameUz}
                    onChange={(e) => setFormData({ ...formData, nameUz: e.target.value })}
                    placeholder="Masalan: Tish oqartirish"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Xizmat nomi (Ruscha) *</label>
                  <input
                    type="text"
                    required
                    value={formData.nameRu}
                    onChange={(e) => setFormData({ ...formData, nameRu: e.target.value })}
                    placeholder="Например: Отбеливание зубов"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Slug (URL manzili) *</label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="tish-oqartirish"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategoriya *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Davomiyligi (daqiqa) *</label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={480}
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Boshlang&apos;ich narx (UZS) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={10000}
                    value={formData.priceFrom}
                    onChange={(e) => setFormData({ ...formData, priceFrom: Number(e.target.value) })}
                    placeholder="150000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Maksimal narx (UZS)</label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={formData.priceTo || ''}
                    onChange={(e) => setFormData({ ...formData, priceTo: Number(e.target.value) })}
                    placeholder="300000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tavsif (O&apos;zbekcha)</label>
                <textarea
                  rows={2}
                  value={formData.descriptionUz}
                  onChange={(e) => setFormData({ ...formData, descriptionUz: e.target.value })}
                  placeholder="Xizmat haqida batafsil..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Muolajaga tayyorgarlik (O&apos;zbekcha)</label>
                <textarea
                  rows={2}
                  value={formData.preparationUz}
                  onChange={(e) => setFormData({ ...formData, preparationUz: e.target.value })}
                  placeholder="Qabuldan oldin nimalarga e'tibor berish kerak..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <span>Xizmat faol (onlayn qabulga ochiq)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.requiresConsultation}
                    onChange={(e) => setFormData({ ...formData, requiresConsultation: e.target.checked })}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <span>Oldindan konsultatsiya talab etiladi</span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
