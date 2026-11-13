'use client';

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { Container, PageIntro, PrimaryLink, SearchField, SecondaryLink, SkeletonCards } from '../../components/site/primitives';
import { baselineFaqs } from '../../components/home/FaqAndCtaSection';

export default function FaqPage() {
  const { t, language } = useI18n();
  const isRu = language === 'ru';
  const [faqs, setFaqs] = useState<any[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadFaqs() {
      try {
        setIsLoading(true);
        const data = await api.getFaqs();
        if (isMounted) setFaqs(data || []);
      } catch (e) {
        console.error('Failed to load faqs', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadFaqs();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleAccordion = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  const rawList = Array.isArray(faqs) && faqs.length > 0 ? faqs : baselineFaqs;
  const normalizedFaqs = rawList.map((faq, idx) => {
    const fallback = baselineFaqs[idx] || baselineFaqs[0];
    const qUz = faq.questionUz || faq.qUz || fallback.questionUz;
    const aUz = faq.answerUz || faq.aUz || fallback.answerUz;
    const qRuRaw = faq.questionRu || faq.qRu;
    const aRuRaw = faq.answerRu || faq.aRu;

    const isCorruptedRu = (str?: string) => !str || str.includes('???') || str.trim().length === 0;
    const qRu = isCorruptedRu(qRuRaw) ? fallback.questionRu : qRuRaw;
    const aRu = isCorruptedRu(aRuRaw) ? fallback.answerRu : aRuRaw;

    return {
      id: faq.id || `faq-${idx}`,
      question: isRu ? qRu : qUz,
      answer: isRu ? aRu : aUz,
    };
  });

  const filteredFaqs = normalizedFaqs.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
  });

  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <div className="bg-canvas">
      <PageIntro
        eyebrow="FAQ"
        title={L('Ko‘p beriladigan savollar', 'Частые вопросы')}
        lead={L(
          'Davolanish, to‘lov, kafolat va qabulga tayyorgarlik haqida qisqa javoblar.',
          'Короткие ответы о лечении, оплате, гарантиях и подготовке к приёму.',
        )}
        aside={<SearchField value={search} onChange={setSearch} placeholder={L('Savol qidirish', 'Поиск по вопросам')} />}
      />

      <Container className="py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          {isLoading ? (
            <SkeletonCards count={4} className="grid-cols-1" />
          ) : filteredFaqs.length === 0 ? (
            <p className="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-muted">{L('Savol topilmadi.', 'Вопросы не найдены.')}</p>
          ) : (
            <ul className="border-t border-line">
              {filteredFaqs.map((faq, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <li key={faq.id} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => toggleAccordion(idx)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-6 py-6 text-left"
                    >
                      <span className="text-lg font-medium tracking-[-0.01em] text-ink">{faq.question}</span>
                      <Plus className={`mt-1 h-5 w-5 shrink-0 text-ink-subtle transition-transform duration-500 ${isOpen ? 'rotate-45' : ''}`} />
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <p className="max-w-2xl pb-6 text-base leading-relaxed text-ink-muted">{faq.answer}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-line bg-white p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">{L('Javob topmadingizmi?', 'Не нашли ответ?')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{L('Administrator barcha savollarga javob beradi.', 'Администратор ответит на любой вопрос.')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <PrimaryLink href="/booking">{t.common.bookAppointment}</PrimaryLink>
              <SecondaryLink href="/contacts">{t.nav.contacts}</SecondaryLink>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
