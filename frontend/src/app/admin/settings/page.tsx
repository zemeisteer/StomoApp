'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Settings as SettingsIcon,
  Building2,
  Clock,
  Globe,
  Phone,
  Mail,
  Save,
  Plus,
  CheckCircle2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Trash2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  MapPin,
  HelpCircle,
  Info,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { normalizeUzPhone, formatUzPhoneDisplay } from '../../../lib/phone';
import { PhoneInput } from '../../../components/PhoneInput';
import { CustomSelect } from '../../../components/CustomSelect';
import { ModalDialog } from '../../../components/ModalDialog';
import { useI18n } from '../../../lib/i18n';
import { translateBranchOrAddress } from '../../../lib/transliterate';

interface ContactPhoneItem {
  id: string;
  number: string;
  label: string;
  isPrimary: boolean;
}

export default function AdminSettingsPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const [settings, setSettings] = useState<any>({
    name: '',
    nameRu: '',
    logo: '',
    phone: '',
    email: '',
    website: '',
    telegramLink: '',
    instagramLink: '',
    facebookLink: '',
    timezone: 'Asia/Tashkent',
    minBookingNoticeHours: 2,
    maxBookingHorizonDays: 60,
    bufferMinutes: 5,
    pendingExpiryMinutes: 30,
  });

  // Logo state & guidance
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contact phones state (repeatable list)
  const [contactPhones, setContactPhones] = useState<ContactPhoneItem[]>([
    { id: 'phone-1', number: '', label: 'Asosiy raqam (Qabulxona)', isPrimary: true },
  ]);

  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchNameUz, setBranchNameUz] = useState('');
  const [branchNameRu, setBranchNameRu] = useState('');
  const [branchAddressUz, setBranchAddressUz] = useState('');
  const [branchAddressRu, setBranchAddressRu] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchWorkHours, setBranchWorkHours] = useState('');
  const [branchMapUrl, setBranchMapUrl] = useState('');
  const [branchIsActive, setBranchIsActive] = useState(true);
  const [branchModalError, setBranchModalError] = useState<string | null>(null);
  const [branchModalSuccess, setBranchModalSuccess] = useState<string | null>(null);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);

  // Branch Deletion & Lifecycle Modal State
  const [branchToDelete, setBranchToDelete] = useState<any | null>(null);
  const [branchPreview, setBranchPreview] = useState<any | null>(null);
  const [isLoadingBranchPreview, setIsLoadingBranchPreview] = useState(false);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [deleteBranchError, setDeleteBranchError] = useState<string | null>(null);
  const [deleteBranchSuccess, setDeleteBranchSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [settingsRes, branchesRes] = await Promise.all([
        api.getClinicSettingsAdmin(),
        api.getBranchesAdmin(),
      ]);

      if (settingsRes) {
        setSettings({
          name: settingsRes.name || '',
          nameRu: settingsRes.nameRu || '',
          logo: settingsRes.logo || '',
          phone: settingsRes.phone || '',
          email: settingsRes.email || '',
          website: settingsRes.website || '',
          telegramLink: settingsRes.telegramLink || '',
          instagramLink: settingsRes.instagramLink || '',
          facebookLink: settingsRes.facebookLink || '',
          timezone: settingsRes.timezone || 'Asia/Tashkent',
          minBookingNoticeHours: settingsRes.minBookingNoticeHours ?? 2,
          maxBookingHorizonDays: settingsRes.maxBookingHorizonDays ?? 60,
          bufferMinutes: settingsRes.bufferMinutes ?? 5,
          pendingExpiryMinutes: settingsRes.pendingExpiryMinutes ?? 30,
          pendingExpiryOutOfRange: Boolean(settingsRes.pendingExpiryOutOfRange),
          rawPendingExpiryMinutes: settingsRes.rawPendingExpiryMinutes,
        });

        if (settingsRes.logo) {
          setLogoUrl(settingsRes.logo);
        }

        // Parse contact phones
        if (settingsRes.phone) {
          try {
            if (settingsRes.phone.trim().startsWith('[')) {
              const parsed = JSON.parse(settingsRes.phone);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setContactPhones(
                  parsed.map((p: any, idx: number) => ({
                    id: p.id || `phone-${idx + 1}`,
                    number: p.number || '',
                    label: p.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam'),
                    isPrimary: Boolean(p.isPrimary ?? idx === 0),
                  })),
                );
              }
            } else {
              setContactPhones([
                {
                  id: 'phone-1',
                  number: settingsRes.phone,
                  label: 'Asosiy raqam (Qabulxona)',
                  isPrimary: true,
                },
              ]);
            }
          } catch {
            setContactPhones([
              {
                id: 'phone-1',
                number: settingsRes.phone,
                label: 'Asosiy raqam',
                isPrimary: true,
              },
            ]);
          }
        }
      }

      setBranches(branchesRes || []);
    } catch (err: any) {
      console.error('Failed to load clinic settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Logo upload handler with validation
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setLogoWarning(null);

    // 1. Check format: strictly reject SVG
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      setErrorMsg('Xavfsizlik talablariga binoan SVG format qabul qilinmaydi. Iltimos, PNG yoki WebP yuklang.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) {
      setErrorMsg('Faqat PNG yoki WebP formatdagi rasmlar ruxsat etiladi.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Check file size (max 2MB)
    const MAX_LOGO_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_LOGO_BYTES) {
      setErrorMsg(`Fayl hajmi 2 MB dan oshmasligi kerak (tanlangan fayl: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 3. Check image dimensions via Image object
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Rasmni o\'qishda xatolik'));
        img.src = objectUrl;
      });

      if (img.naturalWidth < 300 || img.naturalHeight < 100) {
        setLogoWarning(
          `Ogohlantirish: Logo o'lchami kichik (${img.naturalWidth}×${img.naturalHeight} px). Yuqori sifatli ko'rinish uchun kamida 300×100 px tavsiya etiladi.`,
        );
      }
    } catch (err) {
      console.warn('Could not inspect image dimensions:', err);
    }

    // 4. Upload via media API
    try {
      setLogoUploading(true);
      const res = await api.uploadMedia(file);
      const uploadedUrl = res.url || res.data?.url;
      if (uploadedUrl) {
        setLogoUrl(uploadedUrl);
        setSettings((prev: any) => ({ ...prev, logo: uploadedUrl }));
        setSuccessMsg('Logo muvaffaqiyatli yuklandi. O\'zgarishlarni saqlash uchun "Sozlamalarni saqlash" tugmasini bosing.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Logoni yuklashda xatolik yuz berdi');
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoWarning(null);
    setSettings((prev: any) => ({ ...prev, logo: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Contact Phones handlers
  const handleAddPhone = () => {
    setContactPhones((prev) => [
      ...prev,
      {
        id: `phone-${Date.now()}`,
        number: '',
        label: '',
        isPrimary: prev.length === 0,
      },
    ]);
  };

  const handleRemovePhone = (id: string) => {
    if (contactPhones.length <= 1) {
      setErrorMsg('Kamida bitta telefon raqami saqlanishi kerak.');
      return;
    }
    const filtered = contactPhones.filter((p) => p.id !== id);
    // If we removed the primary one, make the first remaining phone primary
    const hasPrimary = filtered.some((p) => p.isPrimary);
    if (!hasPrimary && filtered.length > 0) {
      filtered[0].isPrimary = true;
    }
    setContactPhones(filtered);
  };

  const handleSetPrimaryPhone = (id: string) => {
    setContactPhones((prev) =>
      prev.map((p) => ({
        ...p,
        isPrimary: p.id === id,
      })),
    );
  };

  const handleMovePhone = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === contactPhones.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const items = [...contactPhones];
    const [moved] = items.splice(index, 1);
    items.splice(newIndex, 0, moved);
    setContactPhones(items);
  };

  const handlePhoneChange = (id: string, field: 'number' | 'label', val: string) => {
    setContactPhones((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)),
    );
  };

  // Submit Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSuccessMsg(null);
      setErrorMsg(null);

      // Validate all contact phones
      if (contactPhones.length === 0) {
        throw new Error('Kamida bitta aloqa telefon raqami talab qilinadi.');
      }

      const validatedPhones: ContactPhoneItem[] = [];
      for (const item of contactPhones) {
        const norm = normalizeUzPhone(item.number, true);
        if (!norm.isValid) {
          throw new Error(
            `"${item.label || 'Telefon'}" raqami noto'g'ri: ${norm.errorMessageUz || '+998XXXXXXXXX formatida 9 ta raqam bo\'lishi kerak'}`,
          );
        }
        validatedPhones.push({
          ...item,
          number: norm.normalized,
        });
      }

      // Ensure one primary
      const primaryExists = validatedPhones.some((p) => p.isPrimary);
      if (!primaryExists && validatedPhones.length > 0) {
        validatedPhones[0].isPrimary = true;
      }

      // Validate booking rules range (5..10080 minutes for pending expiry)
      if (
        settings.pendingExpiryMinutes === undefined ||
        settings.pendingExpiryMinutes === null ||
        isNaN(settings.pendingExpiryMinutes) ||
        settings.pendingExpiryMinutes < 5 ||
        settings.pendingExpiryMinutes > 10080
      ) {
        throw new Error(
          'Kutilayotgan qabul eskirish vaqti 5 daqiqadan 10080 daqiqagacha (7 kun) bo\'lishi lozim.',
        );
      }

      if (settings.bufferMinutes < 0 || settings.bufferMinutes > 120) {
        throw new Error('Qabullar orasidagi tanaffus 0 dan 120 daqiqagacha bo\'lishi lozim.');
      }

      const payload = {
        ...settings,
        logo: logoUrl || null,
        phone: JSON.stringify(validatedPhones),
      };

      await api.updateClinicSettingsAdmin(payload);
      setSuccessMsg('Klinika sozlamalari muvaffaqiyatli saqlandi');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sozlamalarni saqlashda xatolik');
    } finally {
      setIsSaving(false);
    }
  };

  const openCreateBranch = () => {
    setEditingBranch(null);
    setBranchNameUz('');
    setBranchNameRu('');
    setBranchAddressUz('');
    setBranchAddressRu('');
    setBranchPhone('');
    setBranchWorkHours('Du - Sha: 08:00 - 20:00');
    setBranchMapUrl('');
    setBranchIsActive(true);
    setBranchModalError(null);
    setBranchModalSuccess(null);
    setShowBranchModal(true);
  };

  const openEditBranch = (b: any) => {
    setEditingBranch(b);
    setBranchNameUz(b.nameUz || '');
    setBranchNameRu(b.nameRu || '');
    setBranchAddressUz(b.addressUz || '');
    setBranchAddressRu(b.addressRu || '');
    setBranchPhone(b.phone || '');
    setBranchWorkHours(b.workHours || '');
    setBranchMapUrl(b.mapUrl || '');
    setBranchIsActive(b.isActive !== false);
    setBranchModalError(null);
    setBranchModalSuccess(null);
    setShowBranchModal(true);
  };

  // Branch Save Handler
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setErrorMsg(null);
      setBranchModalError(null);
      setBranchModalSuccess(null);

      // Validate mapUrl
      let cleanedMapUrl = branchMapUrl.trim();
      if (cleanedMapUrl) {
        const lower = cleanedMapUrl.toLowerCase();
        if (
          lower.startsWith('javascript:') ||
          lower.includes('<script') ||
          lower.includes('<iframe') ||
          lower.startsWith('data:')
        ) {
          throw new Error('Xavfsiz xarita havolasi talab qilinadi (http:// yoki https://). Iframe yoki script ruxsat etilmaydi.');
        }
        if (!cleanedMapUrl.startsWith('http://') && !cleanedMapUrl.startsWith('https://')) {
          cleanedMapUrl = `https://${cleanedMapUrl}`;
        }
      }

      const payload = {
        nameUz: branchNameUz.trim(),
        nameRu: branchNameRu.trim() || branchNameUz.trim(),
        addressUz: branchAddressUz.trim(),
        addressRu: branchAddressRu.trim() || branchAddressUz.trim(),
        phone: branchPhone.trim(),
        workHours: branchWorkHours.trim(),
        mapUrl: cleanedMapUrl || null,
        isActive: branchIsActive,
      };

      if (editingBranch) {
        await api.updateBranchAdmin(editingBranch.id, payload);
      } else {
        await api.createBranchAdmin(payload);
      }

      setBranchModalSuccess(isRu ? 'Данные филиала успешно сохранены!' : 'Filial ma\'lumotlari muvaffaqiyatli saqlandi!');
      setSuccessMsg(isRu ? 'Филиал успешно сохранен' : 'Filial ma\'lumotlari muvaffaqiyatli saqlandi');
      await loadData();

      setTimeout(() => {
        setShowBranchModal(false);
        setEditingBranch(null);
        setBranchModalSuccess(null);
      }, 600);
    } catch (err: any) {
      const msg = err?.message || (isRu ? 'Ошибка при сохранении филиала' : 'Filialni saqlashda xatolik yuz berdi');
      setBranchModalError(msg);
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Branch Deletion Lifecycle Handlers
  const promptDeleteBranch = async (b: any) => {
    if (!b) return;
    setBranchToDelete(b);
    setBranchPreview(null);
    setDeleteBranchError(null);
    setDeleteBranchSuccess(null);
    setIsLoadingBranchPreview(true);
    try {
      const preview = await api.getBranchLifecyclePreview(b.id);
      setBranchPreview(preview);
    } catch (err: any) {
      setDeleteBranchError(err?.message || (isRu ? 'Ошибка при проверке статуса филиала' : 'Filial holatini tekshirishda xatolik yuz berdi'));
    } finally {
      setIsLoadingBranchPreview(false);
    }
  };

  const confirmDeleteBranch = async () => {
    if (!branchToDelete || isDeletingBranch) return;
    try {
      setIsDeletingBranch(true);
      setDeleteBranchError(null);
      const res = await api.deleteBranchAdmin(branchToDelete.id);
      setDeleteBranchSuccess(res?.message || (isRu ? 'Филиал успешно удален' : 'Filial muvaffaqiyatli o\'chirildi'));
      if (editingBranch?.id === branchToDelete.id) {
        setShowBranchModal(false);
        setEditingBranch(null);
      }
      await loadData();
      setTimeout(() => {
        setBranchToDelete(null);
        setBranchPreview(null);
        setDeleteBranchSuccess(null);
      }, 1200);
    } catch (err: any) {
      setDeleteBranchError(err?.message || (isRu ? 'Ошибка при удалении филиала' : 'Filialni o\'chirishda xatolik yuz berdi'));
    } finally {
      setIsDeletingBranch(false);
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER']}>
      <div className="space-y-8 max-w-5xl pb-16">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Klinika Sozlamalari va Filiallar
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Klinika brendi, logotipi, aloqa raqamlari, bronlash qoidalari va filiallar boshqaruvi (Faqat OWNER)
          </p>
        </div>

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. CLINIC LOGO & BRANDING MANAGEMENT (Req 16) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-teal-700" />
                <span>Klinika Logotipi va Brending</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Veb-sayt bosh sahifasi, yuqori menyu (header), pastki qism (footer) va admin panelda ko&apos;rinadi
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={handleLogoFileChange}
              />
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{logoUrl ? 'Logoni almashtirish' : 'Yangi logo yuklash'}</span>
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>O&apos;chirish</span>
                </button>
              )}
            </div>
          </div>

          {logoWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{logoWarning}</span>
            </div>
          )}

          {/* Guidelines Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-teal-700" />
              <span>Logotip uchun texnik talablar va tavsiyalar:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-600">
              <li><strong>Format:</strong> Shaffof fonli <code>PNG</code> yoki <code>WebP</code> tavsiya etiladi (xavfsizlik sababli SVG qabul qilinmaydi).</li>
              <li><strong>Tavsiya etiladigan o&apos;lcham:</strong> Gorizontal logo uchun taxminan <code>600×200 px</code>; kvadrat belgi uchun <code>256×256 px</code>.</li>
              <li><strong>Ruxsat etilgan minimal o&apos;lcham:</strong> Sifat buzilmasligi uchun kamida <code>300×100 px</code>.</li>
              <li><strong>Maksimal fayl hajmi:</strong> <code>2 MB</code> gacha.</li>
            </ul>
          </div>

          {/* Live Previews: Desktop & Mobile Header placement */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Jonli ko&apos;rinish (Desktop va Mobile Prevyu)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Desktop Header Simulation */}
              <div className="lg:col-span-7 p-4 rounded-2xl border border-slate-200 bg-slate-100 flex flex-col justify-between space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <Monitor className="w-3.5 h-3.5 text-teal-700" />
                  <span>Kompyuter (Desktop) menyusi prevyusi:</span>
                </div>
                <div className="h-16 px-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Klinika logotipi"
                        className="h-9 max-w-[160px] object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-teal-700 flex items-center justify-center text-white">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                          </svg>
                        </div>
                        <span className="font-extrabold text-slate-900 text-sm tracking-tight">
                          Denta<span className="text-teal-700">Care</span>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-[11px] font-semibold text-slate-500">
                    <span>Xizmatlar</span>
                    <span>Shifokorlar</span>
                    <span>Klinika</span>
                    <span className="px-2.5 py-1 bg-teal-700 text-white rounded-lg text-[10px] font-bold">
                      Qabulga yozilish
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  {logoUrl ? 'Yuklangan logotip o\'z nisbatini saqlagan holda joylashadi' : 'Logotip yuklanmasa, standart toza DentaCare belgisi aks etadi'}
                </p>
              </div>

              {/* Mobile Header Simulation */}
              <div className="lg:col-span-5 p-4 rounded-2xl border border-slate-200 bg-slate-100 flex flex-col justify-between space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <Smartphone className="w-3.5 h-3.5 text-teal-700" />
                  <span>Mobil (Telefon 390px) prevyusi:</span>
                </div>
                <div className="h-14 px-3 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between max-w-[320px] mx-auto w-full">
                  <div className="flex items-center gap-2">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Mobil logo"
                        className="h-7 max-w-[120px] object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-lg bg-teal-700 flex items-center justify-center text-white">
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                          </svg>
                        </div>
                        <span className="font-extrabold text-slate-900 text-xs">DentaCare</span>
                      </div>
                    )}
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 text-[10px] font-bold">
                    ☰
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 text-center">
                  Mobil ekranda ixcham va toza sig&apos;im
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CLINIC GENERAL & CONTACT PHONES FORM (Req 17) */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-700" />
            <span>Klinika Asosiy Ma&apos;lumotlari</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Klinika nomi (O&apos;zbekcha)
              </label>
              <input
                type="text"
                required
                value={settings.name}
                onChange={(e) => {
                  const val = e.target.value;
                  const shouldSyncRu = !settings.nameRu || settings.nameRu === settings.name;
                  setSettings({
                    ...settings,
                    name: val,
                    nameRu: shouldSyncRu ? val : settings.nameRu,
                  });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Klinika nomi (Ruscha)
              </label>
              <input
                type="text"
                required
                value={settings.nameRu}
                onChange={(e) => setSettings({ ...settings, nameRu: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email manzil
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rasmiy veb-sayt
              </label>
              <input
                type="text"
                value={settings.website}
                onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                placeholder="https://dentacare.uz"
              />
            </div>
          </div>

          {/* Repeatable Contact Phone Numbers List (Req 17) */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-teal-700" />
                  <span>Aloqa Telefon Raqamlari (Ko&apos;p tarmoqli kontaktlar)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Klinika bilan bog&apos;lanish uchun bir nechta raqam kiriting. Ulardan birini &quot;Asosiy&quot; qilib belgilang.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddPhone}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Raqam qo&apos;shish</span>
              </button>
            </div>

            <div className="space-y-3">
              {contactPhones.map((phoneItem, index) => {
                const normCheck = phoneItem.number.trim()
                  ? normalizeUzPhone(phoneItem.number, true)
                  : { isValid: true };

                return (
                  <div
                    key={phoneItem.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700">
                        <input
                          type="radio"
                          name="primaryPhoneGroup"
                          checked={phoneItem.isPrimary}
                          onChange={() => handleSetPrimaryPhone(phoneItem.id)}
                          className="w-4 h-4 text-teal-700 focus:ring-teal-600"
                        />
                        <span>{phoneItem.isPrimary ? 'Asosiy' : 'Qo\'shimcha'}</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
                      <div>
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="+998 71 123 45 67"
                          value={phoneItem.number}
                          onChange={(e) => handlePhoneChange(phoneItem.id, 'number', e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border text-xs focus:ring-2 focus:ring-teal-600 bg-white font-medium ${
                            phoneItem.number.trim() && !normCheck.isValid
                              ? 'border-rose-300 text-rose-800'
                              : 'border-slate-200 text-slate-800'
                          }`}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Tavsifi: masalan, Qabulxona yoki WhatsApp"
                          value={phoneItem.label}
                          onChange={(e) => handlePhoneChange(phoneItem.id, 'label', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMovePhone(index, 'up')}
                        title="Yuqoriga surish"
                        className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-lg hover:bg-slate-200/50"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === contactPhones.length - 1}
                        onClick={() => handleMovePhone(index, 'down')}
                        title="Pastga surish"
                        className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-lg hover:bg-slate-200/50"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={contactPhones.length <= 1}
                        onClick={() => handleRemovePhone(phoneItem.id)}
                        title="Raqamni o'chirish"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telegram havola
              </label>
              <input
                type="text"
                placeholder="https://t.me/..."
                value={settings.telegramLink}
                onChange={(e) => setSettings({ ...settings, telegramLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instagram havola
              </label>
              <input
                type="text"
                placeholder="https://instagram.com/..."
                value={settings.instagramLink}
                onChange={(e) => setSettings({ ...settings, instagramLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Facebook havola
              </label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                value={settings.facebookLink}
                onChange={(e) => setSettings({ ...settings, facebookLink: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* 3. PLAIN-LANGUAGE BOOKING SETTINGS (Req 18) */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-teal-700" />
                <span>{isRu ? 'Правила онлайн-записи и расписания' : 'Bronlash va Vaqt Qoidalari'}</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isRu
                  ? 'Правила предварительной записи, допустимый горизонт, перерывы и авто-отмена неподтвержденных заявок'
                  : 'Bemorlar uchun qabulga yozilish qoidalari, oraliqlar va avtomatik bekor bo\'lish muddatlari'}
              </p>
            </div>

            {/* Out-of-range alert banner if legacy setting in DB was invalid */}
            {settings.pendingExpiryOutOfRange && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {isRu ? 'Коррекция устаревших настроек' : 'Eski sozlamalar to\'g\'rilandi'}
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {isRu
                      ? `Предыдущее значение удержания слота (${settings.rawPendingExpiryMinutes} мин) находилось вне допустимого диапазона (5..10080 мин) и было автоматически нормализовано до ${settings.pendingExpiryMinutes} мин.`
                      : `Eski kutilayotgan qabul eskirish vaqti (${settings.rawPendingExpiryMinutes} daq) ruxsat etilgan oraliqdan (5..10080 daq) tashqarida edi va avtomatik ravishda xavfsiz qiymatga (${settings.pendingExpiryMinutes} daq) to'g'rilandi.`}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Field 1: minBookingNoticeHours */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    {isRu ? 'Минимальное время предварительной записи' : 'Qabulga kamida necha soat oldin yozilish kerak?'}
                  </label>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {isRu ? 'часов' : 'soat'}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={720}
                  step={1}
                  required
                  value={settings.minBookingNoticeHours}
                  onChange={(e) => setSettings({ ...settings, minBookingNoticeHours: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-600 bg-white"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isRu ? (
                    <>
                      <strong>Например:</strong> 2 часа (0 часов разрешает запись сразу на ближайшее время). Если сейчас 10:00, пациент сможет записаться минимум на 12:00.
                    </>
                  ) : (
                    <>
                      <strong>Masalan:</strong> 2 soat (0 soat kiritilsa, joriy vaqtdan darhol yozilish mumkin). Agar hozir soat 10:00 bo&apos;lsa, bemor eng erta 12:00 dagi bo&apos;sh qabulga yozila oladi.
                    </>
                  )}
                </p>
              </div>

              {/* Field 2: maxBookingHorizonDays */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    {isRu ? 'На сколько дней вперед можно записаться?' : 'Necha kun oldingacha yozilish mumkin?'}
                  </label>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {isRu ? 'дней' : 'kun'}
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  required
                  value={settings.maxBookingHorizonDays}
                  onChange={(e) => setSettings({ ...settings, maxBookingHorizonDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-600 bg-white"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isRu ? (
                    <>
                      <strong>Например:</strong> 60 дней. Пациент может выбрать дату в календаре максимум на 60 дней вперед от текущей даты.
                    </>
                  ) : (
                    <>
                      <strong>Masalan:</strong> 60 kun. Bemor taqvimdan bugundan boshlab 60 kungacha bo&apos;lgan muddatdagi sanalarni tanlashi mumkin.
                    </>
                  )}
                </p>
              </div>

              {/* Field 3: bufferMinutes */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    {isRu ? 'Перерыв между приемами (буфер)' : 'Qabullar orasidagi tanaffus'}
                  </label>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {isRu ? 'минут' : 'daqiqa'}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={5}
                  required
                  value={settings.bufferMinutes}
                  onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-600 bg-white"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isRu ? (
                    <>
                      <strong>Например:</strong> 5 или 10 минут (0 минут означает прием без перерыва). Время для проветривания кабинета, стерилизации инструментов и подготовки.
                    </>
                  ) : (
                    <>
                      <strong>Masalan:</strong> 5 yoki 10 daqiqa (0 daqiqa ham kiritilishi mumkin — tanaffussiz ishlash). Shifokor xonasini tozalash, asboblarni sterilizatsiya qilish va tayyorlash uchun ajratiladi.
                    </>
                  )}
                </p>
              </div>

              {/* Field 4: pendingExpiryMinutes */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    {isRu ? 'Время на подтверждение заявки (удержание слота)' : 'Tasdiqlanmagan ariza uchun joy qancha vaqt saqlanadi?'}
                  </label>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                    {isRu ? 'минут' : 'daqiqa'}
                  </span>
                </div>
                <input
                  type="number"
                  min={5}
                  max={10080}
                  step={5}
                  required
                  value={settings.pendingExpiryMinutes}
                  onChange={(e) => setSettings({ ...settings, pendingExpiryMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-600 bg-white"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {isRu ? (
                    <>
                      <strong>Например:</strong> 30 минут (допустимый диапазон: от 5 минут до 10080 минут / 7 дней). Если заявка не подтверждена за это время, слот автоматически освобождается для других пациентов.
                    </>
                  ) : (
                    <>
                      <strong>Masalan:</strong> 30 daqiqa (ruxsat etilgan oraliq: 5 daqiqadan 10080 daqiqagacha / 7 kun). Agar bemor arizani tasdiqlamasa yoki to&apos;lov qilmasa, vaqt oralig&apos;i avtomatik bekor bo&apos;lib boshqalarga ochiladi.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-700/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}</span>
            </button>
          </div>
        </form>

        {/* 4. BRANCHES MANAGEMENT & LOCATION URLS (Req 17) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Klinika Filiallari va Xaritalar
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mavjud filiallar manzillari, telefonlari, xarita havolalari va faollik holati
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateBranch}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Filial qo&apos;shish</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">{b.nameUz}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        b.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {b.isActive ? 'Faol' : 'Nofaol'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{b.addressUz}</p>
                  <p className="text-xs text-teal-700 font-semibold mt-1">Tel: {b.phone}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ish vaqti: {b.workHours}</p>

                  {/* Branch Location URL */}
                  {b.mapUrl ? (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between">
                      <a
                        href={b.mapUrl.startsWith('http://') || b.mapUrl.startsWith('https://') ? b.mapUrl : `https://${b.mapUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Xaritada ochish</span>
                        <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic mt-2">Xarita havolasi kiritilmagan</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => promptDeleteBranch(b)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                    title="Filialni o'chirish"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isRu ? 'Удалить' : 'O‘chirish'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditBranch(b)}
                    className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    {isRu ? 'Редактировать' : 'Tahrirlash'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Branch Modal */}
        {showBranchModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingBranch ? (isRu ? 'Редактировать филиал' : 'Filialni tahrirlash') : (isRu ? 'Добавить новый филиал' : 'Yangi filial qo\'shish')}
              </h3>

              <form onSubmit={handleSaveBranch} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomi (UZ - Lotin)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchNameUz}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBranchNameUz(val);
                        const trans = translateBranchOrAddress(val);
                        if (!editingBranch || !branchNameRu || branchNameRu === branchNameUz) {
                          setBranchNameRu(trans.ru);
                        }
                      }}
                      placeholder="Bektemir filiali"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomi (RU - Кирил)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchNameRu}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBranchNameRu(val);
                        if (!branchNameUz) {
                          setBranchNameUz(translateBranchOrAddress(val).uz);
                        }
                      }}
                      placeholder="Филиал Бектемир"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manzili (UZ - Lotin)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchAddressUz}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBranchAddressUz(val);
                        const trans = translateBranchOrAddress(val);
                        if (!editingBranch || !branchAddressRu || branchAddressRu === branchAddressUz) {
                          setBranchAddressRu(trans.ru);
                        }
                      }}
                      placeholder="Toshkent sh., Bektemir tumani"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Manzili (RU - Кирил)
                    </label>
                    <input
                      type="text"
                      required
                      value={branchAddressRu}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBranchAddressRu(val);
                        if (!branchAddressUz) {
                          setBranchAddressUz(translateBranchOrAddress(val).uz);
                        }
                      }}
                      placeholder="г. Ташкент, Бектемирский район"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telefon raqami
                  </label>
                  <input
                    type="text"
                    required
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    placeholder="+998711234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                {/* Structured Working Hours with Quick Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Ish tartibi (Ish kunlari va soatlari)
                    </label>
                    <span className="text-[10px] text-slate-400">Tezkor namunalar:</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={branchWorkHours}
                    onChange={(e) => setBranchWorkHours(e.target.value)}
                    placeholder="Dushanba - Shanba: 08:00 - 20:00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600 mb-1.5"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Du - Sha: 08:00 - 20:00',
                      'Du - Sha: 09:00 - 18:00',
                      'Har kuni: 08:00 - 20:00',
                      'Har kuni: 09:00 - 21:00',
                      '24/7 (Kechayu-kunduz)',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBranchWorkHours(preset)}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                          branchWorkHours === preset
                            ? 'bg-teal-700 text-white border-teal-700 font-bold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location URL */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Xarita havolasi (Google Maps, Yandex yoki 2GIS)
                  </label>
                  <input
                    type="url"
                    placeholder="https://maps.google.com/?q=... yoki https://yandex.uz/maps/..."
                    value={branchMapUrl}
                    onChange={(e) => setBranchMapUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Faqat xavfsiz <code>http://</code> yoki <code>https://</code> havolalari qabul qilinadi.
                  </p>
                </div>

                <div>
                  <CustomSelect
                    label="Holati"
                    options={[
                      { value: 'true', label: 'Faol (Active)' },
                      { value: 'false', label: 'Nofaol (Inactive)' },
                    ]}
                    value={branchIsActive ? 'true' : 'false'}
                    onChange={(val) => setBranchIsActive(val === 'true')}
                    placeholder="Holatni tanlang..."
                  />
                </div>

                {/* In-Modal Feedback Alerts */}
                {branchModalError && (
                  <div role="alert" className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{branchModalError}</span>
                  </div>
                )}
                {branchModalSuccess && (
                  <div role="status" className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{branchModalSuccess}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  {editingBranch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowBranchModal(false);
                        promptDeleteBranch(editingBranch);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Filialni o&apos;chirish</span>
                    </button>
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBranchModal(false);
                        setBranchModalError(null);
                        setBranchModalSuccess(null);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      <span>{isSaving ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить филиал' : 'Filialni saqlash')}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Accessible Branch Deletion / Lifecycle Modal */}
      <ModalDialog
        isOpen={Boolean(branchToDelete)}
        onClose={() => {
          if (!isDeletingBranch) {
            setBranchToDelete(null);
            setBranchPreview(null);
            setDeleteBranchError(null);
            setDeleteBranchSuccess(null);
          }
        }}
        title={
          branchPreview
            ? (branchPreview.action === 'BLOCKED_ACTIVE_TREATMENT'
                ? (isRu ? 'Удаление филиала заблокировано: идет лечение' : 'Filialni o\'chirish taqiqlanadi: muolaja jarayonda')
                : (branchPreview.action === 'BLOCKED_FUTURE_APPOINTMENTS' || (branchPreview.futureAppointmentsCount || 0) > 0)
                ? (isRu ? 'Удаление филиала заблокировано: есть будущие приемы' : 'Filialni o\'chirish taqiqlanadi: kelgusi qabullar mavjud')
                : (branchPreview.action === 'DEACTIVATE' || branchPreview.actionType === 'ARCHIVE')
                ? (isRu ? 'Деактивация филиала' : 'Filialni nofaol holatga o\'tkazish')
                : (isRu ? 'Полное удаление филиала' : 'Filialni butunlay o\'chirish'))
            : (isRu ? 'Удаление филиала' : 'Filialni o\'chirish')
        }
        size="md"
      >
        <div className="space-y-4 text-xs">
          {isLoadingBranchPreview ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>{isRu ? 'Проверка клинической истории и привязанных врачей...' : 'Klinik tarix va biriktirilgan shifokorlar tekshirilmoqda...'}</p>
            </div>
          ) : (
            <>
              {deleteBranchSuccess && (
                <div role="status" aria-live="polite" className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{deleteBranchSuccess}</span>
                </div>
              )}

              {deleteBranchError && (
                <div role="alert" aria-live="assertive" className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteBranchError}</span>
                </div>
              )}

              {branchToDelete && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {branchToDelete.nameUz} {branchToDelete.nameRu ? `(${branchToDelete.nameRu})` : ''}
                  </h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {branchToDelete.addressUz || branchToDelete.addressRu || 'Manzil ko\'rsatilmagan'}
                  </p>
                </div>
              )}

              {branchPreview && (
                <div className="space-y-3">
                  {(() => {
                    const activeCount = branchPreview.activeTreatmentsCount ?? branchPreview.activeTreatmentCount ?? 0;
                    const futureCount = branchPreview.futureAppointmentsCount ?? branchPreview.futureAppointmentCount ?? 0;
                    const historyCount = branchPreview.historicalAppointmentsCount ?? branchPreview.historicalAppointmentCount ?? 0;
                    const assignedDocCount = branchPreview.assignedDoctorsCount ?? 0;
                    const isBlocked = activeCount > 0 || futureCount > 0 || !branchPreview.canDelete;
                    const isDeactivate = !isBlocked && (branchPreview.action === 'DEACTIVATE' || branchPreview.actionType === 'ARCHIVE' || historyCount > 0);

                    return (
                      <>
                        <div
                          className={`p-3.5 rounded-xl border ${
                            isBlocked
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : isDeactivate
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-teal-50 border-teal-200 text-teal-900'
                          }`}
                        >
                          <p className="font-bold mb-1">
                            {isBlocked
                              ? (isRu ? 'Внимание! Операция заблокирована системой:' : 'Diqqat! Ushbu amal tizim tomonidan taqiqlangan:')
                              : isDeactivate
                              ? (isRu ? 'Внимание! Филиал будет переведен в неактивное состояние:' : 'Diqqat! Filial nofaol holatga o\'tkaziladi:')
                              : (isRu ? 'Филиал не имеет клинической истории и будет полностью удален:' : 'Filialda hech qanday klinik tarix yo\'q va u butunlay o\'chiriladi:')
                            }
                          </p>
                          <p className="text-[11px] leading-relaxed">
                            {branchPreview.reason || branchPreview.resolutionGuidance || (
                              futureCount > 0
                                ? (isRu
                                    ? `В данном филиале запланировано ${futureCount} будущих приемов. Перед удалением перенесите или отмените приемы.`
                                    : `Ushbu filialda kelgusiga ${futureCount} ta faol qabul rejalashtirilgan. Filialni o'chirishdan oldin ushbu qabullarni boshqa mutaxassis yoki filialga ko'chiring yoki bekor qiling.`)
                                : (isRu ? 'Действие невозможно выполнить.' : 'Ushbu amalni bajarish imkonsiz.')
                            )}
                          </p>
                        </div>

                        {/* Impact Statistics Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">{isRu ? 'Активное лечение (сейчас):' : 'Faol muolaja (hozir):'}</span>
                            <strong className={`text-sm ${activeCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                              {activeCount} ta
                            </strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">{isRu ? 'Будущие приемы:' : 'Kelgusi qabullar:'}</span>
                            <strong className={`text-sm ${futureCount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-800'}`}>
                              {futureCount} ta
                            </strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">{isRu ? 'Исторические приемы:' : 'Tarixiy qabullar:'}</span>
                            <strong className="text-sm text-slate-800">
                              {historyCount} ta
                            </strong>
                          </div>
                          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-slate-500 block">{isRu ? 'Прикрепленные врачи:' : 'Biriktirilgan shifokorlar:'}</span>
                            <strong className="text-sm text-slate-800">
                              {assignedDocCount} ta
                            </strong>
                          </div>
                        </div>

                        {/* List of blocking future appointments */}
                        {branchPreview.futureAppointments && branchPreview.futureAppointments.length > 0 && (
                          <div className="space-y-1.5 p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
                            <span className="font-bold text-[11px] text-amber-950 block">
                              {isRu ? 'Блокирующие будущие приемы филиала:' : 'Filialni bloklayotgan kelgusi qabullar:'}
                            </span>
                            <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                              {branchPreview.futureAppointments.map((appt: any) => (
                                <div key={appt.id} className="p-2 bg-white rounded-lg border border-amber-200/80 flex items-center justify-between text-[11px]">
                                  <div>
                                    <strong className="text-slate-900 block">{appt.patientName}</strong>
                                    <span className="text-slate-500 text-[10px]">
                                      {new Date(appt.startTime).toLocaleString('uz-UZ', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                      {appt.serviceName ? ` • ${appt.serviceName}` : ''}
                                    </span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    {appt.doctorName || appt.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            disabled={isDeletingBranch}
                            onClick={() => {
                              setBranchToDelete(null);
                              setBranchPreview(null);
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                          >
                            {isRu ? 'Отмена' : 'Bekor qilish'}
                          </button>

                          {!isBlocked ? (
                            <button
                              type="button"
                              disabled={isDeletingBranch}
                              onClick={confirmDeleteBranch}
                              className={`px-4 py-2 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer ${
                                isDeactivate
                                  ? 'bg-amber-600 hover:bg-amber-700'
                                  : 'bg-rose-600 hover:bg-rose-700'
                              }`}
                            >
                              {isDeletingBranch && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                              <span>
                                {isDeletingBranch
                                  ? (isRu ? 'Выполняется...' : 'Bajarilmoqda...')
                                  : isDeactivate
                                  ? (isRu ? 'Деактивировать филиал' : 'Filialni nofaol qilish')
                                  : (isRu ? 'Удалить навсегда' : 'Butunlay o\'chirish')}
                              </span>
                            </button>
                          ) : (
                            <div className="text-[11px] font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                              {isRu ? 'Действие заблокировано' : 'Amal bloklangan'}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </ModalDialog>
    </AdminLayout>
  );
}
