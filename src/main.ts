import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);

  const bodyLimit = configService.get<string>('BODY_SIZE_LIMIT', '1mb');
  const corsOrigins = configService.get<string>('CORS_ALLOWED_ORIGINS');
  const port = configService.get<number>('PORT', 3000);

  app.useBodyParser('json', { limit: bodyLimit });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
      crossOriginResourcePolicy: { policy: corsOrigins ? 'cross-origin' : 'same-origin' },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      hidePoweredBy: true,
    }),
  );

  if (corsOrigins) {
    app.enableCors({
      origin: corsOrigins.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'X-API-Key'],
      credentials: false,
    });
  }

  app.set('trust proxy', 1);

  await app.listen(port);
}

bootstrap();
