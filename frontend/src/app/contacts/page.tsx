'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ContactsPage() {
  const { t, language } = useI18n();
  const [branches, setBranches] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>('');

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBranches() {
      try {
        const data = await api.getBranches();
        setBranches(data || []);
        if (data && data.length > 0) {
          setActiveBranchId(data[0].id);
        }
      } catch (e) {
        console.error('Failed to load branches', e);
      }
    }
    loadBranches();
  }, []);

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
        preferredBranch: activeBranch?.nameUz || undefined,
        notes: notes.trim() || undefined,
      });
      setSuccess(true);
      setFullName('');
      setPhone('');
      setNotes('');
    } catch (err: any) {
      setError(err?.message || t.common.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeBranch = branches.find((b) => b.id === activeBranchId) || branches[0];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.contacts}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Klinikamiz bilan bog&apos;lanish
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Savollaringiz bormi? Bizga qo&apos;ng&apos;iroq qiling yoki qayta qo&apos;ng&apos;iroq buyurtma qiling
        </p>
      </div>

      {/* Branch Tabs */}
      <div className="flex items-center justify-center gap-3">
        {branches.map((b) => {
          const name = language === 'ru' && b.nameRu ? b.nameRu : b.nameUz;
          const isActive = b.id === activeBranchId;

          return (
            <button
              type="button"
              key={b.id}
              onClick={() => setActiveBranchId(b.id)}
              className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all ${
                isActive
                  ? 'bg-teal-700 text-white shadow-lg shadow-teal-700/20'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Active Branch Info & Contact Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Branch Details Card */}
        {activeBranch && (
          <div className="lg:col-span-6 bg-white rounded-3xl p-8 shadow-xl border border-slate-100 space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                Filial manzili va ish vaqti
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                {language === 'ru' && activeBranch.nameRu ? activeBranch.nameRu : activeBranch.nameUz}
              </h2>
            </div>

            <div className="space-y-4 text-sm text-slate-600">
              <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-2xl">
                <MapPin className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block text-xs uppercase tracking-wider">
                    {t.common.address}
                  </strong>
                  <p className="mt-0.5 text-slate-700">
                    {language === 'ru' && activeBranch.addressRu ? activeBranch.addressRu : activeBranch.addressUz}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-2xl">
                <Phone className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block text-xs uppercase tracking-wider">
                    {t.common.phone}
                  </strong>
                  <a
                    href={`tel:${activeBranch.phone || '+998712004545'}`}
                    className="mt-0.5 block text-slate-800 font-semibold hover:text-teal-700 transition-colors"
                  >
                    {activeBranch.phone || '+998 71 200 45 45'}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-2xl">
                <Clock className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block text-xs uppercase tracking-wider">
                    {t.common.workingHours}
                  </strong>
                  <p className="mt-0.5 text-slate-700">
                    {activeBranch.openingHours || 'Dushanba - Shanba: 09:00 - 20:00, Yakshanba: 10:00 - 16:00'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-2xl">
                <Mail className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block text-xs uppercase tracking-wider">
                    Elektron pochta
                  </strong>
                  <a
                    href="mailto:info@dentacare.uz"
                    className="mt-0.5 block text-slate-800 font-semibold hover:text-teal-700 transition-colors"
                  >
                    {activeBranch.email || 'info@dentacare.uz'}
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right: Callback Form */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">{t.callback.title}</h2>
          <p className="text-xs text-slate-500 mb-6">{t.callback.subtitle}</p>

          {success && (
            <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t.callback.success}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.common.name} *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.callback.namePlaceholder}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.common.phone} *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t.callback.phonePlaceholder}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qo&apos;shimcha savol yoki istak (ixtiyoriy)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Savolingiz yoki sizga qulay vaqt..."
                className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-teal-700/20 text-sm transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? t.common.loading : t.callback.submit}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
