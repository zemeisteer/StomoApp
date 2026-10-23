'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Download,
  AlertTriangle,
  GitMerge,
  Phone,
  Calendar,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatClinicDate } from '../../../lib/dateFormat';

export default function AdminPatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Duplicates state
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);

  // Patient detail modal
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetail, setPatientDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadPatients = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAdminPatients(search, 1, 50);
      setPatients(res.items || []);
    } catch (e) {
      console.error('Failed to load patients', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const csvData = await api.exportPatientsCsv(search);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bemorlar_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'CSV yuklab olishda xatolik yuz berdi');
    } finally {
      setIsExporting(false);
    }
  };

  const loadDuplicates = async () => {
    try {
      setIsLoadingDuplicates(true);
      setShowDuplicates(true);
      const groups = await api.getDuplicatePatients();
      setDuplicateGroups(groups || []);
    } catch (err: any) {
      alert(err?.message || 'Dublikatlarni tekshirishda xatolik yuz berdi');
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  const handleMerge = async (sourceId: string, targetId: string) => {
    if (!confirm('Ushbu bemor yozuvlarini birlashtirishga ishonchingiz komilmi?')) return;
    try {
      await api.mergePatients(sourceId, targetId);
      alert('Bemor yozuvlari muvaffaqiyatli birlashtirildi!');
      await loadDuplicates();
      await loadPatients();
    } catch (err: any) {
      alert(err?.message || 'Birlashtirishda xatolik yuz berdi');
    }
  };

  const openPatientDetail = async (id: string) => {
    setSelectedPatientId(id);
    try {
      setIsLoadingDetail(true);
      const detail = await api.getPatientDetail(id);
      setPatientDetail(detail);
    } catch (err: any) {
      alert(err?.message || 'Bemor ma\'lumotlarini yuklashda xatolik yuz berdi');
      setSelectedPatientId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Bemorlar bazasi</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bemor kontaktlari, qabul tarixi va dublikatlarni ko&apos;rib chiqish
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === 'OWNER' || user?.role === 'ADMIN' ? (
              <>
                <button
                  type="button"
                  onClick={loadDuplicates}
                  className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Dublikatlar tekshiruvi</span>
                </button>

                {user?.role === 'OWNER' && (
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportCsv}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-700" />
                    <span>{isExporting ? 'Yuklanmoqda...' : 'CSV Eksport'}</span>
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* Search Input */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism, familiya yoki telefon raqami bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : patients.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50">
              Bemorlar topilmadi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Bemor (F.I.SH)</th>
                    <th className="py-3.5 px-6">Telefon</th>
                    <th className="py-3.5 px-6">Qabullar soni</th>
                    <th className="py-3.5 px-6">Ro&apos;yxatdan o&apos;tgan</th>
                    <th className="py-3.5 px-6 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openPatientDetail(p.id)}
                      className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {p.fullName}
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-medium">
                        {p.phone}
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">
                          {p._count?.appointments ?? 0}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400">
                        {formatClinicDate(p.createdAt, 'uz')}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          className="text-teal-700 font-bold hover:underline"
                        >
                          Tarixni ko&apos;rish
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

      {/* Duplicate Review Modal */}
      {showDuplicates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  Bir xil telefon raqamli bemorlar dublikatlari
                </h3>
              </div>
              <button onClick={() => setShowDuplicates(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tizim bir telefon raqamidan foydalanadigan oila a&apos;zolarini (masalan, ota va bola) avtomatik ravishda birlashtirmaydi. Agar bu bir xil shaxs bo&apos;lsa, ma&apos;lumotlarni birlashtirishingiz mumkin.
            </p>

            {isLoadingDuplicates ? (
              <div className="p-10 text-center text-xs text-slate-400">Tekshirilmoqda...</div>
            ) : duplicateGroups.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
                Dublikat yozuvlar topilmadi. Barcha ma&apos;lumotlar toza.
              </div>
            ) : (
              <div className="space-y-6">
                {duplicateGroups.map((group, gIdx) => (
                  <div
                    key={gIdx}
                    className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Telefon: {group.phone}</span>
                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        {group.patients.length} ta yozuv
                      </span>
                    </div>

                    <div className="space-y-2">
                      {group.patients.map((pat: any, pIdx: number) => (
                        <div
                          key={pat.id}
                          className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-bold text-slate-900">{pat.fullName}</p>
                            <p className="text-[11px] text-slate-400">
                              Yaratilgan: {formatClinicDate(pat.createdAt, 'uz')} • {pat.appointments?.length || 0} qabul
                            </p>
                          </div>

                          {pIdx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMerge(pat.id, group.patients[0].id)}
                              className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-bold text-xs flex items-center gap-1"
                            >
                              <GitMerge className="w-3.5 h-3.5" />
                              <span>Asosiyga birlashtirish</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Patient Detail Modal */}
      {selectedPatientId && patientDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                  Bemor profili
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {patientDetail.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-teal-600" />
                  <span>{patientDetail.phone}</span>
                </p>
              </div>
              <button onClick={() => setSelectedPatientId(null)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Ruxsat etilgan qabullar tarixi
              </h4>

              {patientDetail.appointments?.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Qabullar tarixi mavjud emas.</p>
              ) : (
                <div className="space-y-2.5">
                  {patientDetail.appointments.map((appt: any) => {
                    const statusConfig: Record<string, { label: string; color: string }> = {
                      PENDING: { label: 'Kutilmoqda', color: 'bg-amber-100 text-amber-900 border-amber-300' },
                      CONFIRMED: { label: 'Tasdiqlangan', color: 'bg-teal-100 text-teal-900 border-teal-300' },
                      CHECKED_IN: { label: 'Klinikada', color: 'bg-blue-100 text-blue-900 border-blue-300' },
                      COMPLETED: { label: 'Yakunlangan', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
                      CANCELLED: { label: 'Bekor qilingan', color: 'bg-rose-100 text-rose-900 border-rose-300' },
                      NO_SHOW: { label: 'Kelmadi', color: 'bg-slate-200 text-slate-800 border-slate-300' },
                    };
                    const badge = statusConfig[appt.status] || {
                      label: appt.status,
                      color: 'bg-white border-slate-200 text-slate-700',
                    };

                    return (
                      <div
                        key={appt.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{appt.serviceName}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            {new Date(appt.startTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-bold border text-[10px] ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
