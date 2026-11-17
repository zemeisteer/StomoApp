import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';

export default function PrivacyPage() {
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
              <Lock className="w-3.5 h-3.5 text-brand-600" />
              Xavfsizlik & Maxfiylik
            </span>
            <h1 className="text-3xl sm:text-5xl font-normal text-ink leading-[1.06] tracking-[-0.035em]">
              Shaxsiy ma&apos;lumotlarni himoya qilish siyosati
            </h1>
            <p className="text-xs text-ink-muted mt-1.5">
              Oxirgi yangilanish: 2026-yil 1-yanvar
            </p>
          </div>

          <div className="text-sm text-ink space-y-6 leading-relaxed">
            <p className="text-xs text-ink-muted leading-relaxed">
              Ushbu Maxfiylik siyosati &ldquo;DentaCare&rdquo; stomatologiya klinikasi (keyingi o&apos;rinlarda &ldquo;Klinika&rdquo;) tomonidan bemorlar va sayt foydalanuvchilarining shaxsiy ma&apos;lumotlarini yig&apos;ish, qayta ishlash va saqlash tartibini belgilaydi.
            </p>

            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-2">1. Yig&apos;iladigan ma&apos;lumotlar</h2>
              <p className="text-xs text-ink-muted mb-2">
                Online qabulga yozilish, qayta qo&apos;ng&apos;iroq buyurtma qilish yoki fikr qoldirishda quyidagi ma&apos;lumotlar so&apos;ralishi mumkin:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-ink-muted">
                <li>Foydalanuvchining to&apos;liq ismi (F.I.SH.);</li>
                <li>Telefon raqami va elektron pochta manzili;</li>
                <li>Qabul vaqti va tanlangan stomatologik xizmat;</li>
                <li>Bemorning shikoyati va xizmat ko&apos;rsatish uchun zarur bo&apos;lgan izohlar.</li>
              </ul>
            </div>

            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-2">2. Ma&apos;lumotlardan foydalanish maqsadi</h2>
              <p className="text-xs text-ink-muted mb-2">
                Shaxsiy ma&apos;lumotlar faqat quyidagi maqsadlarda ishlatiladi:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-ink-muted">
                <li>Qabulga yozilishni tasdiqlash va qabul vaqti haqida SMS/telefon orqali eslatish;</li>
                <li>Tibbiy xizmatlar ko&apos;rsatish va davolanish tarixini yuritish;</li>
                <li>Klinika xizmatlari sifatini oshirish va bemorlar bilan aloqani ta&apos;minlash.</li>
              </ul>
            </div>

            <div className="p-6 rounded-3xl bg-canvas">
              <h2 className="text-lg font-medium text-ink mb-2">3. Ma&apos;lumotlar xavfsizligi</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Klinika bemorlarning shaxsiy ma&apos;lumotlarini uchinchi shaxslarga oshkor qilmaydi va O&apos;zbekiston Respublikasining &ldquo;Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida&rdquo;gi Qonuni talablariga qat&apos;iy rioya qiladi.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
