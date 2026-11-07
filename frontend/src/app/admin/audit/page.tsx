'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';

type Lang = 'uz' | 'ru';

/** Human-readable names for audit action codes. Unknown codes fall back to the raw code. */
const ACTIONS: Record<string, [string, string]> = {
  'appointment.status_confirmed': ['Qabul tasdiqlandi', 'Приём подтверждён'],
  'appointment.status_checked_in': ['Bemor klinikaga keldi', 'Пациент пришёл'],
  'appointment.status_completed': ['Qabul yakunlandi', 'Приём завершён'],
  'appointment.status_cancelled': ['Qabul bekor qilindi', 'Приём отменён'],
  'appointment.status_no_show': ['Bemor kelmadi', 'Пациент не пришёл'],
  'appointment.status_expired': ['Qabul muddati o‘tdi', 'Заявка истекла'],
  'appointment.treatment_started': ['Muolaja boshlandi', 'Лечение начато'],
  'appointment.rescheduled': ['Qabul ko‘chirildi', 'Приём перенесён'],
  'appointment.duration_override': ['Qabul davomiyligi o‘zgartirildi', 'Изменена длительность приёма'],
  'billing.invoice_created': ['Hisob yaratildi', 'Создан счёт'],
  'billing.payment_recorded': ['To‘lov qabul qilindi', 'Принята оплата'],
  'billing.payment_refunded': ['To‘lov qaytarildi', 'Оплата возвращена'],
  'billing.online_payment_performed': ['Onlayn to‘lov tushdi', 'Поступила онлайн-оплата'],
  'billing.online_payment_refunded': ['Onlayn to‘lov qaytarildi', 'Онлайн-оплата возвращена'],
  'cashier.shift_opened': ['Kassa smenasi ochildi', 'Смена кассы открыта'],
  'cashier.shift_closed': ['Kassa smenasi yopildi', 'Смена кассы закрыта'],
  'clinical.odontogram_updated': ['Tish kartasi yangilandi', 'Обновлена зубная карта'],
  'clinical.plan_created': ['Davolash rejasi tuzildi', 'Создан план лечения'],
  'clinical.plan_presented': ['Reja bemorga ko‘rsatildi', 'План показан пациенту'],
  'clinical.plan_accepted': ['Bemor rejani qabul qildi', 'Пациент принял план'],
  'clinical.plan_cancelled': ['Reja bekor qilindi', 'План отменён'],
  'clinical.plan_item_status_changed': ['Reja bandi holati o‘zgardi', 'Изменён статус пункта плана'],
  'clinical.treatment_plan_created': ['Davolash rejasi tuzildi', 'Создан план лечения'],
  'clinical.treatment_plan_status_changed': ['Reja holati o‘zgardi', 'Изменён статус плана'],
  'commission.updated': ['Shifokor foizi o‘zgartirildi', 'Изменён процент врача'],
  'doctor.archive': ['Shifokor arxivlandi', 'Врач в архиве'],
  'doctor.delete': ['Shifokor o‘chirildi', 'Врач удалён'],
  'branch.deactivate': ['Filial o‘chirib qo‘yildi', 'Филиал отключён'],
  'branch.delete': ['Filial o‘chirildi', 'Филиал удалён'],
  'engagement.settings_updated': ['Eslatma sozlamalari o‘zgardi', 'Изменены настройки напоминаний'],
  'engagement.recall_sent': ['Ko‘rikka chaqiruv yuborildi', 'Отправлено приглашение на осмотр'],
  'engagement.recall_contacted': ['Bemor bilan bog‘lanildi', 'С пациентом связались'],
  'inventory.item_created': ['Omborga mahsulot qo‘shildi', 'Добавлен товар на склад'],
  'inventory.item_updated': ['Ombor mahsuloti o‘zgardi', 'Изменён товар склада'],
  'inventory.movement_recorded': ['Ombor kirim/chiqimi', 'Движение по складу'],
  'notification.retried': ['Xabar qayta yuborildi', 'Уведомление отправлено повторно'],
  'review.moderated': ['Sharh tekshirildi', 'Отзыв проверен'],
  'review.deleted': ['Sharh o‘chirildi', 'Отзыв удалён'],
  'staff.login': ['Tizimga kirdi', 'Вход в систему'],
  'staff.logout': ['Tizimdan chiqdi', 'Выход из системы'],
  'staff.sessions_invalidated': ['Barcha seanslar yopildi', 'Все сеансы закрыты'],
  'security.token_replay_detected': ['Shubhali kirish urinishi', 'Подозрительная попытка входа'],
  'service_item.legacy_reconciled': ['Eski yozuv tuzatildi', 'Исправлена старая запись'],
};

const GROUPS: Array<{ key: string; uz: string; ru: string }> = [
  { key: '', uz: 'Hammasi', ru: 'Все' },
  { key: 'appointment', uz: 'Qabullar', ru: 'Приёмы' },
  { key: 'billing', uz: 'To‘lovlar', ru: 'Оплаты' },
  { key: 'cashier', uz: 'Kassa', ru: 'Касса' },
  { key: 'clinical', uz: 'Davolash', ru: 'Лечение' },
  { key: 'staff', uz: 'Kirish', ru: 'Входы' },
];

const tone = (action: string) =>
  action.startsWith('security') || action.endsWith('delete') || action.endsWith('deleted')
    ? 'bg-rose-50 text-rose-800'
    : action.startsWith('billing') || action.startsWith('cashier')
      ? 'bg-emerald-50 text-emerald-800'
      : 'bg-canvas text-ink';

export default function AdminAuditPage() {
  const { language } = useI18n();
  const lang: Lang = language === 'ru' ? 'ru' : 'uz';
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState('');

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAuditLogs(1, 100);
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

  const visible = group ? logs.filter((l) => String(l.action).startsWith(group + '.')) : logs;
  const label = (a: string) => {
    const hit = ACTIONS[a];
    return hit ? (lang === 'ru' ? hit[1] : hit[0]) : a;
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">{L('Harakatlar jurnali', 'Журнал действий')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              {L(
                'Kim, qachon, nima qilganini avtomatik yozib boradi: to‘lov qabul qilish, qaytarish, qabulni bekor qilish, kirish va h.k. Pul yoki ma’lumot bo‘yicha savol tug‘ilsa — shu yerdan tekshirasiz. Hech narsa kiritish shart emas.',
                'Автоматически записывает, кто, когда и что сделал: оплаты, возвраты, отмены, входы и т.д. Если возник вопрос по деньгам или данным — проверяете здесь. Ничего вводить не нужно.',
              )}
            </p>
          </div>
          <button
            onClick={loadLogs}
            className="shrink-0 rounded-xl border border-line bg-white p-2.5 text-ink shadow-sm hover:bg-canvas"
            title={L('Yangilash', 'Обновить')}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                group === g.key ? 'bg-ink text-white' : 'border border-line bg-white text-ink-muted hover:text-ink'
              }`}
            >
              {lang === 'ru' ? g.ru : g.uz}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
          {isLoading ? (
            <div className="p-16 text-center text-sm text-ink-subtle">{L('Yuklanmoqda...', 'Загрузка...')}</div>
          ) : visible.length === 0 ? (
            <div className="bg-canvas p-16 text-center text-sm text-ink-muted">{L('Yozuvlar yo‘q.', 'Записей нет.')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-6 py-3.5">{L('Harakat', 'Действие')}</th>
                    <th className="px-6 py-3.5">{L('Kim', 'Кто')}</th>
                    <th className="px-6 py-3.5">{L('Vaqt', 'Время')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-canvas/70">
                      <td className="px-6 py-3.5">
                        <span className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ${tone(log.action)}`}>{label(log.action)}</span>
                        {typeof log.details?.amount === 'number' && (
                          <span className="ml-2 tabular-nums text-ink-muted">{log.details.amount.toLocaleString('ru-RU')} {L('so‘m', 'сум')}</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-ink">
                        {log.user?.fullName || (log.userId ? L('Xodim', 'Сотрудник') : L('Tizim (avtomatik)', 'Система (авто)'))}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-ink-muted">
                        {new Date(log.createdAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
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
