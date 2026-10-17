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
    try {
      const start = Date.now();
      const [res] = await this.prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
      dbName = res?.current_database || '';
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
        latencyMs: dbLatencyMs,
      },
      clinicTimezone: 'Asia/Tashkent',
    };
  }
}
