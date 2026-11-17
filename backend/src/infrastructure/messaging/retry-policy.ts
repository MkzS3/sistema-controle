export type ProcessingFailureKind = 'TRANSIENT' | 'PERMANENT' | 'BUSINESS';

export function exponentialBackoffSeconds(
  attempt: number,
  baseSeconds: number,
  maxSeconds: number,
): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('Attempt must be a positive integer.');
  if (!Number.isInteger(baseSeconds) || baseSeconds < 1) throw new RangeError('Base delay must be positive.');
  if (!Number.isInteger(maxSeconds) || maxSeconds < baseSeconds) throw new RangeError('Maximum delay must be at least the base delay.');
  return Math.min(maxSeconds, baseSeconds * 2 ** Math.min(attempt - 1, 30));
}
