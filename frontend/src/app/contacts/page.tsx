'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { PhoneInput } from '../../components/PhoneInput';
import { normalizeUzPhone } from '../../lib/phone';
import { formatWorkingHours } from '../../lib/dateFormat';

export default function ContactsPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
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
    let isMounted = true;
    async function loadBranches() {
      try {
        const data = await api.getBranches();
        if (isMounted) {
          setBranches(data || []);
          if (data && data.length > 0) {
            setActiveBranchId(data[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load branches', e);
      }
    }
    loadBranches();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError(isRu ? 'Введите ваше имя' : 'Iltimos, ismingizni kiriting');
      return;
    }

    const phoneVal = normalizeUzPhone(phone, true);
    if (!phoneVal.isValid) {
      setError((isRu ? phoneVal.errorMessageRu : phoneVal.errorMessageUz) || (isRu ? 'Неверный номер телефона' : 'Telefon raqami noto\'g\'ri'));
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await api.submitLead({
        fullName: fullName.trim(),
        phone: phoneVal.normalized,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eaf5f2] text-[#167b78] text-xs font-bold uppercase tracking-wider">
          <Phone className="w-3.5 h-3.5" />
          <span>{t.nav.contacts}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] tracking-tight">
          {isRu ? 'Контакты и филиалы клиники' : 'Klinikamiz bilan bog\'lanish'}
        </h1>
        <p className="text-sm sm:text-base text-[#52696e] leading-relaxed">
          {isRu
            ? 'Есть вопросы или хотите записаться на прием? Свяжитесь с нами удобным способом.'
            : 'Savollaringiz bormi yoki qabulga yozilmoqchimisiz? Bizga qo\'ng\'iroq qiling yoki qayta qo\'ng\'iroq qoldiring.'}
        </p>
      </div>

      {/* Branch Tabs */}
      {branches.length > 1 && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {branches.map((b) => {
            const name = isRu && b.nameRu ? b.nameRu : b.nameUz;
            const isActive = b.id === activeBranchId;

            return (
              <button
                type="button"
                key={b.id}
                onClick={() => setActiveBranchId(b.id)}
                className={`px-6 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
                  isActive
                    ? 'bg-[#167b78] text-white shadow-md shadow-[#167b78]/25'
                    : 'bg-white text-[#152f34] border border-[#d8e5e2] hover:bg-[#f0f7f5]'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Branch Info & Contact Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Branch Details Card */}
        {activeBranch && (
          <div className="lg:col-span-6 bg-white rounded-3xl p-7 sm:p-9 shadow-[0_4px_20px_rgba(21,47,52,0.03)] border border-[#d8e5e2] space-y-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#167b78] bg-[#eaf5f2] px-3 py-1 rounded-full border border-[#d8e5e2]">
                {isRu ? 'Филиал и график работы' : 'Filial manzili va ish vaqti'}
              </span>
              <h2 className="text-2xl font-extrabold text-[#152f34] mt-2.5">
                {isRu && activeBranch.nameRu ? activeBranch.nameRu : activeBranch.nameUz}
              </h2>
            </div>

            <div className="space-y-4 text-sm text-[#52696e]">
              <div className="flex items-start gap-3.5 p-4 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
                <MapPin className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#152f34] block text-xs uppercase tracking-wider">
                    {t.common.address}
                  </strong>
                  <p className="mt-0.5 text-xs sm:text-sm text-[#152f34]">
                    {isRu && activeBranch.addressRu ? activeBranch.addressRu : activeBranch.addressUz}
                  </p>
                  {activeBranch.mapUrl && (
                    <a
                      href={activeBranch.mapUrl.startsWith('http://') || activeBranch.mapUrl.startsWith('https://') ? activeBranch.mapUrl : `https://${activeBranch.mapUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-[#167b78] hover:underline"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isRu ? 'Посмотреть на карте' : 'Xaritada ko\'rish'}</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
                <Phone className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#152f34] block text-xs uppercase tracking-wider">
                    {t.common.phone}
                  </strong>
                  {activeBranch.phone ? (
                    <a
                      href={`tel:${activeBranch.phone.replace(/\s+/g, '')}`}
                      className="mt-0.5 block text-xs sm:text-sm text-[#152f34] font-bold hover:text-[#167b78] transition-colors"
                    >
                      {activeBranch.phone}
                    </a>
                  ) : (
                    <span className="mt-0.5 block text-xs sm:text-sm text-[#52696e]">—</span>
                  )}
                </div>
              </div>

              {formatWorkingHours(activeBranch.workingHours, language) && (
                <div className="flex items-start gap-3.5 p-4 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
                  <Clock className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#152f34] block text-xs uppercase tracking-wider">
                      {t.common.workingHours}
                    </strong>
                    <p className="mt-0.5 text-xs sm:text-sm text-[#152f34]">
                      {formatWorkingHours(activeBranch.workingHours, language)}
                    </p>
                  </div>
                </div>
              )}

              {activeBranch.email && (
                <div className="flex items-start gap-3.5 p-4 bg-[#f4f9f7] rounded-2xl border border-[#d8e5e2]">
                  <Mail className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#152f34] block text-xs uppercase tracking-wider">
                      {isRu ? 'Электронная почта' : 'Elektron pochta'}
                    </strong>
                    <a
                      href={`mailto:${activeBranch.email}`}
                      className="mt-0.5 block text-xs sm:text-sm text-[#152f34] font-semibold hover:text-[#167b78] transition-colors"
                    >
                      {activeBranch.email}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Callback / Contact Form */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-7 sm:p-9 shadow-[0_4px_20px_rgba(21,47,52,0.03)] border border-[#d8e5e2]">
          <h2 className="text-xl font-extrabold text-[#152f34] mb-1">{t.callback.title}</h2>
          <p className="text-xs text-[#52696e] mb-6">{t.callback.subtitle}</p>

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
              <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                {t.common.name} *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.callback.namePlaceholder}
                className="w-full px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-sm focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
              />
            </div>

            <div>
              <PhoneInput
                label={t.common.phone}
                required
                value={phone}
                locale={language}
                onChange={(canonical) => setPhone(canonical)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                {isRu ? 'Дополнительный вопрос или пожелание (необязательно)' : 'Qo\'shimcha savol yoki istak (ixtiyoriy)'}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isRu ? 'Ваш вопрос или удобное время для звонка...' : 'Savolingiz yoki sizga qulay vaqt...'}
                className="w-full px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-sm focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#167b78] hover:bg-[#116460] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/25 text-sm transition-all flex items-center justify-center gap-2 transform active:scale-95"
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
