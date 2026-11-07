'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Shield, User, RefreshCw, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { CustomSelect, SelectOption } from '../../../components/CustomSelect';

export default function AdminStaffPage() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Staff Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState('ADMIN');
  const [createDoctorId, setCreateDoctorId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit Staff Modal
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('ADMIN');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editDoctorId, setEditDoctorId] = useState('');
  const [editTelegramId, setEditTelegramId] = useState('');

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [staffRes, docsRes] = await Promise.all([
        api.getStaffList(),
        api.getDoctors(),
      ]);
      setStaffList(staffRes || []);
      setDoctors(docsRes || []);
    } catch (err: any) {
      console.error('Failed to load staff list', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await api.createStaff({
        email: createEmail.trim(),
        password: createPassword,
        fullName: createFullName.trim(),
        role: createRole,
        doctorId: createRole === 'DOCTOR' && createDoctorId ? createDoctorId : undefined,
      });
      setShowCreateModal(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateFullName('');
      setCreateDoctorId('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Xodimni qo\'shishda xatolik yuz berdi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await api.updateStaff(editingStaff.id, {
        fullName: editFullName.trim(),
        role: editRole,
        isActive: editIsActive,
        doctorId: editRole === 'DOCTOR' ? (editDoctorId || null) : null,
        telegramUserId: editTelegramId.trim() || null,
      });
      setEditingStaff(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Xodimni yangilashda xatolik');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleColors: Record<string, string> = {
    OWNER: 'bg-purple-100 text-purple-900 border-purple-300',
    ADMIN: 'bg-teal-100 text-teal-900 border-teal-300',
    DOCTOR: 'bg-blue-100 text-blue-900 border-blue-300',
    EDITOR: 'bg-canvas text-ink border-line-strong',
    RECEPTION: 'bg-amber-100 text-amber-900 border-amber-300',
  };

  const roleLabels: Record<string, string> = {
    OWNER: 'Klinika rahbari',
    ADMIN: 'Administrator',
    DOCTOR: 'Shifokor',
    EDITOR: 'Muharrir',
    RECEPTION: 'Qabulxona',
  };

  // Doctors are public profiles; only some of them have a login. List the ones without one.
  const linkedDoctorIds = new Set(staffList.map((m) => m.doctorId).filter(Boolean));
  const doctorsWithoutLogin = doctors.filter((d: any) => !linkedDoctorIds.has(d.id));
  const startDoctorAccount = (d: any) => {
    setErrorMessage(null);
    setCreateRole('DOCTOR');
    setCreateDoctorId(d.id);
    setCreateFullName(`${d.firstNameUz || ''} ${d.lastNameUz || ''}`.trim());
    setShowCreateModal(true);
  };

  return (
    <AdminLayout allowedRoles={['OWNER']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">
              Xodimlar (panelga kirish)
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">
              Bu yerda admin panelga kim kira olishi va nima qila olishi boshqariladi. Shifokorlarning saytdagi profili
              &quot;Shifokorlar va jadvallar&quot; bo&apos;limida.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setErrorMessage(null);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-700/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi xodim qo&apos;shish</span>
            </button>
            <button
              onClick={loadData}
              className="p-2.5 bg-white border border-line text-ink rounded-xl hover:bg-canvas shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* What each role can do */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['OWNER', "Hamma narsa: sozlamalar, maosh, xodimlar, hisobotlar"],
            ['ADMIN', "Qabullar, bemorlar, kassa, xizmatlar, shifokorlar jadvali"],
            ['RECEPTION', "Qabulxona: qabullar, bemorlarni ro'yxatga olish, kassa"],
            ['DOCTOR', "Faqat o'z bemorlari: karta, tish formulasi, davolash rejasi"],
            ['EDITOR', "Sayt kontenti va sharhlar"],
          ].map(([role, text]) => (
            <div key={role} className="rounded-2xl border border-line bg-white p-3">
              <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${roleColors[role]}`}>{roleLabels[role]}</span>
              <p className="mt-1.5 text-xs text-ink-muted">{text}</p>
            </div>
          ))}
        </div>

        {doctorsWithoutLogin.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-semibold text-ink">Panelga kirish akkaunti yo&apos;q shifokorlar</p>
            <p className="text-xs text-ink-muted">
              Shifokor o&apos;z jadvali va bemorlarini ko&apos;rishi uchun unga akkaunt yarating. Akkaunt shifokor profiliga avtomatik biriktiriladi.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {doctorsWithoutLogin.map((d: any) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => startDoctorAccount(d)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" /> {d.firstNameUz} {d.lastNameUz}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Staff Table */}
        <div className="bg-white rounded-3xl border border-line shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-ink-subtle text-sm">Yuklanmoqda...</div>
          ) : staffList.length === 0 ? (
            <div className="p-16 text-center text-ink-muted text-sm bg-canvas">
              Xodimlar ro&apos;yxati bo&apos;sh.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas border-b border-line text-ink-subtle font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Xodim</th>
                    <th className="py-3.5 px-6">Email</th>
                    <th className="py-3.5 px-6">Rol</th>
                    <th className="py-3.5 px-6">Biriktirilgan shifokor</th>
                    <th className="py-3.5 px-6">Holat</th>
                    <th className="py-3.5 px-6">Oxirgi kirish</th>
                    <th className="py-3.5 px-6 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staffList.map((member) => {
                    const linkedDoc = doctors.find((d) => d.id === member.doctorId);
                    return (
                      <tr key={member.id} className="hover:bg-canvas/70 transition-colors">
                        <td className="py-4 px-6 font-bold text-ink">
                          {member.fullName}
                        </td>
                        <td className="py-4 px-6 text-ink-muted font-medium">
                          {member.email}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              roleColors[member.role] || 'bg-canvas'
                            }`}
                          >
                            {roleLabels[member.role] || member.role}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-ink-muted">
                          {linkedDoc ? (
                            <span className="font-semibold text-teal-800">
                              Dr. {linkedDoc.firstNameUz} {linkedDoc.lastNameUz}
                            </span>
                          ) : member.role === 'DOCTOR' ? (
                            <span className="text-rose-500 font-semibold bg-rose-50 px-2 py-0.5 rounded">
                              Biriktirilmagan (Kirish cheklangan)
                            </span>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              member.isActive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {member.isActive ? 'Faol' : 'Nofaol'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-ink-subtle text-[11px]">
                          {member.lastLoginAt
                            ? new Date(member.lastLoginAt).toLocaleString('uz-UZ', {
                                timeZone: 'Asia/Tashkent',
                              })
                            : 'Kirmagan'}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMessage(null);
                              setEditingStaff(member);
                              setEditFullName(member.fullName);
                              setEditRole(member.role);
                              setEditIsActive(member.isActive);
                              setEditDoctorId(member.doctorId || '');
                              setEditTelegramId(member.telegramUserId || '');
                            }}
                            className="px-3 py-1.5 bg-canvas hover:bg-line text-ink font-bold rounded-lg text-[11px] transition-colors"
                          >
                            Tahrirlash
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create Staff Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-extrabold text-ink">
                Yangi xodim hisobi yaratish
              </h3>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    To&apos;liq ism (F.I.SH)
                  </label>
                  <input
                    type="text"
                    required
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    placeholder="Masalan: Sardor Aliyev"
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Email manzil
                  </label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="xodim@dentacare.uz"
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Boshlang&apos;ich parol (kamida 6 ta belgi)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomSelect
                    label="Vakolat roli"
                    options={[
                      { value: 'OWNER', label: 'OWNER (To‘liq huquq)', badge: 'Owner' },
                      { value: 'ADMIN', label: 'ADMIN (Operatsion)', badge: 'Admin' },
                      { value: 'DOCTOR', label: 'DOCTOR (Shifokor)', badge: 'Doctor' },
                      { value: 'RECEPTION', label: 'RECEPTION (Qabulxona / kassa)', badge: 'Reception' },
                      { value: 'EDITOR', label: 'EDITOR (CMS / Sharhlar)', badge: 'Editor' },
                    ]}
                    value={createRole}
                    onChange={(val) => setCreateRole(val)}
                  />

                  {createRole === 'DOCTOR' && (
                    <CustomSelect
                      label="Shifokor profiliga biriktirish"
                      options={[
                        { value: '', label: 'Tanlang...' },
                        ...doctors.map((d) => ({
                          value: d.id,
                          label: `Dr. ${d.firstNameUz} ${d.lastNameUz}`,
                          badge: d.specialtyUz || undefined,
                        })),
                      ]}
                      value={createDoctorId}
                      onChange={(val) => setCreateDoctorId(val)}
                    />
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-canvas rounded-xl"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? 'Qo\'shilmoqda...' : 'Hisobni yaratish'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Staff Modal */}
        {editingStaff && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-extrabold text-ink">
                Xodim ma&apos;lumotlarini tahrirlash: {editingStaff.email}
              </h3>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    To&apos;liq ism (F.I.SH)
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomSelect
                    label="Vakolat roli"
                    options={[
                      { value: 'OWNER', label: 'OWNER (To‘liq huquq)', badge: 'Owner' },
                      { value: 'ADMIN', label: 'ADMIN (Operatsion)', badge: 'Admin' },
                      { value: 'DOCTOR', label: 'DOCTOR (Shifokor)', badge: 'Doctor' },
                      { value: 'RECEPTION', label: 'RECEPTION (Qabulxona / kassa)', badge: 'Reception' },
                      { value: 'EDITOR', label: 'EDITOR (CMS / Sharhlar)', badge: 'Editor' },
                    ]}
                    value={editRole}
                    onChange={(val) => setEditRole(val)}
                  />

                  <CustomSelect
                    label="Hisob holati"
                    options={[
                      { value: 'true', label: 'Faol (Active)' },
                      { value: 'false', label: 'Bloklangan (Inactive)' },
                    ]}
                    value={editIsActive ? 'true' : 'false'}
                    onChange={(val) => setEditIsActive(val === 'true')}
                  />
                </div>

                {editRole === 'DOCTOR' && (
                  <CustomSelect
                    label="Shifokor profiliga biriktirish"
                    options={[
                      { value: '', label: 'Biriktirilmagan' },
                      ...doctors.map((d) => ({
                        value: d.id,
                        label: `Dr. ${d.firstNameUz} ${d.lastNameUz}`,
                        badge: d.specialtyUz || undefined,
                      })),
                    ]}
                    value={editDoctorId}
                    onChange={(val) => setEditDoctorId(val)}
                  />
                )}

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Telegram ID (ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{5,15}"
                    placeholder="Masalan: 123456789"
                    value={editTelegramId}
                    onChange={(e) => setEditTelegramId(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 rounded-xl border border-line text-xs focus:ring-2 focus:ring-teal-600"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Xodim klinika botiga <code>/myid</code> yuborib raqamini oladi. Shifokorlar har kuni 08:00 da
                    o&apos;z qabullari jadvalini shu Telegram&apos;ga oladi. Bo&apos;sh qoldirilsa, bog&apos;lanish olib tashlanadi.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl text-[11px] text-amber-800 border border-amber-200">
                  ⚠️ Eslatma: Rol o&apos;zgartirilsa yoki hisob bloklansa, xodimning joriy seanslari darhol bekor qilinadi.
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-canvas rounded-xl"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saqlanmoqda...' : 'O\'zgarishlarni saqlash'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
