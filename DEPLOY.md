# Serverga chiqarish (deploy) qo'llanmasi

Bu qo'llanma bitta klinikani VPS serverga o'rnatishni boshidan oxirigacha ko'rsatadi.
Buyruqlarning hammasi serverda, repozitoriy papkasida bajariladi.

---

## 0. Kerakli narsalar

| Nima | Qayerdan / talab |
|---|---|
| VPS server | Ubuntu 22.04 yoki 24.04, kamida **2 GB RAM**, **20 GB disk**, ochiq **80** va **443** portlar |
| Domen | Masalan `klinika.uz`. Uning **A** yozuvi server IP manziliga yo'naltiriladi (DNS sozlamasi domen sotib olingan joyda) |
| Telegram bot | [@BotFather](https://t.me/BotFather) → `/newbot` → token (`TELEGRAM_BOT_TOKEN`) va bot nomi (`TELEGRAM_BOT_USERNAME`) |
| Xodimlar guruhi | Telegram guruh yarating, botni qo'shing. Guruh ID'si (`TELEGRAM_CHAT_ID`, `-100…` bilan boshlanadi) yangi bron va ogohlantirishlar uchun |
| SMS | [Eskiz](https://eskiz.uz) kabineti: login (email) va parol. Yuboruvchi nomi tasdiqlanmaguncha `4546` ishlatiladi |
| Payme / Click (ixtiyoriy) | Payme Business va Click merchant kabinetlari (5-bosqich) |

> **Eskiz shablonlari.** Eskiz faqat kabinetda moderatsiyadan o'tgan matnlarni yuboradi. Quyidagi xabar turlarini shablon sifatida tasdiqlating (matnlarni `backend/src/notifications/notifications.service.ts`, `engagement.service.ts`, `portal-auth.service.ts` dan oling): qabul qabul qilindi / tasdiqlandi / bekor qilindi / ko'chirildi / eslatma, kabinetga kirish kodi, ko'rik eslatmasi, tug'ilgan kun tabrigi.

---

## 1. Serverni tayyorlash

```bash
# Docker va git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # keyin serverdan chiqib, qayta kiring
sudo apt-get install -y git

# Firewall (agar ufw yoqilgan bo'lsa)
sudo ufw allow 22,80,443/tcp
```

```bash
git clone https://github.com/zemeisteer/StomoApp.git
cd StomoApp
git checkout main
```

---

## 2. Sozlamalar fayli

```bash
# Tasodifiy parollar va kalitlar bilan .env.production yaratadi (mavjud faylni o'chirmaydi)
./scripts/generate-env.sh klinika.uz admin@klinika.uz
nano .env.production
```

To'ldiriladigan qatorlar:

| Kalit | Qiymat |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | BotFather'dan |
| `TELEGRAM_CHAT_ID` | Xodimlar guruhi ID'si |
| `OPS_TELEGRAM_CHAT_ID` | Ixtiyoriy: texnik ogohlantirishlar (SMS yuborilmadi, ombor kam) uchun alohida guruh |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | Eskiz kabineti |
| `CLINIC_NAME`, `CLINIC_PHONE`, `CLINIC_LOCATION_URL` | Bot ko'rsatadigan klinika ma'lumotlari |

Qolgan parol va kalitlarni (`POSTGRES_PASSWORD`, `JWT_*`, `SERVICE_TOKEN`) o'zgartirmang, ular avtomatik yaratilgan.

> SMS sozlanmasa, xabarlar faqat logga yoziladi. Bemor kabinetiga esa faqat Telegram botga ulangan bemorlar kira oladi.

---

## 3. Tekshirish va birinchi ishga tushirish

```bash
# DNS, portlar, Docker, kalitlar, SMS/Payme/Click sozlamalarini tekshiradi. Hech narsani o'zgartirmaydi.
# [FAIL] qatorlarini tuzatmaguncha davom etmang.
./scripts/preflight.sh
```

```bash
# Avval Let's Encrypt staging bilan sinab ko'ring (limitga tushmaslik uchun)
STAGING=1 ./scripts/init-letsencrypt.sh
# Ishladi bo'lsa, haqiqiy sertifikat
FORCE=1 ./scripts/init-letsencrypt.sh
```

```bash
# Klinika egasi akkaunti (parol kamida 12 belgi)
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  -e OWNER_EMAIL=egasi@klinika.uz -e OWNER_NAME="Ism Familiya" -e OWNER_PASSWORD='kamida-12-belgili-parol' \
  backend node scripts/create-owner.js
```

```bash
# Hamma konteynerlar "healthy" bo'lishi kerak
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Ma'lumotlar bazasi migratsiyalari backend ishga tushganda avtomatik qo'llanadi.

---

## 4. Admin panelni sozlash (`https://klinika.uz/admin`)

1. **Sozlamalar:** klinika nomi (uz/ru), logo, brend ranglari, telefonlar, ijtimoiy tarmoqlar, bron qoidalari.
2. **Filiallar:** manzil, telefon, ish vaqti, xarita havolasi.
3. **Xizmatlar va narxlar:** demo xizmatlar bo'lsa o'chiring yoki tahrirlang.
4. **Shifokorlar va jadvallar:** har bir shifokor, ish kunlari, xizmatlari.
5. **Xodimlar:** administrator, qabulxona va shifokor akkauntlari. Har kim o'z Telegram'ini panelning chap pastidagi "Telegram" tugmasi orqali ulaydi.
6. **Shifokor maoshi:** har bir shifokor foizi.
7. **Qayta chaqirish:** avtomatik ko'rik eslatmasi va tug'ilgan kun tabrigini xohlasangiz yoqing (boshida o'chiq).

---

## 5. Payme va Click (ixtiyoriy)

`.env.production` ga qo'shing:

```bash
PAYME_MERCHANT_ID=...
PAYME_KEY=...            # avval sandbox (test) kaliti
PAYME_TEST_MODE=true
CLICK_SERVICE_ID=...
CLICK_MERCHANT_ID=...
CLICK_SECRET_KEY=...
```

Kabinetlarda ko'rsatiladigan manzillar:

| Provayder | Sozlama |
|---|---|
| Payme | Endpoint: `https://klinika.uz/api/payments/payme`, hisob maydoni (account): `invoice_id` |
| Click | Prepare: `https://klinika.uz/api/payments/click/prepare`, Complete: `https://klinika.uz/api/payments/click/complete` |

Payme sandbox testlaridan o'tgach, haqiqiy kalitni yozing, `PAYME_TEST_MODE=false` qiling va `./scripts/deploy.sh` ni ishga tushiring.

---

## 6. Ishga tushirishdan oldingi tekshiruv ro'yxati

- [ ] `https://klinika.uz` ochiladi, brauzerda qulf belgisi bor
- [ ] Saytdan sinov qabuliga yozilish → bemorga SMS keldi, xodimlar guruhiga Telegram xabari keldi
- [ ] Admin panelda qabulni tasdiqlash → bemorga "tasdiqlandi" SMS keldi
- [ ] Telegram bot: `/start`, til tanlash, qabulga yozilish
- [ ] `https://klinika.uz/kabinet` → telefon raqam → kod keldi → kirildi
- [ ] Davolash rejasi → "Bemorga havola" → havola telefonda ochildi, rozilik berildi
- [ ] Kassa: smena ochish → naqd to'lov → smena yopish
- [ ] Payme/Click sandbox to'lovi (agar ulangan bo'lsa)
- [ ] Zaxira nusxa yaratildi: `ls backups/` (birinchisi ishga tushganda olinadi, keyin har 24 soatda)
- [ ] `dev` → `main` PR merge qilingan, serverda `main` branch

---

## 7. Zaxira nusxa (backup)

- `backup` konteyneri har 24 soatda bazani va yuklangan fayllarni `./backups` papkasiga yozadi, 14 kun saqlaydi.
- **Nusxani boshqa joyga ham ko'chiring** (server yo'qolsa, nusxa ham yo'qoladi). Masalan, har kuni `rclone` yoki `rsync` bilan boshqa serverga yoki bulutga.
- Tiklash:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend bot
./backend/scripts/restore-database.sh backups/<fayl>.dump
docker compose --env-file .env.production -f docker-compose.prod.yml start backend bot
```

---

## 8. Yangilash

```bash
git pull
# Tekshiruv → zaxira nusxa → qayta build → hammasi healthy bo'lguncha kutish
./scripts/deploy.sh --pull
```

---

## 9. Muammo bo'lsa

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 nginx
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 bot
```

| Belgi | Sabab |
|---|---|
| Sertifikat olinmadi | DNS hali serverga ko'rsatmayapti yoki 80-port yopiq |
| Admin panelga kira olmayapman | Sayt `https` orqali ochilishi shart (cookie `Secure`) |
| SMS kelmayapti | Eskiz login/parol, balans yoki shablon tasdiqlanmagan. Admin → Xabarnomalar bo'limida xatolar ko'rinadi |
| Bot javob bermayapti | `TELEGRAM_BOT_TOKEN` noto'g'ri yoki bot boshqa joyda ham ishga tushirilgan |
