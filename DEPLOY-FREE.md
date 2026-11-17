# Bepul demo deploy (portfolio uchun)

Maqsad: saytni hech qanday pulsiz internetga chiqarish. Bu **haqiqiy klinika uchun emas**, namoyish (portfolio) uchun.
Haqiqiy klinika uchun [DEPLOY.md](DEPLOY.md) bo'yicha oddiy server kerak.

```
Brauzer ──> Vercel (sayt) ──/api──> Render (backend) ──> Neon (baza)
```

Hamma sozlama allaqachon repo'da tayyor (`render.yaml`, `backend/Dockerfile`). Sizdan faqat uchta joyda akkaunt ochish va bir necha tugmani bosish kerak.
Hech qanday kod yoki buyruq yozish shart emas.

> Kod `dev` branch'dan joylanadi. `main` ga hech narsa chiqmaydi.

## 1. Baza: Neon (2 daqiqa)

1. https://neon.tech ga kiring, ikkinchi Google akkauntingiz bilan ro'yxatdan o'ting.
2. **Create project**: nomi `stomoapp`, region **AWS Europe (Frankfurt)**.
3. Loyiha ochilgach **Connection string** ni nusxalang. **"Pooled connection" katagi o'chiq bo'lsin** (to'g'ridan-to'g'ri ulanish kerak). U shunga o'xshaydi:
   `postgresql://...@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## 2. Backend: Render (5 daqiqa + ~8 daqiqa qurish)

1. https://render.com ga GitHub bilan kiring va GitHub'dagi repo'ga ruxsat bering.
2. **New → Blueprint** → `zemeisteer/StomoApp` reposini tanlang → branch **`dev`**.
3. Render `DATABASE_URL` ni so'raydi: Neon'dan nusxalagan qatorni qo'ying. Boshqa hech narsani o'zgartirmang → **Apply**.
4. Qurilish tugaguncha kuting (taxminan 8 daqiqa). Xizmat nomi `stomoapp-api` bo'lsa, manzili `https://stomoapp-api.onrender.com` bo'ladi.
   Agar nom band bo'lsa, Render boshqa nom beradi, ko'rsatilgan manzilni yozib oling.
5. Admin paroli: Render → `stomoapp-api` → **Environment** → `OWNER_PASSWORD` yonidagi ko'z belgisini bosing.
   Kirish emaili: `owner@stomoapp.demo`.

## 3. Sayt: Vercel (3 daqiqa)

1. https://vercel.com ga ikkinchi akkauntingiz bilan kiring (Artkla turgan akkaunt emas).
2. **Add New → Project** → `zemeisteer/StomoApp` ni import qiling.
3. **Root Directory** ni **`frontend`** qiling.
4. **Environment Variables** ga qo'shing:
   - `NEXT_PUBLIC_API_URL` = Render manzili (masalan `https://stomoapp-api.onrender.com`)
5. **Deploy**. Tugagach Vercel sayt manzilini beradi (masalan `https://stomoapp.vercel.app`).
6. Production branch'ni `dev` qiling: Settings → Git → Production Branch → `dev`.

## 4. Oxirgi ulash (1 daqiqa)

Render → `stomoapp-api` → **Environment** da ikkita qiymatni Vercel manziliga o'zgartiring va saqlang:
- `FRONTEND_URL`
- `PUBLIC_SITE_URL`

Keyin saytga kiring: `<sayt manzili>/admin/login`, yuqoridagi email va paroldan foydalaning.
Ma'lumotlarni (xizmatlar, shifokorlar, filiallar) shu admin paneldan o'zingiz qo'shasiz.

## Bilib qo'ying

- **Birinchi kirish sekin.** Render bepul serveri 15 daqiqa so'rovsiz qolsa uxlaydi, keyingi birinchi so'rov 30–60 soniya oladi.
  Buni oldini olish uchun (ixtiyoriy) https://uptimerobot.com da bepul monitor oching: `https://<render manzili>/api/health/live`, har 5 daqiqa.
  Bu manzil bazaga tegmaydi, shuning uchun Neon uxlayveradi va limitini yemaydi.
- **Yuklangan rasmlar yo'qoladi.** Bepul serverda disk yo'q, server qayta ishga tushsa, admin panel orqali yuklangan rasmlar o'chadi.
- **Bemor kabineti ishlamaydi**: SMS yo'q. Uning havolasi sayt'da yashirin.
- **Eslatmalar va SMS yuborilmaydi**, Telegram bot ham yo'q. Demo uchun kerak emas.
- Bepul tariflar va ularning shartlari tez-tez o'zgaradi. Bu qo'llanma ularni sinab ko'rmasdan yozilgan, birinchi marta ishga tushirganda kuzating.

## Haqiqiy mijoz topilsa

Domen oling va [DEPLOY.md](DEPLOY.md) bo'yicha oddiy serverga ko'chiring. Saytda ma'lumot saqlanmaydi, hammasi baza va backend'da, shuning uchun ko'chirish oson.
