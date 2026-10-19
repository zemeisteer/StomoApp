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
    return settings;
  }

  async updateSettings(data: any) {
    if (data.phone && typeof data.phone === 'string' && data.phone.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(data.phone);
        if (!Array.isArray(parsed)) {
          throw new BadRequestException('Telefon raqamlar ro\'yxati massiv bo\'lishi kerak');
        }
        for (const item of parsed) {
          if (!item.number || !/^\+998\d{9}$/.test(item.number.replace(/\s+/g, ''))) {
            throw new BadRequestException(`Noto'g'ri telefon formati: ${item.number}. +998XXXXXXXXX ko'rinishida bo'lishi kerak`);
          }
        }
      } catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('Telefon raqamlar formati noto\'g\'ri');
      }
    }

    return this.prisma.clinicSettings.upsert({
      where: { id: 'default' },
      create: { ...data, id: 'default' },
      update: data,
    });
  }

  private validateBranchData(data: any) {
    if (data.mapUrl && typeof data.mapUrl === 'string') {
      const lower = data.mapUrl.trim().toLowerCase();
      if (
        lower.startsWith('javascript:') ||
        lower.includes('<script') ||
        lower.includes('<iframe') ||
        lower.startsWith('data:')
      ) {
        throw new BadRequestException(
          'Xavfsiz xarita havolasi talab qilinadi (http:// yoki https://). Iframe yoki script ruxsat etilmaydi.',
        );
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
