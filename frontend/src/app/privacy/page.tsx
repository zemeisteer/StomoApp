import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';

export default function PrivacyPage() {
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
              <Lock className="w-3.5 h-3.5 text-[#167b78]" />
              Xavfsizlik & Maxfiylik
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#152f34] tracking-tight">
              Shaxsiy ma&apos;lumotlarni himoya qilish siyosati
            </h1>
            <p className="text-xs text-[#52696e] mt-1.5">
              Oxirgi yangilanish: 2026-yil 1-yanvar
            </p>
          </div>

          <div className="text-sm text-[#152f34] space-y-6 leading-relaxed">
            <p className="text-xs text-[#52696e] leading-relaxed">
              Ushbu Maxfiylik siyosati &ldquo;DentaCare&rdquo; stomatologiya klinikasi (keyingi o&apos;rinlarda &ldquo;Klinika&rdquo;) tomonidan bemorlar va sayt foydalanuvchilarining shaxsiy ma&apos;lumotlarini yig&apos;ish, qayta ishlash va saqlash tartibini belgilaydi.
            </p>

            <div className="p-5 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-2">1. Yig&apos;iladigan ma&apos;lumotlar</h2>
              <p className="text-xs text-[#52696e] mb-2">
                Online qabulga yozilish, qayta qo&apos;ng&apos;iroq buyurtma qilish yoki fikr qoldirishda quyidagi ma&apos;lumotlar so&apos;ralishi mumkin:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-[#52696e]">
                <li>Foydalanuvchining to&apos;liq ismi (F.I.SH.);</li>
                <li>Telefon raqami va elektron pochta manzili;</li>
                <li>Qabul vaqti va tanlangan stomatologik xizmat;</li>
                <li>Bemorning shikoyati va xizmat ko&apos;rsatish uchun zarur bo&apos;lgan izohlar.</li>
              </ul>
            </div>

            <div className="p-5 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-2">2. Ma&apos;lumotlardan foydalanish maqsadi</h2>
              <p className="text-xs text-[#52696e] mb-2">
                Shaxsiy ma&apos;lumotlar faqat quyidagi maqsadlarda ishlatiladi:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-[#52696e]">
                <li>Qabulga yozilishni tasdiqlash va qabul vaqti haqida SMS/telefon orqali eslatish;</li>
                <li>Tibbiy xizmatlar ko&apos;rsatish va davolanish tarixini yuritish;</li>
                <li>Klinika xizmatlari sifatini oshirish va bemorlar bilan aloqani ta&apos;minlash.</li>
              </ul>
            </div>

            <div className="p-5 rounded-2xl bg-[#f3f8f7] border border-[#d8e5e2]">
              <h2 className="text-base font-bold text-[#152f34] mb-2">3. Ma&apos;lumotlar xavfsizligi</h2>
              <p className="text-xs text-[#52696e] leading-relaxed">
                Klinika bemorlarning shaxsiy ma&apos;lumotlarini uchinchi shaxslarga oshkor qilmaydi va O&apos;zbekiston Respublikasining &ldquo;Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida&rdquo;gi Qonuni talablariga qat&apos;iy rioya qiladi.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
