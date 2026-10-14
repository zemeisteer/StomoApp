'use client';

import React, { useState, useEffect } from 'react';
import { FileText, HelpCircle, Plus, Eye, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminCmsPage() {
  const [activeTab, setActiveTab] = useState<'articles' | 'faqs'>('articles');
  const [articles, setArticles] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [artRes, faqRes] = await Promise.all([
        api.getArticles(1, 50),
        api.getFaqs(),
      ]);
      setArticles(artRes.items || []);
      setFaqs(faqRes || []);
    } catch (e) {
      console.error('Failed to load CMS data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'EDITOR']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Sayt kontenti boshqaruvi (CMS)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Maqolalar, ko&apos;p so&apos;raladigan savollar va sahifalar matnlarini tahrirlash
            </p>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Yangilash"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('articles')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              activeTab === 'articles'
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Maqolalar ({articles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faqs')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              activeTab === 'faqs'
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Savol-Javoblar (FAQ) ({faqs.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : activeTab === 'articles' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Maqolalar ro&apos;yxati
                </span>
              </div>

              {articles.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Maqolalar yo&apos;q.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {articles.map((art) => (
                    <div key={art.id} className="py-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{art.titleUz}</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {art.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{art.excerptUz}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Sana: {new Date(art.publishedAt || art.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Savollar ro&apos;yxati
                </span>
              </div>

              {faqs.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">Savollar yo&apos;q.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {faqs.map((f) => (
                    <div key={f.id} className="py-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-slate-900">{f.questionUz}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {f.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.answerUz}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
