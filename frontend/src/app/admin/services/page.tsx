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
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Modal State
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

  useEffect(() => {
    loadServices();
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Xizmatlar va narxlar boshqaruvi
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Stomatologik xizmatlar ro&apos;yxati, standart davomiylik, toifalar va narxlar
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi xizmat</span>
            </button>

            <button
              onClick={loadServices}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

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
                <tbody className="divide-y divide-slate-100">
                  {filteredServices.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-900 block">{s.nameUz}</span>
                        <span className="text-[11px] text-slate-500 block">
                          {s.nameRu} • <code className="text-teal-700">/{s.slug}</code>
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold text-[10px]">
                          {s.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-medium">
                        {s.durationMinutes} daqiqa
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {s.priceFrom ? (s.priceFrom / 100).toLocaleString('uz-UZ') : 0} so&apos;m
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            s.isActive !== false
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.isActive !== false ? 'FAOL' : 'NOFAOL'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                        >
                          Tahrirlash
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  Xizmatlar boshqaruvi
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {editingService ? 'Xizmatni tahrirlash' : 'Yangi xizmat qo\'shish'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
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
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      setFormData({
                        ...formData,
                        nameUz: name,
                        slug: editingService ? formData.slug : slug,
                      });
                    }}
                    placeholder="Masalan, Kariesni davolash"
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
                    placeholder="Например, Лечение кариеса"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Slug (URL) *</label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="karies-davolash"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Toifa *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Davomiylik (daq) *</label>
                  <input
                    type="number"
                    required
                    min={5}
                    step={5}
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Boshlang&apos;ich narx (so&apos;mda) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={10000}
                    value={formData.priceFrom}
                    onChange={(e) => setFormData({ ...formData, priceFrom: Number(e.target.value) })}
                    placeholder="150000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-600 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Maksimal narx (ixtiyoriy)</label>
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
