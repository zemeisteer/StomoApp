'use client';

import React, { useState } from 'react';
import { X, Phone, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

interface CallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatUzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let localDigits = digits;
  if (digits.startsWith('998')) {
    localDigits = digits.slice(3);
  }
  localDigits = localDigits.slice(0, 9);

  let formatted = '+998';
  if (localDigits.length > 0) {
    formatted += ' (' + localDigits.slice(0, 2);
  }
  if (localDigits.length >= 2) {
    formatted += ') ' + localDigits.slice(2, 5);
  }
  if (localDigits.length >= 5) {
    formatted += '-' + localDigits.slice(5, 7);
  }
  if (localDigits.length >= 7) {
    formatted += '-' + localDigits.slice(7, 9);
  }
  return formatted;
}

export const CallbackModal: React.FC<CallbackModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [preferredBranch, setPreferredBranch] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      setError('Iltimos, ism va telefon raqamingizni kiriting');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await api.submitLead({
        fullName: fullName.trim(),
        phone: phone.trim(),
        preferredBranch: preferredBranch || undefined,
        preferredTime: preferredTime || undefined,
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err?.message || t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setError(null);
    setFullName('');
    setPhone('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-teal-50">
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label={t.common.cancel}
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-6 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t.callback.success}</h3>
            <p className="text-sm text-slate-500 mb-6">{t.callback.subtitle}</p>
            <button
              onClick={handleResetAndClose}
              className="w-full py-3 bg-teal-700 hover:bg-teal-800 text-white font-medium rounded-xl shadow-md transition-all"
            >
              Tushunarli
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-1">{t.callback.title}</h3>
              <p className="text-sm text-slate-500">{t.callback.subtitle}</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.name} *
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t.callback.namePlaceholder}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.phone} *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatUzPhone(e.target.value))}
                    placeholder="+998 (90) 123-45-67"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.callback.branchOptional}
                  </label>
                  <select
                    value={preferredBranch}
                    onChange={(e) => setPreferredBranch(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    <option value="">Ixtiyoriy</option>
                    <option value="Chilonzor filiali">Chilonzor</option>
                    <option value="Yunusobod filiali">Yunusobod</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t.callback.preferredTime}
                  </label>
                  <select
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    <option value="">Tez orada</option>
                    <option value="Ertalab (09:00 - 12:00)">Ertalab</option>
                    <option value="Tushdan keyin (12:00 - 18:00)">Kunduzi</option>
                    <option value="Kechqurun (18:00 - 20:00)">Kechqurun</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-xl shadow-lg shadow-teal-700/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>{t.common.loading}</span>
                ) : (
                  <span>{t.callback.submit}</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
