import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClinicService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.clinicSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.clinicSettings.create({ data: {} });
    }

    let parsedPhones: Array<{ id: string; number: string; label: string; isPrimary: boolean }> = [];
    if (settings.phones && Array.isArray(settings.phones) && settings.phones.length > 0) {
      parsedPhones = (settings.phones as any[]).map((p, idx) => ({
        id: p.id || `phone-${idx + 1}`,
        number: p.number || '',
        label: p.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam'),
        isPrimary: Boolean(p.isPrimary ?? idx === 0),
      }));
    } else if (settings.phone) {
      try {
        if (settings.phone.trim().startsWith('[')) {
          const rawParsed = JSON.parse(settings.phone);
          if (Array.isArray(rawParsed) && rawParsed.length > 0) {
            parsedPhones = rawParsed.map((p: any, idx: number) => ({
              id: p.id || `phone-${idx + 1}`,
              number: p.number || '',
              label: p.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam'),
              isPrimary: Boolean(p.isPrimary ?? idx === 0),
            }));
          }
        }
      } catch {}

      if (parsedPhones.length === 0) {
        parsedPhones = [{ id: 'phone-1', number: settings.phone, label: 'Asosiy raqam', isPrimary: true }];
      }
    }

    const primaryNumber = parsedPhones.find((p) => p.isPrimary)?.number || parsedPhones[0]?.number || settings.phone;

    return {
      ...settings,
      phone: primaryNumber,
      phones: parsedPhones,
    };
  }

  async updateSettings(data: any) {
    let normalizedPhones: Array<{ id: string; number: string; label: string; isPrimary: boolean }> | undefined;
    let primaryPhoneString: string | undefined;

    const rawPhones = data.phones !== undefined ? data.phones : data.phone;

    if (rawPhones !== undefined) {
      let candidateList: any[] = [];
      if (Array.isArray(rawPhones)) {
        candidateList = rawPhones;
      } else if (typeof rawPhones === 'string') {
        const trimmed = rawPhones.trim();
        if (trimmed.startsWith('[')) {
          try {
            candidateList = JSON.parse(trimmed);
          } catch {
            throw new BadRequestException('Telefon raqamlar ro\'yxati yaroqsiz JSON formatida');
          }
        } else if (trimmed) {
          candidateList = [{ number: trimmed, label: 'Asosiy raqam', isPrimary: true }];
        }
      }

      if (!Array.isArray(candidateList) || candidateList.length === 0) {
        throw new BadRequestException('Kamida bitta telefon raqami kiritilishi shart');
      }

      const seenNumbers = new Set<string>();
      let foundPrimary = false;

      normalizedPhones = candidateList.map((item: any, idx: number) => {
        if (!item || !item.number || typeof item.number !== 'string') {
          throw new BadRequestException(`Telefon raqami kiritilishi shart (qator ${idx + 1})`);
        }
        const cleaned = item.number.replace(/[^\d+]/g, '');
        const digits = cleaned.replace(/\D/g, '');
        let canonicalNumber = '';
        if (digits.startsWith('998') && digits.length === 12) {
          canonicalNumber = '+' + digits;
        } else if (digits.length === 9) {
          canonicalNumber = '+998' + digits;
        } else if (cleaned.startsWith('+998') && digits.length === 12) {
          canonicalNumber = '+' + digits;
        } else {
          throw new BadRequestException(
            `Noto'g'ri telefon formati: "${item.number}". O'zbekiston raqami (+998XXXXXXXXX) kiritilishi lozim`,
          );
        }

        if (seenNumbers.has(canonicalNumber)) {
          throw new BadRequestException(`Takroriy telefon raqami kiritildi: ${canonicalNumber}`);
        }
        seenNumbers.add(canonicalNumber);

        const isPrimary = Boolean(item.isPrimary);
        if (isPrimary) {
          if (foundPrimary) {
            // Already found a primary, this one cannot be primary
            throw new BadRequestException('Faqat bitta asosiy telefon raqami bo\'lishi lozim');
          }
          foundPrimary = true;
        }

        return {
          id: item.id || `phone-${idx + 1}`,
          number: canonicalNumber,
          label: (item.label || (idx === 0 ? 'Asosiy raqam' : 'Qo\'shimcha raqam')).trim(),
          isPrimary,
        };
      });

      // Ensure exactly one primary phone
      if (!foundPrimary && normalizedPhones.length > 0) {
        normalizedPhones[0].isPrimary = true;
      }

      primaryPhoneString = normalizedPhones.find((p) => p.isPrimary)?.number || normalizedPhones[0]?.number;
    }

    const payload: any = { ...data };
    if (normalizedPhones) {
      payload.phones = normalizedPhones;
      payload.phone = primaryPhoneString;
    }

    const updated = await this.prisma.clinicSettings.upsert({
      where: { id: 'default' },
      create: { ...payload, id: 'default' },
      update: payload,
    });

    return {
      ...updated,
      phone: primaryPhoneString || updated.phone,
      phones: normalizedPhones || (updated.phones as any) || [],
    };
  }

  private validateBranchData(data: any) {
    if (data.mapUrl && typeof data.mapUrl === 'string' && data.mapUrl.trim()) {
      try {
        const parsed = new URL(data.mapUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new BadRequestException('Xarita havolasi faqat http:// yoki https:// protokoli orqali bo\'lishi lozim');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Xarita havolasi yaroqsiz URL formatida');
      }
    }
  }

  // Branches
  async getBranches() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getAllBranches() {
    return this.prisma.branch.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createBranch(data: any) {
    this.validateBranchData(data);
    return this.prisma.branch.create({ data });
  }

  async updateBranch(id: string, data: any) {
    this.validateBranchData(data);
    return this.prisma.branch.update({ where: { id }, data });
  }
}
