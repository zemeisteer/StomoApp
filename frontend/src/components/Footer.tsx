'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Heart } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';

export const Footer: React.FC = () => {
  const { t } = useI18n();
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);
  const [clinicPhone, setClinicPhone] = useState<string>('+998 71 200 45 45');
  const [clinicEmail, setClinicEmail] = useState<string>('info@dentacare.uz');

  useEffect(() => {
    api.getClinicInfo()
      .then((info) => {
        if (info?.logo) setClinicLogo(info.logo);
        if (info?.phone) setClinicPhone(info.phone);
        if (info?.email) setClinicEmail(info.email);
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-slate-950 text-slate-400 pt-16 pb-12 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand Info */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              {clinicLogo ? (
                <img
                  src={clinicLogo}
                  alt={t.common.clinicName}
                  className="max-h-10 max-w-[190px] object-contain brightness-110"
                />
              ) : (
                <>
                  <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M18.8 4c-1.5-1.2-3.8-1-5.3.3l-.5.4-.5-.4C11 3 8.7 2.8 7.2 4 4.5 6.2 4 10.3 5.4 13.5l1.6 4.8c.4 1.2 1.5 2 2.8 2 1.5 0 2.8-1.2 2.8-2.7V15h.8v2.6c0 1.5 1.3 2.7 2.8 2.7 1.3 0 2.4-.8 2.8-2l1.6-4.8c1.4-3.2.9-7.3-1.9-9.5z" />
                    </svg>
                  </div>
                  <span className="text-2xl font-bold text-white tracking-tight">
                    Denta<span className="text-teal-400">Care</span>
                  </span>
                </>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-400 mb-4">
              {t.common.tagline}. Zamonaviy stomatologiya, tajribali shifokorlar va qulay narxlar.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>O&apos;zbekiston SSV Litsenziyasi № 7482910</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              {t.nav.services}
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/services" className="hover:text-teal-300 transition-colors">
                  Terapiya va karies davolash
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-teal-300 transition-colors">
                  Breketlar va ortodontiya
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-teal-300 transition-colors">
                  Dental implantatsiya
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-teal-300 transition-colors">
                  Professional tozalash va AirFlow
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-teal-300 transition-colors">
                  Bolalar stomatologiyasi
                </Link>
              </li>
            </ul>
          </div>

          {/* Branches */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              {t.common.branches}
            </h4>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-slate-200">Chilonzor filiali</p>
                <p className="text-xs text-slate-400 flex items-start gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                  <span>Chilonzor tumani, Bunyodkor shoh ko&apos;chasi 42</span>
                </p>
              </div>
              <div className="pt-2">
                <p className="font-semibold text-slate-200">Yunusobod filiali</p>
                <p className="text-xs text-slate-400 flex items-start gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                  <span>Yunusobod tumani, Amir Temur ko&apos;chasi 108</span>
                </p>
              </div>
            </div>
          </div>

          {/* Contacts & Working Hours */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">
              {t.nav.contacts}
            </h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-teal-400" />
                <a href={`tel:${clinicPhone.replace(/\s+/g, '')}`} className="hover:text-teal-300 transition-colors">
                  {clinicPhone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-400" />
                <a href={`mailto:${clinicEmail}`} className="hover:text-teal-300 transition-colors">
                  {clinicEmail}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span className="text-xs">
                  Dushanba - Shanba: 09:00 - 20:00<br />
                  Yakshanba: 10:00 - 16:00
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} DentaCare. Barcha huquqlar himoyalangan.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-teal-400 transition-colors">
              Maxfiylik siyosati
            </Link>
            <Link href="/terms" className="hover:text-teal-400 transition-colors">
              Qabul qoidalari
            </Link>
            <Link href="/admin/login" className="hover:text-teal-400 transition-colors">
              Xodimlar uchun
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
