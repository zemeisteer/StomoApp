'use client';

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building2, Clock, Globe, Phone, Mail, Save, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>({
    name: '',
    nameRu: '',
    phone: '',
    email: '',
    website: '',
    telegramLink: '',
    instagramLink: '',
    facebookLink: '',
    timezone: 'Asia/Tashkent',
    minBookingNoticeHours: 2,
    maxBookingHorizonDays: 60,
    bufferMinutes: 5,
    pendingExpiryMinutes: 30,
  });

  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchNameUz, setBranchNameUz] = useState('');
  const [branchNameRu, setBranchNameRu] = useState('');
  const [branchAddressUz, setBranchAddressUz] = useState('');
  const [branchAddressRu, setBranchAddressRu] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchWorkHours, setBranchWorkHours] = useState('');
  const [branchIsActive, setBranchIsActive] = useState(true);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [settingsRes, branchesRes] = await Promise.all([
        api.getClinicSettingsAdmin(),
        api.getBranchesAdmin(),
      ]);
      if (settingsRes) {
        setSettings({
          name: settingsRes.name || '',
          nameRu: settingsRes.nameRu || '',
          phone: settingsRes.phone || '',
          email: settingsRes.email || '',
          website: settingsRes.website || '',
          telegramLink: settingsRes.telegramLink || '',
          instagramLink: settingsRes.instagramLink || '',
          facebookLink: settingsRes.facebookLink || '',
          timezone: settingsRes.timezone || 'Asia/Tashkent',
          minBookingNoticeHours: settingsRes.minBookingNoticeHours ?? 2,
          maxBookingHorizonDays: settingsRes.maxBookingHorizonDays ?? 60,
          bufferMinutes: settingsRes.bufferMinutes ?? 5,
          pendingExpiryMinutes: settingsRes.pendingExpiryMinutes ?? 30,
        });
      }
      setBranches(branchesRes || []);
    } catch (err: any) {
      console.error('Failed to load clinic settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSuccessMsg(null);
      setErrorMsg(null);
      await api.updateClinicSettingsAdmin(settings);
      setSuccessMsg('Klinika sozlamalari muvaffaqiyatli saqlandi');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sozlamalarni saqlashda xatolik');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setErrorMsg(null);
      const payload = {
        nameUz: branchNameUz.trim(),
        nameRu: branchNameRu.trim(),
        addressUz: branchAddressUz.trim(),
        addressRu: branchAddressRu.trim(),
        phone: branchPhone.trim(),
        workHours: branchWorkHours.trim(),
        isActive: branchIsActive,
      };

      if (editingBranch) {
        await api.updateBranchAdmin(editingBranch.id, payload);
      } else {
        await api.createBranchAdmin(payload);
      }
      setShowBranchModal(false);
      setEditingBranch(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Filialni saqlashda xatolik');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER']}>
      <div className="space-y-8 max-w-5xl">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Klinika Sozlamalari va Filiallar
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Klinika profili, bronlash qoidalari, ish vaqti va filiallar ro&apos;yxati (Faqat OWNER)
          </p>
        </div>

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Clinic Identity & Rules Form */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-700" />
            <span>Klinika Ma&apos;lumotlari va Bronlash Qoidalari</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Klinika nomi (O&apos;zbekcha)
              </label>
              <input
                type="text"
                required
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Klinika nomi (Ruscha)
              </label>
              <input
                type="text"
                required
                value={settings.nameRu}
                onChange={(e) => setSettings({ ...settings, nameRu: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Asosiy telefon raqam
              </label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email manzil
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telegram havola
              </label>
              <input
                type="text"
                placeholder="https://t.me/..."
                value={settings.telegramLink}
                onChange={(e) => setSettings({ ...settings, telegramLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instagram havola
              </label>
              <input
                type="text"
                placeholder="https://instagram.com/..."
                value={settings.instagramLink}
                onChange={(e) => setSettings({ ...settings, instagramLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Facebook havola
              </label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                value={settings.facebookLink}
                onChange={(e) => setSettings({ ...settings, facebookLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Bronlash va Vaqt Sozlamalari
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vaqt mintaqasi
                </label>
                <input
                  type="text"
                  disabled
                  value={settings.timezone}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-slate-50 text-slate-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimal ogohlantirish (soat)
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings.minBookingNoticeHours}
                  onChange={(e) => setSettings({ ...settings, minBookingNoticeHours: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maksimal uzoqlik (kun)
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.maxBookingHorizonDays}
                  onChange={(e) => setSettings({ ...settings, maxBookingHorizonDays: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bufer oralig&apos;i (daqiqa)
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings.bufferMinutes}
                  onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-700/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}</span>
            </button>
          </div>
        </form>

        {/* Branches Management */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Klinika Filiallari
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mavjud filiallar manzillari, telefonlari va faollik holati
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingBranch(null);
                setBranchNameUz('');
                setBranchNameRu('');
                setBranchAddressUz('');
                setBranchAddressRu('');
                setBranchPhone('');
                setBranchWorkHours('09:00 - 19:00');
                setBranchIsActive(true);
                setShowBranchModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Filial qo&apos;shish</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">{b.nameUz}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        b.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {b.isActive ? 'Faol' : 'Nofaol'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{b.addressUz}</p>
                  <p className="text-xs text-teal-700 font-semibold mt-1">Tel: {b.phone}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ish vaqti: {b.workHours}</p>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranch(b);
                      setBranchNameUz(b.nameUz);
                      setBranchNameRu(b.nameRu);
                      setBranchAddressUz(b.addressUz);
                      setBranchAddressRu(b.addressRu);
                      setBranchPhone(b.phone);
                      setBranchWorkHours(b.workHours);
                      setBranchIsActive(b.isActive);
                      setShowBranchModal(true);
                    }}
                    className="text-xs font-bold text-teal-700 hover:underline"
                  >
                    Tahrirlash
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Branch Modal */}
        {showBranchModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingBranch ? 'Filialni tahrirlash' : 'Yangi filial qo\'shish'}
              </h3>

              <form onSubmit={handleSaveBranch} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomi (UZ)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchNameUz}
                      onChange={(e) => setBranchNameUz(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomi (RU)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchNameRu}
                      onChange={(e) => setBranchNameRu(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manzili (UZ)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchAddressUz}
                      onChange={(e) => setBranchAddressUz(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manzili (RU)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchAddressRu}
                      onChange={(e) => setBranchAddressRu(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Telefon raqami
                    </label>
                    <input
                      type="text"
                      required
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ish tartibi
                    </label>
                    <input
                      type="text"
                      required
                      value={branchWorkHours}
                      onChange={(e) => setBranchWorkHours(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Holati
                  </label>
                  <select
                    value={branchIsActive ? 'true' : 'false'}
                    onChange={(e) => setBranchIsActive(e.target.value === 'true')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="true">Faol (Active)</option>
                    <option value="false">Nofaol (Inactive)</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBranchModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    {isSaving ? 'Saqlanmoqda...' : 'Filialni saqlash'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
