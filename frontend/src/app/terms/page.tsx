import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-12 sm:py-20">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Bosh sahifa</span>
        </Link>

        <div className="space-y-6">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
              DentaCare Qoidalari
            </span>
            <h1 className="text-3xl sm:text-5xl font-normal text-ink leading-[1.06] tracking-[-0.035em]">
              Qabulga yozilish va xizmat ko&apos;rsatish qoidalari
            </h1>
            <p className="text-xs text-ink-muted mt-1.5">
              Oxirgi yangilanish: 2026-yil 1-yanvar
            </p>
          </div>

          <div className="text-sm text-ink space-y-6 leading-relaxed">
            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-1">1. Online qabul va tasdiqlash</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Online qabulga yozilish so&apos;rov shaklida qabul qilinadi. Klinika administratori 2 soat ichida (ish vaqtida) telefon orqali siz bilan bog&apos;lanib, qabulni tasdiqlaydi.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-1">2. Qabul vaqtiga yetib kelish</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Tibbiy karta rasmiylashtirish va dastlabki ko&apos;rikka tayyorgarlik uchun qabul boshlanishidan 10 daqiqa oldin klinikaga yetib kelishingizni so&apos;raymiz.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-1">3. Qabulni bekor qilish yoki ko&apos;chirish</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Agar rejalaringiz o&apos;zgarsa, qabulni bekor qilish yoki boshqa vaqtga ko&apos;chirishni kamida 2 soat oldin online havola orqali yoki telefon orqali amalga oshirishingizni iltimos qilamiz.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
