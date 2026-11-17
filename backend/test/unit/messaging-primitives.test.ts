import { describe, expect, test } from 'bun:test';
import { exponentialBackoffSeconds } from '../../src/infrastructure/messaging/retry-policy.js';
import { parseDividendCommand } from '../../src/infrastructure/messaging/commands/command-envelope.js';
import { loadMessagingConfig } from '../../src/infrastructure/messaging/sqs/sqs-config.js';
import { MessagingMetrics } from '../../src/infrastructure/messaging/messaging-metrics.js';
import { StructuredLogger } from '../../src/infrastructure/messaging/structured-logger.js';

describe('messaging primitives', () => {
  test('uses capped exponential backoff without unbounded shifts', () => {
    expect([1, 2, 3, 4, 20].map((attempt) => exponentialBackoffSeconds(attempt, 2, 10)))
      .toEqual([2, 4, 8, 10, 10]);
  });

  test('rejects invalid retry policy inputs', () => {
    expect(() => exponentialBackoffSeconds(0, 2, 10)).toThrow(/Attempt/);
    expect(() => exponentialBackoffSeconds(1, 5, 2)).toThrow(/Maximum/);
  });

  test('parses supported command envelope and defaults correlation id to stable message id', () => {
    expect(parseDividendCommand(JSON.stringify({
      messageId: 'cmd-42',
      type: 'dividend.declare',
      data: { dividendId: 'div-42' },
    }))).toEqual({
      messageId: 'cmd-42',
      correlationId: 'cmd-42',
      type: 'dividend.declare',
      data: { dividendId: 'div-42' },
    });
  });

  test('rejects malformed and unsupported command envelopes', () => {
    expect(() => parseDividendCommand('{')).toThrow(/valid JSON/);
    expect(() => parseDividendCommand(JSON.stringify({ type: 'payment.settled', data: {} })))
      .toThrow(/messageId/);
    expect(() => parseDividendCommand(JSON.stringify({ messageId: 'x', type: 'payment.settled', data: {} })))
      .toThrow(/not supported/);
  });

  test('configures distinct standard command and event queues with bounded attempts', () => {
    const config = loadMessagingConfig({});
    expect(config.commandQueueName).toBe('dividend-commands');
    expect(config.eventQueueName).toBe('dividend-events');
    expect(config.maxReceiveCount).toBe(5);
    expect(new Set([
      config.commandQueueName,
      config.commandDlqName,
      config.eventQueueName,
      config.eventDlqName,
    ]).size).toBe(4);
    expect(() => loadMessagingConfig({ SQS_COMMAND_QUEUE_NAME: 'commands.fifo' })).toThrow(/standard SQS/);
    expect(() => loadMessagingConfig({
      MESSAGING_RETRY_BASE_SECONDS: '5',
      MESSAGING_RETRY_MAX_SECONDS: '2',
    })).toThrow(/greater than or equal/);
  });

  test('emits structured correlation fields and processing counters', () => {
    const lines: string[] = [];
    new StructuredLogger((line) => lines.push(line)).info('command_processed', {
      correlationId: 'trace-7',
      messageId: 'cmd-7',
    });
    const log = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(log.event).toBe('command_processed');
    expect(log.correlationId).toBe('trace-7');

    const metrics = new MessagingMetrics();
    metrics.increment('sqs_processed_total');
    metrics.observeProcessingDuration(0.25);
    expect(metrics.snapshot().sqs_processed_total).toBe(1);
    expect(metrics.toPrometheusText()).toContain('sqs_processing_duration_seconds_sum 0.25');
  });
});
