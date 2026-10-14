'use client';

import React, { useState, useEffect } from 'react';
import { Stethoscope, Clock, DollarSign, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      const data = await api.getServices();
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

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Xizmatlar va narxlar boshqaruvi
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Stomatologik xizmatlar ro&apos;yxati, standart davomiylik va narxlar
            </p>
          </div>

          <button
            onClick={loadServices}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Yangilash"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Services Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Xizmat nomi (O&apos;zbekcha / Ruscha)</th>
                    <th className="py-3.5 px-6">Kategoriya</th>
                    <th className="py-3.5 px-6">Davomiyligi</th>
                    <th className="py-3.5 px-6">Boshlang&apos;ich narx</th>
                    <th className="py-3.5 px-6">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {s.nameUz}
                        {s.nameRu && (
                          <span className="block text-[11px] font-normal text-slate-500">
                            {s.nameRu}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold text-[10px]">
                          {s.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-medium">
                        {s.durationMinutes} daqiqa
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {(s.priceFrom / 100).toLocaleString('uz-UZ')} so&apos;m
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          FAOL
                        </span>
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
