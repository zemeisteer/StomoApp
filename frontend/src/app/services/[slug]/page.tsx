'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  ChevronRight,
  ArrowLeft,
  Stethoscope,
  Info,
  CheckCircle2,
  User,
  ShieldCheck,
} from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';

export default function ServiceDetailPage() {
  const { t, language } = useI18n();
  const params = useParams();
  const slug = params?.slug as string;

  const [service, setService] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadService() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const res = await api.getServiceBySlug(slug);
        setService(res);
      } catch (err: any) {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadService();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-32 text-center text-slate-400 font-semibold text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (notFound || !service) {
    return (
      <div className="max-w-md mx-auto py-32 text-center space-y-4 px-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <Stethoscope className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {language === 'uz' ? 'Xizmat topilmadi' : 'Услуга не найдена'}
        </h1>
        <p className="text-xs text-slate-500">
          {language === 'uz'
            ? 'Ushbu stomatologik xizmat mavjud emas yoki arxivlangan.'
            : 'Данная стоматологическая услуга не найдена или архивирована.'}
        </p>
        <Link
          href="/services"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'uz' ? 'Barcha xizmatlar' : 'Все услуги'}</span>
        </Link>
      </div>
    );
  }

  const name = language === 'uz' ? service.nameUz : service.nameRu || service.nameUz;
  const description = language === 'uz' ? service.descriptionUz : service.descriptionRu || service.descriptionUz;
  const prep =
    language === 'uz'
      ? service.preparationUz || 'Ushbu muolaja oldidan maxsus tayyorgarlik talab etilmaydi. Qabuldan 1 soat oldin yengil tamaddi qilib kelish tavsiya etiladi.'
      : service.preparationRu || 'Специальной подготовки не требуется. Рекомендуется легко перекусить за 1 час до приема.';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/" className="hover:text-teal-700">
            {t.nav.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/services" className="hover:text-teal-700">
            {t.nav.services}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800">{name}</span>
        </nav>

        {/* Hero Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200 uppercase tracking-wider">
                {service.category}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                {name}
              </h1>
            </div>

            <div className="sm:text-right shrink-0">
              <span className="text-xs text-slate-400 block font-medium">
                {language === 'uz' ? 'Boshlang\'ich narx' : 'Начальная цена'}
              </span>
              <span className="text-2xl font-black text-teal-800">
                {service.priceFrom ? `${service.priceFrom.toLocaleString()} so'm` : (language === 'uz' ? 'Konsultatsiya asosida' : 'По консультации')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <Clock className="w-5 h-5 text-teal-700 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  {language === 'uz' ? 'Davomiyligi' : 'Длительность'}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {service.durationMinutes} {language === 'uz' ? 'daqiqa' : 'минут'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  {language === 'uz' ? 'Kafolat' : 'Гарантия'}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {language === 'uz' ? 'Standart protokol' : 'Стандартный протокол'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 col-span-2 sm:col-span-1">
              <Stethoscope className="w-5 h-5 text-teal-700 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">
                  {language === 'uz' ? 'Mutaxassislar' : 'Специалисты'}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {service.doctors?.length || 0} {language === 'uz' ? 'nafar shifokor' : 'врачей'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <Link
              href={`/booking?serviceId=${service.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-xs shadow-md shadow-teal-700/20 transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>{language === 'uz' ? 'Ushbu xizmatga yozilish' : 'Записаться на процедуру'}</span>
            </Link>
          </div>
        </div>

        {/* Description & Preparation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Muolaja tavsifi' : 'Описание процедуры'}</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {description}
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Qabulga tayyorgarlik' : 'Подготовка к приему'}</span>
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {prep}
            </p>
          </div>
        </div>

        {/* Suitable Doctors */}
        {service.doctors && service.doctors.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-teal-700" />
              <span>{language === 'uz' ? 'Ushbu muolajani o\'tkazuvchi shifokorlar' : 'Врачи, проводящие данную процедуру'}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {service.doctors.map((ds: any) => {
                const doc = ds.doctor;
                if (!doc) return null;
                const docName =
                  language === 'uz'
                    ? `${doc.firstNameUz} ${doc.lastNameUz}`
                    : `${doc.firstNameRu || doc.firstNameUz} ${doc.lastNameRu || doc.lastNameUz}`;

                return (
                  <div
                    key={doc.id}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-white hover:border-teal-200 transition-all flex items-center gap-4"
                  >
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                      {doc.photoUrl ? (
                        <img src={doc.photoUrl} alt={docName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <User className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{docName}</h4>
                      <p className="text-[11px] text-teal-700 truncate">{doc.titleUz}</p>
                      <Link
                        href={`/doctors/${doc.slug}`}
                        className="text-[11px] font-bold text-slate-600 hover:text-teal-700 mt-1 inline-block"
                      >
                        {language === 'uz' ? 'Profilni ko\'rish →' : 'Смотреть профиль →'}
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
