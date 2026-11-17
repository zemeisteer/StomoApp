'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n';
import { SITE_PHOTOS } from '../../lib/sitePhotos';
import { PinnedChapters } from '../site/moments';

/** steps, as the dealt pinned-chapters moment: how a first visit goes, one photograph per step. */
export const VisitStepsSection: React.FC = () => {
  const { language } = useI18n();
  const isRu = language === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  return (
    <PinnedChapters
      id="visit"
      lang={language}
      eyebrow={L('Birinchi tashrif', 'Первый визит')}
      title={L('Qabul uch qadamda o‘tadi', 'Приём проходит в три шага')}
      chapters={[
        {
          title: L('Ko‘rik va rentgen', 'Осмотр и снимок'),
          body: L(
            'Shifokor og‘izni to‘liq ko‘rib chiqadi, kerak bo‘lsa raqamli rentgen oladi va topilganini sizga ekranda ko‘rsatadi.',
            'Врач полностью осматривает полость рта, при необходимости делает цифровой снимок и показывает найденное на экране.',
          ),
          photo: SITE_PHOTOS.checkup,
          position: '40% 50%',
        },
        {
          title: L('Yozma reja va narx', 'Письменный план и цена'),
          body: L(
            'Har bir bosqich, muddat va summa rejaga yoziladi. Rozilik berguningizcha hech qanday muolaja boshlanmaydi.',
            'Каждый этап, срок и сумма вносятся в план. Никакие процедуры не начинаются без вашего согласия.',
          ),
          photo: SITE_PHOTOS.room,
          position: '50% 60%',
        },
        {
          title: L('Davolash va nazorat', 'Лечение и контроль'),
          body: L(
            'Muolaja zamonaviy og‘riqsizlantirish bilan o‘tadi. Keyingi ko‘rik vaqti haqida Telegram yoki SMS orqali eslatamiz.',
            'Лечение проходит с современной анестезией. О следующем осмотре напомним в Telegram или по SMS.',
          ),
          photo: SITE_PHOTOS.procedure,
          position: '55% 40%',
        },
      ]}
    />
  );
};
