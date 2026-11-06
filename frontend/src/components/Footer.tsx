'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Stethoscope } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useBrand } from '../lib/brand';
import { api } from '../lib/api';
import { formatWorkingHours } from '../lib/dateFormat';

export const Footer: React.FC = () => {
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const brand = useBrand();
  const clinicLogo = brand.logo;
  const [logoError, setLogoError] = useState(false);
  const clinicName = brand.clinicName(language);
  const clinicPhone = (brand.clinic?.phone as string) || '';
  const clinicEmail = (brand.clinic?.email as string) || '';
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    api.getBranches()
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) setBranches(data.slice(0, 3));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const firstBranchHours = branches[0]?.workingHours
    ? formatWorkingHours(branches[0].workingHours, language)
    : branches[0]?.openingHours;

  return (
    <footer className="bg-brand-950 text-[#e8f3f2] pt-16 pb-12 border-t border-brand-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand Info */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              {clinicLogo && !logoError ? (
                <Image
                  src={clinicLogo}
                  alt={clinicName}
                  width={190}
                  height={40}
                  unoptimized
                  onError={() => setLogoError(true)}
                  className="max-h-10 max-w-[190px] object-contain brightness-110"
                />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-secondary-600 flex items-center justify-center text-white shadow-md">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-bold text-white tracking-tight">
                    {clinicName}
                  </span>
                </>
              )}
            </Link>

            <p className="text-sm leading-relaxed text-brand-200">
              {isRu
                ? 'Современная стоматологическая клиника. Квалифицированная помощь, передовые стандарты и забота о каждом пациенте.'
                : 'Zamonaviy stomatologiya klinikasi. Malakali muolaja, ilg\'or standartlar va har bir bemorga samimiy e\'tibor.'}
            </p>

            <div className="flex items-center gap-2 text-xs text-brand-200/80 pt-1">
              <ShieldCheck className="w-4 h-4 text-secondary-600 shrink-0" />
              <span>{isRu ? 'Официальная медицинская деятельность' : 'Rasmiy tibbiy faoliyat litsenziyasi'}</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {t.nav.services}
            </h4>
            <ul className="space-y-2.5 text-sm text-brand-200">
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isRu ? 'Терапия и лечение кариеса' : 'Terapiya va davolash'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isRu ? 'Ортодонтия и брекеты' : 'Ortodontiya va breketlar'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isRu ? 'Дентальная имплантация' : 'Dental implantatsiya'}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  {isRu ? 'Профессиональная чистка' : 'Professional gigiyena'}
                </Link>
              </li>
              <li>
                <Link href="/prices" className="hover:text-white transition-colors text-xs text-secondary-600">
                  {isRu ? 'Посмотреть все цены →' : 'Barcha narxlarni ko\'rish →'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Real Branches from Database */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {t.common.branches}
            </h4>
            <div className="space-y-4 text-sm text-brand-200">
              {branches.length > 0 ? (
                branches.map((b) => {
                  const bName = isRu && b.nameRu ? b.nameRu : b.nameUz;
                  const bAddress = isRu && b.addressRu ? b.addressRu : b.addressUz;
                  return (
                    <div key={b.id} className="space-y-1">
                      <p className="font-semibold text-white">{bName}</p>
                      <p className="text-xs text-brand-200 flex items-start gap-1.5 leading-relaxed">
                        <MapPin className="w-3.5 h-3.5 text-secondary-600 shrink-0 mt-0.5" />
                        <span>{bAddress}</span>
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2">
                  <p className="font-semibold text-white">{clinicName}</p>
                  <p className="text-xs text-brand-200">
                    {isRu ? 'Филиалы в Ташкенте' : 'Toshkent shahri bo\'ylab filiallar'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">
              {t.nav.contacts}
            </h4>
            <ul className="space-y-3 text-sm text-brand-200">
              {clinicPhone && (
                <li className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-950 flex items-center justify-center text-secondary-600 shrink-0">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <a
                    href={`tel:${clinicPhone.replace(/\s+/g, '')}`}
                    className="hover:text-white transition-colors font-medium text-white"
                  >
                    {clinicPhone}
                  </a>
                </li>
              )}
              {clinicEmail && (
                <li className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-950 flex items-center justify-center text-secondary-600 shrink-0">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <a
                    href={`mailto:${clinicEmail}`}
                    className="hover:text-white transition-colors"
                  >
                    {clinicEmail}
                  </a>
                </li>
              )}
              {firstBranchHours && (
                <li className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-brand-950 flex items-center justify-center text-secondary-600 shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs leading-relaxed">
                    {firstBranchHours}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-brand-950 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-brand-200/70">
          <p>© {new Date().getFullYear()} {clinicName}. {isRu ? 'Все права защищены.' : 'Barcha huquqlar himoyalangan.'}</p>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-white transition-colors">
              {t.nav.about}
            </Link>
            <Link href="/faq" className="hover:text-white transition-colors">
              FAQ
            </Link>
            <Link href="/contacts" className="hover:text-white transition-colors">
              {t.nav.contacts}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
