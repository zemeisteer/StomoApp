'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'uz' | 'ru';

export interface Translations {
  common: {
    clinicName: string;
    tagline: string;
    bookAppointment: string;
    callNow: string;
    requestCallback: string;
    phone: string;
    workingHours: string;
    address: string;
    branches: string;
    selectLanguage: string;
    loading: string;
    success: string;
    error: string;
    retry: string;
    back: string;
    next: string;
    save: string;
    cancel: string;
    confirm: string;
    reschedule: string;
    search: string;
    all: string;
    submit: string;
    name: string;
    email: string;
    note: string;
    status: string;
    date: string;
    time: string;
    doctor: string;
    service: string;
    branch: string;
    price: string;
    uzs: string;
    viewDetails: string;
    readMore: string;
  };
  nav: {
    home: string;
    about: string;
    services: string;
    doctors: string;
    prices: string;
    reviews: string;
    faq: string;
    articles: string;
    contacts: string;
    admin: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    ctaBook: string;
    ctaServices: string;
    features: {
      experience: string;
      guarantee: string;
      painless: string;
      modern: string;
    };
    pause3d: string;
    resume3d: string;
    rotateHint: string;
  };
  booking: {
    title: string;
    subtitle: string;
    stepBranch: string;
    stepService: string;
    stepDoctor: string;
    stepTime: string;
    stepDetails: string;
    stepConfirmation: string;
    selectBranch: string;
    selectService: string;
    selectDoctor: string;
    anyDoctor: string;
    selectDate: string;
    selectSlot: string;
    noSlots: string;
    patientInfo: string;
    fullNamePlaceholder: string;
    phonePlaceholder: string;
    consentText: string;
    consentError: string;
    bookingSuccess: string;
    requestReceivedNotice: string;
    appointmentId: string;
    managementTokenNotice: string;
    trackBooking: string;
  };
  callback: {
    title: string;
    subtitle: string;
    namePlaceholder: string;
    phonePlaceholder: string;
    branchOptional: string;
    preferredTime: string;
    submit: string;
    success: string;
  };
  reviews: {
    title: string;
    subtitle: string;
    writeReview: string;
    rating: string;
    comment: string;
    authorName: string;
    displayNameConsent: string;
    pendingApproval: string;
    averageRating: string;
  };
  admin: {
    loginTitle: string;
    dashboard: string;
    calendar: string;
    appointments: string;
    patients: string;
    leads: string;
    doctorsManage: string;
    servicesManage: string;
    reviewsModerate: string;
    cms: string;
    analytics: string;
    audit: string;
    logout: string;
    role: string;
  };
}

const translations: Record<Language, Translations> = {
  uz: {
    common: {
      clinicName: 'DentaCare',
      tagline: 'Zamonaviy va professional stomatologiya klinikasi',
      bookAppointment: 'Qabulga yozilish',
      callNow: 'Qo\'ng\'iroq qilish',
      requestCallback: 'Qayta qo\'ng\'iroq buyurtma qilish',
      phone: 'Telefon',
      workingHours: 'Ish vaqti',
      address: 'Manzil',
      branches: 'Filiallarimiz',
      selectLanguage: 'Tilni tanlang',
      loading: 'Yuklanmoqda...',
      success: 'Muvaffaqiyatli bajarildi',
      error: 'Xatolik yuz berdi',
      retry: 'Qayta urinish',
      back: 'Orqaga',
      next: 'Keyingisi',
      save: 'Saqlash',
      cancel: 'Bekor qilish',
      confirm: 'Tasdiqlash',
      reschedule: 'Vaqtni o\'zgartirish',
      search: 'Qidirish',
      all: 'Barchasi',
      submit: 'Yuborish',
      name: 'Ism familiya',
      email: 'Elektron pochta',
      note: 'Qo\'shimcha izoh',
      status: 'Holat',
      date: 'Sana',
      time: 'Vaqt',
      doctor: 'Shifokor',
      service: 'Xizmat',
      branch: 'Filial',
      price: 'Narx',
      uzs: 'so\'m',
      viewDetails: 'Batafsil',
      readMore: 'Ko\'proq o\'qish',
    },
    nav: {
      home: 'Bosh sahifa',
      about: 'Klinika haqida',
      services: 'Xizmatlar',
      doctors: 'Shifokorlar',
      prices: 'Narxlar',
      reviews: 'Fikrlar',
      faq: 'Ko\'p so\'raladigan savollar',
      articles: 'Maqolalar',
      contacts: 'Bog\'lanish',
      admin: 'Boshqaruv paneli',
    },
    hero: {
      badge: 'Toshkentdagi yetakchi stomatologiya tarmog\'i',
      title: 'Sog\'lom tabassum — ishonchli va og\'riqsiz muolaja',
      subtitle: 'Eng so\'nggi mikroskopik texnologiyalar, nemis va yapon asbob-uskunalari hamda 15 yildan ortiq tajribaga ega malakali mutaxassislar xizmatingizda.',
      ctaBook: 'Qabulga yozilish',
      ctaServices: 'Xizmatlarimiz bilan tanishish',
      features: {
        experience: '15+ yillik tajriba',
        guarantee: '100% kafolatlangan gigiyena',
        painless: 'Og\'riqsiz kompyuter anesteziyasi',
        modern: '3D tomografiya va mikroskop',
      },
      pause3d: '3D animatsiyani to\'xtatish',
      resume3d: '3D animatsiyani davom ettirish',
      rotateHint: 'Tish modelini aylantirish uchun sichqoncha yoki barmoq bilan suring',
    },
    booking: {
      title: 'Online qabulga yozilish',
      subtitle: 'Qulay filial, xizmat va shifokorni tanlab, bir necha daqiqada qabulga yoziling',
      stepBranch: 'Filial',
      stepService: 'Xizmat',
      stepDoctor: 'Shifokor',
      stepTime: 'Vaqt',
      stepDetails: 'Ma\'lumotlar',
      stepConfirmation: 'Tasdiq',
      selectBranch: 'Klinika filialini tanlang',
      selectService: 'Kerakli xizmatni tanlang',
      selectDoctor: 'Shifokorni tanlang',
      anyDoctor: 'Istalgan bo\'sh shifokor',
      selectDate: 'Qabul sanasini tanlang',
      selectSlot: 'Mavjud bo\'sh vaqtni tanlang',
      noSlots: 'Tanlangan kunda bo\'sh vaqtlar mavjud emas. Iltimos boshqa sanani tanlang.',
      patientInfo: 'Bemor ma\'lumotlari',
      fullNamePlaceholder: 'Ismingiz va familiyangiz',
      phonePlaceholder: '+998 90 123 45 67',
      consentText: 'Shaxsiy ma\'lumotlarimni qayta ishlashga va klinikadan SMS xabarnoma olishga roziman',
      consentError: 'Davom etish uchun shaxsiy ma\'lumotlar qayta ishlanishiga rozilik berishingiz kerak',
      bookingSuccess: 'Qabulga so\'rov qabul qilindi!',
      requestReceivedNotice: 'Sizning qabul so\'rovingiz qabul qilindi va administrator ko\'rib chiqmoqda. Tez orada telefon orqali tasdiqlash uchun bog\'lanamiz.',
      appointmentId: 'Qabul ID raqami',
      managementTokenNotice: 'Qabul holatini kuzatish yoki vaqtini o\'zgartirish uchun havolani saqlab qo\'ying.',
      trackBooking: 'Qabul holatini ko\'rish',
    },
    callback: {
      title: 'Qayta qo\'ng\'iroq buyurtma qilish',
      subtitle: 'Raqamingizni qoldiring, 15 daqiqa ichida mutaxassisimiz siz bilan bog\'lanadi',
      namePlaceholder: 'Ismingiz',
      phonePlaceholder: '+998 90 123 45 67',
      branchOptional: 'Qulay filial (ixtiyoriy)',
      preferredTime: 'Qulay qo\'ng\'iroq vaqti',
      submit: 'Qo\'ng\'iroqni kutaman',
      success: 'Rahmat! Tez orada administrator siz bilan bog\'lanadi.',
    },
    reviews: {
      title: 'Bemorlarimiz fikrlari',
      subtitle: 'Haqiqiy davolangan bemorlarimizning samimiy mulohazalari',
      writeReview: 'Fikr bildirish',
      rating: 'Baholash',
      comment: 'Fikringiz va taassurotlaringiz',
      authorName: 'Ismingiz',
      displayNameConsent: 'Fikrim yonida ismim ko\'rinishiga roziman (aks holda "Bemor" deb yoziladi)',
      pendingApproval: 'Fikringiz uchun tashakkur! Moderator ko\'rib chiqqandan so\'ng saytda e\'lon qilinadi.',
      averageRating: 'O\'rtacha baho',
    },
    admin: {
      loginTitle: 'DentaCare Admin Tizimi',
      dashboard: 'Umumiy ko\'rsatkichlar',
      calendar: 'Qabul taqvimi',
      appointments: 'Barcha qabullar',
      patients: 'Bemorlar bazasi',
      leads: 'Qayta qo\'ng\'iroqlar (Lidlar)',
      doctorsManage: 'Shifokorlar va jadvallar',
      servicesManage: 'Xizmatlar va narxlar',
      reviewsModerate: 'Fikrlarni moderatsiya qilish',
      cms: 'Sayt kontenti (CMS)',
      analytics: 'Kengaytirilgan tahlil',
      audit: 'Xavfsizlik jurnali',
      logout: 'Chiqish',
      role: 'Roli',
    },
  },
  ru: {
    common: {
      clinicName: 'DentaCare',
      tagline: 'Современная и профессиональная стоматологическая клиника',
      bookAppointment: 'Записаться на прием',
      callNow: 'Позвонить',
      requestCallback: 'Заказать звонок',
      phone: 'Телефон',
      workingHours: 'Время работы',
      address: 'Адрес',
      branches: 'Наши филиалы',
      selectLanguage: 'Выберите язык',
      loading: 'Загрузка...',
      success: 'Успешно выполнено',
      error: 'Произошла ошибка',
      retry: 'Повторить попытку',
      back: 'Назад',
      next: 'Далее',
      save: 'Сохранить',
      cancel: 'Отмена',
      confirm: 'Подтвердить',
      reschedule: 'Перенести время',
      search: 'Поиск',
      all: 'Все',
      submit: 'Отправить',
      name: 'Имя и фамилия',
      email: 'Электронная почта',
      note: 'Примечание к приему',
      status: 'Статус',
      date: 'Дата',
      time: 'Время',
      doctor: 'Врач',
      service: 'Услуга',
      branch: 'Филиал',
      price: 'Стоимость',
      uzs: 'сум',
      viewDetails: 'Подробнее',
      readMore: 'Читать далее',
    },
    nav: {
      home: 'Главная',
      about: 'О клинике',
      services: 'Услуги',
      doctors: 'Врачи',
      prices: 'Цены',
      reviews: 'Отзывы',
      faq: 'Частые вопросы',
      articles: 'Статьи',
      contacts: 'Контакты',
      admin: 'Панель управления',
    },
    hero: {
      badge: 'Ведущая сеть стоматологий в Ташкенте',
      title: 'Здоровая улыбка — надежное и безболезненное лечение',
      subtitle: 'Передовое лечение под дентальным микроскопом, немецкое и японское оборудование, а также опытные врачи с практикой более 15 лет.',
      ctaBook: 'Записаться на прием',
      ctaServices: 'Ознакомиться с услугами',
      features: {
        experience: 'Более 15 лет опыта',
        guarantee: '100% стерильность и гарантия',
        painless: 'Безболезненная компьютерная анестезия',
        modern: '3D-томография и микроскопия',
      },
      pause3d: 'Остановить 3D-анимацию',
      resume3d: 'Возобновить 3D-анимацию',
      rotateHint: 'Вращайте модель зуба с помощью мыши или пальца на сенсорном экране',
    },
    booking: {
      title: 'Онлайн запись на прием',
      subtitle: 'Выберите удобный филиал, услугу и специалиста, чтобы забронировать время онлайн',
      stepBranch: 'Филиал',
      stepService: 'Услуга',
      stepDoctor: 'Специалист',
      stepTime: 'Время',
      stepDetails: 'Контакты',
      stepConfirmation: 'Подтверждение',
      selectBranch: 'Выберите филиал клиники',
      selectService: 'Выберите необходимую услугу',
      selectDoctor: 'Выберите лечащего врача',
      anyDoctor: 'Любой свободный специалист',
      selectDate: 'Выберите дату визита',
      selectSlot: 'Выберите свободное время',
      noSlots: 'На выбранную дату нет свободных слотов. Пожалуйста, выберите другой день.',
      patientInfo: 'Данные пациента',
      fullNamePlaceholder: 'Ваше имя и фамилия',
      phonePlaceholder: '+998 90 123 45 67',
      consentText: 'Согласен на обработку персональных данных и получение сервисных уведомлений от клиники',
      consentError: 'Необходимо подтвердить согласие на обработку персональных данных',
      bookingSuccess: 'Заявка на прием успешно принята!',
      requestReceivedNotice: 'Ваша заявка зарегистрирована в системе и ожидает подтверждения администратором клиники. Мы свяжемся с вами в ближайшее время.',
      appointmentId: 'Номер бронирования',
      managementTokenNotice: 'Сохраните эту ссылку для проверки статуса или переноса времени приема.',
      trackBooking: 'Проверить статус записи',
    },
    callback: {
      title: 'Заказать обратный звонок',
      subtitle: 'Оставьте номер телефона, и наш консультант свяжется с вами в течение 15 минут',
      namePlaceholder: 'Ваше имя',
      phonePlaceholder: '+998 90 123 45 67',
      branchOptional: 'Удобный филиал (по желанию)',
      preferredTime: 'Удобное время звонка',
      submit: 'Жду звонка',
      success: 'Спасибо! Администратор скоро свяжется с вами.',
    },
    reviews: {
      title: 'Отзывы наших пациентов',
      subtitle: 'Искренние отзывы людей, доверивших нам свое здоровье и улыбку',
      writeReview: 'Оставить отзыв',
      rating: 'Ваша оценка',
      comment: 'Ваш отзыв и впечатления',
      authorName: 'Ваше имя',
      displayNameConsent: 'Разрешить отображение моего имени рядом с отзывом (иначе будет указано «Пациент»)',
      pendingApproval: 'Благодарим за отзыв! Он появится на сайте после проверки модератором.',
      averageRating: 'Средний рейтинг',
    },
    admin: {
      loginTitle: 'Вход в панель DentaCare',
      dashboard: 'Обзор показателей',
      calendar: 'Календарь приемов',
      appointments: 'Все записи',
      patients: 'База пациентов',
      leads: 'Заявки на звонок (Лиды)',
      doctorsManage: 'Врачи и расписания',
      servicesManage: 'Услуги и прейскурант',
      reviewsModerate: 'Модерация отзывов',
      cms: 'Управление сайтом (CMS)',
      analytics: 'Подробная аналитика',
      audit: 'Журнал безопасности',
      logout: 'Выйти',
      role: 'Роль',
    },
  },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType>({
  language: 'uz',
  setLanguage: () => {},
  t: translations.uz,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('uz');

  useEffect(() => {
    const saved = localStorage.getItem('dentacare_lang') as Language;
    if (saved === 'uz' || saved === 'ru') {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('dentacare_lang', lang);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
