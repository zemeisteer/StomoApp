'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  ChevronLeft,
  ChevronRight,
  Send,
  Wallet,
  BellRing,
  Package,
  HandCoins,
} from 'lucide-react';
import { useAuth, StaffRole } from '../lib/auth';
import { TelegramLinkModal } from './admin/TelegramLinkModal';
import { useI18n } from '../lib/i18n';
import { useBrand } from '../lib/brand';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Each admin page mounts its own layout, so keep the sidebar where the user left it.
  const navRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    try {
      const saved = Number(sessionStorage.getItem('admin-nav-scroll') || 0);
      if (saved > 0) el.scrollTop = saved;
    } catch {}
  }, []);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const brand = useBrand();
  const clinicLogo = brand.logo;
  const [logoError, setLogoError] = useState(false);
  const clinicName = brand.clinicName(language);
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-brand-600 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-sm font-medium text-ink-muted">{t.common.loading}</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center space-y-4 border border-line">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-ink">Kirish ruxsati cheklangan</h2>
          <p className="text-sm text-ink-muted">
            Sizning rolingiz ({user.role}) ushbu bo&apos;limga kirish uchun yetarli vakolatga ega emas.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors"
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
      roles: ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'],
    },
    {
      href: '/admin/calendar',
      label: t.admin.calendar,
      icon: Calendar,
      roles: ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'],
    },
    {
      href: '/admin/patients',
      label: t.admin.patients,
      icon: Users,
      roles: ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'],
    },
    {
      href: '/admin/cashier',
      label: language === 'ru' ? 'Касса' : 'Kassa',
      icon: Wallet,
      roles: ['OWNER', 'ADMIN', 'RECEPTION'],
    },
    {
      href: '/admin/recall',
      label: language === 'ru' ? 'Повторные визиты' : 'Qayta chaqirish',
      icon: BellRing,
      roles: ['OWNER', 'ADMIN', 'RECEPTION'],
    },
    {
      href: '/admin/inventory',
      label: language === 'ru' ? 'Склад' : 'Ombor',
      icon: Package,
      roles: ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'],
    },
    {
      href: '/admin/payroll',
      label: language === 'ru' ? 'Зарплата' : 'Xodimlar maoshi',
      icon: HandCoins,
      roles: ['OWNER'],
    },
    {
      href: '/admin/leads',
      label: t.admin.leads,
      icon: PhoneCall,
      roles: ['OWNER', 'ADMIN', 'RECEPTION'],
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
      href: '/admin/notifications',
      label: language === 'ru' ? 'Уведомления' : 'Xabarnomalar',
      icon: Bell,
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

  const isRu = language === 'ru';
  const NAV_GROUPS: Array<{ key: string; label: string; hrefs: string[] }> = [
    { key: 'work', label: isRu ? 'Работа' : 'Ish', hrefs: ['/admin', '/admin/calendar', '/admin/patients', '/admin/cashier', '/admin/recall', '/admin/leads'] },
    { key: 'clinic', label: isRu ? 'Клиника' : 'Klinika', hrefs: ['/admin/doctors', '/admin/services', '/admin/inventory', '/admin/reviews', '/admin/cms'] },
    { key: 'manage', label: isRu ? 'Управление' : 'Boshqaruv', hrefs: ['/admin/payroll', '/admin/audit', '/admin/notifications', '/admin/staff', '/admin/settings'] },
  ];
  const groupedNav = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.hrefs.map((h) => visibleNav.find((n) => n.href === h)).filter(Boolean) as typeof visibleNav,
  })).filter((g) => g.items.length > 0);

  const initial = (user.fullName || user.email).charAt(0).toUpperCase();
  const roleLabel: Record<string, string> = isRu
    ? { OWNER: 'Владелец', ADMIN: 'Администратор', DOCTOR: 'Врач', EDITOR: 'Редактор' }
    : { OWNER: 'Rahbar', ADMIN: 'Administrator', DOCTOR: 'Shifokor', EDITOR: 'Muharrir' };

  const brandMark = (compact = false) =>
    clinicLogo && !logoError && !compact ? (
      <Image
        src={clinicLogo}
        alt={clinicName}
        width={150}
        height={36}
        unoptimized
        onError={() => setLogoError(true)}
        className="clinic-logo h-9 w-auto max-w-[150px] object-contain"
      />
    ) : (
      <span className="flex items-center gap-2.5 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-soft shrink-0">
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
          </svg>
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block font-bold text-[15px] tracking-tight text-ink leading-tight truncate">{clinicName}</span>
            <span className="block text-[11px] text-ink-subtle font-medium">{isRu ? 'Панель управления' : 'Boshqaruv paneli'}</span>
          </span>
        )}
      </span>
    );

  const navList = (collapsed: boolean, onNavigate?: () => void) => (
    <div className="space-y-5">
      {groupedNav.map((group) => (
        <div key={group.key}>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{group.label}</p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center rounded-lg text-[13px] font-medium transition-colors ${
                    collapsed ? 'justify-center h-10' : 'gap-2.5 px-3 h-9'
                  } ${active ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-muted hover:bg-canvas hover:text-ink'}`}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-600" />}
                  <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-brand-600' : 'text-ink-subtle'}`} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.href === '/admin/calendar' && pendingCount > 0 && (
                    <span
                      className={
                        collapsed
                          ? 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white'
                          : 'ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center justify-center'
                      }
                    >
                      {!collapsed && pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const footerBtn = (collapsed: boolean) =>
    `w-full flex items-center rounded-lg text-[13px] font-medium transition-colors ${collapsed ? 'justify-center h-9' : 'gap-2.5 px-3 h-9'}`;

  const siteLabel = isRu ? 'Сайт клиники' : 'Klinika sayti';

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* Desktop sidebar: light surface so any clinic logo stays legible; brand color marks the active item */}
      <aside
        className={`hidden lg:flex print:!hidden flex-col bg-white border-r border-line shrink-0 sticky top-0 h-screen z-20 transition-[width] duration-200 ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className={`h-16 flex items-center border-b border-line ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}>
          <Link href="/admin" className="flex items-center min-w-0" aria-label={clinicName}>
            {brandMark(isCollapsed)}
          </Link>
        </div>

        <nav
          ref={navRef}
          onScroll={(e) => {
            try {
              sessionStorage.setItem('admin-nav-scroll', String(e.currentTarget.scrollTop));
            } catch {}
          }}
          className={`flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-2' : 'px-3'}`}
        >{navList(isCollapsed)}</nav>

        <div className={`border-t border-line py-3 space-y-0.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          <Link href="/" target="_blank" className={`${footerBtn(isCollapsed)} text-ink-muted hover:bg-canvas hover:text-ink`} title={siteLabel}>
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>{siteLabel}</span>}
          </Link>
          <button type="button" onClick={() => setTelegramOpen(true)} className={`${footerBtn(isCollapsed)} text-ink-muted hover:bg-canvas hover:text-ink`} title="Telegram">
            <Send className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Telegram</span>}
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`${footerBtn(isCollapsed)} text-ink-muted hover:bg-canvas hover:text-ink`}
            title={isCollapsed ? (isRu ? 'Развернуть меню' : 'Kengaytirish') : isRu ? 'Свернуть меню' : 'Kichraytirish'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
            {!isCollapsed && <span>{isRu ? 'Свернуть' : 'Kichraytirish'}</span>}
          </button>

          <div className={`mt-2 pt-3 border-t border-line flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-2.5 px-1'}`}>
            <span
              className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0"
              title={`${user.fullName || user.email} (${user.role})`}
            >
              {initial}
            </span>
            {!isCollapsed && (
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink truncate leading-tight">{user.fullName || user.email.split('@')[0]}</span>
                <span className="block text-[11px] text-ink-subtle truncate">{roleLabel[user.role] || user.role}</span>
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-lg text-ink-subtle hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title={t.admin.logout}
              aria-label={t.admin.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <TelegramLinkModal isOpen={telegramOpen} onClose={() => setTelegramOpen(false)} language={isRu ? 'ru' : 'uz'} />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <header className="print:hidden h-16 bg-white/85 backdrop-blur-md border-b border-line px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-ink hover:bg-canvas rounded-lg border border-line"
              aria-label={isRu ? 'Открыть меню' : 'Menyu ochish'}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-[17px] font-semibold text-ink tracking-tight truncate">{currentNavItem.label}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {branches.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 h-8 px-3 text-ink-muted rounded-lg border border-line text-xs font-medium bg-white">
                <Building2 className="w-3.5 h-3.5 text-ink-subtle" />
                <span>
                  {branches.length === 1
                    ? isRu
                      ? branches[0].nameRu
                      : branches[0].nameUz
                    : isRu
                      ? `${branches.length} филиала`
                      : `${branches.length} ta filial`}
                </span>
              </div>
            )}

            <div className="flex items-center h-8 p-0.5 rounded-lg border border-line bg-canvas" role="group" aria-label={isRu ? 'Язык' : 'Til'}>
              {(['uz', 'ru'] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLanguage(lng)}
                  aria-pressed={language === lng}
                  className={`h-full px-2.5 text-[11px] font-bold rounded-md transition-colors ${
                    language === lng ? 'bg-white text-ink shadow-soft' : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>

            <span className="lg:hidden w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">{initial}</span>
          </div>
        </header>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
            <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-popover z-10 animate-fade-in">
              <div className="h-16 px-4 flex items-center justify-between border-b border-line">
                {brandMark()}
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-ink-subtle hover:text-ink rounded-lg" aria-label={isRu ? 'Закрыть' : 'Yopish'}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-4">{navList(false, () => setSidebarOpen(false))}</nav>
              <div className="border-t border-line p-3 space-y-0.5">
                <div className="flex items-center gap-2.5 px-1 pb-2">
                  <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">{initial}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink truncate">{user.fullName || user.email}</span>
                    <span className="block text-[11px] text-ink-subtle">{roleLabel[user.role] || user.role}</span>
                  </span>
                </div>
                <Link href="/" target="_blank" className={`${footerBtn(false)} text-ink-muted hover:bg-canvas`}>
                  <ExternalLink className="w-4 h-4" />
                  <span>{siteLabel}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    setTelegramOpen(true);
                  }}
                  className={`${footerBtn(false)} text-ink-muted hover:bg-canvas`}
                >
                  <Send className="w-4 h-4" />
                  <span>Telegram</span>
                </button>
                <button onClick={logout} className={`${footerBtn(false)} text-rose-600 hover:bg-rose-50`}>
                  <LogOut className="w-4 h-4" />
                  <span>{t.admin.logout}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-full pb-24 lg:pb-8 print:p-0">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-line px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex items-center justify-around">
        {[
          { href: '/admin', icon: LayoutDashboard, label: isRu ? 'Главная' : 'Asosiy', exact: true },
          { href: '/admin/calendar', icon: Calendar, label: isRu ? 'Календарь' : 'Taqvim', exact: false },
          { href: '/admin/patients', icon: Users, label: isRu ? 'Пациенты' : 'Bemorlar', exact: false },
          { href: '/admin/analytics', icon: BarChart3, label: isRu ? 'Аналитика' : 'Hisobot', exact: false },
        ]
          .filter((item) => visibleNav.some((n) => n.href === item.href))
          .map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors ${
                  active ? 'text-brand-700' : 'text-ink-subtle hover:text-ink'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={`text-[10px] mt-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                {item.href === '/admin/calendar' && pendingCount > 0 && (
                  <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
                )}
              </Link>
            );
          })}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex flex-col items-center justify-center px-3 py-1 rounded-lg text-ink-subtle hover:text-ink transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 font-medium">{isRu ? 'Меню' : 'Menyu'}</span>
        </button>
      </nav>
    </div>
  );
};
