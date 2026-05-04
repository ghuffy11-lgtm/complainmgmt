import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TraceIdInterceptor } from './common/interceptors/trace-id.interceptor';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const cfg = app.get(ConfigService).get<AppConfig>('app')!;

  app.use(helmet());
  app.enableCors({
    origin: cfg.corsOrigins.length ? cfg.corsOrigins : false,
    credentials: false,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TraceIdInterceptor());

  app.enableShutdownHooks();

  await app.listen(cfg.port, '0.0.0.0');
  new Logger('Bootstrap').log(`CTS backend listening on :${cfg.port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
