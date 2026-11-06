'use client';

import React from 'react';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import { formatClinicDate } from '../../lib/dateFormat';
import { TOOTH_NAMES } from '../InteractiveOdontogram';

export interface MedicalCardData {
  patientId: string;
  patientName: string;
  patientPhone?: string;
  doctorName?: string;
  date?: string | Date;
  serviceName?: string;
  teethRecords: Record<number, any>;
  treatmentItems: Array<{
    toothNum: number;
    condition: string;
    treatmentNameUz: string;
    treatmentNameRu: string;
    surfaces: string[];
    costUzs: number;
    status: string;
    note?: string;
  }>;
}

export interface PatientMedicalCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: MedicalCardData | null;
  isUz: boolean;
}

export function PatientMedicalCardModal({
  isOpen,
  onClose,
  data,
  isUz,
}: PatientMedicalCardModalProps) {
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = formatClinicDate(data.date || new Date());

  // Helper for short clinical formula code
  const getToothFormulaCode = (toothNum: number) => {
    const rec = data.teethRecords[toothNum];
    if (!rec || rec.condition === 'HEALTHY') return '-';
    switch (rec.condition) {
      case 'CARIES':
        return 'C';
      case 'PULPITIS':
        return 'P';
      case 'PERIODONTITIS':
        return 'Pt';
      case 'FILLED':
        return 'Pl';
      case 'CROWN':
        return 'K';
      case 'MISSING':
        return 'O';
      case 'IMPLANT':
        return 'Imp';
      case 'ROOT':
        return 'R';
      default:
        return '•';
    }
  };

  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

  const totalCost = data.treatmentItems.reduce((acc, item) => acc + (item.costUzs || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white w-full max-w-4xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-scale-up print:shadow-none print:border-none print:p-0 print:max-w-none">
        {/* Modal Action Header (hidden on print) */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-sm">
            <FileText className="w-5 h-5" />
            <span>{isUz ? '043/h shaklli stomatologik ambulatoriya kartasi' : 'Стоматологическая медицинская карта (Форма 043/у)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>{isUz ? 'Chop etish (A4)' : 'Печать (А4)'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Medical Form (A4 standard) */}
        <div className="space-y-6 text-ink p-2 print:p-0">
          {/* Official Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                O&apos;ZBEKISTON RESPUBLIKASI SOG&apos;LIQNI SAQLASH VAZIRLIGI
              </span>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 mt-0.5">
                043/h-SHAKLLI STOMATOLOGIK AMBULATORIYA KARTASI
              </h1>
              <p className="text-xs font-semibold text-brand-600">
                &quot;DentaCare&quot; Zamonaviy Stomatologiya Markazi • Litsenziya № D-9821
              </p>
            </div>
            <div className="text-right text-xs space-y-1 shrink-0 font-mono">
              <div><span className="text-slate-500">Karta №:</span> <strong>{data.patientId}</strong></div>
              <div><span className="text-slate-500">Sana:</span> <strong>{formattedDate}</strong></div>
            </div>
          </div>

          {/* Patient Bio & Visit Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 print:bg-white print:border-slate-300">
            <div>
              <span className="text-slate-500 block">{isUz ? 'Bemorning F.I.Sh:' : 'Ф.И.О. пациента:'}</span>
              <strong className="text-sm text-slate-900">{data.patientName}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isUz ? 'Telefon raqami:' : 'Номер телефона:'}</span>
              <strong className="text-sm text-slate-900">{data.patientPhone || "+998 -- --- -- --"}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isUz ? 'Davolovchi shifokor:' : 'Лечащий врач:'}</span>
              <strong className="text-slate-900">{data.doctorName || "Dr. Rahimov Aziz"}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">{isUz ? 'Asosiy xizmat / Tashrif maqsadi:' : 'Основная услуга / Причина обращения:'}</span>
              <strong className="text-slate-900">{data.serviceName || (isUz ? 'Profilaktik ko\'rik va sanatsiya' : 'Первичный осмотр')}</strong>
            </div>
          </div>

          {/* FDI Dental Formula Grid */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-1">
              <span>{isUz ? 'Tish formulasi (FDI tizimi)' : 'Зубная формула (Система FDI)'}</span>
              <span className="text-[10px] text-slate-500 font-normal lowercase">
                C-karies, P-pulpit, Pt-periodontit, Pl-plomba, K-koronka, O-yo&apos;q, Imp-implant
              </span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-xs font-mono">
                {/* Upper Jaw Numbers */}
                <tbody>
                  <tr className="border-b border-slate-300 bg-slate-100 font-bold">
                    <td className="p-1 text-[10px] text-slate-500 w-16 text-left font-sans">Yuqori</td>
                    {upperRight.map((n) => (
                      <td key={n} className="p-1 w-8 border-r border-slate-200">{n}</td>
                    ))}
                    <td className="w-2 bg-slate-400"></td>
                    {upperLeft.map((n) => (
                      <td key={n} className="p-1 w-8 border-r border-slate-200 last:border-none">{n}</td>
                    ))}
                  </tr>
                  {/* Upper Jaw Status Codes */}
                  <tr className="border-b-2 border-slate-400 font-bold">
                    <td className="p-1 text-[10px] text-slate-500 text-left font-sans">Holat</td>
                    {upperRight.map((n) => {
                      const code = getToothFormulaCode(n);
                      return (
                        <td key={n} className={`p-1 border-r border-slate-200 ${code !== '-' ? 'bg-amber-50 text-amber-900 font-extrabold' : 'text-slate-400'}`}>
                          {code}
                        </td>
                      );
                    })}
                    <td className="w-2 bg-slate-400"></td>
                    {upperLeft.map((n) => {
                      const code = getToothFormulaCode(n);
                      return (
                        <td key={n} className={`p-1 border-r border-slate-200 last:border-none ${code !== '-' ? 'bg-amber-50 text-amber-900 font-extrabold' : 'text-slate-400'}`}>
                          {code}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Lower Jaw Status Codes */}
                  <tr className="border-b border-slate-200 font-bold">
                    <td className="p-1 text-[10px] text-slate-500 text-left font-sans">Holat</td>
                    {lowerRight.map((n) => {
                      const code = getToothFormulaCode(n);
                      return (
                        <td key={n} className={`p-1 border-r border-slate-200 ${code !== '-' ? 'bg-amber-50 text-amber-900 font-extrabold' : 'text-slate-400'}`}>
                          {code}
                        </td>
                      );
                    })}
                    <td className="w-2 bg-slate-400"></td>
                    {lowerLeft.map((n) => {
                      const code = getToothFormulaCode(n);
                      return (
                        <td key={n} className={`p-1 border-r border-slate-200 last:border-none ${code !== '-' ? 'bg-amber-50 text-amber-900 font-extrabold' : 'text-slate-400'}`}>
                          {code}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Lower Jaw Numbers */}
                  <tr className="bg-slate-100 font-bold border-b border-slate-300">
                    <td className="p-1 text-[10px] text-slate-500 text-left font-sans">Pastki</td>
                    {lowerRight.map((n) => (
                      <td key={n} className="p-1 w-8 border-r border-slate-200">{n}</td>
                    ))}
                    <td className="w-2 bg-slate-400"></td>
                    {lowerLeft.map((n) => (
                      <td key={n} className="p-1 w-8 border-r border-slate-200 last:border-none">{n}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Treatment Plan & Clinical Interventions */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
              {isUz ? 'Bajarilgan muolajalar va davolash rejasi' : 'План лечения и выполненные манипуляции'}
            </h3>

            {data.treatmentItems.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-2">
                {isUz ? 'Tishlarda patologik o\'zgarishlar aniqlanmadi (Sanatsiya qilingan).' : 'Патологий не обнаружено.'}
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-12 text-center">№</th>
                      <th className="p-2 w-16">Tish</th>
                      <th className="p-2">Muolaja / Tashxis</th>
                      <th className="p-2 w-28">Holat</th>
                      <th className="p-2 w-28 text-right">Summasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.treatmentItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-mono font-bold text-brand-600">#{item.toothNum}</td>
                        <td className="p-2">
                          <strong className="text-slate-900">{isUz ? item.treatmentNameUz : item.treatmentNameRu}</strong>
                          {item.surfaces.length > 0 && (
                            <span className="text-[10px] text-slate-500 block">Sirtlar: {item.surfaces.join(', ')}</span>
                          )}
                          {item.note && (
                            <span className="text-[10px] text-slate-500 italic block">Izoh: {item.note}</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.status === 'COMPLETED' ? (isUz ? 'Bajarildi' : 'Выполнено') : (isUz ? 'Rejada' : 'В плане')}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-800">
                          {item.costUzs ? `${item.costUzs.toLocaleString()} so'm` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totalCost > 0 && (
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={4} className="p-2 text-right uppercase text-slate-700">Jami hisoblangan qiymat:</td>
                        <td className="p-2 text-right font-mono text-sm text-brand-600">{totalCost.toLocaleString()} so&apos;m</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Doctor Signature & Clinic Stamp Block */}
          <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-end text-xs">
            <div className="space-y-4">
              <p className="text-slate-600">
                {isUz ? 'Tavsiyalar:' : 'Рекомендации:'} Og&apos;iz bo&apos;shlig&apos;i gigiyenasiga rioya qilish, har 6 oyda profilaktik ko&apos;rik.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{isUz ? 'Davolovchi shifokor imzosi:' : 'Подпись врача:'}</span>
                <span className="font-mono underline underline-offset-4 decoration-slate-400">
                  ___________________________ ({data.doctorName || "Dr. Rahimov Aziz"})
                </span>
              </div>
            </div>
            <div className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-full flex items-center justify-center text-[10px] text-slate-400 font-bold text-center">
              M.O&apos;. / MUHR
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

