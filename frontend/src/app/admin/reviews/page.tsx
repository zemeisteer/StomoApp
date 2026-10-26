'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Star,
  CheckCircle,
  XCircle,
  Trash2,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
  Eye,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileEdit,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

export default function AdminReviewsPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const isUz = language === 'uz';

  const [reviews, setReviews] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Note Modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [activeReview, setActiveReview] = useState<any | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [pendingTargetStatus, setPendingTargetStatus] = useState<string | null>(null);

  // Delete Confirm Modal state
  const [deleteConfirmReview, setDeleteConfirmReview] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canDelete = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await api.getAdminReviews(statusFilter || undefined, page, limit);
      const items = res.items || [];
      const totalCount = res.total || 0;

      // If current page is out of bounds (e.g. after deleting or moderating all items on page), navigate back
      if (items.length === 0 && totalCount > 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
        return;
      }

      setReviews(items);
      setTotal(totalCount);
    } catch (e: any) {
      console.error('Failed to load reviews', e);
      setErrorMessage(e?.message || (isUz ? "Sharhlarni yuklashda xatolik yuz berdi" : "Ошибка загрузки отзывов"));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page, limit, isUz]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleOpenNoteModal = (review: any, targetStatus: string) => {
    setActiveReview(review);
    setAdminNote(review.adminNote || '');
    setPendingTargetStatus(targetStatus);
    setNoteModalOpen(true);
  };

  const handleApplyModeration = async () => {
    if (!activeReview || !pendingTargetStatus) return;
    try {
      setUpdatingId(activeReview.id);
      setErrorMessage(null);
      await api.updateReviewStatus(activeReview.id, pendingTargetStatus, adminNote.trim() || undefined);
      setFeedbackMessage(
        isUz ? "Sharh holati muvaffaqiyatli o'zgartirildi" : "Статус отзыва успешно обновлен",
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
      setNoteModalOpen(false);
      setActiveReview(null);
      setPendingTargetStatus(null);
      if (statusFilter && reviews.length === 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        await loadReviews();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isUz ? "Holatni saqlashda xatolik" : "Ошибка обновления статуса"));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDirectStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      setErrorMessage(null);
      await api.updateReviewStatus(id, newStatus);
      setFeedbackMessage(
        isUz ? "Sharh holati muvaffaqiyatli o'zgartirildi" : "Статус отзыва успешно обновлен",
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
      if (statusFilter && reviews.length === 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        await loadReviews();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isUz ? "Holatni saqlashda xatolik" : "Ошибка обновления статуса"));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmReview) return;
    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await api.deleteReview(deleteConfirmReview.id);
      setFeedbackMessage(
        isUz ? "Sharh muvaffaqiyatli o'chirildi" : "Отзыв успешно удален",
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
      setDeleteConfirmReview(null);
      // Adjust page if this was the last item on current page
      if (reviews.length === 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      } else {
        await loadReviews();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isUz ? "O'chirishda xatolik yuz berdi" : "Ошибка при удалении"));
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            {isUz ? 'Kutilmoqda' : 'Ожидает'}
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            {isUz ? 'Tasdiqlangan' : 'Одобрено'}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
            {isUz ? 'Rad etilgan' : 'Отклонено'}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'EDITOR']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#152f34]">
              {isUz ? 'Fikrlarni moderatsiya qilish' : 'Модерация отзывов'}
            </h1>
            <p className="text-xs text-[#52696e] mt-1">
              {isUz
                ? 'Bemorlar qoldirgan sharhlarni tasdiqlash, rad etish va boshqarish'
                : 'Проверка, подтверждение и отклонение отзывов пациентов'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadReviews()}
              disabled={isLoading}
              className="p-2.5 bg-white border border-[#d8e5e2] text-[#152f34] rounded-xl hover:bg-[#f3f8f7] shadow-sm transition-all"
              title={isUz ? 'Yangilash' : 'Обновить'}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#167b78]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              {feedbackMessage}
            </span>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filters bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: '', label: isUz ? 'Barchasi' : 'Все', count: statusFilter === '' ? total : null },
            { id: 'PENDING', label: isUz ? 'Kutilayotganlar' : 'Ожидают' },
            { id: 'APPROVED', label: isUz ? 'Tasdiqlanganlar' : 'Одобрены' },
            { id: 'REJECTED', label: isUz ? 'Rad etilganlar' : 'Отклонены' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#167b78] text-white shadow-sm'
                  : 'bg-white text-[#52696e] hover:bg-[#f3f8f7] border border-[#d8e5e2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Reviews List */}
        <div className="bg-white rounded-3xl border border-[#d8e5e2] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-[#52696e] text-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#167b78]" />
              <span>{isUz ? 'Yuklanmoqda...' : 'Загрузка...'}</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="p-16 text-center text-[#52696e] text-xs bg-[#f8fbfb]">
              <MessageSquare className="w-8 h-8 text-[#98b3ad] mx-auto mb-2 opacity-50" />
              <p className="font-bold text-[#152f34]">
                {isUz ? 'Sharhlar topilmadi' : 'Отзывы не найдены'}
              </p>
              <p className="text-[11px] text-[#52696e] mt-0.5">
                {isUz
                  ? "Tanlangan filtr bo'yicha hech qanday fikr mavjud emas"
                  : 'По выбранному фильтру нет доступных отзывов'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#e2eeee]">
              {reviews.map((r) => {
                const isItemUpdating = updatingId === r.id;
                return (
                  <div key={r.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#fafdfc] transition-colors">
                    {/* Left content */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-bold text-sm text-[#152f34]">{r.authorName}</span>
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < (r.rating || 5) ? 'fill-current' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        {statusBadge(r.status)}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            r.consentDisplayName
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.consentDisplayName
                            ? isUz
                              ? "Ism ko'rsatiladi"
                              : 'Имя отображается'
                            : isUz
                            ? "Anonim (Bemor)"
                            : 'Анонимно (Пациент)'}
                        </span>
                      </div>

                      <p className="text-xs text-[#2b474d] leading-relaxed italic bg-[#f8fbfb] p-3 rounded-xl border border-[#e8f1f0]">
                        &ldquo;{r.text}&rdquo;
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#52696e]">
                        <span>
                          {isUz ? 'Sana: ' : 'Дата: '}
                          {new Date(r.createdAt).toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')}
                        </span>
                        {r.adminNote && (
                          <span className="text-[#167b78] font-medium bg-[#e0f2ed] px-2 py-0.5 rounded">
                            {isUz ? 'Moderator izohi: ' : 'Примечание: '}
                            {r.adminNote}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                      {/* Approve button */}
                      {r.status !== 'APPROVED' && (
                        <button
                          type="button"
                          disabled={isItemUpdating}
                          onClick={() => handleOpenNoteModal(r, 'APPROVED')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{isUz ? 'Tasdiqlash' : 'Одобрить'}</span>
                        </button>
                      )}

                      {/* Reject button */}
                      {r.status !== 'REJECTED' && (
                        <button
                          type="button"
                          disabled={isItemUpdating}
                          onClick={() => handleOpenNoteModal(r, 'REJECTED')}
                          className="px-3.5 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{isUz ? 'Rad etish' : 'Отклонить'}</span>
                        </button>
                      )}

                      {/* Note edit button */}
                      <button
                        type="button"
                        disabled={isItemUpdating}
                        onClick={() => handleOpenNoteModal(r, r.status)}
                        className="p-2 text-[#52696e] hover:text-[#152f34] hover:bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] transition-all"
                        title={isUz ? 'Izoh qo‘shish / o‘zgartirish' : 'Добавить / изменить примечание'}
                      >
                        <FileEdit className="w-4 h-4" />
                      </button>

                      {/* Permanent Delete (OWNER / ADMIN only) */}
                      {canDelete && (
                        <button
                          type="button"
                          disabled={isItemUpdating}
                          onClick={() => setDeleteConfirmReview(r)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all"
                          title={isUz ? 'Butunlay o‘chirish' : 'Удалить навсегда'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-4 bg-[#f8fbfb] border-t border-[#d8e5e2] flex items-center justify-between text-xs text-[#52696e]">
              <span>
                {isUz
                  ? `Jami ${total} ta sharh (Sahifa ${page} / ${totalPages})`
                  : `Всего ${total} отзывов (Стр. ${page} из ${totalPages})`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage(page - 1)}
                  className="p-2 rounded-lg border border-[#d8e5e2] bg-white disabled:opacity-40 hover:bg-[#f3f8f7] transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage(page + 1)}
                  className="p-2 rounded-lg border border-[#d8e5e2] bg-white disabled:opacity-40 hover:bg-[#f3f8f7] transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Moderation Note Modal */}
      {noteModalOpen && activeReview && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#d8e5e2] space-y-4">
            <div className="flex items-center justify-between border-b border-[#e2eeee] pb-3">
              <h2 className="text-base font-bold text-[#152f34]">
                {pendingTargetStatus === 'APPROVED'
                  ? isUz
                    ? 'Sharhni tasdiqlash'
                    : 'Одобрение отзыва'
                  : pendingTargetStatus === 'REJECTED'
                  ? isUz
                    ? 'Sharhni rad etish'
                    : 'Отклонение отзыва'
                  : isUz
                  ? 'Moderator izohi'
                  : 'Примечание модератора'}
              </h2>
              <button
                onClick={() => setNoteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-[#52696e] space-y-1">
              <p>
                <strong className="text-[#152f34]">{activeReview.authorName}</strong> ({activeReview.rating} ★)
              </p>
              <p className="italic line-clamp-2">&ldquo;{activeReview.text}&rdquo;</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#152f34]">
                {isUz ? 'Ichki moderator izohi (ixtiyoriy)' : 'Внутреннее примечание модератора (необязательно)'}
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder={
                  isUz
                    ? 'Rad etish sababi yoki boshqa xodimlar uchun eslatma...'
                    : 'Причина отклонения или заметка для сотрудников...'
                }
                className="w-full text-xs p-3 rounded-xl border border-[#d8e5e2] focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-[#f8fbfb]"
              />
              <span className="text-[10px] text-slate-400 block text-right">
                {adminNote.length} / 500
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2eeee]">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#52696e] hover:bg-[#f3f8f7] rounded-xl transition-all"
              >
                {isUz ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                type="button"
                disabled={updatingId !== null}
                onClick={handleApplyModeration}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all ${
                  pendingTargetStatus === 'REJECTED'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-[#167b78] hover:bg-[#125856]'
                }`}
              >
                {updatingId !== null
                  ? isUz
                    ? 'Saqlanmoqda...'
                    : 'Сохранение...'
                  : isUz
                  ? 'Saqlash'
                  : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmReview && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#152f34]">
                  {isUz ? 'Sharhni butunlay o‘chirish' : 'Удалить отзыв навсегда'}
                </h2>
                <p className="text-[11px] text-rose-600">
                  {isUz ? 'Ushbu amalni bekor qilib bo‘lmaydi!' : 'Это действие нельзя отменить!'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 rounded-2xl border border-rose-100 text-xs text-[#2b474d] space-y-1">
              <p>
                <strong>{deleteConfirmReview.authorName}</strong> ({deleteConfirmReview.rating} ★)
              </p>
              <p className="italic line-clamp-2">&ldquo;{deleteConfirmReview.text}&rdquo;</p>
            </div>

            <p className="text-xs text-[#52696e]">
              {isUz
                ? 'Sharh maʼlumotlar bazasidan butunlay yo‘qotiladi va audit jurnali qayd etiladi. Faqat rad etish kerak bo‘lsa, "Rad etish" tugmasidan foydalaning.'
                : 'Отзыв будет полностью удален из базы данных с записью в аудит. Если нужно просто скрыть отзыв, используйте статус "Отклонить".'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2eeee]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmReview(null)}
                className="px-4 py-2 text-xs font-bold text-[#52696e] hover:bg-[#f3f8f7] rounded-xl transition-all"
              >
                {isUz ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-all"
              >
                {isDeleting
                  ? isUz
                    ? 'O‘chirilmoqda...'
                    : 'Удаление...'
                  : isUz
                  ? 'Ha, butunlay o‘chirilsin'
                  : 'Да, удалить навсегда'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
