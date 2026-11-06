'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Phone,
  Calendar,
  Menu,
  X,
  ChevronDown,
  Info,
  DollarSign,
  MessageSquare,
  BookOpen,
  HelpCircle,
  Stethoscope,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useBrand } from '../lib/brand';
import { CallbackModal } from './CallbackModal';
import { api } from '../lib/api';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { language, setLanguage, t } = useI18n();
  const isRu = language === 'ru';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false);
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);
  const brand = useBrand();
  const clinicLogo = brand.logo;
  const [logoError, setLogoError] = useState(false);
  const clinicName = brand.clinicName(language);
  const clinicPhone = (brand.clinic?.phone as string) || '';

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const clinicButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setLogoError(false), [clinicLogo]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClinicDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle focus into mobile drawer when opened
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => {
        drawerCloseBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Handle keyboard: Escape & Tab focus trap in mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          menuButtonRef.current?.focus();
        }
        if (clinicDropdownOpen) {
          setClinicDropdownOpen(false);
          clinicButtonRef.current?.focus();
        }
        return;
      }

      // Trap focus in open mobile drawer
      if (mobileMenuOpen && drawerRef.current && e.key === 'Tab') {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, clinicDropdownOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const clinicItems = [
    { href: '/about', label: t.nav.about, icon: Info },
    { href: '/prices', label: t.nav.prices, icon: DollarSign },
    { href: '/reviews', label: t.nav.reviews, icon: MessageSquare },
    { href: '/articles', label: t.nav.articles, icon: BookOpen },
    { href: '/faq', label: 'FAQ', icon: HelpCircle },
  ];

  const isClinicActive = clinicItems.some((item) => isActive(item.href));

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-line transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* 1. Clinic Brand Logo on the Left */}
          <Link
            href="/"
            className="flex items-center gap-2.5 sm:gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-2xl py-1 pr-1 shrink-0"
            aria-label={`${clinicName} - ${t.nav.home}`}
          >
            {clinicLogo && !logoError ? (
              <Image
                src={clinicLogo}
                alt={clinicName}
                width={190}
                height={44}
                unoptimized
                onError={() => setLogoError(true)}
                className="h-10 sm:h-11 max-w-[160px] sm:max-w-[190px] object-contain"
              />
            ) : (
              <>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-brand-600 to-secondary-600 flex items-center justify-center text-white shadow-md shadow-brand-600/25 group-hover:scale-105 transition-transform shrink-0">
                  <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink group-hover:text-brand-600 transition-colors truncate block">
                    {clinicName}
                  </span>
                  <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-ink-muted truncate">
                    {language === 'ru' ? 'Стоматологическая клиника' : 'Stomatologiya klinikasi'}
                  </p>
                </div>
              </>
            )}
          </Link>

          {/* 2. Primary Navigation Row in the Middle (Desktop lg:flex) */}
          <nav className="hidden lg:flex items-center gap-1.5" aria-label="Asosiy menyu">
            {/* Services */}
            <Link
              href="/services"
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                isActive('/services')
                  ? 'bg-brand-50 text-brand-600 font-bold shadow-sm'
                  : 'text-ink hover:text-brand-600 hover:bg-brand-50'
              }`}
            >
              {t.nav.services}
            </Link>

            {/* Doctors */}
            <Link
              href="/doctors"
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                isActive('/doctors')
                  ? 'bg-brand-50 text-brand-600 font-bold shadow-sm'
                  : 'text-ink hover:text-brand-600 hover:bg-brand-50'
              }`}
            >
              {t.nav.doctors}
            </Link>

            {/* Clinic Dropdown with accessible keyboard handling */}
            <div className="relative" ref={dropdownRef}>
              <button
                ref={clinicButtonRef}
                type="button"
                onClick={() => setClinicDropdownOpen(!clinicDropdownOpen)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && !clinicDropdownOpen) {
                    e.preventDefault();
                    setClinicDropdownOpen(true);
                  }
                }}
                aria-expanded={clinicDropdownOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer ${
                  isClinicActive || clinicDropdownOpen
                    ? 'bg-brand-50 text-brand-600 font-bold shadow-sm'
                    : 'text-ink hover:text-brand-600 hover:bg-brand-50'
                }`}
              >
                <span>{t.nav.clinic || (language === 'ru' ? 'Клиника' : 'Klinika')}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    clinicDropdownOpen ? 'rotate-180 text-brand-600' : 'text-ink-muted'
                  }`}
                />
              </button>

              {clinicDropdownOpen && (
                <div
                  className="absolute left-0 mt-2.5 w-64 bg-white rounded-2xl shadow-xl border border-line py-2 z-50 animate-fade-in"
                  role="menu"
                  aria-orientation="vertical"
                >
                  {clinicItems.map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setClinicDropdownOpen(false)}
                        role="menuitem"
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'bg-brand-50 text-brand-600 font-bold'
                            : 'text-ink hover:bg-brand-50 hover:text-brand-600'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Contacts */}
            <Link
              href="/contacts"
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                isActive('/contacts')
                  ? 'bg-brand-50 text-brand-600 font-bold shadow-sm'
                  : 'text-ink hover:text-brand-600 hover:bg-brand-50'
              }`}
            >
              {t.nav.contacts}
            </Link>
          </nav>

          {/* 3. Right Section: Phone, Language Switcher & Book Appointment CTA */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Direct Phone Link (Desktop) */}
            {clinicPhone && (
              <a
                href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                className="hidden xl:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-ink hover:text-brand-600 hover:bg-brand-50 transition-colors"
                title={language === 'ru' ? 'Позвонить в клинику' : 'Klinikaga qo\'ng\'iroq qilish'}
              >
                <Phone className="w-3.5 h-3.5 text-brand-600" />
                <span>{clinicPhone}</span>
              </a>
            )}

            {/* Language Switcher Pill (Fits comfortably at 360px) */}
            <div
              className="flex items-center bg-brand-50 rounded-xl p-0.5 sm:p-1 border border-line"
              role="group"
              aria-label={t.common.selectLanguage}
            >
              <button
                id="lang-btn-uz"
                type="button"
                onClick={() => setLanguage('uz')}
                aria-label="O'zbekcha"
                aria-pressed={language === 'uz'}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  language === 'uz'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                UZ
              </button>
              <button
                id="lang-btn-ru"
                type="button"
                onClick={() => setLanguage('ru')}
                aria-label="Русский"
                aria-pressed={language === 'ru'}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  language === 'ru'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                RU
              </button>
            </div>

            {/* Book Appointment CTA Button (Desktop) */}
            <Link
              href="/booking"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md shadow-brand-600/20 hover:shadow-lg transition-all transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>{t.common.bookAppointment}</span>
            </Link>

            {/* Mobile menu trigger */}
            <button
              id="mobile-menu-trigger-btn"
              ref={menuButtonRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-ink hover:text-brand-600 rounded-xl hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 cursor-pointer"
              aria-label={mobileMenuOpen ? (language === 'ru' ? 'Закрыть меню' : 'Menyuni yopish') : (language === 'ru' ? 'Меню' : 'Menyu')}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Accessible Mobile Drawer & Overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-brand-950/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => {
                setMobileMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
              aria-hidden="true"
            />

            {/* Menu Panel with Focus Trap & Visible Close Button */}
            <div
              id="mobile-navigation"
              ref={drawerRef}
              className="fixed top-0 right-0 w-full sm:w-96 bottom-0 bg-white z-50 lg:hidden overflow-y-auto px-6 py-6 space-y-6 shadow-2xl animate-fade-in border-l border-line flex flex-col justify-between"
              role="dialog"
              aria-modal="true"
              aria-label={language === 'ru' ? 'Мобильное меню навигации' : 'Mobil navigatsiya menyusi'}
            >
              <div className="space-y-6">
                {/* Header with Title and Visible Close Button */}
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <span className="font-extrabold text-base text-ink">
                    {clinicName}
                  </span>
                  <button
                    id="mobile-drawer-close-btn"
                    ref={drawerCloseBtnRef}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      menuButtonRef.current?.focus();
                    }}
                    className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-brand-50 transition-colors cursor-pointer"
                    aria-label={language === 'ru' ? 'Закрыть меню' : 'Menyuni yopish'}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Primary links */}
                <div className="space-y-1">
                  <Link
                    href="/services"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                      isActive('/services')
                        ? 'bg-brand-50 text-brand-600 font-bold'
                        : 'text-ink hover:bg-brand-50'
                    }`}
                  >
                    {t.nav.services}
                  </Link>

                  <Link
                    href="/doctors"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                      isActive('/doctors')
                        ? 'bg-brand-50 text-brand-600 font-bold'
                        : 'text-ink hover:bg-brand-50'
                    }`}
                  >
                    {t.nav.doctors}
                  </Link>

                  {/* Klinika section with secondary links */}
                  <div className="pt-3 pb-1">
                    <p className="px-4 text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
                      {t.nav.clinic || (language === 'ru' ? 'Клиника' : 'Klinika')}
                    </p>
                    <div className="pl-2 space-y-1">
                      {clinicItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isActive(item.href)
                              ? 'bg-brand-50 text-brand-600 font-bold'
                              : 'text-ink-muted hover:bg-brand-50 hover:text-ink'
                          }`}
                        >
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <Link
                    href="/contacts"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                      isActive('/contacts')
                        ? 'bg-brand-50 text-brand-600 font-bold'
                        : 'text-ink hover:bg-brand-50'
                    }`}
                  >
                    {t.nav.contacts}
                  </Link>
                </div>
              </div>

              {/* Action Buttons: Qabulga yozilish & Direct Call */}
              <div className="pt-4 border-t border-line space-y-3">
                <Link
                  href="/booking"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-brand-600/25 active:scale-95 transition-all text-sm cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{t.common.bookAppointment}</span>
                </Link>

                {clinicPhone && (
                  <a
                    href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                    className="w-full py-3 border border-line hover:border-brand-600 text-ink rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-brand-50 transition-colors text-sm"
                  >
                    <Phone className="w-4 h-4 text-brand-600" />
                    <span>{clinicPhone}</span>
                  </a>
                )}

                <div className="pt-2 text-center">
                  <Link
                    href="/admin/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-xs text-ink-muted hover:text-brand-600 transition-colors font-medium"
                  >
                    {t.nav.admin}
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {/* Fast Callback Modal */}
      <CallbackModal isOpen={callbackModalOpen} onClose={() => setCallbackModalOpen(false)} />
    </>
  );
};
