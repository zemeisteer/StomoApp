import React from 'react';

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-6">
      <h1 className="text-3xl font-extrabold text-slate-900">
        Qabulga yozilish va xizmat ko&apos;rsatish qoidalari
      </h1>
      <p className="text-xs text-slate-400">
        Oxirgi yangilanish: 2026-yil 1-yanvar
      </p>

      <div className="prose prose-slate max-w-none text-sm text-slate-700 space-y-4 leading-relaxed">
        <h2 className="text-lg font-bold text-slate-900">1. Online qabul va tasdiqlash</h2>
        <p>
          Online qabulga yozilish so&apos;rov shaklida qabul qilinadi. Klinika administratori 2 soat ichida (ish vaqtida) telefon orqali siz bilan bog&apos;lanib, qabulni tasdiqlaydi.
        </p>

        <h2 className="text-lg font-bold text-slate-900">2. Qabul vaqtiga yetib kelish</h2>
        <p>
          Tibbiy karta rasmiylashtirish va dastlabki ko&apos;rikka tayyorgarlik uchun qabul boshlanishidan 10 daqiqa oldin klinikaga yetib kelishingizni so&apos;raymiz.
        </p>

        <h2 className="text-lg font-bold text-slate-900">3. Qabulni bekor qilish yoki ko&apos;chirish</h2>
        <p>
          Agar rejalaringiz o&apos;zgarsa, qabulni bekor qilish yoki boshqa vaqtga ko&apos;chirishni kamida 2 soat oldin online havola orqali yoki telefon orqali amalga oshirishingizni iltimos qilamiz.
        </p>
      </div>
    </div>
  );
}
