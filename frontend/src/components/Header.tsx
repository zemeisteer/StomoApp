'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
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
import { CallbackModal } from './CallbackModal';
import { api } from '../lib/api';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { language, setLanguage, t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false);
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [clinicPhone, setClinicPhone] = useState<string>('+998 71 200 45 45');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const clinicButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isMounted = true;
    api.getClinicInfo()
      .then((info) => {
        if (!isMounted) return;
        if (info?.logo) setClinicLogo(info.logo);
        if (info?.phone) setClinicPhone(info.phone);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Handle Escape key to close mobile menu or clinic dropdown and restore focus
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, clinicDropdownOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const clinicItems = [
    { href: '/about', label: t.nav.about, icon: Info },
    { href: '/prices', label: t.nav.prices, icon: DollarSign },
    { href: '/reviews', label: t.nav.reviews, icon: MessageSquare },
    { href: '/articles', label: t.nav.articles, icon: BookOpen },
    { href: '/faq', label: t.nav.faq, icon: HelpCircle },
  ];

  const isClinicActive = clinicItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Clean Single Primary Header Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#d8e5e2] shadow-[0_2px_12px_rgba(21,47,52,0.04)] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* 1. Clinic Brand Logo on the Left */}
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78] rounded-2xl py-1 pr-2"
            aria-label={`${t.common.clinicName} - ${t.nav.home}`}
          >
            {clinicLogo ? (
              <img
                src={clinicLogo}
                alt={t.common.clinicName}
                className="h-11 max-w-[190px] object-contain"
              />
            ) : (
              <>
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#167b78] to-[#2bb49c] flex items-center justify-center text-white shadow-md shadow-[#167b78]/25 group-hover:scale-105 transition-transform">
                  <Stethoscope className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <span className="text-2xl font-extrabold tracking-tight text-[#152f34] group-hover:text-[#167b78] transition-colors">
                    Denta<span className="text-[#167b78]">Care</span>
                  </span>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-[#52696e]">
                    {language === 'ru' ? 'Стоматологическая клиника' : 'Stomatologiya klinikasi'}
                  </p>
                </div>
              </>
            )}
          </Link>

          {/* 2. Primary Navigation Row in the Middle (Switches to mobile before crowding: lg:flex) */}
          <nav className="hidden lg:flex items-center gap-1.5" aria-label="Asosiy menyu">
            {/* Services */}
            <Link
              href="/services"
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78] ${
                isActive('/services')
                  ? 'bg-[#eaf5f2] text-[#167b78] font-bold shadow-sm'
                  : 'text-[#152f34] hover:text-[#167b78] hover:bg-[#f0f7f5]'
              }`}
            >
              {t.nav.services}
            </Link>

            {/* Doctors */}
            <Link
              href="/doctors"
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78] ${
                isActive('/doctors')
                  ? 'bg-[#eaf5f2] text-[#167b78] font-bold shadow-sm'
                  : 'text-[#152f34] hover:text-[#167b78] hover:bg-[#f0f7f5]'
              }`}
            >
              {t.nav.doctors}
            </Link>

            {/* Clinic Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                ref={clinicButtonRef}
                type="button"
                onClick={() => setClinicDropdownOpen(!clinicDropdownOpen)}
                aria-expanded={clinicDropdownOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78] ${
                  isClinicActive || clinicDropdownOpen
                    ? 'bg-[#eaf5f2] text-[#167b78] font-bold shadow-sm'
                    : 'text-[#152f34] hover:text-[#167b78] hover:bg-[#f0f7f5]'
                }`}
              >
                <span>{t.nav.clinic || (language === 'ru' ? 'Клиника' : 'Klinika')}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    clinicDropdownOpen ? 'rotate-180 text-[#167b78]' : 'text-[#52696e]'
                  }`}
                />
              </button>

              {clinicDropdownOpen && (
                <div
                  className="absolute left-0 mt-2.5 w-64 bg-white rounded-2xl shadow-xl border border-[#d8e5e2] py-2 z-50 animate-fade-in"
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
                            ? 'bg-[#eaf5f2] text-[#167b78] font-bold'
                            : 'text-[#152f34] hover:bg-[#f0f7f5] hover:text-[#167b78]'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#eaf5f2] flex items-center justify-center text-[#167b78] shrink-0">
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
              className={`text-sm font-semibold px-4 py-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78] ${
                isActive('/contacts')
                  ? 'bg-[#eaf5f2] text-[#167b78] font-bold shadow-sm'
                  : 'text-[#152f34] hover:text-[#167b78] hover:bg-[#f0f7f5]'
              }`}
            >
              {t.nav.contacts}
            </Link>
          </nav>

          {/* 3. Right Section: Phone, Language Switcher & Book Appointment CTA */}
          <div className="flex items-center gap-3">
            {/* Direct Phone Link (Desktop) */}
            <a
              href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
              className="hidden xl:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-[#152f34] hover:text-[#167b78] hover:bg-[#eaf5f2] transition-colors"
              title={language === 'ru' ? 'Позвонить в клинику' : 'Klinikaga qo\'ng\'iroq qilish'}
            >
              <Phone className="w-3.5 h-3.5 text-[#167b78]" />
              <span>{clinicPhone}</span>
            </a>

            {/* Language Switcher Pill */}
            <div
              className="flex items-center bg-[#eaf5f2] rounded-xl p-1 border border-[#d8e5e2]"
              role="group"
              aria-label={t.common.selectLanguage}
            >
              <button
                type="button"
                onClick={() => setLanguage('uz')}
                aria-pressed={language === 'uz'}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  language === 'uz'
                    ? 'bg-[#167b78] text-white shadow-sm'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                UZ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ru')}
                aria-pressed={language === 'ru'}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  language === 'ru'
                    ? 'bg-[#167b78] text-white shadow-sm'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                RU
              </button>
            </div>

            {/* Book Appointment CTA Button */}
            <Link
              href="/booking"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#167b78] hover:bg-[#116460] text-white font-bold text-sm shadow-md shadow-[#167b78]/20 hover:shadow-lg transition-all transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78]"
            >
              <Calendar className="w-4 h-4" />
              <span>{t.common.bookAppointment}</span>
            </Link>

            {/* Mobile menu trigger */}
            <button
              ref={menuButtonRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2.5 text-[#152f34] hover:text-[#167b78] rounded-xl hover:bg-[#eaf5f2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#167b78]"
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
              className="fixed inset-0 bg-[#0b2228]/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Menu Panel */}
            <div
              id="mobile-navigation"
              className="fixed top-20 inset-x-0 bottom-0 bg-white z-50 lg:hidden overflow-y-auto px-6 py-6 space-y-6 shadow-2xl animate-fade-in border-t border-[#d8e5e2]"
              role="dialog"
              aria-modal="true"
              aria-label="Mobil navigatsiya menyusi"
            >
              {/* Primary links */}
              <div className="space-y-1">
                <Link
                  href="/services"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                    isActive('/services')
                      ? 'bg-[#eaf5f2] text-[#167b78] font-bold'
                      : 'text-[#152f34] hover:bg-[#f0f7f5]'
                  }`}
                >
                  {t.nav.services}
                </Link>

                <Link
                  href="/doctors"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                    isActive('/doctors')
                      ? 'bg-[#eaf5f2] text-[#167b78] font-bold'
                      : 'text-[#152f34] hover:bg-[#f0f7f5]'
                  }`}
                >
                  {t.nav.doctors}
                </Link>

                {/* Klinika section with secondary links */}
                <div className="pt-3 pb-1">
                  <p className="px-4 text-xs font-bold uppercase tracking-wider text-[#52696e] mb-2">
                    {t.nav.clinic || (language === 'ru' ? 'Клиника' : 'Klinika')}
                  </p>
                  <div className="pl-2 space-y-1">
                    {clinicItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isActive(item.href)
                            ? 'bg-[#eaf5f2] text-[#167b78] font-bold'
                            : 'text-[#52696e] hover:bg-[#f0f7f5] hover:text-[#152f34]'
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
                      ? 'bg-[#eaf5f2] text-[#167b78] font-bold'
                      : 'text-[#152f34] hover:bg-[#f0f7f5]'
                  }`}
                >
                  {t.nav.contacts}
                </Link>
              </div>

              {/* Action Buttons: Qabulga yozilish & Direct Call */}
              <div className="pt-4 border-t border-[#d8e5e2] space-y-3">
                <Link
                  href="/booking"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3.5 bg-[#167b78] hover:bg-[#116460] text-white rounded-2xl font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-[#167b78]/25 active:scale-95 transition-all text-sm"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{t.common.bookAppointment}</span>
                </Link>

                <a
                  href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                  className="w-full py-3 border border-[#d8e5e2] hover:border-[#167b78] text-[#152f34] rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-[#f0f7f5] transition-colors text-sm"
                >
                  <Phone className="w-4 h-4 text-[#167b78]" />
                  <span>{clinicPhone}</span>
                </a>

                <div className="pt-2 text-center">
                  <Link
                    href="/admin/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-xs text-[#52696e] hover:text-[#167b78] transition-colors font-medium"
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
