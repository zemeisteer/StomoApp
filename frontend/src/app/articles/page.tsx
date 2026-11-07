'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { formatClinicDate } from '../../lib/dateFormat';
import { Container, PageIntro, SkeletonCards } from '../../components/site/primitives';

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

  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow={t.nav.articles}
        title={L('Maqolalar', 'Статьи')}
        lead={L(
          'Tish parvarishi, profilaktika va zamonaviy davolash haqida shifokorlarimiz maslahatlari.',
          'Советы наших врачей об уходе за зубами, профилактике и современном лечении.',
        )}
      />

      <Container className="py-12 sm:py-16">
        {isLoading ? (
          <SkeletonCards count={3} />
        ) : articles.length === 0 ? (
          <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">
            {L('Maqolalar tez orada chiqadi.', 'Статьи скоро появятся.')}
          </p>
        ) : (
          <ul className="border-t border-line">
            {articles.map((article) => {
              const title = isRu && article.titleRu ? article.titleRu : article.titleUz;
              const excerpt = isRu && article.excerptRu ? article.excerptRu : article.excerptUz;
              return (
                <li key={article.id} className="border-b border-line">
                  <Link href={`/articles/${article.slug}`} className="group grid gap-3 py-8 sm:grid-cols-[12rem_1fr_auto] sm:gap-8">
                    <span className="text-sm text-ink-subtle">
                      {formatClinicDate(article.publishedAt || article.createdAt, isRu ? 'ru' : 'uz')}
                      {article.category && <span className="block">{article.category}</span>}
                    </span>
                    <span>
                      <span className="block text-xl font-medium tracking-[-0.01em] text-ink transition-colors group-hover:text-brand-700">{title}</span>
                      {excerpt && <span className="mt-2 block max-w-2xl text-base leading-relaxed text-ink-muted line-clamp-2">{excerpt}</span>}
                    </span>
                    <ArrowUpRight className="hidden h-5 w-5 text-ink-subtle transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </div>
  );
}
