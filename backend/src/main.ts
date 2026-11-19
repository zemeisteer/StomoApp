import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';
import { isProductionLike } from './common/runtime-env';
import { allowedOrigins, buildCorsOptions } from './common/cors';

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
  const expressApp = app.getHttpAdapter().getInstance();

  if (trustProxyEnv) {
    const parsedProxy = /^\d+$/.test(trustProxyEnv) ? parseInt(trustProxyEnv, 10) : trustProxyEnv;
    expressApp.set('trust proxy', parsedProxy);
  } else if (isProductionLike()) {
    expressApp.set('trust proxy', 'loopback');
  } else {
    expressApp.set('trust proxy', false);
  }

  // Static files for uploads (fallback storage)
  const uploadsDir = path.resolve(process.cwd(), configService.get<string>('UPLOAD_DIR') || 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // CORS: explicit origin list only (FRONTEND_URL, optional CORS_EXTRA_ORIGINS, localhost in development)
  const origins = allowedOrigins(
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('CORS_EXTRA_ORIGINS'),
    !isProductionLike(),
  );
  app.enableCors(buildCorsOptions(origins));

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
