'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  PhoneCall,
  UserCheck,
  Stethoscope,
  MessageSquare,
  FileText,
  BarChart3,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ExternalLink,
  UserCog,
  Settings,
} from 'lucide-react';
import { useAuth, StaffRole } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

interface AdminLayoutProps {
  children: React.ReactNode;
  allowedRoles?: StaffRole[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children, allowedRoles }) => {
  const { user, isLoading, logout } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);

  useEffect(() => {
    api.getClinicInfo()
      .then((info) => {
        if (info?.logo) setClinicLogo(info.logo);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/admin/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchPendingCount = async () => {
      try {
        const params: Record<string, any> = { status: 'PENDING', limit: 1 };
        if (user.role === 'DOCTOR' && user.doctorId) {
          params.doctorId = user.doctorId;
        }
        const res = await api.getAdminAppointments(params);
        if (isMounted) setPendingCount(res?.total || 0);
      } catch {}
    };
    fetchPendingCount();

    const handleCountChange = () => {
      fetchPendingCount();
    };

    window.addEventListener('pendingCountChanged', handleCountChange);
    const interval = setInterval(fetchPendingCount, 25000);

    return () => {
      isMounted = false;
      window.removeEventListener('pendingCountChanged', handleCountChange);
      clearInterval(interval);
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm font-semibold">{t.common.loading}</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Role authorization check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Kirish ruxsati cheklangan</h2>
          <p className="text-xs text-slate-500">
            Sizning rolingiz ({user.role}) ushbu bo&apos;limga kirish uchun yetarli vakolatga ega emas.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2.5 bg-teal-700 text-white font-semibold rounded-xl text-xs"
          >
            Boshqaruv paneliga qaytish
          </button>
        </div>
      </div>
    );
  }

  // Navigation items scoped by role:
  // OWNER: full access
  // ADMIN: operational access (all except owner settings)
  // DOCTOR: calendar, appointments, patients
  // EDITOR: cms, reviews
  const allNav = [
    {
      href: '/admin',
      label: t.admin.dashboard,
      icon: LayoutDashboard,
      roles: ['OWNER', 'ADMIN', 'DOCTOR'],
    },
    {
      href: '/admin/calendar',
      label: t.admin.calendar,
      icon: Calendar,
      roles: ['OWNER', 'ADMIN', 'DOCTOR'],
    },
    {
      href: '/admin/patients',
      label: t.admin.patients,
      icon: Users,
      roles: ['OWNER', 'ADMIN', 'DOCTOR'],
    },
    {
      href: '/admin/leads',
      label: t.admin.leads,
      icon: PhoneCall,
      roles: ['OWNER', 'ADMIN'],
    },
    {
      href: '/admin/doctors',
      label: t.admin.doctorsManage,
      icon: UserCheck,
      roles: ['OWNER', 'ADMIN'],
    },
    {
      href: '/admin/services',
      label: t.admin.servicesManage,
      icon: Stethoscope,
      roles: ['OWNER', 'ADMIN'],
    },
    {
      href: '/admin/reviews',
      label: t.admin.reviewsModerate,
      icon: MessageSquare,
      roles: ['OWNER', 'ADMIN', 'EDITOR'],
    },
    {
      href: '/admin/cms',
      label: t.admin.cms,
      icon: FileText,
      roles: ['OWNER', 'ADMIN', 'EDITOR'],
    },
    {
      href: '/admin/analytics',
      label: t.admin.analytics,
      icon: BarChart3,
      roles: ['OWNER', 'ADMIN'],
    },
    {
      href: '/admin/audit',
      label: t.admin.audit,
      icon: ShieldCheck,
      roles: ['OWNER', 'ADMIN'],
    },
    {
      href: '/admin/staff',
      label: 'Xodimlar',
      icon: UserCog,
      roles: ['OWNER'],
    },
    {
      href: '/admin/settings',
      label: 'Sozlamalar',
      icon: Settings,
      roles: ['OWNER'],
    },
  ];

  const visibleNav = allNav.filter((item) => item.roles.includes(user.role));

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            {clinicLogo ? (
              <img
                src={clinicLogo}
                alt="DentaCare Admin"
                className="max-h-9 max-w-[150px] object-contain brightness-110"
              />
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                  </svg>
                </div>
                <div>
                  <span className="font-extrabold text-lg text-white">DentaCare</span>
                  <span className="text-[10px] text-teal-400 block font-bold tracking-wider uppercase">
                    Admin Panel
                  </span>
                </div>
              </>
            )}
          </Link>
        </div>

        {/* User Card */}
        <div className="p-4 mx-3 my-3 bg-slate-800/80 rounded-2xl border border-slate-700/60">
          <p className="text-xs font-bold text-white truncate">{user.email}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-900 text-teal-300 font-bold uppercase">
              {user.role}
            </span>
            <Link
              href="/"
              target="_blank"
              className="text-slate-400 hover:text-white text-[11px] flex items-center gap-1"
              title="Saytni ko'rish"
            >
              <span>Sayt</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-teal-700 text-white shadow-md shadow-teal-700/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {item.href === '/admin/calendar' && pendingCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] shadow-sm animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout button */}
        <div className="p-3 border-t border-slate-800">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.admin.logout}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header Bar */}
        <header className="lg:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg bg-slate-800"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {clinicLogo ? (
              <img
                src={clinicLogo}
                alt="DentaCare Admin"
                className="max-h-7 max-w-[120px] object-contain brightness-110"
              />
            ) : (
              <span className="font-bold text-sm">DentaCare Admin</span>
            )}
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-teal-900 text-teal-300 font-bold uppercase">
            {user.role}
          </span>
        </header>

        {/* Mobile Drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/90 backdrop-blur-sm p-4 animate-fade-in flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="font-bold text-white text-base">Menyu</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-1">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                        active ? 'bg-teal-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                      {item.href === '/admin/calendar' && pendingCount > 0 && (
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] shadow-sm animate-pulse">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full py-3 bg-rose-900/40 text-rose-300 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.admin.logout}</span>
            </button>
          </div>
        )}

        {/* Page Content */}
        <main className="p-4 sm:p-8 flex-1">{children}</main>
      </div>
    </div>
  );
};
