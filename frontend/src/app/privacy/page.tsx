import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-6">
      <h1 className="text-3xl font-extrabold text-slate-900">
        Shaxsiy ma&apos;lumotlarni himoya qilish siyosati
      </h1>
      <p className="text-xs text-slate-400">
        Oxirgi yangilanish: 2026-yil 1-yanvar
      </p>

      <div className="prose prose-slate max-w-none text-sm text-slate-700 space-y-4 leading-relaxed">
        <p>
          Ushbu Maxfiylik siyosati &ldquo;DentaCare&rdquo; stomatologiya klinikasi (keyingi o&apos;rinlarda &ldquo;Klinika&rdquo;) tomonidan bemorlar va sayt foydalanuvchilarining shaxsiy ma&apos;lumotlarini yig&apos;ish, qayta ishlash va saqlash tartibini belgilaydi.
        </p>

        <h2 className="text-lg font-bold text-slate-900 pt-2">1. Yig&apos;iladigan ma&apos;lumotlar</h2>
        <p>
          Online qabulga yozilish, qayta qo&apos;ng&apos;iroq buyurtma qilish yoki fikr qoldirishda quyidagi ma&apos;lumotlar so&apos;ralishi mumkin:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Foydalanuvchining to&apos;liq ismi (F.I.SH.);</li>
          <li>Telefon raqami va elektron pochta manzili;</li>
          <li>Qabul vaqti va tanlangan stomatologik xizmat;</li>
          <li>Bemorning shikoyati va xizmat ko&apos;rsatish uchun zarur bo&apos;lgan izohlar.</li>
        </ul>

        <h2 className="text-lg font-bold text-slate-900 pt-2">2. Ma&apos;lumotlardan foydalanish maqsadi</h2>
        <p>
          Shaxsiy ma&apos;lumotlar faqat quyidagi maqsadlarda ishlatiladi:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Qabulga yozilishni tasdiqlash va qabul vaqti haqida SMS/telefon orqali eslatish;</li>
          <li>Tibbiy xizmatlar ko&apos;rsatish va davolanish tarixini yuritish;</li>
          <li>Klinika xizmatlari sifatini oshirish va bemorlar bilan aloqani ta&apos;minlash.</li>
        </ul>

        <h2 className="text-lg font-bold text-slate-900 pt-2">3. Ma&apos;lumotlar xavfsizligi</h2>
        <p>
          Klinika bemorlarning shaxsiy ma&apos;lumotlarini uchinchi shaxslarga oshkor qilmaydi va O&apos;zbekiston Respublikasining &ldquo;Shaxsga doir ma&apos;lumotlar to&apos;g&apos;risida&rdquo;gi Qonuni talablariga qat&apos;iy rioya qiladi.
        </p>
      </div>
    </div>
  );
}
