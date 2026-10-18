'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Phone,
  Calendar,
  Menu,
  X,
  Shield,
  Clock,
  ChevronDown,
  Info,
  DollarSign,
  MessageSquare,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { CallbackModal } from './CallbackModal';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { language, setLanguage, t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false);
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const clinicButtonRef = useRef<HTMLButtonElement>(null);

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
      {/* Top ribbon: schedule, quality guarantee, phone & language */}
      <div className="bg-slate-900 text-slate-300 text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-teal-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Dush - Shan: 09:00 - 20:00 | Yak: 10:00 - 16:00</span>
            </span>
            <span className="hidden md:inline text-slate-500">|</span>
            <span className="hidden md:flex items-center gap-1.5 text-slate-400">
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>100% sterilizatsiya va Germaniya standartlari</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Direct phone in secondary top location */}
            <button
              type="button"
              onClick={() => setCallbackModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 text-slate-300 hover:text-teal-400 transition-colors font-medium text-[11px]"
              aria-label="Telefon orqali bog'lanish"
            >
              <Phone className="w-3 h-3 text-teal-400" />
              <span>+998 71 200 45 45</span>
            </button>

            {/* Language Switcher */}
            <div
              className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700"
              role="group"
              aria-label={t.common.selectLanguage}
            >
              <button
                type="button"
                onClick={() => setLanguage('uz')}
                aria-pressed={language === 'uz'}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  language === 'uz'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                UZ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ru')}
                aria-pressed={language === 'ru'}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  language === 'ru'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                RU
              </button>
            </div>

            <Link
              href="/admin/login"
              className="text-slate-400 hover:text-teal-300 text-[11px] font-medium hidden sm:inline transition-colors"
            >
              {t.nav.admin}
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo (Home link) */}
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-xl"
            aria-label={`${t.common.clinicName} - ${t.nav.home}`}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-800 to-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-700/20 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
              </svg>
            </div>
            <div>
              <span className="text-2xl font-extrabold tracking-tight text-slate-900 group-hover:text-teal-800 transition-colors">
                Denta<span className="text-teal-700">Care</span>
              </span>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                Dental Clinic
              </p>
            </div>
          </Link>

          {/* Simplified Desktop Navigation: Xizmatlar / Shifokorlar / Klinika / Aloqa */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Asosiy menyu">
            {/* 1. Xizmatlar */}
            <Link
              href="/services"
              className={`text-sm font-semibold transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-md ${
                isActive('/services')
                  ? 'text-teal-700 border-b-2 border-teal-700'
                  : 'text-slate-600 hover:text-teal-700'
              }`}
            >
              {t.nav.services}
            </Link>

            {/* 2. Shifokorlar */}
            <Link
              href="/doctors"
              className={`text-sm font-semibold transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-md ${
                isActive('/doctors')
                  ? 'text-teal-700 border-b-2 border-teal-700'
                  : 'text-slate-600 hover:text-teal-700'
              }`}
            >
              {t.nav.doctors}
            </Link>

            {/* 3. Klinika (Dropdown with Prices, Reviews, Articles, FAQ) */}
            <div className="relative" ref={dropdownRef}>
              <button
                ref={clinicButtonRef}
                type="button"
                onClick={() => setClinicDropdownOpen(!clinicDropdownOpen)}
                aria-expanded={clinicDropdownOpen}
                aria-haspopup="true"
                className={`flex items-center gap-1.5 text-sm font-semibold transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-md ${
                  isClinicActive
                    ? 'text-teal-700 border-b-2 border-teal-700'
                    : 'text-slate-600 hover:text-teal-700'
                }`}
              >
                <span>{t.nav.clinic || 'Klinika'}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    clinicDropdownOpen ? 'rotate-180 text-teal-700' : 'text-slate-400'
                  }`}
                />
              </button>

              {clinicDropdownOpen && (
                <div
                  className="absolute left-0 mt-2.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fade-in"
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
                            ? 'bg-teal-50 text-teal-800 font-bold'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-teal-700'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Aloqa */}
            <Link
              href="/contacts"
              className={`text-sm font-semibold transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded-md ${
                isActive('/contacts')
                  ? 'text-teal-700 border-b-2 border-teal-700'
                  : 'text-slate-600 hover:text-teal-700'
              }`}
            >
              {t.nav.contacts}
            </Link>
          </nav>

          {/* Prominent CTA: Qabulga yozilish */}
          <div className="hidden sm:flex items-center gap-4">
            <Link
              href="/booking"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow-md shadow-teal-700/20 hover:shadow-lg transition-all transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            >
              <Calendar className="w-4 h-4" />
              <span>{t.common.bookAppointment}</span>
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <button
            ref={menuButtonRef}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-700 hover:text-teal-700 rounded-xl hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            aria-label={mobileMenuOpen ? 'Menyuni yopish' : 'Menyu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer & Overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Menu Panel */}
            <div
              id="mobile-navigation"
              className="fixed top-20 inset-x-0 bottom-0 bg-white z-50 md:hidden overflow-y-auto px-6 py-6 space-y-5 shadow-2xl animate-fade-in border-t border-slate-100"
              role="dialog"
              aria-modal="true"
              aria-label="Mobil navigatsiya menyusi"
            >
              {/* Primary simplified links */}
              <div className="space-y-1">
                <Link
                  href="/services"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                    isActive('/services')
                      ? 'bg-teal-50 text-teal-800 font-bold'
                      : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {t.nav.services}
                </Link>

                <Link
                  href="/doctors"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-2xl text-base font-semibold transition-colors ${
                    isActive('/doctors')
                      ? 'bg-teal-50 text-teal-800 font-bold'
                      : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {t.nav.doctors}
                </Link>

                {/* Klinika section with secondary links */}
                <div className="pt-2 pb-1">
                  <p className="px-4 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t.nav.clinic || 'Klinika'}
                  </p>
                  <div className="pl-2 space-y-1">
                    {clinicItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          isActive(item.href)
                            ? 'bg-teal-50 text-teal-800 font-bold'
                            : 'text-slate-600 hover:bg-slate-50'
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
                      ? 'bg-teal-50 text-teal-800 font-bold'
                      : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {t.nav.contacts}
                </Link>
              </div>

              {/* Action Buttons: Qabulga yozilish & Callback */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <Link
                  href="/booking"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3.5 bg-teal-700 hover:bg-teal-800 text-white rounded-2xl font-bold text-center flex items-center justify-center gap-2 shadow-lg shadow-teal-700/20 active:scale-95 transition-all"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{t.common.bookAppointment}</span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setCallbackModalOpen(true);
                  }}
                  className="w-full py-3 border border-slate-200 hover:border-teal-300 text-slate-800 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <Phone className="w-4 h-4 text-teal-600" />
                  <span>+998 71 200 45 45</span>
                </button>
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
