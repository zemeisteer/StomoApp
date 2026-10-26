'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell,
  RefreshCw,
  Mail,
  MessageSquare,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Server,
  Smartphone,
  Bot,
  Info,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

interface NotificationItem {
  id: string;
  channel: 'SMS' | 'EMAIL' | 'TELEGRAM';
  templateKey: string;
  recipient: string;
  appointmentId?: string | null;
  appointment?: {
    id: string;
    startTime: string;
    serviceName: string;
    status: string;
    patientName?: string | null;
  } | null;
  scheduleRevision?: number | null;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'SIMULATED';
  attempts: number;
  maxAttempts: number;
  scheduledFor?: string | null;
  sentAt?: string | null;
  lockedAt?: string | null;
  lastError?: string | null;
  isSimulated: boolean;
  createdAt: string;
}

interface IntegrationStatus {
  email: {
    configured: boolean;
    provider: string;
    host?: string | null;
    port?: number | null;
    hasSender?: boolean;
    status: string;
    mode: 'real' | 'simulated';
  };
  sms: {
    configured: boolean;
    provider: string;
    status: string;
    mode: 'real' | 'simulated';
  };
  telegram: {
    configured: boolean;
    botConfigured: boolean;
    chatIdConfigured: boolean;
    status: string;
    mode: 'real' | 'simulated';
  };
}

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const isUz = language === 'uz';

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true);

  const loadIntegrations = useCallback(async () => {
    try {
      setIsLoadingIntegrations(true);
      const res = await api.getNotificationIntegrationStatus();
      setIntegrations(res);
    } catch (e: any) {
      console.error('Failed to load integration status', e);
    } finally {
      setIsLoadingIntegrations(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await api.getAdminNotifications(
        channelFilter || undefined,
        statusFilter || undefined,
        page,
        limit,
      );
      const items = res.items || [];
      const totalCount = res.total || 0;

      if (items.length === 0 && totalCount > 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
        return;
      }

      setNotifications(items);
      setTotal(totalCount);
    } catch (e: any) {
      console.error('Failed to load notifications', e);
      setErrorMessage(
        e?.message || (isUz ? 'Xabarnomalarni yuklashda xatolik' : 'Ошибка загрузки уведомлений'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [channelFilter, statusFilter, page, limit, isUz]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRetry = async (job: NotificationItem) => {
    try {
      setRetryingId(job.id);
      setErrorMessage(null);
      await api.retryAdminNotification(job.id);
      setSuccessMessage(
        isUz
          ? 'Xabarnoma qayta navbatga qo‘shildi'
          : 'Уведомление успешно поставлено в очередь на повтор',
      );
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadNotifications();
    } catch (err: any) {
      setErrorMessage(
        err?.message || (isUz ? 'Qayta yuborishda xatolik yuz berdi' : 'Ошибка при повторе'),
      );
    } finally {
      setRetryingId(null);
    }
  };

  const isRetryAllowed = (job: NotificationItem): boolean => {
    if (
      job.status === 'SENT' ||
      job.status === 'SIMULATED' ||
      job.status === 'CANCELLED'
    ) {
      return false;
    }
    if (job.status === 'PROCESSING') {
      const lockedTime = job.lockedAt ? new Date(job.lockedAt).getTime() : 0;
      const leaseDurationMs = 5 * 60 * 1000;
      // Active lease: retry forbidden
      if (Date.now() - lockedTime < leaseDurationMs) {
        return false;
      }
    }
    return true;
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const channelBadge = (channel: string) => {
    switch (channel) {
      case 'EMAIL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Mail className="w-3.5 h-3.5" />
            Email
          </span>
        );
      case 'SMS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Smartphone className="w-3.5 h-3.5" />
            SMS
          </span>
        );
      case 'TELEGRAM':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Bot className="w-3.5 h-3.5" />
            Telegram
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700">
            {channel}
          </span>
        );
    }
  };

  const statusBadge = (status: string, isSimulated: boolean) => {
    if (isSimulated || status === 'SIMULATED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <Info className="w-3 h-3" />
          {isUz ? 'Simulyatsiya' : 'Симуляция (Dev)'}
        </span>
      );
    }
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            {isUz ? 'Navbatda' : 'В очереди'}
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <RotateCcw className="w-3 h-3 animate-spin" />
            {isUz ? 'Yuborilmoqda' : 'Отправка'}
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            {isUz ? 'Yuborildi' : 'Отправлено'}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            {isUz ? 'Xatolik' : 'Ошибка'}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            {isUz ? 'Bekor qilingan' : 'Отменено'}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#152f34] flex items-center gap-2">
              <Bell className="w-6 h-6 text-[#167b78]" />
              {isUz ? 'Xabarnomalar va Yetkazish Holati' : 'Уведомления и статус доставки'}
            </h1>
            <p className="text-xs text-[#52696e] mt-1">
              {isUz
                ? 'Bemorlarga yuborilgan SMS, Email va Telegram xabarlari, integratsiya holati va xavfsiz qayta yuborish'
                : 'Отправка SMS, Email и Telegram уведомлений пациентам, статус шлюзов и безопасный повтор'}
            </p>
          </div>

          <button
            onClick={() => {
              loadIntegrations();
              loadNotifications();
            }}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#d8e5e2] text-[#152f34] rounded-xl hover:bg-[#f3f8f7] shadow-sm transition-all self-start sm:self-auto"
            title={isUz ? 'Yangilash' : 'Обновить'}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#167b78]' : ''}`} />
          </button>
        </div>

        {/* Integration Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Email Integration */}
          <div className="bg-white rounded-2xl border border-[#d8e5e2] p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#152f34]">Email (SMTP)</h3>
                  <span className="text-[10px] text-[#52696e]">
                    {integrations?.email.host ? `${integrations.email.host}:${integrations.email.port || 587}` : 'Nodemailer'}
                  </span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  integrations?.email.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {integrations?.email.configured
                  ? isUz ? 'Sozlangan' : 'Настроен'
                  : isUz ? 'Simulyatsiya (Dev)' : 'Симуляция (Dev)'}
              </span>
            </div>
            <p className="text-[11px] text-[#52696e]">
              {integrations?.email.configured
                ? isUz ? 'SMTP server orqali real xatlar yetkazilmoqda.' : 'Реальная отправка через SMTP сервер.'
                : isUz ? 'SMTP sozlamalari to‘liq emas, xatlar logda simulyatsiya qilinadi.' : 'SMTP не настроен, письма логируются в dev sink.'}
            </p>
          </div>

          {/* SMS Integration */}
          <div className="bg-white rounded-2xl border border-[#d8e5e2] p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#152f34]">SMS Gateway</h3>
                  <span className="text-[10px] text-[#52696e]">Eskiz / Provider</span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  integrations?.sms.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {integrations?.sms.configured
                  ? isUz ? 'Sozlangan' : 'Настроен'
                  : isUz ? 'Simulyatsiya (Dev)' : 'Симуляция (Dev)'}
              </span>
            </div>
            <p className="text-[11px] text-[#52696e]">
              {integrations?.sms.configured
                ? isUz ? 'SMS provayder orqali real SMS jo‘natilmoqda.' : 'Реальная отправка через SMS провайдер.'
                : isUz ? 'SMS_API_KEY sozlanmagan, SMS logda simulyatsiya qilinadi.' : 'SMS ключ не настроен, отправка симулируется.'}
            </p>
          </div>

          {/* Telegram Integration */}
          <div className="bg-white rounded-2xl border border-[#d8e5e2] p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#152f34]">Telegram Bot</h3>
                  <span className="text-[10px] text-[#52696e]">Staff Alerts</span>
                </div>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  integrations?.telegram.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {integrations?.telegram.configured
                  ? isUz ? 'Sozlangan' : 'Настроен'
                  : isUz ? 'Simulyatsiya (Dev)' : 'Симуляция (Dev)'}
              </span>
            </div>
            <p className="text-[11px] text-[#52696e]">
              {integrations?.telegram.configured
                ? isUz ? 'Xodimlar uchun yangi buyurtma bildirishnomalari faol.' : 'Оповещения для персонала активны.'
                : isUz ? 'TELEGRAM_BOT_TOKEN kiritilmagan, bildirishnomalar simulyatsiya qilinadi.' : 'Токен бота не настроен, уведомления симулируются.'}
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              {errorMessage}
            </span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {successMessage}
            </span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#d8e5e2] shadow-sm">
          {/* Channel Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: '', label: isUz ? 'Barcha kanallar' : 'Все каналы' },
              { id: 'SMS', label: 'SMS' },
              { id: 'EMAIL', label: 'Email' },
              { id: 'TELEGRAM', label: 'Telegram' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setChannelFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  channelFilter === tab.id
                    ? 'bg-[#167b78] text-white shadow-sm'
                    : 'bg-[#f3f8f7] text-[#52696e] hover:bg-[#e2eeee]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#52696e] font-medium whitespace-nowrap">
              {isUz ? 'Holat:' : 'Статус:'}
            </span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs font-semibold bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl px-3 py-1.5 text-[#152f34] focus:outline-none focus:ring-2 focus:ring-[#167b78]"
            >
              <option value="">{isUz ? 'Barchasi' : 'Все'}</option>
              <option value="PENDING">{isUz ? 'Navbatda (Pending)' : 'В очереди'}</option>
              <option value="SENT">{isUz ? 'Yetkazildi (Sent)' : 'Отправлено'}</option>
              <option value="SIMULATED">{isUz ? 'Simulyatsiya (Simulated)' : 'Симуляция'}</option>
              <option value="FAILED">{isUz ? 'Xatolik (Failed)' : 'Ошибка'}</option>
              <option value="CANCELLED">{isUz ? 'Bekor qilingan (Cancelled)' : 'Отменено'}</option>
            </select>
          </div>
        </div>

        {/* Notifications Table Card */}
        <div className="bg-white rounded-3xl border border-[#d8e5e2] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-[#52696e] text-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#167b78]" />
              <span>{isUz ? 'Xabarnomalar yuklanmoqda...' : 'Загрузка уведомлений...'}</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-16 text-center text-[#52696e] text-xs bg-[#f8fbfb]">
              {isUz ? 'Mos keluvchi xabarnomalar topilmadi.' : 'Нет уведомлений по выбранным фильтрам.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f3f8f7] border-b border-[#d8e5e2] text-[#52696e] font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">{isUz ? 'Kanal va Qabul qiluvchi' : 'Канал и получатель'}</th>
                    <th className="py-3.5 px-4">{isUz ? 'Shablon va Qabul' : 'Шаблон и прием'}</th>
                    <th className="py-3.5 px-4">{isUz ? 'Holat' : 'Статус'}</th>
                    <th className="py-3.5 px-4">{isUz ? 'Reja / Urinishlar' : 'Время / Попытки'}</th>
                    <th className="py-3.5 px-4">{isUz ? 'Xatolik / Sabab' : 'Ошибка / Причина'}</th>
                    <th className="py-3.5 px-4 text-right">{isUz ? 'Amallar' : 'Действия'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2eeee]">
                  {notifications.map((job) => {
                    const retryAllowed = isRetryAllowed(job);
                    const isRetrying = retryingId === job.id;

                    return (
                      <tr key={job.id} className="hover:bg-[#f8fbfb] transition-colors">
                        {/* Channel & Masked Recipient */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div>{channelBadge(job.channel)}</div>
                            <div className="font-mono text-xs font-bold text-[#152f34]">
                              {job.recipient}
                            </div>
                          </div>
                        </td>

                        {/* Template & Appointment */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className="font-mono text-[11px] font-semibold text-[#167b78] bg-[#e0f2ed] px-2 py-0.5 rounded-md inline-block">
                              {job.templateKey}
                            </span>
                            {job.appointment ? (
                              <div className="text-[11px] text-[#52696e]">
                                <Link
                                  href={`/admin/calendar?appointmentId=${job.appointment.id}`}
                                  className="text-[#167b78] hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  {job.appointment.patientName || job.appointment.serviceName}
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                                <div className="text-[10px] text-[#718e95]">
                                  {new Date(job.appointment.startTime).toLocaleString(
                                    isUz ? 'uz-UZ' : 'ru-RU',
                                    { dateStyle: 'short', timeStyle: 'short' },
                                  )}
                                  {job.scheduleRevision ? ` (rev: s${job.scheduleRevision})` : ''}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#718e95]">—</span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          {statusBadge(job.status, job.isSimulated)}
                        </td>

                        {/* Schedule & Attempts */}
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] text-[#152f34] space-y-0.5">
                            <div>
                              {job.scheduledFor
                                ? new Date(job.scheduledFor).toLocaleString(isUz ? 'uz-UZ' : 'ru-RU', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })
                                : '—'}
                            </div>
                            <div className="text-[10px] text-[#52696e]">
                              {isUz ? 'Urinishlar:' : 'Попытки:'}{' '}
                              <span className="font-bold text-[#152f34]">
                                {job.attempts} / {job.maxAttempts}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Sanitized Failure Reason */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          {job.lastError ? (
                            <span
                              className="font-mono text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded-md block truncate"
                              title={job.lastError}
                            >
                              {job.lastError}
                            </span>
                          ) : job.isSimulated ? (
                            <span className="text-[11px] text-purple-700 italic">
                              {isUz ? 'Sinov muhitida simulyatsiya qilindi' : 'Симуляция в sink'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#718e95]">—</span>
                          )}
                        </td>

                        {/* Actions (Safe Retry) */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleRetry(job)}
                            disabled={!retryAllowed || isRetrying}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              retryAllowed && !isRetrying
                                ? 'bg-[#167b78] hover:bg-[#116460] text-white shadow-sm'
                                : 'bg-[#f3f8f7] text-[#a4b8bb] cursor-not-allowed border border-[#d8e5e2]'
                            }`}
                            title={
                              retryAllowed
                                ? isUz ? 'Qayta navbatga qo‘yish' : 'Повторить отправку'
                                : isUz ? 'Qayta urinish mumkin emas' : 'Повтор недоступен'
                            }
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                            {isUz ? 'Qayta urinish' : 'Повтор'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="p-4 border-t border-[#d8e5e2] flex items-center justify-between bg-white text-xs text-[#52696e]">
              <div>
                {isUz ? 'Jami:' : 'Всего:'} <span className="font-bold text-[#152f34]">{total}</span>{' '}
                {isUz ? 'ta xabarnoma' : 'уведомлений'} ({isUz ? 'Sahifa:' : 'Страница:'} {page} /{' '}
                {totalPages})
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-[#d8e5e2] disabled:opacity-40 hover:bg-[#f3f8f7]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-[#152f34] px-2">{page}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-[#d8e5e2] disabled:opacity-40 hover:bg-[#f3f8f7]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
