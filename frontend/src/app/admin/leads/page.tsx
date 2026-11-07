'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneCall, CheckCircle2, Clock, MessageSquare, AlertCircle, RefreshCw, Edit3, Search } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { CustomSelect } from '../../../components/CustomSelect';
import Link from 'next/link';

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

  const loadLeads = useCallback(async () => {
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
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLeads();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadLeads]);

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
    CLOSED: 'bg-canvas text-ink border-line-strong',
  };

  const statusLabels: Record<string, string> = {
    NEW: 'Yangi',
    CONTACTED: 'Bog\'lanildi',
    BOOKED: 'Qabulga yozildi',
    CLOSED: 'Yopildi',
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'RECEPTION']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">
              Qayta qo&apos;ng&apos;iroq murojaatlari
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">
              Saytdagi &quot;Qayta qo&apos;ng&apos;iroq&quot; formasidan avtomatik tushadi — qo&apos;lda yozish shart emas. Telefon raqami
              bo&apos;yicha bemorlar bazasi bilan avtomatik solishtiriladi: allaqachon qabulga yozilgan bo&apos;lsa, yashil belgi chiqadi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLeads}
              className="p-2.5 bg-white border border-line text-ink rounded-xl hover:bg-canvas shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-line shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mijoz ismi yoki telefon raqami bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
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
        <div className="bg-white rounded-3xl border border-line shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-ink-subtle text-sm">Yuklanmoqda...</div>
          ) : leads.length === 0 ? (
            <div className="p-16 text-center text-ink-muted text-sm bg-canvas">
              Murojaatlar topilmadi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas border-b border-line text-ink-subtle font-bold uppercase tracking-wider">
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
                <tbody className="divide-y divide-line">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-4 px-6 font-bold text-ink">
                        {lead.fullName}
                        {lead.match?.upcomingAppointment ? (
                          <span className="mt-1 block w-max rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Qabulga yozilgan:{' '}
                            {new Date(lead.match.upcomingAppointment.startTime).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : lead.match ? (
                          <Link
                            href={`/admin/patients/${lead.match.patientId}`}
                            className="mt-1 block w-max rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
                          >
                            Bazada bor bemor →
                          </Link>
                        ) : (
                          <span className="mt-1 block w-max rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Yangi odam
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-teal-800 font-semibold font-mono">
                        {lead.phone}
                      </td>
                      <td className="py-4 px-6 text-ink-muted">
                        <div className="font-medium text-ink">
                          {lead.preferredBranch || 'Ixtiyoriy filial'}
                        </div>
                        <div className="text-[11px] text-ink-subtle mt-0.5">
                          {lead.preferredTime || 'Tez orada'}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-ink-muted max-w-xs">
                        <p className="line-clamp-2 italic text-ink">
                          &quot;{lead.notes || lead.message || 'Izoh qoldirilmagan'}&quot;
                        </p>
                        {lead.internalNotes && (
                          <div className="mt-1 p-1.5 bg-canvas rounded-lg text-[10px] text-ink border border-line">
                            <strong>Qayd:</strong> {lead.internalNotes}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            statusColors[lead.status] || 'bg-canvas text-ink'
                          }`}
                        >
                          {statusLabels[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-ink-subtle text-[11px]">
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
                            className="p-1.5 text-ink-muted hover:text-teal-700 hover:bg-canvas rounded-lg transition-colors"
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
                              className="px-2.5 py-1 text-ink-subtle hover:text-ink hover:bg-canvas rounded-lg text-[11px]"
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
              <h3 className="text-base font-bold text-ink">
                Murojaat holati va xodim qaydi: {selectedLead.fullName}
              </h3>
              <p className="text-xs text-ink-muted">
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
                <label className="block text-xs font-semibold text-ink mb-1">
                  Ichki xodim qaydlari
                </label>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Mijoz bilan suhbat natijasi yoki istaklar..."
                  className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-canvas rounded-xl"
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
