'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Shield, User, RefreshCw, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

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
    RECEPTIONIST: 'bg-amber-100 text-amber-900 border-amber-300',
    EDITOR: 'bg-slate-100 text-slate-800 border-slate-300',
  };

  return (
    <AdminLayout allowedRoles={['OWNER']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Xodimlar va Ruxsatnomalar
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Klinika xodimlari, rollar, shifokor profiliga biriktirish va xavfsizlik nazorati
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
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : staffList.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50">
              Xodimlar ro&apos;yxati bo&apos;sh.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
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
                <tbody className="divide-y divide-slate-100">
                  {staffList.map((member) => {
                    const linkedDoc = doctors.find((d) => d.id === member.doctorId);
                    return (
                      <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-4 px-6 font-bold text-slate-900">
                          {member.fullName}
                        </td>
                        <td className="py-4 px-6 text-slate-600 font-medium">
                          {member.email}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              roleColors[member.role] || 'bg-slate-100'
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-600">
                          {linkedDoc ? (
                            <span className="font-semibold text-teal-800">
                              Dr. {linkedDoc.firstNameUz} {linkedDoc.lastNameUz}
                            </span>
                          ) : member.role === 'DOCTOR' ? (
                            <span className="text-rose-500 font-semibold bg-rose-50 px-2 py-0.5 rounded">
                              Biriktirilmagan (Kirish cheklangan)
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
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
                        <td className="py-4 px-6 text-slate-400 text-[11px]">
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
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition-colors"
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
              <h3 className="text-lg font-extrabold text-slate-900">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To&apos;liq ism (F.I.SH)
                  </label>
                  <input
                    type="text"
                    required
                    value={createFullName}
                    onChange={(e) => setCreateFullName(e.target.value)}
                    placeholder="Masalan: Sardor Aliyev"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email manzil
                  </label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="xodim@dentacare.uz"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Boshlang&apos;ich parol (kamida 6 ta belgi)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vakolat roli
                    </label>
                    <select
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="OWNER">OWNER (To&apos;liq huquq)</option>
                      <option value="ADMIN">ADMIN (Operatsion)</option>
                      <option value="DOCTOR">DOCTOR (Shifokor)</option>
                      <option value="RECEPTIONIST">RECEPTIONIST</option>
                      <option value="EDITOR">EDITOR (CMS / Sharhlar)</option>
                    </select>
                  </div>

                  {createRole === 'DOCTOR' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Shifokor profiliga biriktirish
                      </label>
                      <select
                        value={createDoctorId}
                        onChange={(e) => setCreateDoctorId(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="">Tanlang...</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            Dr. {d.firstNameUz} {d.lastNameUz}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
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
              <h3 className="text-lg font-extrabold text-slate-900">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To&apos;liq ism (F.I.SH)
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Vakolat roli
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="DOCTOR">DOCTOR</option>
                      <option value="RECEPTIONIST">RECEPTIONIST</option>
                      <option value="EDITOR">EDITOR</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hisob holati
                    </label>
                    <select
                      value={editIsActive ? 'true' : 'false'}
                      onChange={(e) => setEditIsActive(e.target.value === 'true')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="true">Faol (Active)</option>
                      <option value="false">Bloklangan (Inactive)</option>
                    </select>
                  </div>
                </div>

                {editRole === 'DOCTOR' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shifokor profiliga biriktirish
                    </label>
                    <select
                      value={editDoctorId}
                      onChange={(e) => setEditDoctorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="">Biriktirilmagan</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.firstNameUz} {d.lastNameUz}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="p-3 bg-amber-50 rounded-xl text-[11px] text-amber-800 border border-amber-200">
                  ⚠️ Eslatma: Rol o&apos;zgartirilsa yoki hisob bloklansa, xodimning joriy seanslari darhol bekor qilinadi.
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
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
