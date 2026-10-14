'use client';

import React, { useState, useEffect } from 'react';
import { PhoneCall, CheckCircle2, Clock, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      await api.updateLeadStatus(id, newStatus);
      await loadLeads();
    } catch (err: any) {
      alert(err?.message || 'Holatni yangilashda xatolik');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusColors: Record<string, string> = {
    NEW: 'bg-amber-100 text-amber-900 border-amber-300',
    CONTACTED: 'bg-blue-100 text-blue-900 border-blue-300',
    APPOINTMENT_BOOKED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    CONVERTED: 'bg-purple-100 text-purple-900 border-purple-300',
    ARCHIVED: 'bg-slate-100 text-slate-700 border-slate-300',
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
              <option value="APPOINTMENT_BOOKED">Qabulga yozildi</option>
              <option value="ARCHIVED">Arxiv</option>
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
                        {lead.notes && (
                          <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                            {lead.notes}
                          </span>
                        )}
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
                      <td className="py-4 px-6">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            statusColors[lead.status] || 'bg-slate-100'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {new Date(lead.createdAt).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
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
                              onClick={() => handleUpdateStatus(lead.id, 'APPOINTMENT_BOOKED')}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Qabulga yozildi
                            </button>
                          )}
                          {lead.status !== 'ARCHIVED' && (
                            <button
                              type="button"
                              disabled={updatingId === lead.id}
                              onClick={() => handleUpdateStatus(lead.id, 'ARCHIVED')}
                              className="px-2.5 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-[11px]"
                            >
                              Arxivlash
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
      </div>
    </AdminLayout>
  );
}
