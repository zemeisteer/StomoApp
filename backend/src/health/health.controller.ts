import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  async check() {
    let dbStatus = 'ok';
    let dbLatencyMs = 0;
    let dbName = '';
    let dbServerAddr: string | null = null;
    let dbServerPort: number | null = null;
    try {
      const start = Date.now();
      const [res] = await this.prisma.$queryRaw<
        Array<{ current_database: string; server_addr: string | null; server_port: number | null }>
      >`SELECT current_database(), inet_server_addr()::text as server_addr, inet_server_port() as server_port;`;
      dbName = res?.current_database || '';
      dbServerAddr = res?.server_addr ?? null;
      dbServerPort = res?.server_port ?? null;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      service: 'dentacare-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        name: dbName,
        serverAddress: dbServerAddr,
        serverPort: dbServerPort,
        latencyMs: dbLatencyMs,
      },
      clinicTimezone: 'Asia/Tashkent',
    };
  }
}
