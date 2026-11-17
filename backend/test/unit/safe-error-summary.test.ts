import { describe, expect, test } from 'bun:test';
import { safeErrorSummary } from '../../src/infrastructure/messaging/safe-error-summary.js';

describe('worker error summaries', () => {
  test('omits exception details while retaining safe error class and code', () => {
    const error = Object.assign(new Error('SQL includes private payload and password'), { code: '23505' });
    expect(safeErrorSummary(error)).toBe('Error; code=23505; details omitted.');
    expect(safeErrorSummary(error)).not.toContain('private payload');
    expect(safeErrorSummary(Object.assign(new Error('secret'), { code: 'postgres://user:password@host' })))
      .toBe('Error; details omitted.');
  });

  test('handles non-error throws without serializing their values', () => {
    expect(safeErrorSummary({ secret: 'private' })).toBe('Unknown error; details omitted.');
  });
});
