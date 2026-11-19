import { Controller, Get, UseGuards } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness only: never touches the database. Hosts that probe often (Render, uptime monitors)
   * should use this, otherwise a serverless database (Neon) never gets to sleep.
   */
  @Get('live')
  @Public()
  live() {
    return { status: 'ok', service: 'dentacare-backend', timestamp: new Date().toISOString() };
  }

  /** Public readiness: status and time only. Database details are on the admin route below. */
  @Get()
  @Public()
  async check() {
    const db = await this.probeDatabase();
    return { status: db.status === 'ok' ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }

  @Get('details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER)
  async details() {
    const db = await this.probeDatabase();
    return {
      status: db.status === 'ok' ? 'ok' : 'degraded',
      service: 'dentacare-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: db,
      clinicTimezone: 'Asia/Tashkent',
    };
  }

  private async probeDatabase() {
    try {
      const start = Date.now();
      const [res] = await this.prisma.$queryRaw<
        Array<{ current_database: string; server_addr: string | null; server_port: number | null }>
      >`SELECT current_database(), inet_server_addr()::text as server_addr, inet_server_port() as server_port;`;
      return {
        status: 'ok' as const,
        name: res?.current_database || '',
        serverAddress: res?.server_addr ?? null,
        serverPort: res?.server_port ?? null,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'disconnected' as const, name: '', serverAddress: null, serverPort: null, latencyMs: 0 };
    }
  }
}
