import { describe, expect, test } from 'bun:test';
import { isPositiveBrlAmount, parseStringParameters } from '../../src/app/validation.js';

describe('form validation', () => {
  test('accepts only positive decimal BRL text with at most two fraction digits', () => {
    expect(isPositiveBrlAmount('0.01')).toBe(true);
    expect(isPositiveBrlAmount('1000000000000000000000000000000.99')).toBe(true);
    expect(isPositiveBrlAmount('0')).toBe(false);
    expect(isPositiveBrlAmount('-1.00')).toBe(false);
    expect(isPositiveBrlAmount('1.001')).toBe(false);
    expect(isPositiveBrlAmount('1,25')).toBe(false);
    expect(isPositiveBrlAmount('1e3')).toBe(false);
  });

  test('accepts only JSON objects whose values are strings', () => {
    expect(parseStringParameters('{"reference":"2026-Q4"}')).toEqual({ reference: '2026-Q4' });
    expect(parseStringParameters('{"amount":12.5}')).toBeUndefined();
    expect(parseStringParameters('[]')).toBeUndefined();
    expect(parseStringParameters('not-json')).toBeUndefined();
  });
});
