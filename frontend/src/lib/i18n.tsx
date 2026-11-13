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
    clinic: string;
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
    toothStaticFallback: string;
    toothAriaLabel: string;
  };
  statuses: {
    PENDING: string;
    CONFIRMED: string;
    CHECKED_IN: string;
    COMPLETED: string;
    CANCELLED: string;
    NO_SHOW: string;
  };
  booking: {
    title: string;
    subtitle: string;
    stepDate: string;
    stepBranch: string;
    stepService: string;
    stepDoctor: string;
    stepTime: string;
    stepDetails: string;
    stepConfirmation: string;
    branchRecommendedBadge: string;
    branchRecommendedDesc: string;
    branchOtherNote: string;
    doctorsAvailableOnDate: string;
    doctorsAvailableOnDateDesc: string;
    doctorWorksTodayBadge: string;
    doctorNotWorkingToday: string;
    selectDoctorFirst: string;
    selectServiceFirst: string;
    selectDateFirst: string;
    selectSlotFirst: string;
    selectBranchFirst: string;
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
    maxServicesLimit: string;
    servicesSelectionHint: string;
    noScheduleConfigured: string;
    notWorkingOnDate: string;
    jumpToNextWorkingDate: string;
    doctorIncompatible: string;
    slotConflictNotice: string;
    phoneValidationError: string;
    emailValidationError: string;
    nameRequired: string;
    workingSchedule: string;
    estimatedDuration: string;
    estimatedPrice: string;
    minutes: string;
    selectedServices: string;
    confirmLocation: string;
    confirmLocationDesc: string;
    switchBranchNote: string;
    branchSwitchedBanner: string;
    slotBranchLabel: string;
    allSlotsBooked: string;
    freePrice: string;
    selectionMismatchWarning: string;
    returnToSlotSelection: string;
    switchBranchBtn: string;
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
    pendingWebsiteBookings: string;
    pendingWebsiteBookingsSubtitle: string;
    confirmAction: string;
    cancelAction: string;
    confirming: string;
    cancelling: string;
    cancelConfirmTitle: string;
    cancelConfirmDesc: string;
    appointmentDetails: string;
    viewAll: string;
    pageText: string;
    prevPage: string;
    nextPage: string;
    totalRecords: string;
    noPendingBookings: string;
    allPendingReviewed: string;
    newLeadsCard: string;
    pendingLeadsSubtitle: string;
    noNewLeads: string;
    noAppointmentsToday: string;
    noUpcomingAppointments: string;
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
      clinic: 'Klinika',
      services: 'Xizmatlar',
      doctors: 'Shifokorlar',
      prices: 'Narxlar',
      reviews: 'Fikrlar',
      faq: 'Ko\'p so\'raladigan savollar',
      articles: 'Maqolalar',
      contacts: 'Aloqa',
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
      toothStaticFallback: '3D modeli statik rejimda ko\'rsatilmoqda',
      toothAriaLabel: 'Anatomik inson tishi 3D modeli',
    },
    statuses: {
      PENDING: 'Kutilmoqda',
      CONFIRMED: 'Tasdiqlangan',
      CHECKED_IN: 'Keldi',
      COMPLETED: 'Yakunlandi',
      CANCELLED: 'Bekor qilindi',
      NO_SHOW: 'Kelmadi',
    },
    booking: {
      title: 'Online qabulga yozilish',
      subtitle: 'Qulay sana, xizmat va shifokorni tanlab, bir necha daqiqada qabulga yoziling',
      stepDate: 'Sana',
      stepService: 'Xizmat',
      stepDoctor: 'Shifokor',
      stepTime: 'Vaqt',
      stepBranch: 'Filial',
      stepDetails: 'Ma\'lumotlar',
      stepConfirmation: 'Tasdiq',
      branchRecommendedBadge: 'Tavsiya etiladi (Shifokor ushbu kunda shu filialda qabul qiladi)',
      branchRecommendedDesc: 'Shifokor ushbu kunda aynan shu filialda qabul qiladi',
      branchOtherNote: 'Shifokor ushbu kunda tavsiya etilgan filialda qabul olib boradi',
      doctorsAvailableOnDate: 'Ushbu kunda qabul qiluvchi shifokorlar',
      doctorsAvailableOnDateDesc: 'Tanlangan sana va xizmatlar bo\'yicha qabul qiluvchi mutaxassislar',
      doctorWorksTodayBadge: 'Ushbu kunda qabul qiladi',
      doctorNotWorkingToday: 'Bu kunda qabul qilmaydi',
      selectDoctorFirst: 'Avval shifokorni tanlang',
      selectServiceFirst: 'Avval kamida bitta xizmatni tanlang',
      selectDateFirst: 'Avval qabul sanasini tanlang',
      selectSlotFirst: 'Avval qabul vaqtini tanlang',
      selectBranchFirst: 'Avval filialni tanlang',
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
      requestReceivedNotice: 'Sizning qabul so\'rovingiz qabul qilindi va tanlangan vaqt siz uchun vaqtincha band qilindi. Administrator qabulni tasdiqlash uchun tez orada bog\'lanadi.',
      appointmentId: 'Qabul ID raqami',
      managementTokenNotice: 'Qabul holatini kuzatish yoki vaqtini o\'zgartirish uchun havolani saqlab qo\'ying.',
      trackBooking: 'Qabul holatini ko\'rish',
      maxServicesLimit: 'Bir vaqtning o\'zida ko\'pi bilan 3 ta xizmat tanlash mumkin',
      servicesSelectionHint: 'Bir vaqtning o\'zida 1 tadan 3 tagacha xizmatni tanlashingiz mumkin',
      noScheduleConfigured: 'Ushbu filial uchun qabul jadvali belgilanmagan',
      notWorkingOnDate: 'Tanlangan kunda shifokor qabul qilmaydi',
      jumpToNextWorkingDate: 'Eng yaqin ish kuniga o\'tish',
      doctorIncompatible: 'Shifokor tanlangan barcha xizmatlarni ko\'rsatmaydi yoki ushbu filialda ishlamaydi',
      slotConflictNotice: 'Tanlangan vaqt band qilindi. Iltimos, boshqa vaqtni tanlang.',
      phoneValidationError: 'Iltimos, telefon raqamini to\'liq kiriting (+998 XX XXX-XX-XX)',
      emailValidationError: 'Elektron pochta manzili formati noto\'g\'ri',
      nameRequired: 'Iltimos, ismingizni kiriting',
      workingSchedule: 'Qabul kunlari',
      estimatedDuration: 'Umumiy davomiyligi',
      estimatedPrice: 'Taxminiy narx',
      minutes: 'daqiqa',
      selectedServices: 'Tanlangan xizmatlar',
      confirmLocation: 'Filial manzilini tasdiqlash',
      confirmLocationDesc: 'Siz tanlagan qabul vaqti bo\'yicha shifokor quyidagi filialda qabul qiladi:',
      switchBranchNote: 'Boshqa filialni tanlasangiz, ushbu filial uchun mos qabul vaqtini tanlashingiz lozim bo\'ladi.',
      branchSwitchedBanner: 'Filial tanlandi. Iltimos, ushbu filial uchun mos bo\'sh qabul vaqtini tanlang.',
      slotBranchLabel: 'Filial:',
      allSlotsBooked: 'Ushbu kunda barcha qabul vaqtlari band qilingan. Iltimos, boshqa sanani tanlang.',
      freePrice: 'Bepul',
      selectionMismatchWarning: 'Tanlangan qabul parametrlari o\'zgargan. Iltimos, bo\'sh vaqtni qayta tanlang.',
      returnToSlotSelection: 'Qabul vaqtini tanlashga qaytish',
      switchBranchBtn: 'Boshqa filialni tanlash',
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
      leads: 'Murojaatlar',
      doctorsManage: 'Shifokorlar va jadvallar',
      servicesManage: 'Xizmatlar va narxlar',
      reviewsModerate: 'Fikrlarni moderatsiya qilish',
      cms: 'Sayt kontenti (CMS)',
      analytics: 'Kengaytirilgan tahlil',
      audit: 'Xavfsizlik jurnali',
      logout: 'Chiqish',
      role: 'Roli',
      pendingWebsiteBookings: 'Saytdan kelgan yangi qabullar (Kutilmoqda)',
      pendingWebsiteBookingsSubtitle: 'Sayt orqali yuborilgan yangi arizalarni tasdiqlash yoki bekor qilish',
      confirmAction: 'Tasdiqlash',
      cancelAction: 'Bekor qilish',
      confirming: 'Tasdiqlanmoqda...',
      cancelling: 'Bekor qilinmoqda...',
      cancelConfirmTitle: 'Qabulni bekor qilishni tasdiqlaysizmi?',
      cancelConfirmDesc: 'Ushbu qabul bekor qilinadi va band qilingan vaqt bo\'shatiladi.',
      appointmentDetails: 'Tafsilotlar',
      viewAll: 'Barchasini ko\'rish',
      pageText: 'Sahifa',
      prevPage: 'Oldingi',
      nextPage: 'Keyingi',
      totalRecords: 'Jami',
      noPendingBookings: 'Hozircha yangi kutilayotgan arizalar yo\'q',
      allPendingReviewed: 'Barcha arizalar ko\'rib chiqilgan',
      newLeadsCard: 'Yangi murojaatlar',
      pendingLeadsSubtitle: 'Qayta qo\'ng\'iroq kutayotgan murojaatlar',
      noNewLeads: 'Yangi murojaatlar yo\'q.',
      noAppointmentsToday: 'Bugun uchun rejalashtirilgan qabullar yo\'q.',
      noUpcomingAppointments: 'Yaqin orada tasdiqlangan qabullar mavjud emas.',
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
      clinic: 'Клиника',
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
      toothStaticFallback: '3D-модель отображается в статичном режиме',
      toothAriaLabel: '3D-модель анатомического зуба человека',
    },
    statuses: {
      PENDING: 'В ожидании',
      CONFIRMED: 'Подтверждено',
      CHECKED_IN: 'Прибыл',
      COMPLETED: 'Завершено',
      CANCELLED: 'Отменено',
      NO_SHOW: 'Не явился',
    },
    booking: {
      title: 'Онлайн запись на прием',
      subtitle: 'Выберите удобную дату, услугу и врача, чтобы забронировать время онлайн',
      stepDate: 'Дата',
      stepService: 'Услуга',
      stepDoctor: 'Специалист',
      stepTime: 'Время',
      stepBranch: 'Филиал',
      stepDetails: 'Контакты',
      stepConfirmation: 'Подтверждение',
      branchRecommendedBadge: 'Рекомендуется (Врач принимает в этом филиале в этот день)',
      branchRecommendedDesc: 'Врач принимает именно в этом филиале в выбранную дату',
      branchOtherNote: 'В этот день прием врача проходит в рекомендуемом филиале',
      doctorsAvailableOnDate: 'Врачи, принимающие в этот день',
      doctorsAvailableOnDateDesc: 'Специалисты, принимающие в выбранную дату по указанным услугам',
      doctorWorksTodayBadge: 'Принимает в этот день',
      doctorNotWorkingToday: 'В этот день приема нет',
      selectDoctorFirst: 'Сначала выберите специалиста',
      selectServiceFirst: 'Сначала выберите хотя бы одну услугу',
      selectDateFirst: 'Сначала выберите дату визита',
      selectSlotFirst: 'Сначала выберите время приёма',
      selectBranchFirst: 'Сначала выберите филиал',
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
      requestReceivedNotice: 'Ваша заявка зарегистрирована в системе и выбранное время предварительно забронировано за вами. Администратор свяжется с вами для подтверждения.',
      appointmentId: 'Номер бронирования',
      managementTokenNotice: 'Сохраните эту ссылку для проверки статуса или переноса времени приема.',
      trackBooking: 'Проверить статус записи',
      maxServicesLimit: 'Можно выбрать не более 3 услуг одновременно',
      servicesSelectionHint: 'Вы можете выбрать от 1 до 3 услуг одновременно',
      noScheduleConfigured: 'График приема для этого филиала не настроен',
      notWorkingOnDate: 'В выбранный день врач не принимает',
      jumpToNextWorkingDate: 'Перейти к ближайшему рабочему дню',
      doctorIncompatible: 'Врач не оказывает все выбранные услуги или не принимает в этом филиале',
      slotConflictNotice: 'Выбранное время уже занято. Пожалуйста, выберите другое время.',
      phoneValidationError: 'Введите полный номер телефона (+998 XX XXX-XX-XX)',
      emailValidationError: 'Неверный формат электронной почты',
      nameRequired: 'Пожалуйста, укажите ваше имя',
      workingSchedule: 'Дни приема',
      estimatedDuration: 'Общая длительность',
      estimatedPrice: 'Ориентировочная стоимость',
      minutes: 'минут',
      selectedServices: 'Выбранные услуги',
      confirmLocation: 'Подтвердить адрес филиала',
      confirmLocationDesc: 'По выбранному времени приём врача состоится в следующем филиале:',
      switchBranchNote: 'При выборе другого филиала потребуется выбрать подходящее время приёма в этом филиале.',
      branchSwitchedBanner: 'Филиал выбран. Пожалуйста, выберите подходящее свободное время приёма.',
      slotBranchLabel: 'Филиал:',
      allSlotsBooked: 'На эту дату все доступные интервалы уже заняты. Пожалуйста, выберите другую дату.',
      freePrice: 'Бесплатно',
      selectionMismatchWarning: 'Параметры записи изменились. Пожалуйста, выберите время повторно.',
      returnToSlotSelection: 'Вернуться к выбору времени',
      switchBranchBtn: 'Выбрать другой филиал',
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
      leads: 'Заявки на звонок',
      doctorsManage: 'Врачи и расписания',
      servicesManage: 'Услуги и прейскурант',
      reviewsModerate: 'Модерация отзывов',
      cms: 'Управление сайтом (CMS)',
      analytics: 'Подробная аналитика',
      audit: 'Журнал безопасности',
      logout: 'Выйти',
      role: 'Роль',
      pendingWebsiteBookings: 'Новые онлайн-заявки с сайта (Ожидают)',
      pendingWebsiteBookingsSubtitle: 'Подтверждение или отмена новых онлайн-записей пациентов',
      confirmAction: 'Подтвердить',
      cancelAction: 'Отменить',
      confirming: 'Подтверждение...',
      cancelling: 'Отмена...',
      cancelConfirmTitle: 'Подтвердите отмену записи',
      cancelConfirmDesc: 'Данная запись будет отменена, и забронированное время освободится.',
      appointmentDetails: 'Детали',
      viewAll: 'Смотреть все',
      pageText: 'Страница',
      prevPage: 'Назад',
      nextPage: 'Вперед',
      totalRecords: 'Всего',
      noPendingBookings: 'На данный момент новых ожидающих заявок нет',
      allPendingReviewed: 'Все заявки обработаны',
      newLeadsCard: 'Новые заявки',
      pendingLeadsSubtitle: 'Заявки, ожидающие звонка администратора',
      noNewLeads: 'Новых заявок на звонок нет.',
      noAppointmentsToday: 'На сегодня запланированных приёмов нет.',
      noUpcomingAppointments: 'Подтверждённых предстоящих приёмов нет.',
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
