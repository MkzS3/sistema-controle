export type DependencyHealth = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: {
    postgres: DependencyHealth;
    sqs: DependencyHealth;
  };
}
