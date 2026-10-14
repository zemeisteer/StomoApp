'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Calendar, Clock, ArrowRight, User } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

export default function ArticlesPage() {
  const { t, language } = useI18n();
  const [articles, setArticles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadArticles() {
      try {
        setIsLoading(true);
        const res = await api.getArticles(1, 20);
        setArticles(res.items || []);
      } catch (e) {
        console.error('Failed to load articles', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadArticles();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          {t.nav.articles}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          Foydali maqolalar va maslahatlar
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Tish parvarishi, karies profilaktikasi va zamonaviy stomatologiya haqida shifokorlarimiz tavsiyalari
        </p>
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-slate-400 text-sm">{t.common.loading}</div>
      ) : articles.length === 0 ? (
        <div className="p-16 text-center text-slate-500 text-sm bg-white rounded-3xl border border-dashed border-slate-200">
          Maqolalar tez orada e&apos;lon qilinadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {articles.map((article) => {
            const title = language === 'ru' && article.titleRu ? article.titleRu : article.titleUz;
            const excerpt = language === 'ru' && article.excerptRu ? article.excerptRu : article.excerptUz;

            return (
              <article
                key={article.id}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:border-teal-200 hover:shadow-xl transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 font-bold">
                      {article.category || 'Profilaktika'}
                    </span>
                    <span>•</span>
                    <span>{new Date(article.publishedAt || article.createdAt).toLocaleDateString()}</span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors mb-2 leading-snug">
                    {title}
                  </h2>

                  <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-6">
                    {excerpt}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-700">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span>DentaCare mutaxassisi</span>
                  </span>
                  <span className="inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    {t.common.readMore} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
