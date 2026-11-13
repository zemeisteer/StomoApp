import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { StaffRole, Prisma } from '@prisma/client';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createStaff(data: {
    email: string;
    password: string;
    fullName: string;
    role: StaffRole;
    doctorId?: string;
    branchId?: string | null;
    telegramUserId?: string | null;
  }) {
    const existing = await this.prisma.staffUser.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Bu email allaqachon ro\'yxatdan o\'tgan');
    }

    await this.assertTelegramIdFree(this.prisma, data.telegramUserId);
    await this.assertBranch(this.prisma, data.branchId);

    const passwordHash = await this.authService.hashPassword(data.password);

    return this.prisma.staffUser.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        fullName: data.fullName,
        role: data.role,
        doctorId: data.doctorId,
        branchId: data.role === StaffRole.OWNER ? null : data.branchId || null,
        telegramUserId: data.telegramUserId || null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  private async assertTelegramIdFree(
    client: Prisma.TransactionClient | PrismaService,
    telegramUserId: string | null | undefined,
    excludeId?: string,
  ) {
    if (!telegramUserId) return;
    const other = await client.staffUser.findFirst({
      where: { telegramUserId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (other) {
      throw new ConflictException('Bu Telegram ID boshqa xodimga biriktirilgan');
    }
  }

  private async assertBranch(client: Prisma.TransactionClient | PrismaService, branchId: string | null | undefined) {
    if (!branchId) return;
    const branch = await client.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new BadRequestException('Filial topilmadi');
  }

  async findAll() {
    return this.prisma.staffUser.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        doctorId: true,
        branchId: true,
        telegramUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        doctorId: true,
        branchId: true,
        telegramUserId: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  async updateStaff(id: string, data: {
    fullName?: string;
    role?: StaffRole;
    isActive?: boolean;
    doctorId?: string | null;
    branchId?: string | null;
    telegramUserId?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Transactional advisory lock to serialize concurrent staff owner demotions/updates
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('staff_owner_mutex'))`;

      const user = await tx.staffUser.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

      // Prevent removing or disabling the last active owner
      const isTargetActiveOwner = user.role === StaffRole.OWNER && user.isActive === true;
      const isBeingDemotedOrDisabled =
        (data.isActive === false && user.isActive === true) ||
        (data.role !== undefined && data.role !== StaffRole.OWNER && user.role === StaffRole.OWNER);

      if (isTargetActiveOwner && isBeingDemotedOrDisabled) {
        const activeOwners = await tx.staffUser.count({
          where: { role: StaffRole.OWNER, isActive: true },
        });
        if (activeOwners <= 1) {
          throw new BadRequestException(
            'Klinikada kamida bitta faol Egasi (OWNER) qolishi shart. Oxirgi egasini o\'chirib yoki rolini o\'zgartirib bo\'lmaydi',
          );
        }
      }

      // If doctor role, validate doctorId if supplied
      if (data.role === StaffRole.DOCTOR && data.doctorId) {
        const doctor = await tx.doctor.findUnique({ where: { id: data.doctorId } });
        if (!doctor) throw new BadRequestException('Biriktirilayotgan shifokor topilmadi');
      }

      await this.assertTelegramIdFree(tx, data.telegramUserId, id);
      await this.assertBranch(tx, data.branchId);
      // Owners always see every branch
      if ((data.role ?? user.role) === StaffRole.OWNER) data.branchId = null;

      // Invalidate sessions immediately if role changed or staff disabled
      const roleChanged = data.role !== undefined && data.role !== user.role;
      const deactivated = data.isActive === false && user.isActive === true;
      const shouldInvalidate = roleChanged || deactivated;

      return tx.staffUser.update({
        where: { id },
        data: {
          ...data,
          tokenVersion: shouldInvalidate ? { increment: 1 } : undefined,
          refreshTokenHash: shouldInvalidate ? null : undefined,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          doctorId: true,
          branchId: true,
          telegramUserId: true,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10000,
    });
  }

  async changePassword(id: string, newPassword: string) {
    const passwordHash = await this.authService.hashPassword(newPassword);
    await this.prisma.staffUser.update({
      where: { id },
      data: {
        passwordHash,
        refreshTokenHash: null,
        tokenVersion: { increment: 1 },
      },
    });
  }
}
