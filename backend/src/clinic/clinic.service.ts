import { Injectable } from '@nestjs/common';
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
    return this.prisma.clinicSettings.upsert({
      where: { id: 'default' },
      create: { ...data, id: 'default' },
      update: data,
    });
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
    return this.prisma.branch.create({ data });
  }

  async updateBranch(id: string, data: any) {
    return this.prisma.branch.update({ where: { id }, data });
  }
}
