'use client';

import React from 'react';

export type PayType = 'PERCENT' | 'SALARY' | 'MIXED';
export interface PayTerms {
  payType: PayType;
  percentage: string;
  monthlySalary: string;
}

export const emptyStaffPay: PayTerms = { payType: 'SALARY', percentage: '0', monthlySalary: '0' };

/** Pay type switch plus the percent / salary inputs it needs. Values stay strings while typing. */
export function PayTermsFields({
  value,
  onChange,
  percentHint,
}: {
  value: PayTerms;
  onChange: (next: PayTerms) => void;
  percentHint: string;
}) {
  const set = (patch: Partial<PayTerms>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3 text-xs">
      <p className="font-bold text-ink">Maosh</p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
        {([
          ['SALARY', 'Oylik'],
          ['PERCENT', 'Foiz'],
          ['MIXED', 'Oylik + foiz'],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => set({ payType: v })}
            className={`h-8 rounded-lg font-semibold ${value.payType === v ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {value.payType !== 'PERCENT' && (
          <label className="block">
            <span className="mb-1 block text-ink-muted">Oylik maosh, so‘m</span>
            <input
              inputMode="numeric"
              value={value.monthlySalary}
              onChange={(e) => set({ monthlySalary: e.target.value.replace(/\D/g, '') })}
              className="w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
        )}
        {value.payType !== 'SALARY' && (
          <label className="block">
            <span className="mb-1 block text-ink-muted">Foiz, %</span>
            <input
              inputMode="numeric"
              value={value.percentage}
              onChange={(e) => set({ percentage: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              className="w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
        )}
      </div>
      {value.payType !== 'SALARY' && <p className="text-[10px] text-ink-subtle">{percentHint}</p>}
    </div>
  );
}

export const payPayload = (v: PayTerms) => ({
  payType: v.payType,
  percentage: v.payType === 'SALARY' ? 0 : Math.min(100, Number(v.percentage) || 0),
  monthlySalary: v.payType === 'PERCENT' ? 0 : Number(v.monthlySalary) || 0,
});
