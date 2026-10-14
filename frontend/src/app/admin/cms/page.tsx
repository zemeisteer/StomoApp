'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  HelpCircle,
  Plus,
  Eye,
  RefreshCw,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Upload,
  Globe,
  Shield,
  Layers,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminCmsPage() {
  const [activeTab, setActiveTab] = useState<'articles' | 'faqs' | 'policies'>('articles');
  const [articles, setArticles] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any>({ privacyPolicy: '', bookingPolicy: '' });

  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Article Modal State
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleForm, setArticleForm] = useState({
    slug: '',
    titleUz: '',
    titleRu: '',
    excerptUz: '',
    excerptRu: '',
    contentUz: '',
    contentRu: '',
    authorName: 'DentaCare Mutaxassisi',
    coverImageUrl: '',
    status: 'PUBLISHED',
  });
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // FAQ Modal State
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState({
    questionUz: '',
    questionRu: '',
    answerUz: '',
    answerRu: '',
    category: 'Umumiy',
    sortOrder: 0,
    isActive: true,
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [artRes, faqRes, polRes] = await Promise.all([
        api.getAdminArticles(),
        api.getAdminFaqs(),
        api.getPolicies(),
      ]);
      setArticles(artRes.items || []);
      setFaqs(faqRes || []);
      if (polRes) {
        setPolicies({
          privacyPolicy: typeof polRes.privacyPolicy === 'string' ? polRes.privacyPolicy : JSON.stringify(polRes.privacyPolicy || '', null, 2),
          bookingPolicy: typeof polRes.bookingPolicy === 'string' ? polRes.bookingPolicy : JSON.stringify(polRes.bookingPolicy || '', null, 2),
        });
      }
    } catch (e: any) {
      console.error('Failed to load CMS data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------------------
  // ARTICLE HANDLERS
  // -------------------------------------------------------------
  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      if (editingArticleId) {
        await api.updateArticle(editingArticleId, articleForm);
        setStatusMessage({ type: 'success', text: 'Maqola muvaffaqiyatli yangilandi' });
      } else {
        await api.createArticle(articleForm);
        setStatusMessage({ type: 'success', text: 'Yangi maqola yaratildi va saqlandi' });
      }
      setShowArticleModal(false);
      setEditingArticleId(null);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Maqolani saqlashda xatolik' });
    }
  };

  const handleTogglePublishArticle = async (article: any) => {
    try {
      const newStatus = article.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
      await api.updateArticle(article.id, { status: newStatus });
      await loadData();
      setStatusMessage({
        type: 'success',
        text: `Maqola holati o'zgartirildi: ${newStatus === 'PUBLISHED' ? 'E\'lon qilindi' : 'Qoralamaga o\'tkazildi'}`,
      });
    } catch (err: any) {
      alert(err?.message || 'Holatni o\'zgartirishda xatolik');
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Haqiqatan ham ushbu maqolani o\'chirmoqchimisiz?')) return;
    try {
      await api.deleteArticle(id);
      await loadData();
      setStatusMessage({ type: 'success', text: 'Maqola o\'chirildi' });
    } catch (err: any) {
      alert(err?.message || 'O\'chirishda xatolik');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingCover(true);
      const res = await api.uploadMedia(file);
      if (res.url) {
        setArticleForm((prev) => ({ ...prev, coverImageUrl: res.url }));
      }
    } catch (err: any) {
      alert(err?.message || 'Rasm yuklashda xatolik');
    } finally {
      setIsUploadingCover(false);
    }
  };

  // -------------------------------------------------------------
  // FAQ HANDLERS
  // -------------------------------------------------------------
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      if (editingFaqId) {
        await api.updateFaq(editingFaqId, faqForm);
        setStatusMessage({ type: 'success', text: 'FAQ muvaffaqiyatli yangilandi' });
      } else {
        await api.createFaq(faqForm);
        setStatusMessage({ type: 'success', text: 'Yangi FAQ qo\'shildi' });
      }
      setShowFaqModal(false);
      setEditingFaqId(null);
      await loadData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'FAQ saqlashda xatolik' });
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!confirm('Ushbu savol-javobni o\'chirmoqchimisiz?')) return;
    try {
      await api.deleteFaq(id);
      await loadData();
      setStatusMessage({ type: 'success', text: 'FAQ o\'chirildi' });
    } catch (err: any) {
      alert(err?.message || 'O\'chirishda xatolik');
    }
  };

  // -------------------------------------------------------------
  // POLICIES HANDLER
  // -------------------------------------------------------------
  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      await api.updatePolicies({
        privacyPolicy: policies.privacyPolicy,
        bookingPolicy: policies.bookingPolicy,
      });
      setStatusMessage({ type: 'success', text: 'Klinika qoidalari va siyosatlari muvaffaqiyatli saqlandi' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Siyosatlarni saqlashda xatolik' });
    }
  };

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

        {statusMessage && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

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

          <button
            type="button"
            onClick={() => setActiveTab('policies')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              activeTab === 'policies'
                ? 'bg-teal-700 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Qoidalar va Siyosatlar</span>
          </button>
        </div>

        {/* Tab 1: Articles */}
        {activeTab === 'articles' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase">
                Maqolalar ro&apos;yxati (Barcha qoralama va e&apos;lon qilinganlar)
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingArticleId(null);
                  setArticleForm({
                    slug: '',
                    titleUz: '',
                    titleRu: '',
                    excerptUz: '',
                    excerptRu: '',
                    contentUz: '',
                    contentRu: '',
                    authorName: 'DentaCare Mutaxassisi',
                    coverImageUrl: '',
                    status: 'PUBLISHED',
                  });
                  setShowArticleModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Yangi maqola yaratish</span>
              </button>
            </div>

            {articles.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">Maqolalar topilmadi.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {articles.map((art) => (
                  <div key={art.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {art.coverImageUrl ? (
                        <img
                          src={art.coverImageUrl}
                          alt={art.titleUz}
                          className="w-16 h-12 object-cover rounded-xl border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{art.titleUz}</h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              art.status === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {art.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Slug: <span className="font-mono text-teal-700">/{art.slug}</span> • Muallif: {art.authorName}
                        </p>
                        {art.excerptUz && (
                          <p className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">{art.excerptUz}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePublishArticle(art)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                      >
                        {art.status === 'PUBLISHED' ? 'Qoralamaga' : 'Nashr qilish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingArticleId(art.id);
                          setArticleForm({
                            slug: art.slug || '',
                            titleUz: art.titleUz || '',
                            titleRu: art.titleRu || '',
                            excerptUz: art.excerptUz || '',
                            excerptRu: art.excerptRu || '',
                            contentUz: art.contentUz || '',
                            contentRu: art.contentRu || '',
                            authorName: art.authorName || 'DentaCare Mutaxassisi',
                            coverImageUrl: art.coverImageUrl || '',
                            status: art.status || 'PUBLISHED',
                          });
                          setShowArticleModal(true);
                        }}
                        className="p-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs"
                        title="Tahrirlash"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArticle(art.id)}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
                        title="O'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: FAQs */}
        {activeTab === 'faqs' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase">
                Savol-Javoblar Ro&apos;yxati
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingFaqId(null);
                  setFaqForm({
                    questionUz: '',
                    questionRu: '',
                    answerUz: '',
                    answerRu: '',
                    category: 'Umumiy',
                    sortOrder: faqs.length + 1,
                    isActive: true,
                  });
                  setShowFaqModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Yangi savol-javob qo&apos;shish</span>
              </button>
            </div>

            {faqs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">FAQlar topilmadi.</div>
            ) : (
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <div
                    key={faq.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                          {faq.category || 'Umumiy'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            faq.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {faq.isActive ? 'Faol' : 'Nofaol'}
                        </span>
                        <span className="text-[10px] text-slate-400">Tartib: #{faq.sortOrder}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{faq.questionUz}</h4>
                      <p className="text-xs text-slate-600 line-clamp-2">{faq.answerUz}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFaqId(faq.id);
                          setFaqForm({
                            questionUz: faq.questionUz || '',
                            questionRu: faq.questionRu || '',
                            answerUz: faq.answerUz || '',
                            answerRu: faq.answerRu || '',
                            category: faq.category || 'Umumiy',
                            sortOrder: faq.sortOrder ?? 0,
                            isActive: faq.isActive ?? true,
                          });
                          setShowFaqModal(true);
                        }}
                        className="p-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFaq(faq.id)}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Policies */}
        {activeTab === 'policies' && (
          <form onSubmit={handleSavePolicies} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-700" />
              <span>Maxfiylik va Qabul Qoidalari Matnlari</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Maxfiylik Siyosati (Privacy Policy)
              </label>
              <textarea
                rows={6}
                value={policies.privacyPolicy}
                onChange={(e) => setPolicies({ ...policies, privacyPolicy: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qabul va Bronlash Qoidalari (Booking Terms & Conditions)
              </label>
              <textarea
                rows={6}
                value={policies.bookingPolicy}
                onChange={(e) => setPolicies({ ...policies, bookingPolicy: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-700/20"
              >
                Siyosatlarni saqlash
              </button>
            </div>
          </form>
        )}

        {/* Article Edit/Create Modal */}
        {showArticleModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingArticleId ? 'Maqolani tahrirlash' : 'Yangi maqola yaratish'}
              </h3>

              <form onSubmit={handleSaveArticle} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      URL Slug (masalan: toza-tishlar)
                    </label>
                    <input
                      type="text"
                      required
                      value={articleForm.slug}
                      onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Muallif
                    </label>
                    <input
                      type="text"
                      required
                      value={articleForm.authorName}
                      onChange={(e) => setArticleForm({ ...articleForm, authorName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sarlavha (UZ)
                    </label>
                    <input
                      type="text"
                      required
                      value={articleForm.titleUz}
                      onChange={(e) => setArticleForm({ ...articleForm, titleUz: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Sarlavha (RU)
                    </label>
                    <input
                      type="text"
                      required
                      value={articleForm.titleRu}
                      onChange={(e) => setArticleForm({ ...articleForm, titleRu: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Qisqacha matn (UZ)
                    </label>
                    <textarea
                      rows={2}
                      value={articleForm.excerptUz}
                      onChange={(e) => setArticleForm({ ...articleForm, excerptUz: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Qisqacha matn (RU)
                    </label>
                    <textarea
                      rows={2}
                      value={articleForm.excerptRu}
                      onChange={(e) => setArticleForm({ ...articleForm, excerptRu: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To&apos;liq maqola matni (UZ)
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={articleForm.contentUz}
                    onChange={(e) => setArticleForm({ ...articleForm, contentUz: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To&apos;liq maqola matni (RU)
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={articleForm.contentRu}
                    onChange={(e) => setArticleForm({ ...articleForm, contentRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Muqova rasmi (URL yoki yuklash)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={articleForm.coverImageUrl}
                        onChange={(e) => setArticleForm({ ...articleForm, coverImageUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                      />
                      <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer shrink-0 text-xs font-bold flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingCover ? '...' : 'Yuklash'}</span>
                        <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Holati
                    </label>
                    <select
                      value={articleForm.status}
                      onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="PUBLISHED">Nashr qilingan (PUBLISHED)</option>
                      <option value="DRAFT">Qoralama (DRAFT)</option>
                      <option value="ARCHIVED">Arxivlangan (ARCHIVED)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowArticleModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* FAQ Edit/Create Modal */}
        {showFaqModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingFaqId ? 'FAQni tahrirlash' : 'Yangi FAQ qo\'shish'}
              </h3>

              <form onSubmit={handleSaveFaq} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Savol (UZ)
                  </label>
                  <input
                    type="text"
                    required
                    value={faqForm.questionUz}
                    onChange={(e) => setFaqForm({ ...faqForm, questionUz: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Savol (RU)
                  </label>
                  <input
                    type="text"
                    required
                    value={faqForm.questionRu}
                    onChange={(e) => setFaqForm({ ...faqForm, questionRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Javob (UZ)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={faqForm.answerUz}
                    onChange={(e) => setFaqForm({ ...faqForm, answerUz: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Javob (RU)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={faqForm.answerRu}
                    onChange={(e) => setFaqForm({ ...faqForm, answerRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kategoriya
                    </label>
                    <input
                      type="text"
                      value={faqForm.category}
                      onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tartib (#)
                    </label>
                    <input
                      type="number"
                      value={faqForm.sortOrder}
                      onChange={(e) => setFaqForm({ ...faqForm, sortOrder: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Holat
                    </label>
                    <select
                      value={faqForm.isActive ? 'true' : 'false'}
                      onChange={(e) => setFaqForm({ ...faqForm, isActive: e.target.value === 'true' })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="true">Faol</option>
                      <option value="false">Nofaol</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFaqModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-md"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
