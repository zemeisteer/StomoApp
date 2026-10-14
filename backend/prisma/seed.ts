import { PrismaClient, StaffRole, DayOfWeek, ServiceCategory, ContentStatus, ReviewStatus, AppointmentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clinic Settings
  const settings = await prisma.clinicSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'DentaCare',
      nameRu: 'DentaCare',
      phone: '+998 71 200 55 44',
      email: 'info@dentacare.uz',
      website: 'https://dentacare.uz',
      primaryColor: '#0D7377',
      secondaryColor: '#14BDAC',
      accentColor: '#A8E6CF',
      timezone: 'Asia/Tashkent',
      minBookingNoticeHours: 2,
      maxBookingHorizonDays: 60,
      pendingExpiryMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 5,
      telegramLink: 'https://t.me/dentacare_uz',
      instagramLink: 'https://instagram.com/dentacare_uz',
      facebookLink: 'https://facebook.com/dentacare.uz',
      privacyPolicy: {
        uz: 'DentaCare klinikasi bemorlarning shaxsiy ma\'lumotlari xavfsizligini to\'liq kafolatlaydi.',
        ru: 'Клиника DentaCare гарантирует полную безопасность персональных данных пациентов.',
      },
      bookingPolicy: {
        uz: 'Qabulga kamida 2 soat oldin yozilish mumkin. Bekor qilish kamida 1 soat oldin amalga oshirilishi shart.',
        ru: 'Запись на прием возможна минимум за 2 часа. Отмена приема должна производиться минимум за 1 час.',
      },
      metaTitleUz: 'DentaCare - Toshkentdagi zamonaviy stomatologiya klinikasi',
      metaTitleRu: 'DentaCare - Современная стоматологическая клиника в Ташкенте',
      metaDescriptionUz: 'Professional stomatologlar, og\'riqsiz davolash, zamonaviy uskunalar va qulay narxlar.',
      metaDescriptionRu: 'Профессиональные стоматологи, безболезненное лечение, современное оборудование и доступные цены.',
    },
  });
  console.log('✅ Clinic settings seeded');

  // 2. Branches
  const branchChilonzor = await prisma.branch.upsert({
    where: { id: 'branch-chilonzor' },
    update: {},
    create: {
      id: 'branch-chilonzor',
      nameUz: 'Chilonzor filiali',
      nameRu: 'Филиал Чиланзар',
      addressUz: 'Toshkent sh., Chilonzor tumani, Bunyodkor shoh ko\'chasi, 42-uy',
      addressRu: 'г. Ташкент, Чиланзарский район, проспект Бунёдкор, 42',
      phone: '+998 71 200 55 44',
      email: 'chilonzor@dentacare.uz',
      mapUrl: 'https://maps.google.com/?q=41.2785,69.2154',
      latitude: 41.2785,
      longitude: 69.2154,
      sortOrder: 1,
      workingHours: {
        mon: { open: '09:00', close: '20:00' },
        tue: { open: '09:00', close: '20:00' },
        wed: { open: '09:00', close: '20:00' },
        thu: { open: '09:00', close: '20:00' },
        fri: { open: '09:00', close: '20:00' },
        sat: { open: '09:00', close: '18:00' },
        sun: { open: '10:00', close: '16:00' },
      },
    },
  });

  const branchYunusobod = await prisma.branch.upsert({
    where: { id: 'branch-yunusobod' },
    update: {},
    create: {
      id: 'branch-yunusobod',
      nameUz: 'Yunusobod filiali',
      nameRu: 'Филиал Юнусабад',
      addressUz: 'Toshkent sh., Yunusobod tumani, Amir Temur ko\'chasi, 108-uy',
      addressRu: 'г. Ташкент, Юнусабадский район, улица Амира Темура, 108',
      phone: '+998 71 200 55 45',
      email: 'yunusobod@dentacare.uz',
      mapUrl: 'https://maps.google.com/?q=41.3541,69.2891',
      latitude: 41.3541,
      longitude: 69.2891,
      sortOrder: 2,
      workingHours: {
        mon: { open: '09:00', close: '20:00' },
        tue: { open: '09:00', close: '20:00' },
        wed: { open: '09:00', close: '20:00' },
        thu: { open: '09:00', close: '20:00' },
        fri: { open: '09:00', close: '20:00' },
        sat: { open: '09:00', close: '18:00' },
        sun: { open: '10:00', close: '16:00' },
      },
    },
  });
  console.log('✅ Branches seeded');

  // 3. Specialties
  const specTherapy = await prisma.specialty.upsert({
    where: { slug: 'terapiya' },
    update: {},
    create: {
      nameUz: 'Terapiya va profilaktika',
      nameRu: 'Терапия и профилактика',
      slug: 'terapiya',
      sortOrder: 1,
    },
  });

  const specOrthodontics = await prisma.specialty.upsert({
    where: { slug: 'ortodontiya' },
    update: {},
    create: {
      nameUz: 'Ortodontiya (Breketlar)',
      nameRu: 'Ортодонтия (Брекеты)',
      slug: 'ortodontiya',
      sortOrder: 2,
    },
  });

  const specImplants = await prisma.specialty.upsert({
    where: { slug: 'implantologiya' },
    update: {},
    create: {
      nameUz: 'Implantologiya va jarrohlik',
      nameRu: 'Имплантология и хирургия',
      slug: 'implantologiya',
      sortOrder: 3,
    },
  });

  const specPediatric = await prisma.specialty.upsert({
    where: { slug: 'bolalar-stomatologiyasi' },
    update: {},
    create: {
      nameUz: 'Bolalar stomatologiyasi',
      nameRu: 'Детская стоматология',
      slug: 'bolalar-stomatologiyasi',
      sortOrder: 4,
    },
  });

  const specAesthetics = await prisma.specialty.upsert({
    where: { slug: 'estetik-stomatologiya' },
    update: {},
    create: {
      nameUz: 'Estetik stomatologiya va oqartirish',
      nameRu: 'Эстетическая стоматология и отбеливание',
      slug: 'estetik-stomatologiya',
      sortOrder: 5,
    },
  });
  console.log('✅ Specialties seeded');

  // 4. Services
  const servicesData = [
    {
      id: 'srv-consultation',
      slug: 'konsultatsiya',
      category: ServiceCategory.DIAGNOSTICS,
      nameUz: 'Birlamchi ko\'rik va maslahat',
      nameRu: 'Первичный осмотр и консультация',
      descriptionUz: 'Barcha tishlarning holatini kompyuter diagnostikasi va individual davolash rejasi tuzish.',
      descriptionRu: 'Компьютерная диагностика состояния зубов и составление индивидуального плана лечения.',
      durationMinutes: 30,
      priceFrom: 10000000, // 100,000 UZS in tiyin
      priceTo: 15000000,
      sortOrder: 1,
    },
    {
      id: 'srv-cleaning',
      slug: 'professional-gigiyena',
      category: ServiceCategory.PREVENTIVE,
      nameUz: 'Professional tish tozalash (AirFlow)',
      nameRu: 'Профессиональная чистка зубов (AirFlow)',
      descriptionUz: 'Ultratovush va AirFlow yordamida tish toshlari va qorayishlarni xavfsiz tozalash.',
      descriptionRu: 'Безопасное удаление зубного камня и налета с помощью ультразвука и технологии AirFlow.',
      durationMinutes: 45,
      priceFrom: 35000000, // 350,000 UZS
      priceTo: 50000000,
      sortOrder: 2,
    },
    {
      id: 'srv-caries',
      slug: 'karies-davolash',
      category: ServiceCategory.THERAPY,
      nameUz: 'Kariesni davolash va fotoplomba',
      nameRu: 'Лечение кариеса и световая пломба',
      descriptionUz: 'Germaniya va Yaponiya kompozit materiallari yordamida estetik fotoplomba qo\'yish.',
      descriptionRu: 'Эстетическая реставрация светоотверждаемыми композитами из Германии и Японии.',
      durationMinutes: 45,
      priceFrom: 30000000, // 300,000 UZS
      priceTo: 60000000,
      sortOrder: 3,
    },
    {
      id: 'srv-braces',
      slug: 'breket-tizimi',
      category: ServiceCategory.ORTHODONTICS,
      nameUz: 'Breket tizimini o\'rnatish',
      nameRu: 'Установка брекет-системы',
      descriptionUz: 'Tish qatorini to\'g\'rilash uchun metall va sapfir breket tizimlari.',
      descriptionRu: 'Металлические и сапфировые брекет-системы для коррекции прикуса и зубного ряда.',
      durationMinutes: 60,
      priceFrom: 350000000, // 3,500,000 UZS
      priceTo: 700000000,
      sortOrder: 4,
    },
    {
      id: 'srv-implant',
      slug: 'dental-implantatsiya',
      category: ServiceCategory.IMPLANTS,
      nameUz: 'Dental implantatsiya (Osstem / Straumann)',
      nameRu: 'Дентальная имплантация (Osstem / Straumann)',
      descriptionUz: 'Yo\'qotilgan tish o\'rniga yuqori sifatli titan implant o\'rnatish va umrlik kafolat.',
      descriptionRu: 'Установка высококачественного титанового имплантата с пожизненной гарантией производителя.',
      durationMinutes: 60,
      priceFrom: 300000000, // 3,000,000 UZS
      priceTo: 800000000,
      sortOrder: 5,
    },
    {
      id: 'srv-whitening',
      slug: 'tishlarni-oqartirish',
      category: ServiceCategory.WHITENING,
      nameUz: 'Professional oqartirish (Zoom 4)',
      nameRu: 'Профессиональное отбеливание (Zoom 4)',
      descriptionUz: 'Emalga zarar yetkazmasdan tish rangini 6-8 tonnaga ochartirish.',
      descriptionRu: 'Осветление зубов на 6-8 тонов без вреда для эмали с помощью технологии Zoom 4.',
      durationMinutes: 60,
      priceFrom: 180000000, // 1,800,000 UZS
      priceTo: 250000000,
      sortOrder: 6,
    },
    {
      id: 'srv-pediatric',
      slug: 'bolalar-tish-davolash',
      category: ServiceCategory.PEDIATRIC,
      nameUz: 'Bolalar tishlarini og\'riqsiz davolash',
      nameRu: 'Детское лечение зубов без боли',
      descriptionUz: 'Psixologik yondashuv bilan bolalarda tish davolash va sut tishlarini plombalash.',
      descriptionRu: 'Адаптационный прием для детей, безболезненное лечение молочных и постоянных зубов.',
      durationMinutes: 30,
      priceFrom: 20000000, // 200,000 UZS
      priceTo: 40000000,
      sortOrder: 7,
    },
  ];

  const services: Record<string, any> = {};
  for (const s of servicesData) {
    services[s.id] = await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });
  }
  console.log('✅ Services seeded');

  // 5. Doctors
  const docRahimov = await prisma.doctor.upsert({
    where: { slug: 'aziz-rahimov' },
    update: {},
    create: {
      id: 'doc-rahimov',
      firstNameUz: 'Aziz',
      lastNameUz: 'Rahimov',
      firstNameRu: 'Азиз',
      lastNameRu: 'Рахимов',
      slug: 'aziz-rahimov',
      titleUz: 'Bosh shifokor, jarroh-implantolog',
      titleRu: 'Главный врач, хирург-имплантолог',
      bioUz: '15 yillik tajribaga ega yetakchi implantolog. Germaniya va Janubiy Koreyada malaka oshirgan.',
      bioRu: 'Ведущий имплантолог с опытом более 15 лет. Стажировался в Германии и Южной Корее.',
      educationUz: 'Toshkent Davlat Stomatologiya Instituti (2011), Berlin Charité klinikasida ordinatura (2014)',
      educationRu: 'Ташкентский Государственный Стоматологический Институт (2011), резидентура в клинике Charité, Берлин (2014)',
      experienceYears: 15,
      languages: ['uz', 'ru', 'en'],
      sortOrder: 1,
    },
  });

  const docKarimova = await prisma.doctor.upsert({
    where: { slug: 'nilufar-karimova' },
    update: {},
    create: {
      id: 'doc-karimova',
      firstNameUz: 'Nilufar',
      lastNameUz: 'Karimova',
      firstNameRu: 'Нилуфар',
      lastNameRu: 'Каримова',
      slug: 'nilufar-karimova',
      titleUz: 'Ortodont, tish qatori mutaxassisi',
      titleRu: 'Врач-ортодонт высшей категории',
      bioUz: 'Murakkab tish qatorlari va yuz-jag\' anomaliyalarini zamonaviy breket tizimlari bilan davolash bo\'yicha mutaxassis.',
      bioRu: 'Специалист по исправлению прикуса и аномалий зубных рядов с использованием передовых брекет-систем.',
      educationUz: 'Toshkent Davlat Stomatologiya Instituti (2016)',
      educationRu: 'Ташкентский Государственный Стоматологический Институт (2016)',
      experienceYears: 10,
      languages: ['uz', 'ru'],
      sortOrder: 2,
    },
  });

  const docAliev = await prisma.doctor.upsert({
    where: { slug: 'jamshid-aliev' },
    update: {},
    create: {
      id: 'doc-aliev',
      firstNameUz: 'Jamshid',
      lastNameUz: 'Aliyev',
      firstNameRu: 'Жамшид',
      lastNameRu: 'Алиев',
      slug: 'jamshid-aliev',
      titleUz: 'Stomatolog-terapevt, estetik mutaxassis',
      titleRu: 'Стоматолог-терапевт, специалист по эстетике',
      bioUz: 'Mikroskop ostida tish kanallarini davolash va badiiy restavratsiya ustasi.',
      bioRu: 'Эксперт в области лечения каналов под дентальным микроскопом и художественной реставрации зубов.',
      educationUz: 'Samarqand Davlat Tibbiyot Universiteti (2017)',
      educationRu: 'Самаркандский Государственный Медицинский Университет (2017)',
      experienceYears: 9,
      languages: ['uz', 'ru'],
      sortOrder: 3,
    },
  });

  const docUmarova = await prisma.doctor.upsert({
    where: { slug: 'madina-umarova' },
    update: {},
    create: {
      id: 'doc-umarova',
      firstNameUz: 'Madina',
      lastNameUz: 'Umarova',
      firstNameRu: 'Мадина',
      lastNameRu: 'Умарова',
      slug: 'madina-umarova',
      titleUz: 'Bolalar stomatologi',
      titleRu: 'Детский стоматолог',
      bioUz: 'Kichkintoylar bilan iliq til topishadigan va og\'riqsiz muolajalarni ta\'minlaydigan tajribali shifokor.',
      bioRu: 'Чуткий и внимательный специалист, умеющий находить подход к каждому маленькому пациенту.',
      educationUz: 'Toshkent Davlat Stomatologiya Instituti (2019)',
      educationRu: 'Ташкентский Государственный Стоматологический Институт (2019)',
      experienceYears: 7,
      languages: ['uz', 'ru'],
      sortOrder: 4,
    },
  });
  console.log('✅ Doctors seeded');

  // Doctor Specialties
  await prisma.doctorSpecialty.createMany({
    data: [
      { doctorId: docRahimov.id, specialtyId: specImplants.id },
      { doctorId: docKarimova.id, specialtyId: specOrthodontics.id },
      { doctorId: docAliev.id, specialtyId: specTherapy.id },
      { doctorId: docAliev.id, specialtyId: specAesthetics.id },
      { doctorId: docUmarova.id, specialtyId: specPediatric.id },
    ],
    skipDuplicates: true,
  });

  // Doctor Branches
  await prisma.doctorBranch.createMany({
    data: [
      { doctorId: docRahimov.id, branchId: branchChilonzor.id },
      { doctorId: docRahimov.id, branchId: branchYunusobod.id },
      { doctorId: docKarimova.id, branchId: branchChilonzor.id },
      { doctorId: docAliev.id, branchId: branchChilonzor.id },
      { doctorId: docAliev.id, branchId: branchYunusobod.id },
      { doctorId: docUmarova.id, branchId: branchYunusobod.id },
    ],
    skipDuplicates: true,
  });

  // Doctor Services
  await prisma.doctorService.createMany({
    data: [
      { doctorId: docRahimov.id, serviceId: services['srv-consultation'].id },
      { doctorId: docRahimov.id, serviceId: services['srv-implant'].id },
      { doctorId: docKarimova.id, serviceId: services['srv-consultation'].id },
      { doctorId: docKarimova.id, serviceId: services['srv-braces'].id },
      { doctorId: docAliev.id, serviceId: services['srv-consultation'].id },
      { doctorId: docAliev.id, serviceId: services['srv-cleaning'].id },
      { doctorId: docAliev.id, serviceId: services['srv-caries'].id },
      { doctorId: docAliev.id, serviceId: services['srv-whitening'].id },
      { doctorId: docUmarova.id, serviceId: services['srv-consultation'].id },
      { doctorId: docUmarova.id, serviceId: services['srv-pediatric'].id },
    ],
    skipDuplicates: true,
  });

  // Doctor Schedules (Mon-Fri)
  const weekdays = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];

  const doctorsWithBranches = [
    { docId: docRahimov.id, branchId: branchChilonzor.id, days: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY] },
    { docId: docRahimov.id, branchId: branchYunusobod.id, days: [DayOfWeek.TUESDAY, DayOfWeek.THURSDAY] },
    { docId: docKarimova.id, branchId: branchChilonzor.id, days: weekdays },
    { docId: docAliev.id, branchId: branchChilonzor.id, days: [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY] },
    { docId: docAliev.id, branchId: branchYunusobod.id, days: [DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY] },
    { docId: docUmarova.id, branchId: branchYunusobod.id, days: weekdays },
  ];

  for (const item of doctorsWithBranches) {
    for (const day of item.days) {
      await prisma.doctorSchedule.upsert({
        where: {
          doctorId_dayOfWeek_branchId: {
            doctorId: item.docId,
            dayOfWeek: day,
            branchId: item.branchId,
          },
        },
        update: {},
        create: {
          doctorId: item.docId,
          branchId: item.branchId,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '18:00',
          breakStart: '13:00',
          breakEnd: '14:00',
          isActive: true,
        },
      });
    }
  }
  console.log('✅ Doctor schedules seeded');

  // 6. Staff Users
  const ownerEmail = process.env.OWNER_EMAIL || 'admin@dentacare.local';
  const ownerPassword = process.env.OWNER_PASSWORD || 'DentacareAdmin2026!';
  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  await prisma.staffUser.upsert({
    where: { email: ownerEmail.toLowerCase() },
    update: { passwordHash },
    create: {
      email: ownerEmail.toLowerCase(),
      passwordHash,
      fullName: 'Bosh Administrator',
      role: StaffRole.OWNER,
      isActive: true,
    },
  });

  const doctorPasswordHash = await bcrypt.hash('Doctor2026!', 12);
  await prisma.staffUser.upsert({
    where: { email: 'dr.rahimov@dentacare.local' },
    update: { passwordHash: doctorPasswordHash },
    create: {
      email: 'dr.rahimov@dentacare.local',
      passwordHash: doctorPasswordHash,
      fullName: 'Dr. Aziz Rahimov',
      role: StaffRole.DOCTOR,
      doctorId: docRahimov.id,
      isActive: true,
    },
  });

  const adminPasswordHash = await bcrypt.hash('Reception2026!', 12);
  await prisma.staffUser.upsert({
    where: { email: 'reception@dentacare.local' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'reception@dentacare.local',
      passwordHash: adminPasswordHash,
      fullName: 'Dildora Karimova (Reception)',
      role: StaffRole.ADMIN,
      isActive: true,
    },
  });
  console.log('✅ Staff users seeded');

  // 7. Articles
  await prisma.article.upsert({
    where: { slug: 'tishlarni-togri-tozalash-qoidalari' },
    update: {},
    create: {
      slug: 'tishlarni-togri-tozalash-qoidalari',
      titleUz: 'Tishlarni to\'g\'ri tozalash qoidalari: stomatolog maslahati',
      titleRu: 'Правила правильной чистки зубов: советы стоматолога',
      contentUz: 'Kuniga ikki marta kamida 2 daqiqa tishlarni tozalash, tish ipidan foydalanish va har 6 oyda professional gigiyena muolajasini o\'tash tavsiya etiladi. Cho\'tkani 45 gradus burchak ostida ushlab, milkdan tish uchiga qarab harakatlanish zarur.',
      contentRu: 'Рекомендуется чистить зубы два раза в день не менее 2 минут, использовать зубную нить и каждые 6 месяцев проходить профессиональную чистку. Держите щетку под углом 45 градусов и делайте выметающие движения от десны к краю зуба.',
      excerptUz: 'Har kuni amal qilinishi kerak bo\'lgan gigiyena qoidalari haqida qisqacha qo\'llanma.',
      excerptRu: 'Краткое руководство по ежедневной гигиене полости рта от ведущих стоматологов.',
      authorName: 'Dr. Jamshid Aliyev',
      status: ContentStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  await prisma.article.upsert({
    where: { slug: 'implantatsiya-haqida-nimalarni-bilish-kerak' },
    update: {},
    create: {
      slug: 'implantatsiya-haqida-nimalarni-bilish-kerak',
      titleUz: 'Dental implantatsiya haqida 5 ta muhim fakt',
      titleRu: '5 важных фактов о дентальной имплантации',
      contentUz: 'Implantatsiya butunlay og\'riqsiz zamonaviy anesteziya ostida o\'tkaziladi. Titan implant suyak bilan 98% hollarda to\'liq birikib ketadi va o\'z tishingizdek xizmat qiladi.',
      contentRu: 'Имплантация проводится абсолютно безболезненно под современной местной анестезией. Титановый имплантат приживается в 98% случаев и служит как собственный зуб.',
      excerptUz: 'Implantatsiya qanday o\'tadi, kimlarga mos keladi va narxi nimaga bog\'liq?',
      excerptRu: 'Как проходит имплантация, кому она подходит и из чего складывается стоимость?',
      authorName: 'Dr. Aziz Rahimov',
      status: ContentStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  console.log('✅ Articles seeded');

  // 8. FAQs
  const faqs = [
    {
      questionUz: 'Qabulga oldindan yozilish majburiymi?',
      questionRu: 'Обязательна ли предварительная запись?',
      answerUz: 'Ha, shifokorlarimiz har bir bemorga individual vaqt ajratishi hamda kutish vaqtini yo\'qotish uchun oldindan yozilish tavsiya etiladi.',
      answerRu: 'Да, предварительная запись рекомендуется, чтобы врач уделил вам достаточно времени без очередей.',
      sortOrder: 1,
    },
    {
      questionUz: 'Muolajalar og\'riqlimi?',
      questionRu: 'Болезненны ли процедуры?',
      answerUz: 'Klinikamizda Germaniya va Fransiya anesteziya preparatlari qo\'llaniladi. Barcha muolajalar 100% og\'riqsiz o\'tadi.',
      answerRu: 'Мы используем современные анестетики из Германии и Франции, благодаря чему все процедуры проходят абсолютно безболезненно.',
      sortOrder: 2,
    },
    {
      questionUz: 'Implantlarga kafolat beriladimi?',
      questionRu: 'Предоставляется ли гарантия на импланты?',
      answerUz: 'Ha, biz faqat xalqaro sertifikatlangan tizimlar (Osstem, Straumann) bilan ishlaymiz va implantlarga rasmiy ishlab chiqaruvchi kafolati beriladi.',
      answerRu: 'Да, мы работаем с сертифицированными производителями (Osstem, Straumann) и предоставляем официальную гарантию.',
      sortOrder: 3,
    },
    {
      questionUz: 'Bolalar bilan qanday ishlanadi?',
      questionRu: 'Как проходит прием детей?',
      answerUz: 'Bolalar stomatologimiz moslashuv o\'yinlari orqali bolani tinchlantiradi va stresssiz davolaydi.',
      answerRu: 'Наш детский врач находит дружеский контакт с ребенком в игровой форме, исключая страх перед врачом.',
      sortOrder: 4,
    },
  ];

  for (const faq of faqs) {
    const existing = await prisma.fAQ.findFirst({ where: { questionUz: faq.questionUz } });
    if (!existing) {
      await prisma.fAQ.create({ data: faq });
    }
  }
  console.log('✅ FAQs seeded');

  // 9. Reviews
  const reviews = [
    {
      authorName: 'Jasur Bekmurodov',
      rating: 5,
      text: 'Dr. Aziz Rahimovga katta rahmat! 2 ta implant qo\'ydirdim, umuman og\'rimadi. Klinika sharoitlari juda zamonaviy.',
      status: ReviewStatus.APPROVED,
      consentDisplayName: true,
    },
    {
      authorName: 'Shaxnoza Alimova',
      rating: 5,
      text: 'Bolam tish shifokoridan qo\'rqardi, lekin Dr. Madina Umarova bilan do\'stlashib qoldi! Juda minnatdorman.',
      status: ReviewStatus.APPROVED,
      consentDisplayName: true,
    },
    {
      authorName: 'Rustam Qosimov',
      rating: 5,
      text: 'Professional tozalash va fotoplomba qildirdim. Xodimlar juda xushmuomala, navbatsiz qabul qilishdi.',
      status: ReviewStatus.APPROVED,
      consentDisplayName: true,
    },
  ];

  for (const r of reviews) {
    const existing = await prisma.review.findFirst({ where: { authorName: r.authorName } });
    if (!existing) {
      await prisma.review.create({ data: r });
    }
  }
  console.log('✅ Reviews seeded');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
