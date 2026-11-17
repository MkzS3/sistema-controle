import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { assertLoopbackHost, assertLoopbackHttpOrigin } from './presentation/http/local-network.js';
import { resolveSecurityConfig } from './presentation/http/security/security-config.js';

// Resolve both common working directories: repository root and backend workspace.
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../.env'), override: false });
resolveSecurityConfig();

const { AppModule } = await import('./app.module.js');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://127.0.0.1:5173';
  const configuredOrigin = assertLoopbackHttpOrigin(corsOrigin, 'CORS_ORIGIN');
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
      if (!origin || origin === configuredOrigin.origin) callback(null, true);
      else callback(new Error('CORS origin is not allowed.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Scope', 'Idempotency-Key', 'X-Correlation-Id'],
    credentials: false,
  });

  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  assertLoopbackHost(host, 'API_HOST');
  await app.listen(port, host);
}

await bootstrap();
