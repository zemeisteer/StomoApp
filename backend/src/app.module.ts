import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { StaffModule } from './staff/staff.module';
import { ClinicModule } from './clinic/clinic.module';
import { DoctorsModule } from './doctors/doctors.module';
import { ServicesModule } from './services/services.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PatientsModule } from './patients/patients.module';
import { LeadsModule } from './leads/leads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CmsModule } from './cms/cms.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PublicModule } from './public/public.module';

const redisImports = process.env.REDIS_ENABLED === 'true'
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const redisUrl = configService.get<string>('REDIS_URL');
          if (redisUrl) {
            try {
              const url = new URL(redisUrl);
              return {
                redis: {
                  host: url.hostname || 'localhost',
                  port: parseInt(url.port, 10) || 6379,
                  password: url.password || undefined,
                },
              };
            } catch {
              // fallback
            }
          }
          return {
            redis: {
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
            },
          };
        },
        inject: [ConfigService],
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ...redisImports,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    StaffModule,
    ClinicModule,
    DoctorsModule,
    ServicesModule,
    SchedulingModule,
    AppointmentsModule,
    PatientsModule,
    LeadsModule,
    ReviewsModule,
    CmsModule,
    MediaModule,
    AnalyticsModule,
    NotificationsModule,
    PublicModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
