'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone, Calendar, Menu, X, Shield, Clock } from 'lucide-react';
import { useI18n, Language } from '../lib/i18n';
import { CallbackModal } from './CallbackModal';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { language, setLanguage, t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [callbackModalOpen, setCallbackModalOpen] = useState(false);

  const navLinks = [
    { href: '/', label: t.nav.home },
    { href: '/services', label: t.nav.services },
    { href: '/doctors', label: t.nav.doctors },
    { href: '/prices', label: t.nav.prices },
    { href: '/about', label: t.nav.about },
    { href: '/reviews', label: t.nav.reviews },
    { href: '/articles', label: t.nav.articles },
    { href: '/faq', label: t.nav.faq },
    { href: '/contacts', label: t.nav.contacts },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Top emergency & working hours ribbon */}
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

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setLanguage('uz')}
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
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-teal-800 to-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-700/20 group-hover:scale-105 transition-transform">
              {/* Tooth icon */}
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
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

          {/* Desktop Nav Links */}
          <nav className="hidden xl:flex items-center gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-semibold transition-colors py-1 ${
                  isActive(link.href)
                    ? 'text-teal-700 border-b-2 border-teal-700'
                    : 'text-slate-600 hover:text-teal-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions: Phone & Book CTA */}
          <div className="hidden sm:flex items-center gap-4">
            <button
              onClick={() => setCallbackModalOpen(true)}
              className="flex items-center gap-2 text-slate-700 hover:text-teal-700 font-semibold text-sm px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Phone className="w-4 h-4 text-teal-600" />
              <span>+998 71 200 45 45</span>
            </button>

            <Link
              href="/booking"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow-md shadow-teal-700/20 hover:shadow-lg transition-all transform active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>{t.common.bookAppointment}</span>
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden p-2 text-slate-600 hover:text-teal-700 rounded-xl hover:bg-slate-100 transition-colors"
            aria-label="Menyu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-100 bg-white px-4 pt-3 pb-6 space-y-2 shadow-xl animate-fade-in">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-xl text-base font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-teal-50 text-teal-800 font-bold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-4 border-t border-slate-100 space-y-3">
              <Link
                href="/booking"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 bg-teal-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-md shadow-teal-700/20"
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
                className="w-full py-2.5 border border-teal-200 text-teal-800 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-teal-50"
              >
                <Phone className="w-4 h-4 text-teal-600" />
                <span>{t.common.requestCallback}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Fast Callback Modal */}
      <CallbackModal isOpen={callbackModalOpen} onClose={() => setCallbackModalOpen(false)} />
    </>
  );
};
