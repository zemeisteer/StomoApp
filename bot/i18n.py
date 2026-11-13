"""Uzbek / Russian texts for the patient-facing bot.

Staff-facing messages (staff group, doctor schedules) stay Uzbek.
"""
from typing import Dict, Iterable

LANGS = ("uz", "ru")
DEFAULT_LANG = "uz"

# Reply-keyboard buttons. Handlers match every language's label.
BUTTONS: Dict[str, Dict[str, str]] = {
    "appointments": {"uz": "📅 Qabullarim", "ru": "📅 Мои приёмы"},
    "plan": {"uz": "🦷 Davolash rejasi", "ru": "🦷 План лечения"},
    "debt": {"uz": "💳 Qarzdorlik holati", "ru": "💳 Задолженность"},
    "book": {"uz": "📝 Yangi qabulga yozilish", "ru": "📝 Записаться на приём"},
    "location": {"uz": "📍 Klinika manzili", "ru": "📍 Адрес клиники"},
    "contacts": {"uz": "📞 Bog'lanish", "ru": "📞 Контакты"},
    "language": {"uz": "🌐 Til / Язык", "ru": "🌐 Til / Язык"},
    "share_phone": {"uz": "📱 Telefon raqamimni ulashish", "ru": "📱 Поделиться номером телефона"},
}


def button_labels(key: str) -> Iterable[str]:
    return set(BUTTONS[key].values())


TEXTS: Dict[str, Dict[str, str]] = {
    "welcome": {
        "uz": "Assalomu alaykum, <b>{name}</b>!\n\n🦷 <b>{clinic}</b> rasmiy Telegram botiga xush kelibsiz!\n\n"
              "Qabullaringizni ko'rish, qabulga yozilish va davolash rejangizni kuzatish uchun "
              "pastdagi tugma orqali telefon raqamingizni yuboring:",
        "ru": "Здравствуйте, <b>{name}</b>!\n\n🦷 Добро пожаловать в официальный Telegram-бот <b>{clinic}</b>!\n\n"
              "Чтобы видеть свои приёмы, записываться и следить за планом лечения, "
              "отправьте свой номер телефона кнопкой ниже:",
    },
    "contact_foreign": {
        "uz": "⚠️ <b>Xavfsizlik:</b> faqat o'zingizning telefon raqamingizni ulashishingiz mumkin.\n\n"
              "Pastdagi <b>📱 Telefon raqamimni ulashish</b> tugmasini bosing.",
        "ru": "⚠️ <b>Безопасность:</b> можно поделиться только своим номером телефона.\n\n"
              "Нажмите кнопку <b>📱 Поделиться номером телефона</b> ниже.",
    },
    "sync_error": {
        "uz": "⚠️ Tizim bilan bog'lanishda xatolik. Birozdan keyin qayta urinib ko'ring.",
        "ru": "⚠️ Ошибка связи с системой. Попробуйте немного позже.",
    },
    "sync_ambiguous": {
        "uz": "⚠️ Bu telefon raqamiga bir nechta bemor yozilgan. Hisobingizni bog'lash uchun klinika qabulxonasiga murojaat qiling.",
        "ru": "⚠️ На этот номер записано несколько пациентов. Чтобы привязать аккаунт, обратитесь в регистратуру клиники.",
    },
    "linked": {
        "uz": "✅ <b>Hisobingiz bog'landi!</b>\n\n👤 <b>F.I.Sh:</b> {name}\n📱 <b>Telefon:</b> {phone}\n\n"
              "Endi pastdagi menyudan foydalanishingiz mumkin.",
        "ru": "✅ <b>Аккаунт привязан!</b>\n\n👤 <b>Ф.И.О.:</b> {name}\n📱 <b>Телефон:</b> {phone}\n\n"
              "Теперь можно пользоваться меню ниже.",
    },
    "not_registered": {
        "uz": "Bemor hisobi topilmadi. Avval /start buyrug'ini yuborib, telefon raqamingizni ulashing.",
        "ru": "Аккаунт пациента не найден. Сначала отправьте /start и поделитесь номером телефона.",
    },
    "choose_language": {"uz": "🌐 Tilni tanlang:", "ru": "🌐 Выберите язык:"},
    "language_set": {"uz": "✅ Til: o'zbekcha", "ru": "✅ Язык: русский"},
    # Appointments
    "no_appointments": {
        "uz": "📅 <b>Sizda faol qabullar yo'q.</b>\n\nYozilish uchun <b>📝 Yangi qabulga yozilish</b> tugmasini bosing.",
        "ru": "📅 <b>У вас нет активных приёмов.</b>\n\nЧтобы записаться, нажмите <b>📝 Записаться на приём</b>.",
    },
    "appointment_card": {
        "uz": "📋 <b>QABUL</b>\n\n👨‍⚕️ <b>Shifokor:</b> {doctor} ({spec})\n📅 <b>Sana:</b> {date}\n⏰ <b>Vaqt:</b> {time}\n"
              "Holati: <b>{status}</b>{notes}",
        "ru": "📋 <b>ПРИЁМ</b>\n\n👨‍⚕️ <b>Врач:</b> {doctor} ({spec})\n📅 <b>Дата:</b> {date}\n⏰ <b>Время:</b> {time}\n"
              "Статус: <b>{status}</b>{notes}",
    },
    "status_confirmed": {"uz": "🟢 Tasdiqlangan", "ru": "🟢 Подтверждён"},
    "status_pending": {"uz": "🟡 Tasdiq kutilmoqda", "ru": "🟡 Ожидает подтверждения"},
    "status_checked_in": {"uz": "🔵 Klinikada", "ru": "🔵 В клинике"},
    "notes_label": {"uz": "\nIzoh: <i>{notes}</i>", "ru": "\nПримечание: <i>{notes}</i>"},
    "cancel_appt_button": {"uz": "❌ Qabulni bekor qilish", "ru": "❌ Отменить приём"},
    "cancel_confirm_q": {
        "uz": "⚠️ <b>Haqiqatan ham bu qabulni bekor qilmoqchimisiz?</b>",
        "ru": "⚠️ <b>Вы действительно хотите отменить этот приём?</b>",
    },
    "cancel_yes": {"uz": "⚠️ Ha, bekor qilinsin", "ru": "⚠️ Да, отменить"},
    "back": {"uz": "⬅️ Ortga", "ru": "⬅️ Назад"},
    "cancelled": {"uz": "❌ <b>Qabulingiz bekor qilindi.</b>", "ru": "❌ <b>Ваш приём отменён.</b>"},
    "cancel_failed": {
        "uz": "⚠️ Bu qabulni bekor qilib bo'lmaydi (yakunlangan yoki ruxsat yo'q).",
        "ru": "⚠️ Этот приём нельзя отменить (завершён или нет доступа).",
    },
    # Treatment plan / debt
    "no_plan": {
        "uz": "✨ <b>Rejalashtirilgan muolajalar yo'q.</b>\nProfilaktik ko'rik uchun har 6 oyda kelib turishni tavsiya qilamiz.",
        "ru": "✨ <b>Запланированных процедур нет.</b>\nРекомендуем профилактический осмотр каждые 6 месяцев.",
    },
    "plan_title": {"uz": "🦷 <b>DAVOLASH REJANGIZ:</b>\n", "ru": "🦷 <b>ВАШ ПЛАН ЛЕЧЕНИЯ:</b>\n"},
    "plan_item": {"uz": "• <b>Tish #{tooth}</b>: {proc} — <b>{price}</b>", "ru": "• <b>Зуб #{tooth}</b>: {proc} — <b>{price}</b>"},
    "plan_general": {"uz": "Umumiy", "ru": "Общее"},
    "plan_total": {
        "uz": "\n💰 <b>Jami:</b> <b>{total}</b>\n\n<i>Batafsil ma'lumot uchun shifokoringiz bilan maslahatlashing.</i>",
        "ru": "\n💰 <b>Итого:</b> <b>{total}</b>\n\n<i>Подробности уточняйте у вашего врача.</i>",
    },
    "debt_yes": {
        "uz": "💳 <b>HISOB-KITOB</b>\n\n👤 {name}\n⚠️ <b>Qarzdorlik:</b> <b>{amount}</b>\n\n"
              "<i>To'lovni klinika qabulxonasida amalga oshirishingiz mumkin.</i>{phone}",
        "ru": "💳 <b>РАСЧЁТЫ</b>\n\n👤 {name}\n⚠️ <b>Задолженность:</b> <b>{amount}</b>\n\n"
              "<i>Оплатить можно в регистратуре клиники.</i>{phone}",
    },
    "debt_no": {
        "uz": "💳 <b>HISOB-KITOB</b>\n\n👤 {name}\n✅ <b>Qarzdorlik yo'q.</b> Rahmat!",
        "ru": "💳 <b>РАСЧЁТЫ</b>\n\n👤 {name}\n✅ <b>Задолженности нет.</b> Спасибо!",
    },
    "phone_line": {"uz": "\n📞 {phone}", "ru": "\n📞 {phone}"},
    "currency": {"uz": "{amount} so'm", "ru": "{amount} сум"},
    "price_from": {"uz": "{amount} so'mdan", "ru": "от {amount} сум"},
    # Booking
    "no_doctors": {
        "uz": "Hozirda onlayn yozilish uchun faol shifokorlar yo'q.",
        "ru": "Сейчас нет врачей, доступных для онлайн-записи.",
    },
    "choose_doctor": {"uz": "👨‍⚕️ <b>Shifokorni tanlang:</b>", "ru": "👨‍⚕️ <b>Выберите врача:</b>"},
    "choose_branch": {"uz": "🏥 <b>Filialni tanlang:</b>", "ru": "🏥 <b>Выберите филиал:</b>"},
    "choose_service": {"uz": "🦷 <b>Xizmatni tanlang:</b>", "ru": "🦷 <b>Выберите услугу:</b>"},
    "choose_date": {"uz": "📅 <b>Qabul kunini tanlang:</b>", "ru": "📅 <b>Выберите дату приёма:</b>"},
    "choose_time": {"uz": "⏰ <b>{date}</b> uchun vaqtni tanlang:", "ru": "⏰ Выберите время на <b>{date}</b>:"},
    "no_slots": {
        "uz": "⚠️ Bu kunda bo'sh vaqt qolmagan. Boshqa kunni tanlang:",
        "ru": "⚠️ На этот день свободного времени нет. Выберите другой день:",
    },
    "today": {"uz": "Bugun", "ru": "Сегодня"},
    "tomorrow": {"uz": "Ertaga", "ru": "Завтра"},
    "other_date": {"uz": "⬅️ Boshqa sana", "ru": "⬅️ Другая дата"},
    "cancel": {"uz": "❌ Bekor qilish", "ru": "❌ Отмена"},
    "booking_cancelled": {"uz": "Qabulga yozilish bekor qilindi.", "ru": "Запись отменена."},
    "session_expired": {
        "uz": "Sessiya eskirgan. \"📝 Yangi qabulga yozilish\" tugmasidan qaytadan boshlang.",
        "ru": "Сессия устарела. Начните заново кнопкой \"📝 Записаться на приём\".",
    },
    "booking_failed": {
        "uz": "Qabulni band qilib bo'lmadi: vaqt hozirgina band qilingan bo'lishi mumkin. "
              "Telefon raqamingizni hali ulashmagan bo'lsangiz, avval /start yuboring.\n\nBoshqa kunni tanlang:",
        "ru": "Не удалось записаться: время могли только что занять. "
              "Если вы ещё не поделились номером, сначала отправьте /start.\n\nВыберите другой день:",
    },
    "booked": {
        "uz": "✅ <b>QABULGA YOZILDINGIZ!</b>\n\n👨‍⚕️ <b>Shifokor:</b> {doctor}\n🏥 <b>Filial:</b> {branch}\n"
              "🦷 <b>Xizmat:</b> {service}\n📅 <b>Sana:</b> {date}\n⏰ <b>Vaqt:</b> {time}\n\n"
              "<i>Klinika qabulni tasdiqlaydi. Qabuldan 24 soat oldin shu yerda, 2 soat oldin SMS orqali eslatamiz.</i>",
        "ru": "✅ <b>ВЫ ЗАПИСАНЫ!</b>\n\n👨‍⚕️ <b>Врач:</b> {doctor}\n🏥 <b>Филиал:</b> {branch}\n"
              "🦷 <b>Услуга:</b> {service}\n📅 <b>Дата:</b> {date}\n⏰ <b>Время:</b> {time}\n\n"
              "<i>Клиника подтвердит запись. Напомним здесь за 24 часа и по SMS за 2 часа.</i>",
    },
    # Clinic info
    "location_title": {"uz": "📍 <b>{clinic}</b>", "ru": "📍 <b>{clinic}</b>"},
    "branch_block": {"uz": "\n🏥 <b>{name}</b>\n{address}", "ru": "\n🏥 <b>{name}</b>\n{address}"},
    "hours": {"uz": "⏰ {hours}", "ru": "⏰ {hours}"},
    "map": {"uz": "🗺 <a href=\"{url}\">Xaritada ko'rish</a>", "ru": "🗺 <a href=\"{url}\">Открыть на карте</a>"},
    "phone": {"uz": "📞 {phone}", "ru": "📞 {phone}"},
    "contacts_title": {
        "uz": "📞 <b>QABULXONA</b>\n\nYozilish, narxlar yoki savollar bo'yicha bog'laning:\n",
        "ru": "📞 <b>РЕГИСТРАТУРА</b>\n\nПо записи, ценам и вопросам:\n",
    },
    "website": {"uz": "🌐 <a href=\"{url}\">{url}</a>", "ru": "🌐 <a href=\"{url}\">{url}</a>"},
    "telegram_channel": {"uz": "💬 {link}", "ru": "💬 {link}"},
    # Reminder
    "reminder_24h": {
        "uz": "⏰ <b>ESLATMA: ERTAGA QABULINGIZ BOR</b>\n\nHurmatli {patient},\n<b>{date}</b> kuni soat <b>{time}</b> da "
              "<b>{doctor}</b> qabuliga yozilgansiz.{branch}\n\n"
              "<i>Kela olmasangiz, \"📅 Qabullarim\" bo'limidan qabulni bekor qilishingiz mumkin.</i>",
        "ru": "⏰ <b>НАПОМИНАНИЕ: ЗАВТРА У ВАС ПРИЁМ</b>\n\nУважаемый(ая) {patient},\nвы записаны на <b>{date}</b> в <b>{time}</b> "
              "к врачу <b>{doctor}</b>.{branch}\n\n"
              "<i>Если не сможете прийти, отмените приём в разделе \"📅 Мои приёмы\".</i>",
    },
    # Staff linking
    "staff_linked": {
        "uz": "✅ {name}, Telegram akkauntingiz klinika tizimiga ulandi. Har kuni ertalab qabullaringiz jadvalini shu yerda olasiz.",
        "ru": "✅ {name}, ваш Telegram подключён к системе клиники. Каждое утро здесь будет расписание ваших приёмов.",
    },
    "staff_link_failed": {
        "uz": "⚠️ Havola eskirgan, allaqachon ishlatilgan yoki bu Telegram boshqa xodimga ulangan. Admin paneldan yangi havola oling.",
        "ru": "⚠️ Ссылка устарела, уже использована или этот Telegram привязан к другому сотруднику. Получите новую ссылку в админ-панели.",
    },
    "myid": {
        "uz": "🆔 Telegram ID: <code>{id}</code>\n\nXodim bo'lsangiz, admin panelda \"Telegram\" tugmasi orqali o'zingiz ulashingiz mumkin.",
        "ru": "🆔 Telegram ID: <code>{id}</code>\n\nЕсли вы сотрудник, подключитесь сами через кнопку \"Telegram\" в админ-панели.",
    },
}

WEEKDAYS = {
    "uz": {"mon": "Du", "tue": "Se", "wed": "Ch", "thu": "Pa", "fri": "Ju", "sat": "Sh", "sun": "Ya"},
    "ru": {"mon": "Пн", "tue": "Вт", "wed": "Ср", "thu": "Чт", "fri": "Пт", "sat": "Сб", "sun": "Вс"},
}
DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
CLOSED = {"uz": "dam olish", "ru": "выходной"}


def norm_lang(lang) -> str:
    return lang if lang in LANGS else DEFAULT_LANG


def t(lang: str, key: str, **kwargs) -> str:
    entry = TEXTS[key]
    text = entry.get(norm_lang(lang)) or entry[DEFAULT_LANG]
    return text.format(**kwargs) if kwargs else text


def money(lang: str, amount, key: str = "currency") -> str:
    try:
        formatted = f"{int(amount):,}".replace(",", " ")
    except (TypeError, ValueError):
        formatted = "0"
    return t(lang, key, amount=formatted)


def format_working_hours(lang: str, hours: dict) -> str:
    """{mon: {open, close}, ...} -> 'Du–Ju 09:00–20:00, Sh 09:00–18:00, Ya dam olish'."""
    if not isinstance(hours, dict) or not hours:
        return ""
    names = WEEKDAYS[norm_lang(lang)]

    def span(day):
        h = hours.get(day)
        if not isinstance(h, dict) or h.get("closed") or not h.get("open") or not h.get("close"):
            return None
        return f"{h['open']}–{h['close']}"

    groups = []  # [first_day, last_day, span]
    for day in DAY_ORDER:
        s = span(day)
        if groups and groups[-1][2] == s:
            groups[-1][1] = day
        else:
            groups.append([day, day, s])
    parts = []
    for first, last, s in groups:
        days = names[first] if first == last else f"{names[first]}–{names[last]}"
        parts.append(f"{days} {s if s else CLOSED[norm_lang(lang)]}")
    return ", ".join(parts)
