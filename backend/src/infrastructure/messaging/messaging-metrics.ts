export type MessagingMetric =
  | 'outbox_claimed_total'
  | 'outbox_published_total'
  | 'outbox_retried_total'
  | 'outbox_dead_lettered_total'
  | 'sqs_received_total'
  | 'sqs_processed_total'
  | 'sqs_duplicate_total'
  | 'sqs_retried_total'
  | 'sqs_permanent_failure_total'
  | 'sqs_ack_failure_total';

const METRIC_NAMES: readonly MessagingMetric[] = [
  'outbox_claimed_total',
  'outbox_published_total',
  'outbox_retried_total',
  'outbox_dead_lettered_total',
  'sqs_received_total',
  'sqs_processed_total',
  'sqs_duplicate_total',
  'sqs_retried_total',
  'sqs_permanent_failure_total',
  'sqs_ack_failure_total',
];

export class MessagingMetrics {
  private readonly counters = new Map<MessagingMetric, number>(METRIC_NAMES.map((name) => [name, 0]));
  private processingCount = 0;
  private processingDurationSeconds = 0;

  increment(name: MessagingMetric, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observeProcessingDuration(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.processingCount += 1;
    this.processingDurationSeconds += seconds;
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.freeze({
      ...Object.fromEntries(this.counters),
      sqs_processing_duration_seconds_count: this.processingCount,
      sqs_processing_duration_seconds_sum: this.processingDurationSeconds,
    });
  }

  toPrometheusText(): string {
    return `${Object.entries(this.snapshot()).map(([name, value]) => `${name} ${value}`).join('\n')}\n`;
  }
}
