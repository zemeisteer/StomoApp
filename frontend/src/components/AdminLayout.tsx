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
  Building2,
  Globe,
  Bell,
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
  const { t, language, setLanguage } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [clinicName, setClinicName] = useState<string>('DentaCare');
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    api.getClinicInfo()
      .then((info) => {
        if (info?.logo) setClinicLogo(info.logo);
        if (info?.name) setClinicName(info.name);
      })
      .catch(() => {});

    api.getBranches()
      .then((res) => {
        if (Array.isArray(res)) setBranches(res);
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
      <div className="min-h-screen bg-[#12353b] flex items-center justify-center text-white">
        <div className="w-8 h-8 border-3 border-[#167b78] border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm font-semibold text-[#e8f3f2]">{t.common.loading}</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-[#f3f8f7] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center space-y-4 border border-[#d8e5e2]">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-[#152f34]">Kirish ruxsati cheklangan</h2>
          <p className="text-sm text-[#52696e]">
            Sizning rolingiz ({user.role}) ushbu bo&apos;limga kirish uchun yetarli vakolatga ega emas.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2.5 bg-[#167b78] hover:bg-[#116460] text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Boshqaruv paneliga qaytish
          </button>
        </div>
      </div>
    );
  }

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
      label: language === 'ru' ? 'Сотрудники' : 'Xodimlar',
      icon: UserCog,
      roles: ['OWNER'],
    },
    {
      href: '/admin/settings',
      label: language === 'ru' ? 'Настройки' : 'Sozlamalar',
      icon: Settings,
      roles: ['OWNER'],
    },
  ];

  const visibleNav = allNav.filter((item) => item.roles.includes(user.role));

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  // Compute active page title
  const currentNavItem = visibleNav.find((item) => isActive(item.href)) || {
    label: language === 'ru' ? 'Управление' : 'Boshqaruv',
  };

  return (
    <div className="min-h-screen bg-[#f3f8f7] flex">
      {/* Desktop Sidebar (Image 4 & 2 visual language: deep teal, clean active item, clear hierarchy) */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#12353b] text-[#e8f3f2] border-r border-[#1e464d] shrink-0 sticky top-0 h-screen z-20">
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-[#1e464d] flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-3">
            {clinicLogo && !logoError ? (
              <img
                src={clinicLogo}
                alt={clinicName}
                onError={() => setLogoError(true)}
                className="clinic-logo max-h-9 max-w-[140px] brightness-110"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#167b78] flex items-center justify-center text-white shadow-sm">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                  </svg>
                </div>
                <div>
                  <span className="font-bold text-base tracking-tight text-white block leading-tight">
                    {clinicName}
                  </span>
                  <span className="text-[10px] text-[#b2c9ca] font-medium tracking-wide block">
                    Dental OS
                  </span>
                </div>
              </div>
            )}
          </Link>
        </div>

        {/* User Card */}
        <div className="p-3 mx-3 my-3 bg-[#18424a] rounded-xl border border-[#23535d]/60 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#167b78] text-white flex items-center justify-center font-bold text-xs shrink-0">
            {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {user.fullName || user.email}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#245158] text-[#86efac] font-bold tracking-wider uppercase">
                {user.role}
              </span>
            </div>
          </div>
          <Link
            href="/"
            target="_blank"
            className="p-1.5 text-[#b2c9ca] hover:text-white hover:bg-[#245158] rounded-lg transition-colors"
            title={language === 'ru' ? "Перейти на сайт клиники" : "Klinika saytiga o'tish"}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-[#245158] text-white shadow-xs font-semibold'
                    : 'text-[#b2c9ca] hover:bg-[#1a434a] hover:text-[#e8f3f2]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#a7f3d0]' : 'text-[#8ea9ab]'}`} />
                <span className="truncate">{item.label}</span>
                {item.href === '/admin/calendar' && pendingCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold text-[11px] shadow-xs">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout Footer */}
        <div className="p-3 border-t border-[#1e464d]">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.admin.logout}</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Compact Clean Top Bar (Desktop & Mobile) */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-[#d8e5e2] px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          {/* Left: Mobile trigger & Page Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-[#152f34] hover:bg-[#f0f7f5] rounded-xl border border-[#d8e5e2]"
              aria-label={language === 'ru' ? "Открыть меню" : "Menyu ochish"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[#152f34] tracking-tight leading-tight">
                {currentNavItem.label}
              </h1>
            </div>
          </div>

          {/* Right: Branch Info, Language Switcher, Profile Pill */}
          <div className="flex items-center gap-2 sm:gap-3">
            {branches.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#f0f7f5] text-[#152f34] rounded-xl border border-[#d8e5e2] text-xs font-medium">
                <Building2 className="w-3.5 h-3.5 text-[#167b78]" />
                <span>
                  {branches.length === 1
                    ? (language === 'ru' ? branches[0].nameRu : branches[0].nameUz)
                    : (language === 'ru' ? `${branches.length} филиалов` : `${branches.length} ta filial`)}
                </span>
              </div>
            )}

            {/* Language Switcher */}
            <div className="flex items-center bg-[#f0f7f5] p-0.5 rounded-xl border border-[#d8e5e2]">
              <button
                type="button"
                onClick={() => setLanguage('uz')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                  language === 'uz'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                UZ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ru')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                  language === 'ru'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                RU
              </button>
            </div>

            {/* Staff User Avatar Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#d8e5e2]">
              <div className="w-8 h-8 rounded-full bg-[#e0f2ed] text-[#167b78] font-bold flex items-center justify-center text-xs border border-[#167b78]/30">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-[#152f34] leading-tight truncate max-w-[120px]">
                  {user.fullName || user.email.split('@')[0]}
                </p>
                <p className="text-[10px] text-[#52696e] font-medium leading-tight">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Slide-over Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />

            {/* Drawer Content */}
            <div className="relative w-72 max-w-[85vw] bg-[#12353b] text-[#e8f3f2] h-full flex flex-col justify-between shadow-2xl p-4 z-10 animate-fade-in">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e464d]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#167b78] flex items-center justify-center text-white">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                      </svg>
                    </div>
                    <span className="font-bold text-white text-base">{clinicName}</span>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 text-[#b2c9ca] hover:text-white rounded-lg"
                    aria-label={language === 'ru' ? "Закрыть" : "Yopish"}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-3 bg-[#18424a] rounded-xl border border-[#23535d]/60">
                  <p className="text-xs font-semibold text-white truncate">{user.email}</p>
                  <span className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-[#245158] text-[#86efac] font-bold uppercase">
                    {user.role}
                  </span>
                </div>

                {/* Nav list */}
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {visibleNav.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                          active
                            ? 'bg-[#245158] text-white font-semibold'
                            : 'text-[#b2c9ca] hover:bg-[#1a434a] hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                        {item.href === '/admin/calendar' && pendingCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold text-[10px]">
                            {pendingCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[#1e464d] space-y-2">
                <Link
                  href="/"
                  target="_blank"
                  className="w-full py-2.5 px-3 bg-[#18424a] text-[#b2c9ca] hover:text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{language === 'ru' ? 'Сайт клиники' : 'Klinika sayti'}</span>
                </Link>
                <button
                  onClick={logout}
                  className="w-full py-2.5 px-3 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.admin.logout}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-full">
          {children}
        </main>
      </div>
    </div>
  );
};
