'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { PhoneInput } from '../../components/PhoneInput';
import { normalizeUzPhone } from '../../lib/phone';
import { formatWorkingHours } from '../../lib/dateFormat';
import { Container, FilterPills, PageIntro, PrimaryLink } from '../../components/site/primitives';

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

  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const branchOptions = branches.map((b) => ({ value: b.id, label: isRu && b.nameRu ? b.nameRu : b.nameUz }));
  const hours = activeBranch ? formatWorkingHours(activeBranch.workingHours, language) : '';
  const mapHref = activeBranch?.mapUrl
    ? activeBranch.mapUrl.startsWith('http://') || activeBranch.mapUrl.startsWith('https://')
      ? activeBranch.mapUrl
      : `https://${activeBranch.mapUrl}`
    : '';
  const field =
    'w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-subtle transition-colors focus:border-ink focus:outline-none';

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.contacts}
        title={L('Bog‘lanish', 'Контакты')}
        lead={L(
          'Qo‘ng‘iroq qiling, filialga keling yoki raqamingizni qoldiring — administrator 15 daqiqa ichida qayta qo‘ng‘iroq qiladi.',
          'Позвоните, приходите в филиал или оставьте номер — администратор перезвонит в течение 15 минут.',
        )}
      />

      <Container className="py-8 sm:py-12">
        {branchOptions.length > 1 && (
          <div className="mb-10">
            <FilterPills options={branchOptions} value={activeBranch?.id || ''} onChange={setActiveBranchId} label={L('Filial', 'Филиал')} />
          </div>
        )}

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            {activeBranch ? (
              <>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
                  {isRu && activeBranch.nameRu ? activeBranch.nameRu : activeBranch.nameUz}
                </h2>
                <dl className="mt-8 border-t border-line">
                  <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm text-ink-subtle">{t.common.address}</dt>
                    <dd className="text-base text-ink">
                      {isRu && activeBranch.addressRu ? activeBranch.addressRu : activeBranch.addressUz}
                      {mapHref && (
                        <a href={mapHref} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex w-max items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
                          {L('Xaritada ochish', 'Открыть на карте')} <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </dd>
                  </div>
                  <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm text-ink-subtle">{t.common.phone}</dt>
                    <dd className="text-base text-ink">
                      {activeBranch.phone ? (
                        <a href={`tel:${activeBranch.phone.replace(/\s+/g, '')}`} className="tabular-nums hover:text-brand-700">
                          {activeBranch.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  {hours && (
                    <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-sm text-ink-subtle">{t.common.workingHours}</dt>
                      <dd className="text-base text-ink">{hours}</dd>
                    </div>
                  )}
                  {activeBranch.email && (
                    <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[10rem_1fr]">
                      <dt className="text-sm text-ink-subtle">{L('Elektron pochta', 'Эл. почта')}</dt>
                      <dd className="text-base text-ink">
                        <a href={`mailto:${activeBranch.email}`} className="hover:text-brand-700">
                          {activeBranch.email}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-8">
                  <PrimaryLink href={`/booking?branchId=${activeBranch.id}`}>
                    {L('Shu filialga yozilish', 'Записаться в этот филиал')} <ArrowRight className="h-4 w-4" />
                  </PrimaryLink>
                </div>
              </>
            ) : (
              <div className="space-y-4" aria-busy="true">
                <div className="h-8 w-1/2 animate-pulse rounded bg-white" />
                <div className="h-40 animate-pulse rounded-3xl bg-white" />
              </div>
            )}
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-[2rem] border border-line bg-white p-7 sm:p-10">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.callback.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.callback.subtitle}</p>

              {success ? (
                <div className="mt-8 rounded-2xl bg-canvas p-6" role="status">
                  <CheckCircle2 className="h-6 w-6 text-brand-700" />
                  <p className="mt-3 text-base text-ink">{t.callback.success}</p>
                  <button type="button" onClick={() => setSuccess(false)} className="mt-4 text-sm font-medium text-ink-muted hover:text-ink">
                    {L('Yana so‘rov yuborish', 'Отправить ещё заявку')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div>
                    <label htmlFor="lead-name" className="mb-2 block text-sm font-medium text-ink">
                      {t.common.name}
                    </label>
                    <input
                      id="lead-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t.callback.namePlaceholder}
                      className={field}
                    />
                  </div>
                  <PhoneInput label={t.common.phone} required value={phone} locale={language} onChange={(canonical) => setPhone(canonical)} />
                  <div>
                    <label htmlFor="lead-notes" className="mb-2 block text-sm font-medium text-ink">
                      {L('Izoh', 'Комментарий')} <span className="font-normal text-ink-subtle">({L('ixtiyoriy', 'необязательно')})</span>
                    </label>
                    <textarea
                      id="lead-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={L('Savolingiz yoki qulay vaqt', 'Ваш вопрос или удобное время')}
                      className={`${field} resize-none`}
                    />
                  </div>
                  {error && (
                    <p className="flex items-center gap-2 text-sm text-red-700" role="alert">
                      <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors duration-300 hover:bg-brand-800 disabled:opacity-50"
                  >
                    {isSubmitting ? t.common.loading : t.callback.submit}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
