'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Copy, Check, Unlink } from 'lucide-react';
import { ModalDialog } from '../ModalDialog';
import { api } from '../../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  language: 'uz' | 'ru';
}

type Status = { linked: boolean; telegramUserId: string | null; botUsername: string | null };
type LinkInfo = { token: string; expiresAt: string; deepLink: string | null; command: string };

const T = {
  uz: {
    title: 'Telegram bildirishnomalari',
    description: "Shaxsiy Telegram'ingizni ulang: shifokorlar har kuni 08:00 da o'z qabullari jadvalini oladi.",
    linked: "Telegram ulangan",
    notLinked: 'Telegram ulanmagan',
    generate: 'Ulash havolasini olish',
    open: "Telegram'da ochish",
    orSend: "Yoki botga quyidagi buyruqni yuboring:",
    expires: 'Havola 10 daqiqa amal qiladi va bir marta ishlatiladi.',
    checkAgain: "Ulandimi? Tekshirish",
    unlink: "Ulanishni o'chirish",
    error: 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.',
  },
  ru: {
    title: 'Уведомления в Telegram',
    description: 'Подключите личный Telegram: врачи каждый день в 08:00 получают своё расписание приёмов.',
    linked: 'Telegram подключён',
    notLinked: 'Telegram не подключён',
    generate: 'Получить ссылку для подключения',
    open: 'Открыть в Telegram',
    orSend: 'Или отправьте боту команду:',
    expires: 'Ссылка действует 10 минут и только один раз.',
    checkAgain: 'Подключили? Проверить',
    unlink: 'Отключить',
    error: 'Произошла ошибка. Попробуйте ещё раз.',
  },
};

export const TelegramLinkModal: React.FC<Props> = ({ isOpen, onClose, language }) => {
  const t = T[language] || T.uz;
  const [status, setStatus] = useState<Status | null>(null);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const s = await api.getMyTelegramStatus();
      setStatus(s);
      if (s.linked) setLink(null);
    } catch {
      setError(t.error);
    }
  }, [t.error]);

  useEffect(() => {
    if (isOpen) {
      setLink(null);
      setCopied(false);
      refresh();
    }
  }, [isOpen, refresh]);

  const generate = async () => {
    try {
      setBusy(true);
      setError(null);
      setLink(await api.createMyTelegramLink());
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      setBusy(true);
      await api.unlinkMyTelegram();
      await refresh();
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} title={t.title} description={t.description} size="md">
      <div className="space-y-4 text-xs">
        {status && (
          <div
            className={`p-3 rounded-xl border font-semibold ${
              status.linked
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-canvas border-line text-ink'
            }`}
          >
            {status.linked ? `✅ ${t.linked} (ID: ${status.telegramUserId})` : t.notLinked}
          </div>
        )}

        {status && !status.linked && !link && (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="w-full px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl disabled:opacity-50"
          >
            {t.generate}
          </button>
        )}

        {link && (
          <div className="space-y-3">
            {link.deepLink && (
              <a
                href={link.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl"
              >
                <ExternalLink className="w-4 h-4" /> {t.open}
              </a>
            )}
            <div>
              <p className="text-ink-muted mb-1">{t.orSend}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-canvas rounded-lg break-all text-[11px]">{link.command}</code>
                <button
                  type="button"
                  onClick={() => copy(link.command)}
                  className="p-2 rounded-lg bg-canvas hover:bg-line"
                  aria-label="Copy"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-ink-muted">{t.expires}</p>
            <button
              type="button"
              onClick={refresh}
              className="w-full px-4 py-2 bg-canvas hover:bg-line text-ink font-semibold rounded-xl"
            >
              {t.checkAgain}
            </button>
          </div>
        )}

        {status?.linked && (
          <button
            type="button"
            onClick={unlink}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-rose-700 hover:bg-rose-50 border border-rose-200 font-semibold rounded-xl disabled:opacity-50"
          >
            <Unlink className="w-4 h-4" /> {t.unlink}
          </button>
        )}

        {error && <p className="text-rose-600 font-semibold">{error}</p>}
      </div>
    </ModalDialog>
  );
};
