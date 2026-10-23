'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Calendar,
  User,
  ChevronRight,
  ArrowLeft,
  FileText,
  Clock,
  Share2,
} from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { formatClinicDate } from '../../../lib/dateFormat';

export default function ArticleDetailPage() {
  const { t, language } = useI18n();
  const params = useParams();
  const slug = params?.slug as string;

  const [article, setArticle] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadArticle() {
      if (!slug) return;
      try {
        setIsLoading(true);
        const res = await api.getArticleBySlug(slug);
        setArticle(res);
      } catch (err: any) {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadArticle();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="py-32 text-center text-slate-400 font-semibold text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="max-w-md mx-auto py-32 text-center space-y-4 px-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <FileText className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">
          {language === 'uz' ? 'Maqola topilmadi' : 'Статья не найдена'}
        </h1>
        <p className="text-xs text-slate-500">
          {language === 'uz'
            ? 'Ushbu maqola hali e\'lon qilinmagan yoki o\'chirilgan.'
            : 'Данная статья еще не опубликована или удалена.'}
        </p>
        <Link
          href="/articles"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'uz' ? 'Barcha maqolalar' : 'Все статьи'}</span>
        </Link>
      </div>
    );
  }

  const title = language === 'uz' ? article.titleUz : article.titleRu || article.titleUz;
  const content = language === 'uz' ? article.contentUz : article.contentRu || article.contentUz;
  const publishedDate = article.publishedAt
    ? formatClinicDate(article.publishedAt, language === 'uz' ? 'uz' : 'ru', { includeYear: true })
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3f8f7] via-white to-[#f3f8f7] py-10 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[#52696e]">
          <Link href="/" className="hover:text-[#167b78] transition-colors">
            {t.nav.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#52696e]" />
          <Link href="/articles" className="hover:text-[#167b78] transition-colors">
            {t.nav.articles}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#52696e]" />
          <span className="font-semibold text-[#152f34] line-clamp-1">{title}</span>
        </nav>

        {/* Article Body */}
        <article className="bg-white rounded-3xl border border-[#d8e5e2] p-6 sm:p-12 shadow-sm space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-[#52696e]">
              <span className="flex items-center gap-1.5 font-medium text-[#167b78] bg-[#eaf5f2] px-2.5 py-0.5 rounded-full border border-[#d8e5e2]">
                <User className="w-3.5 h-3.5" />
                {article.authorName}
              </span>
              {publishedDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {publishedDate}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-[#152f34] leading-tight tracking-tight">
              {title}
            </h1>
          </div>

          {article.coverImageUrl && (
            <div className="w-full h-64 sm:h-96 rounded-2xl overflow-hidden bg-slate-100 border border-[#d8e5e2]">
              <img
                src={article.coverImageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Formatted Content */}
          <div className="prose prose-slate max-w-none text-[#152f34] text-sm sm:text-base leading-relaxed space-y-4 whitespace-pre-line pt-2">
            {content}
          </div>

          {/* CTA Box */}
          <div className="p-6 bg-[#eaf5f2] border border-[#d8e5e2] rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8">
            <div>
              <h3 className="text-sm font-bold text-[#152f34]">
                {language === 'uz' ? 'Tish salomatligingiz haqida qayg\'uryapsizmi?' : 'Беспокоит здоровье зубов?'}
              </h3>
              <p className="text-xs text-[#52696e] mt-0.5 leading-relaxed">
                {language === 'uz'
                  ? 'Bizning tajribali mutaxassislarimiz ko\'rigiga yoziling va aniq tashxis oling.'
                  : 'Запишитесь на прием к нашим опытным врачам и получите точный диагноз.'}
              </p>
            </div>
            <Link
              href="/booking"
              className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] text-white text-xs font-bold rounded-2xl shadow-md shadow-[#167b78]/20 shrink-0 text-center transition-all cursor-pointer"
            >
              {language === 'uz' ? 'Qabulga yozilish' : 'Записаться'}
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
