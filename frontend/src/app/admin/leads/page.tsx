'use client';

import React, { useState, useEffect } from 'react';
import { PhoneCall, CheckCircle2, Clock, MessageSquare, AlertCircle, RefreshCw, Edit3 } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Note editing state
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState('CONTACTED');

  const loadLeads = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAdminLeads(statusFilter || undefined, 1, 50);
      setLeads(res.items || []);
    } catch (e) {
      console.error('Failed to load leads', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [statusFilter]);

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
              Qayta qo&apos;ng&apos;iroq murojaatlari (Lidlar)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Saytdan yuborilgan murojaatlar monitoringi va aloqa holatini boshqarish
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-medium focus:ring-2 focus:ring-teal-600"
            >
              <option value="">Barcha holatlar</option>
              <option value="NEW">Yangi (NEW)</option>
              <option value="CONTACTED">Bog&apos;lanildi (CONTACTED)</option>
              <option value="BOOKED">Qabulga yozildi (BOOKED)</option>
              <option value="CLOSED">Yopilgan (CLOSED)</option>
            </select>

            <button
              onClick={loadLeads}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {lead.fullName}
                      </td>
                      <td className="py-4 px-6">
                        <a
                          href={`tel:${lead.phone}`}
                          className="font-bold text-teal-700 hover:underline"
                        >
                          {lead.phone}
                        </a>
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        <span>{lead.preferredBranch || 'Istalgan'}</span>
                        {lead.preferredTime && (
                          <span className="block text-[11px] text-slate-400">
                            {lead.preferredTime}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600 max-w-xs">
                        <p className="line-clamp-2">{lead.message || '—'}</p>
                        {lead.internalNotes && (
                          <p className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded mt-1">
                            Qayd: {lead.internalNotes}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            statusColors[lead.status] || 'bg-slate-100'
                          }`}
                        >
                          {statusLabels[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {new Date(lead.createdAt).toLocaleString()}
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
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px]"
                            title="Tahrirlash / Qayd qo'shish"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {lead.status === 'NEW' && (
                            <button
                              type="button"
                              disabled={updatingId === lead.id}
                              onClick={() => handleUpdateStatus(lead.id, 'CONTACTED')}
                              className="px-2.5 py-1 bg-blue-50 text-blue-800 hover:bg-blue-600 hover:text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Bog&apos;lanildi
                            </button>
                          )}
                          {lead.status === 'CONTACTED' && (
                            <button
                              type="button"
                              disabled={updatingId === lead.id}
                              onClick={() => handleUpdateStatus(lead.id, 'BOOKED')}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Qabulga yozildi
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
                Lid holati va xodim qaydi: {selectedLead.fullName}
              </h3>
              <p className="text-xs text-slate-500">
                Telefon: <span className="font-semibold text-teal-700">{selectedLead.phone}</span>
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Murojaat holati
                </label>
                <select
                  value={noteStatus}
                  onChange={(e) => setNoteStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                >
                  <option value="NEW">Yangi (NEW)</option>
                  <option value="CONTACTED">Bog&apos;lanildi (CONTACTED)</option>
                  <option value="BOOKED">Qabulga yozildi (BOOKED)</option>
                  <option value="CLOSED">Yopildi (CLOSED)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ichki xodim qaydlari (Internal Notes)
                </label>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Mijoz bilan suhbat natijasi yoki istaklar..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
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
