import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cookieParser());

  // Reverse proxy configuration (restricted to real deployment topology)
  const trustProxyEnv = configService.get<string>('TRUST_PROXY');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const expressApp = app.getHttpAdapter().getInstance();

  if (trustProxyEnv) {
    const parsedProxy = /^\d+$/.test(trustProxyEnv) ? parseInt(trustProxyEnv, 10) : trustProxyEnv;
    expressApp.set('trust proxy', parsedProxy);
  } else if (nodeEnv === 'production') {
    expressApp.set('trust proxy', 'loopback');
  } else {
    expressApp.set('trust proxy', false);
  }

  // Static files for uploads (fallback storage)
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // CORS
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Requested-With', 'X-CSRF-Token'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  app.enableShutdownHooks();

  const port = configService.get<number>('APP_PORT', 4000);
  await app.listen(port);
  console.log(`🦷 DentaCare API running on http://localhost:${port}/api`);
}

bootstrap();
