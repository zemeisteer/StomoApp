import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3f8f7] via-white to-[#f3f8f7] py-12 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52696e] hover:text-[#167b78] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Bosh sahifa</span>
        </Link>

        <div className="bg-white rounded-3xl p-6 sm:p-12 border border-[#d8e5e2] shadow-sm space-y-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#eaf5f2] text-[#167b78] border border-[#d8e5e2] mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-[#167b78]" />
              DentaCare Qoidalari
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#152f34] tracking-tight">
              Qabulga yozilish va xizmat ko&apos;rsatish qoidalari
            </h1>
            <p className="text-xs text-[#52696e] mt-1.5">
              Oxirgi yangilanish: 2026-yil 1-yanvar
            </p>
          </div>

          <div className="text-sm text-[#152f34] space-y-6 leading-relaxed">
            <div className="p-4 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-1">1. Online qabul va tasdiqlash</h2>
              <p className="text-xs text-[#52696e] leading-relaxed">
                Online qabulga yozilish so&apos;rov shaklida qabul qilinadi. Klinika administratori 2 soat ichida (ish vaqtida) telefon orqali siz bilan bog&apos;lanib, qabulni tasdiqlaydi.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-1">2. Qabul vaqtiga yetib kelish</h2>
              <p className="text-xs text-[#52696e] leading-relaxed">
                Tibbiy karta rasmiylashtirish va dastlabki ko&apos;rikka tayyorgarlik uchun qabul boshlanishidan 10 daqiqa oldin klinikaga yetib kelishingizni so&apos;raymiz.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-1">3. Qabulni bekor qilish yoki ko&apos;chirish</h2>
              <p className="text-xs text-[#52696e] leading-relaxed">
                Agar rejalaringiz o&apos;zgarsa, qabulni bekor qilish yoki boshqa vaqtga ko&apos;chirishni kamida 2 soat oldin online havola orqali yoki telefon orqali amalga oshirishingizni iltimos qilamiz.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
