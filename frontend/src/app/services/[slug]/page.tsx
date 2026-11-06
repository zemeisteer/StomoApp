'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  ChevronRight,
  ArrowLeft,
  Stethoscope,
  Info,
  CheckCircle2,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

export default function ServiceDetailPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const params = useParams();
  const slug = params?.slug as string;

  const [service, setService] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadService() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const res = await api.getServiceBySlug(slug);
        if (isMounted) setService(res);
      } catch (err: any) {
        if (isMounted) setNotFound(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadService();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-32 text-center text-ink-muted font-semibold text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (notFound || !service) {
    return (
      <div className="max-w-md mx-auto py-32 text-center space-y-4 px-4">
        <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto">
          <Stethoscope className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-ink">
          {isRu ? 'Услуга не найдена' : 'Xizmat topilmadi'}
        </h1>
        <p className="text-xs text-ink-muted">
          {isRu
            ? 'Данная стоматологическая услуга не найдена или была перенесена.'
            : 'Ushbu stomatologik xizmat mavjud emas yoki arxivlangan.'}
        </p>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isRu ? 'Все услуги' : 'Barcha xizmatlar'}</span>
        </Link>
      </div>
    );
  }

  const name = isRu && service.nameRu ? service.nameRu : service.nameUz;
  const description = isRu && service.descriptionRu ? service.descriptionRu : service.descriptionUz;
  const prep = isRu
    ? service.preparationRu || 'Специальной подготовки не требуется. Рекомендуется легко перекусить за 1 час до приема.'
    : service.preparationUz || 'Ushbu muolaja oldidan maxsus tayyorgarlik talab etilmaydi. Qabuldan 1 soat oldin yengil tamaddi qilib kelish tavsiya etiladi.';

  const formattedPrice = service.priceFrom
    ? `${(service.priceFrom > 1000000 ? service.priceFrom / 100 : service.priceFrom).toLocaleString('uz-UZ')} ${t.common.uzs}`
    : (isRu ? 'По консультации' : 'Konsultatsiya asosida');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-ink-muted">
        <Link href="/" className="hover:text-brand-600 transition-colors">
          {t.nav.home}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/services" className="hover:text-brand-600 transition-colors">
          {t.nav.services}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-semibold text-ink">{name}</span>
      </nav>

      {/* Hero Card */}
      <div className="bg-white rounded-3xl border border-line p-6 sm:p-10 shadow-[0_4px_20px_rgba(21,47,52,0.03)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-line uppercase tracking-wider">
              {service.category}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink mt-2">
              {name}
            </h1>
          </div>

          <div className="sm:text-right shrink-0">
            <span className="text-xs text-ink-muted block font-medium">
              {isRu ? 'Начальная цена' : 'Boshlang\'ich narx'}
            </span>
            <span className="text-2xl font-black text-brand-600">
              {formattedPrice}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-line">
          <div className="p-3.5 bg-canvas rounded-2xl border border-line flex items-center gap-3">
            <Clock className="w-5 h-5 text-brand-600 shrink-0" />
            <div>
              <span className="text-[11px] text-ink-muted block font-medium">
                {isRu ? 'Длительность' : 'Davomiyligi'}
              </span>
              <span className="text-xs font-bold text-ink">
                {service.durationMinutes} {isRu ? 'минут' : 'daqiqa'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-canvas rounded-2xl border border-line flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0" />
            <div>
              <span className="text-[11px] text-ink-muted block font-medium">
                {isRu ? 'Гарантия' : 'Kafolat'}
              </span>
              <span className="text-xs font-bold text-ink">
                {isRu ? 'Официальный протокол' : 'Rasmiy kafolat'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-canvas rounded-2xl border border-line flex items-center gap-3 col-span-2 sm:col-span-1">
            <Stethoscope className="w-5 h-5 text-brand-600 shrink-0" />
            <div>
              <span className="text-[11px] text-ink-muted block font-medium">
                {isRu ? 'Специалисты' : 'Mutaxassislar'}
              </span>
              <span className="text-xs font-bold text-ink">
                {service.doctors?.length || 0} {isRu ? 'врачей' : 'nafar shifokor'}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Link
            href={`/booking?serviceId=${service.id}`}
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-brand-600/20 transition-all"
          >
            <Calendar className="w-4 h-4" />
            <span>{isRu ? 'Записаться на процедуру' : 'Ushbu xizmatga yozilish'}</span>
          </Link>
        </div>
      </div>

      {/* Description & Preparation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        <div className="bg-white rounded-3xl border border-line p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-ink border-b border-line pb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-brand-600" />
            <span>{isRu ? 'Описание процедуры' : 'Muolaja tavsifi'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed whitespace-pre-line">
            {description}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-line p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-ink border-b border-line pb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-600" />
            <span>{isRu ? 'Подготовка к приему' : 'Qabulga tayyorgarlik'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed whitespace-pre-line">
            {prep}
          </p>
        </div>
      </div>

      {/* Doctors Providing This Service */}
      {service.doctors && service.doctors.length > 0 && (
        <div className="bg-white rounded-3xl border border-line p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <User className="w-4 h-4 text-brand-600" />
            <span>{isRu ? 'Врачи, проводящие данную процедуру' : 'Ushbu muolajani o\'tkazuvchi shifokorlar'}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {service.doctors.map((ds: any) => {
              const doc = ds.doctor;
              if (!doc) return null;
              const docName = isRu && doc.firstNameRu
                ? `Dr. ${doc.firstNameRu} ${doc.lastNameRu}`
                : `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`;

              return (
                <div
                  key={doc.id}
                  className="p-4 rounded-2xl border border-line bg-canvas hover:bg-white hover:border-brand-600/40 transition-all flex items-center gap-4"
                >
                  <div className="w-14 h-16 rounded-xl overflow-hidden bg-brand-50 shrink-0">
                    {doc.photoUrl ? (
                      <Image
                        src={doc.photoUrl}
                        alt={docName}
                        width={56}
                        height={64}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-brand-600 font-bold text-sm">
                        {doc.firstNameUz?.[0]}{doc.lastNameUz?.[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-ink truncate">{docName}</h4>
                    <p className="text-[11px] text-brand-600 truncate">{isRu && doc.titleRu ? doc.titleRu : doc.titleUz}</p>
                    <Link
                      href={`/doctors/${doc.slug}`}
                      className="text-[11px] font-bold text-ink-muted hover:text-brand-600 mt-1 inline-block"
                    >
                      {isRu ? 'Смотреть профиль →' : 'Profilni ko\'rish →'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
