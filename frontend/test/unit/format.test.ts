import { describe, expect, test } from 'bun:test';
import { formatMoney, isKnownStatus, statusLabel } from '../../src/app/format.js';

describe('frontend value formatting', () => {
  test('formats decimal strings as BRL without converting through floating point', () => {
    expect(formatMoney({ amount: '12345678901234567890.07', currency: 'BRL' })).toBe('R$\u00a012.345.678.901.234.567.890,07');
    expect(formatMoney({ amount: '12', currency: 'BRL' })).toBe('R$\u00a012,00');
    expect(formatMoney({ amount: '-0.5', currency: 'BRL' })).toBe('-R$\u00a00,50');
  });

  test('keeps an unrecognized state visibly unknown', () => {
    expect(isKnownStatus('PAYMENT_REQUESTED')).toBe(true);
    expect(isKnownStatus('FUTURE_STATE')).toBe(false);
    expect(statusLabel('FUTURE_STATE')).toBe('Estado desconhecido (FUTURE_STATE)');
  });

  test('treats inherited object property names as unknown states', () => {
    for (const status of ['constructor', 'toString', '__proto__']) {
      expect(isKnownStatus(status)).toBe(false);
      expect(statusLabel(status)).toBe(`Estado desconhecido (${status})`);
    }
  });
});
