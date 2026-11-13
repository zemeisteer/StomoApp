import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type Lang = 'uz' | 'ru';

/**
 * Machine translation for admin content (FAQ, bios, descriptions) between Uzbek and Russian.
 *
 * Providers, first configured wins:
 *  - DEEPL_API_KEY            DeepL (free or pro key)
 *  - GOOGLE_TRANSLATE_API_KEY Google Cloud Translation v2
 *  - otherwise, outside production (or with TRANSLATE_FREE_FALLBACK=true), Google's public
 *    web endpoint — fine for local work, not something to rely on in production.
 * Only the text being translated is sent; never patient data.
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.deeplKey || this.googleKey || this.freeFallback);
  }

  private get deeplKey() {
    return this.config.get<string>('DEEPL_API_KEY') || '';
  }
  private get googleKey() {
    return this.config.get<string>('GOOGLE_TRANSLATE_API_KEY') || '';
  }
  private get freeFallback() {
    const flag = this.config.get<string>('TRANSLATE_FREE_FALLBACK');
    if (flag !== undefined) return flag === 'true';
    return process.env.NODE_ENV !== 'production';
  }

  async translate(text: string, from: Lang, to: Lang): Promise<string> {
    const clean = (text || '').trim();
    if (!clean) return '';
    if (clean.length > 5000) throw new BadRequestException('Matn juda uzun (5000 belgigacha)');
    if (from === to) return clean;
    try {
      if (this.deeplKey) return await this.viaDeepl(clean, from, to);
      if (this.googleKey) return await this.viaGoogleCloud(clean, from, to);
      if (this.freeFallback) return await this.viaGoogleFree(clean, from, to);
    } catch (e: any) {
      this.logger.warn(`Translation failed: ${e?.message || e}`);
      throw new ServiceUnavailableException('Tarjima xizmati hozir javob bermadi');
    }
    throw new ServiceUnavailableException('Tarjima xizmati sozlanmagan');
  }

  private async viaDeepl(text: string, from: Lang, to: Lang) {
    const host = this.deeplKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
    const res = await fetch(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${this.deeplKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: [text], source_lang: from.toUpperCase(), target_lang: to.toUpperCase() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`DeepL ${res.status}`);
    const data: any = await res.json();
    return String(data?.translations?.[0]?.text || '').trim();
  }

  private async viaGoogleCloud(text: string, from: Lang, to: Lang) {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.googleKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: from, target: to, format: 'text' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Google ${res.status}`);
    const data: any = await res.json();
    return String(data?.data?.translations?.[0]?.translatedText || '').trim();
  }

  private async viaGoogleFree(text: string, from: Lang, to: Lang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${from}&tl=${to}&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Google free ${res.status}`);
    const data: any = await res.json();
    return (Array.isArray(data?.[0]) ? data[0].map((part: any) => part?.[0] || '').join('') : '').trim();
  }
}
