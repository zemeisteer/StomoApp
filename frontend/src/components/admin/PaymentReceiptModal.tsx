'use client';

import React from 'react';
import { Printer, X, CheckCircle, ShieldCheck } from 'lucide-react';
import { formatClinicDate, formatClinicTime } from '../../lib/dateFormat';

export interface PaymentReceiptData {
  receiptNumber?: string;
  patientName: string;
  patientPhone?: string;
  doctorName?: string;
  serviceName?: string;
  amount: number;
  method: string;
  date: string | Date;
  invoiceId?: string;
  note?: string;
}

export interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PaymentReceiptData | null;
  isUz: boolean;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  data,
  isUz,
}: PaymentReceiptModalProps) {
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  const receiptNum = data.receiptNumber || (data.invoiceId ? `INV-${data.invoiceId.slice(-6).toUpperCase()}` : `REC-${Date.now().toString().slice(-6)}`);
  const formattedDate = formatClinicDate(data.date);
  const formattedTime = formatClinicTime(data.date);

  const getMethodLabel = (m: string) => {
    switch (m.toUpperCase()) {
      case 'CASH':
        return isUz ? 'Naqd pul' : 'Наличные';
      case 'CARD':
        return isUz ? 'Plastik karta (UzCard/Humo)' : 'Банковская карта';
      case 'TRANSFER':
        return isUz ? "Bank o'tkazmasi" : 'Перевод на счет';
      default:
        return m;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-line space-y-5 animate-scale-up print:shadow-none print:border-none print:p-2 print:max-w-none">
        {/* Actions Header (hidden on print) */}
        <div className="flex items-center justify-between border-b border-line pb-3 print:hidden">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-sm">
            <Printer className="w-4 h-4" />
            <span>{isUz ? "Kassa to'lov kvitansiyasi" : 'Кассовая квитанция об оплате'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isUz ? 'Chop etish' : 'Печать'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-ink-subtle hover:text-ink-muted rounded-xl hover:bg-canvas transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Thermal / Paper Receipt Body */}
        <div className="p-6 bg-canvas rounded-2xl border border-line space-y-4 font-mono text-xs print:bg-white print:border-none print:p-0">
          {/* Clinic Branding */}
          <div className="text-center space-y-1 border-b border-dashed border-line-strong pb-4">
            <h2 className="text-base font-extrabold text-ink tracking-wider uppercase font-sans">
              DENTACARE CLINIC
            </h2>
            <p className="text-[11px] text-ink-muted font-sans">
              {isUz ? 'Zamonaviy stomatologiya markazi' : 'Центр современной стоматологии'}
            </p>
            <p className="text-[10px] text-ink-subtle">
              Toshkent sh., Navoiy ko&apos;chasi 14 • Tel: +998 71 123 45 67
            </p>
          </div>

          {/* Receipt Meta */}
          <div className="space-y-1 text-ink-muted border-b border-dashed border-line-strong pb-3">
            <div className="flex justify-between">
              <span>{isUz ? 'Kvitansiya №:' : 'Квитанция №:'}</span>
              <span className="font-bold text-ink">{receiptNum}</span>
            </div>
            <div className="flex justify-between">
              <span>{isUz ? 'Sana va vaqt:' : 'Дата и время:'}</span>
              <span>{formattedDate} {formattedTime}</span>
            </div>
            {data.doctorName && (
              <div className="flex justify-between">
                <span>{isUz ? 'Shifokor:' : 'Врач:'}</span>
                <span className="font-semibold text-ink">{data.doctorName}</span>
              </div>
            )}
          </div>

          {/* Patient Info */}
          <div className="space-y-1 border-b border-dashed border-line-strong pb-3">
            <div className="flex justify-between">
              <span className="text-ink-muted">{isUz ? 'Bemor:' : 'Пациент:'}</span>
              <span className="font-bold text-ink">{data.patientName}</span>
            </div>
            {data.patientPhone && (
              <div className="flex justify-between">
                <span className="text-ink-muted">{isUz ? 'Telefon:' : 'Телефон:'}</span>
                <span>{data.patientPhone}</span>
              </div>
            )}
            {data.serviceName && (
              <div className="flex justify-between">
                <span className="text-ink-muted">{isUz ? 'Xizmat:' : 'Услуга:'}</span>
                <span className="font-semibold text-ink text-right max-w-[200px] truncate">
                  {data.serviceName}
                </span>
              </div>
            )}
          </div>

          {/* Payment Breakdown */}
          <div className="space-y-1.5 border-b border-dashed border-line-strong pb-4">
            <div className="flex justify-between items-baseline">
              <span className="text-ink-muted font-sans font-semibold">
                {isUz ? "To'lov usuli:" : 'Способ оплаты:'}
              </span>
              <span className="font-bold text-ink">{getMethodLabel(data.method)}</span>
            </div>
            {data.note && (
              <div className="flex justify-between text-[11px] text-ink-muted">
                <span>{isUz ? 'Izoh:' : 'Примечание:'}</span>
                <span>{data.note}</span>
              </div>
            )}
            <div className="pt-2 flex justify-between items-baseline text-sm">
              <span className="font-extrabold text-ink uppercase font-sans">
                {isUz ? 'Jami to\'landi:' : 'ИТОГО К ОПЛАТЕ:'}
              </span>
              <span className="font-extrabold text-base text-brand-600">
                {data.amount.toLocaleString()} so&apos;m
              </span>
            </div>
          </div>

          {/* Status & Signature Footer */}
          <div className="pt-2 text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[11px] font-bold font-sans">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isUz ? "TO'LOV QABUL QILINDI" : 'ОПЛАТА ПРИНЯТА'}</span>
            </div>
            <p className="text-[10px] text-ink-subtle font-sans">
              {isUz
                ? 'DentaCare klinikasini tanlaganingiz uchun tashakkur!'
                : 'Спасибо за выбор клиники DentaCare!'}
            </p>
            <div className="flex justify-between pt-4 text-[10px] text-ink-subtle border-t border-line">
              <span>{isUz ? 'Kassir imzosi: ___________' : 'Подпись кассира: ___________'}</span>
              <span>{isUz ? 'M.O\'.' : 'М.П.'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

