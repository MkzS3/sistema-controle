import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { assertLoopbackHost } from './presentation/http/local-network.js';
import { resolveSecurityConfig } from './presentation/http/security/security-config.js';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../.env'), override: false });
process.env.WORKERS_ENABLED = 'true';
resolveSecurityConfig();
const metricsHost = process.env.WORKER_METRICS_HOST ?? '127.0.0.1';
assertLoopbackHost(metricsHost, 'WORKER_METRICS_HOST');

const { WorkerModule } = await import('./worker.module.js');
const app = await NestFactory.create(WorkerModule, { logger: ['error', 'warn', 'log'] });
app.enableShutdownHooks();
const metricsPort = Number(process.env.WORKER_METRICS_PORT ?? 3001);
await app.listen(metricsPort, metricsHost);
