export interface MessagingConfig {
  commandQueueName: string;
  commandDlqName: string;
  eventQueueName: string;
  eventDlqName: string;
  maxReceiveCount: number;
  visibilityTimeoutSeconds: number;
  outboxBatchSize: number;
  outboxLeaseSeconds: number;
  outboxMaxAttempts: number;
  pollIntervalMs: number;
  retryBaseSeconds: number;
  retryMaxSeconds: number;
}

function positiveInteger(value: string | undefined, fallback: number, field: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return parsed;
}

function standardQueueName(value: string | undefined, fallback: string, field: string): string {
  const name = value?.trim() || fallback;
  if (name.endsWith('.fifo') || !/^[A-Za-z0-9_-]{1,80}$/.test(name)) {
    throw new Error(`${field} must be a valid standard SQS queue name (FIFO is intentionally not required).`);
  }
  return name;
}

export function loadMessagingConfig(env: NodeJS.ProcessEnv = process.env): MessagingConfig {
  const config: MessagingConfig = {
    commandQueueName: standardQueueName(env.SQS_COMMAND_QUEUE_NAME, 'dividend-commands', 'SQS_COMMAND_QUEUE_NAME'),
    commandDlqName: standardQueueName(env.SQS_COMMAND_DLQ_NAME, 'dividend-commands-dlq', 'SQS_COMMAND_DLQ_NAME'),
    eventQueueName: standardQueueName(env.SQS_EVENT_QUEUE_NAME, 'dividend-events', 'SQS_EVENT_QUEUE_NAME'),
    eventDlqName: standardQueueName(env.SQS_EVENT_DLQ_NAME, 'dividend-events-dlq', 'SQS_EVENT_DLQ_NAME'),
    maxReceiveCount: positiveInteger(env.SQS_MAX_RECEIVE_COUNT, 5, 'SQS_MAX_RECEIVE_COUNT'),
    visibilityTimeoutSeconds: positiveInteger(env.SQS_VISIBILITY_TIMEOUT_SECONDS, 60, 'SQS_VISIBILITY_TIMEOUT_SECONDS'),
    outboxBatchSize: positiveInteger(env.OUTBOX_BATCH_SIZE, 10, 'OUTBOX_BATCH_SIZE'),
    outboxLeaseSeconds: positiveInteger(env.OUTBOX_LEASE_SECONDS, 60, 'OUTBOX_LEASE_SECONDS'),
    outboxMaxAttempts: positiveInteger(env.OUTBOX_MAX_ATTEMPTS, 10, 'OUTBOX_MAX_ATTEMPTS'),
    pollIntervalMs: positiveInteger(env.MESSAGING_POLL_INTERVAL_MS, 1000, 'MESSAGING_POLL_INTERVAL_MS'),
    retryBaseSeconds: positiveInteger(env.MESSAGING_RETRY_BASE_SECONDS, 2, 'MESSAGING_RETRY_BASE_SECONDS'),
    retryMaxSeconds: positiveInteger(env.MESSAGING_RETRY_MAX_SECONDS, 120, 'MESSAGING_RETRY_MAX_SECONDS'),
  };

  if (new Set([
    config.commandQueueName,
    config.commandDlqName,
    config.eventQueueName,
    config.eventDlqName,
  ]).size !== 4) {
    throw new Error('Command, event, and dead-letter queues must have distinct names.');
  }
  if (config.retryMaxSeconds < config.retryBaseSeconds) {
    throw new Error('MESSAGING_RETRY_MAX_SECONDS must be greater than or equal to MESSAGING_RETRY_BASE_SECONDS.');
  }
  if (config.retryMaxSeconds > 43_200 || config.visibilityTimeoutSeconds > 43_200) {
    throw new Error('SQS visibility delays cannot exceed 43,200 seconds.');
  }
  if (config.maxReceiveCount > 1_000) {
    throw new Error('SQS_MAX_RECEIVE_COUNT cannot exceed 1,000.');
  }
  return config;
}
