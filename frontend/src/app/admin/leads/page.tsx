'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PhoneCall, CheckCircle2, Clock, MessageSquare, AlertCircle, RefreshCw, Edit3, Search } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { CustomSelect } from '../../../components/CustomSelect';

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Note editing state
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState('CONTACTED');

  const reqIdRef = useRef(0);

  const loadLeads = async () => {
    const curReq = ++reqIdRef.current;
    try {
      setIsLoading(true);
      const res = await api.getAdminLeads(statusFilter || undefined, 1, 50, search || undefined);
      if (reqIdRef.current === curReq) {
        setLeads(res.items || []);
      }
    } catch (e) {
      if (reqIdRef.current === curReq) {
        console.error('Failed to load leads', e);
      }
    } finally {
      if (reqIdRef.current === curReq) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLeads();
    }, 250);
    return () => clearTimeout(timer);
  }, [statusFilter, search]);

  const handleUpdateStatus = async (id: string, newStatus: string, notes?: string) => {
    try {
      setUpdatingId(id);
      await api.updateLeadStatus(id, newStatus, notes);
      await loadLeads();
      if (selectedLead?.id === id) {
        setSelectedLead(null);
      }
    } catch (err: any) {
      alert(err?.message || 'Holatni yangilashda xatolik');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusColors: Record<string, string> = {
    NEW: 'bg-amber-100 text-amber-900 border-amber-300',
    CONTACTED: 'bg-blue-100 text-blue-900 border-blue-300',
    BOOKED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    CLOSED: 'bg-slate-100 text-slate-700 border-slate-300',
  };

  const statusLabels: Record<string, string> = {
    NEW: 'Yangi',
    CONTACTED: 'Bog\'lanildi',
    BOOKED: 'Qabulga yozildi',
    CLOSED: 'Yopildi',
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Qayta qo&apos;ng&apos;iroq murojaatlari
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Saytdan yuborilgan murojaatlar monitoringi va aloqa holatini boshqarish
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLeads}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mijoz ismi yoki telefon raqami bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
            />
          </div>

          <div className="w-full sm:w-56">
            <CustomSelect
              options={[
                { value: '', label: 'Barcha holatlar' },
                { value: 'NEW', label: 'Yangi', badge: 'Yangi' },
                { value: 'CONTACTED', label: 'Bog‘lanildi' },
                { value: 'BOOKED', label: 'Qabulga yozildi' },
                { value: 'CLOSED', label: 'Yopilgan' },
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              placeholder="Barcha holatlar"
            />
          </div>
        </div>

        {/* Leads Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : leads.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50">
              Murojaatlar topilmadi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Mijoz</th>
                    <th className="py-3.5 px-6">Telefon</th>
                    <th className="py-3.5 px-6">Filial / Vaqt</th>
                    <th className="py-3.5 px-6">Izoh / Murojaat</th>
                    <th className="py-3.5 px-6">Holat</th>
                    <th className="py-3.5 px-6">Kelgan sana</th>
                    <th className="py-3.5 px-6 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {lead.fullName}
                      </td>
                      <td className="py-4 px-6 text-teal-800 font-semibold font-mono">
                        {lead.phone}
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        <div className="font-medium text-slate-800">
                          {lead.preferredBranch || 'Ixtiyoriy filial'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {lead.preferredTime || 'Tez orada'}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-600 max-w-xs">
                        <p className="line-clamp-2 italic text-slate-700">
                          &quot;{lead.notes || lead.message || 'Izoh qoldirilmagan'}&quot;
                        </p>
                        {lead.internalNotes && (
                          <div className="mt-1 p-1.5 bg-slate-100 rounded-lg text-[10px] text-slate-700 border border-slate-200">
                            <strong>Qayd:</strong> {lead.internalNotes}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            statusColors[lead.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {statusLabels[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {new Date(lead.createdAt).toLocaleString('uz-UZ', {
                          timeZone: 'Asia/Tashkent',
                        })}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLead(lead);
                              setNoteText(lead.internalNotes || '');
                              setNoteStatus(lead.status);
                            }}
                            className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Tahrirlash va izoh"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {lead.status === 'NEW' && (
                            <button
                              type="button"
                              disabled={updatingId === lead.id}
                              onClick={() => handleUpdateStatus(lead.id, 'CONTACTED')}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-bold transition-colors"
                            >
                              Bog&apos;lanildi
                            </button>
                          )}

                          {lead.status !== 'CLOSED' && (
                            <button
                              type="button"
                              disabled={updatingId === lead.id}
                              onClick={() => handleUpdateStatus(lead.id, 'CLOSED')}
                              className="px-2.5 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-[11px]"
                            >
                              Yopish
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Note & Status Modal */}
        {selectedLead && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Murojaat holati va xodim qaydi: {selectedLead.fullName}
              </h3>
              <p className="text-xs text-slate-500">
                Telefon: <span className="font-semibold text-teal-700">{selectedLead.phone}</span>
              </p>

              <div>
                <CustomSelect
                  label="Murojaat holati"
                  options={[
                    { value: 'NEW', label: 'Yangi', badge: 'Yangi' },
                    { value: 'CONTACTED', label: 'Bog‘lanildi' },
                    { value: 'BOOKED', label: 'Qabulga yozildi' },
                    { value: 'CLOSED', label: 'Yopildi' },
                  ]}
                  value={noteStatus}
                  onChange={(val) => setNoteStatus(val)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ichki xodim qaydlari
                </label>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Mijoz bilan suhbat natijasi yoki istaklar..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={updatingId === selectedLead.id}
                  onClick={() => handleUpdateStatus(selectedLead.id, noteStatus, noteText)}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md"
                >
                  Saqlash
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
