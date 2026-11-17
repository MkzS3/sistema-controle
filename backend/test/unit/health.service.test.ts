import { describe, expect, mock, test } from 'bun:test';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { MikroORM } from '@mikro-orm/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../src/presentation/http/health/health.controller.js';
import { HealthService } from '../../src/presentation/http/health/health.service.js';

function createHealthService(options?: {
  databaseOk?: boolean;
  databaseThrows?: boolean;
  sqsThrows?: boolean;
}): HealthService {
  const databaseCheck = mock(async () => {
    if (options?.databaseThrows) {
      throw new Error('database unavailable');
    }
    return options?.databaseOk === false
      ? { ok: false as const, reason: 'unavailable' }
      : { ok: true as const };
  });

  const sqsSend = mock(async () => {
    if (options?.sqsThrows) {
      throw new Error('queue unavailable');
    }
    return { QueueUrls: [] };
  });

  return new HealthService(
    { checkConnection: databaseCheck } as unknown as MikroORM,
    { send: sqsSend } as unknown as SQSClient,
  );
}

describe('health endpoints', () => {
  test('liveness succeeds without checking dependencies', () => {
    const controller = new HealthController(createHealthService());
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  test('readiness reports PostgreSQL and SQS as available', async () => {
    const report = await createHealthService().readiness();
    expect(report).toEqual({
      status: 'ok',
      checks: { postgres: 'up', sqs: 'up' },
    });
  });

  test('readiness reports a database outage without exposing its error', async () => {
    const report = await createHealthService({ databaseOk: false }).readiness();
    expect(report).toEqual({
      status: 'error',
      checks: { postgres: 'down', sqs: 'up' },
    });
    expect(JSON.stringify(report)).not.toContain('unavailable');
  });

  test('readiness reports an SQS outage', async () => {
    const report = await createHealthService({ sqsThrows: true }).readiness();
    expect(report).toEqual({
      status: 'error',
      checks: { postgres: 'up', sqs: 'down' },
    });
  });

  test('readiness contains dependency exceptions as an unhealthy result', async () => {
    const report = await createHealthService({ databaseThrows: true }).readiness();
    expect(report.status).toBe('error');
    expect(report.checks.postgres).toBe('down');
  });

  test('readiness returns an HTTP 503 exception when a dependency is down', async () => {
    const controller = new HealthController(
      createHealthService({ sqsThrows: true }),
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
