'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, CheckCircle, XCircle, Archive, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAdminReviews(statusFilter || undefined, 1, 50);
      setReviews(res.items || []);
    } catch (e) {
      console.error('Failed to load reviews', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [statusFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      await api.updateReviewStatus(id, newStatus);
      await loadReviews();
    } catch (err: any) {
      alert(err?.message || 'Holatni o\'zgartirishda xatolik');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900 border-amber-300',
    APPROVED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    REJECTED: 'bg-rose-100 text-rose-900 border-rose-300',
    ARCHIVED: 'bg-slate-100 text-slate-700 border-slate-300',
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'EDITOR']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Fikrlarni moderatsiya qilish
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bemorlar qoldirgan sharhlarni tasdiqlash, rad etish yoki arxivlash
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-medium focus:ring-2 focus:ring-teal-600"
            >
              <option value="">Barcha sharhlar</option>
              <option value="PENDING">Kutilmoqda (PENDING)</option>
              <option value="APPROVED">Tasdiqlangan (APPROVED)</option>
              <option value="REJECTED">Rad etilgan (REJECTED)</option>
            </select>

            <button
              onClick={loadReviews}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Reviews List */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : reviews.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl">
              Sharhlar topilmadi.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reviews.map((r) => (
                <div key={r.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-sm text-slate-900">{r.authorName}</span>
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {[...Array(r.rating || 5)].map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-current" />
                        ))}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          statusColors[r.status] || 'bg-slate-100'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      &ldquo;{r.text}&rdquo;
                    </p>

                    <p className="text-[11px] text-slate-400">
                      Sana: {new Date(r.createdAt).toLocaleString()} • Ism ko&apos;rsatishga rozilik:{' '}
                      <strong className={r.consentDisplayName ? 'text-emerald-600' : 'text-slate-500'}>
                        {r.consentDisplayName ? 'Ha' : 'Yo\'q (Bemor)'}
                      </strong>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={updatingId === r.id}
                        onClick={() => handleStatusChange(r.id, 'APPROVED')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Tasdiqlash</span>
                      </button>
                    )}

                    {r.status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={updatingId === r.id}
                        onClick={() => handleStatusChange(r.id, 'REJECTED')}
                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rad etish</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
