'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Calendar, Clock, ArrowRight, User, Sparkles } from 'lucide-react';
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

  const isRu = language === 'ru';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3f8f7] via-white to-[#f3f8f7] py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#eaf5f2] text-[#167b78] border border-[#d8e5e2]">
            <Sparkles className="w-3.5 h-3.5 text-[#167b78]" />
            {t.nav.articles}
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] mt-3 tracking-tight">
            {isRu ? 'Полезные статьи и советы' : 'Foydali maqolalar va maslahatlar'}
          </h1>
          <p className="text-sm text-[#52696e] mt-2 leading-relaxed">
            {isRu
              ? 'Советы врачей об уходе за зубами, профилактике кариеса и современных технологиях'
              : 'Tish parvarishi, karies profilaktikasi va zamonaviy stomatologiya haqida shifokorlarimiz tavsiyalari'}
          </p>
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-[#52696e] text-sm bg-white rounded-3xl border border-[#d8e5e2]">
            {t.common.loading}
          </div>
        ) : articles.length === 0 ? (
          <div className="p-16 text-center text-[#52696e] text-sm bg-white rounded-3xl border border-dashed border-[#d8e5e2]">
            {isRu ? 'Статьи скоро будут опубликованы.' : "Maqolalar tez orada e'lon qilinadi."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => {
              const title = isRu && article.titleRu ? article.titleRu : article.titleUz;
              const excerpt = isRu && article.excerptRu ? article.excerptRu : article.excerptUz;

              return (
                <Link
                  key={article.id}
                  href={`/articles/${article.slug}`}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-[#d8e5e2] hover:border-[#167b78]/50 hover:shadow-lg hover:shadow-[#167b78]/5 transition-all flex flex-col justify-between group block"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-[#52696e] font-semibold mb-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#eaf5f2] text-[#167b78] font-bold border border-[#d8e5e2]">
                        {article.category || (isRu ? 'Профилактика' : 'Profilaktika')}
                      </span>
                      <span>•</span>
                      <span>{new Date(article.publishedAt || article.createdAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}</span>
                    </div>

                    <h2 className="text-base font-bold text-[#152f34] group-hover:text-[#167b78] transition-colors mb-2 leading-snug">
                      {title}
                    </h2>

                    <p className="text-xs text-[#52696e] line-clamp-3 leading-relaxed mb-6">
                      {excerpt}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#d8e5e2]/60 flex items-center justify-between text-xs font-bold text-[#167b78]">
                    <span className="flex items-center gap-1.5 text-[#52696e] font-medium">
                      <User className="w-3.5 h-3.5 text-[#167b78]" />
                      <span>{isRu ? 'Специалист DentaCare' : 'DentaCare mutaxassisi'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      {t.common.readMore} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
