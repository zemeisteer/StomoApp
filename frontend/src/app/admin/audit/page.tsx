'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Clock, User, Terminal } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAuditLogs(1, 50);
      setLogs(res.items || []);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Xavfsizlik va harakatlar jurnali (Audit Log)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Xodimlar va administratorlar tomonidan amalga oshirilgan muhim operatsiyalar tarixi
            </p>
          </div>

          <button
            onClick={loadLogs}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Yangilash"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : logs.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50">
              Hozircha audit yozuvlari mavjud emas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Amal</th>
                    <th className="py-3.5 px-6">Foydalanuvchi</th>
                    <th className="py-3.5 px-6">Resurs</th>
                    <th className="py-3.5 px-6">IP Manzil</th>
                    <th className="py-3.5 px-6">Vaqt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-700 font-medium">
                        {log.userId ? log.userId.slice(0, 10) + '...' : 'Tizim'}
                      </td>
                      <td className="py-4 px-6 text-slate-500">
                        {log.entityType ? `${log.entityType} (${log.entityId || ''})` : '—'}
                      </td>
                      <td className="py-4 px-6 font-mono text-[11px] text-slate-400">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                      <td className="py-4 px-6 text-slate-500">
                        {new Date(log.createdAt).toLocaleString()}
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
