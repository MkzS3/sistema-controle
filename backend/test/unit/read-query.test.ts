import { describe, expect, test } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { parseOptionalEnum, parseOptionalText, parsePageQuery } from '../../src/presentation/http/financial/read-query.js';

describe('admin read query validation', () => {
  test('applies bounded pagination defaults and accepts allowed values', () => {
    expect(parsePageQuery({})).toEqual({ limit: 20, offset: 0 });
    expect(parsePageQuery({ limit: '100', offset: '40' })).toEqual({ limit: 100, offset: 40 });
    expect(parseOptionalText('  beneficiary-id  ', 'beneficiaryId')).toBe('beneficiary-id');
    expect(parseOptionalEnum('DUE', 'status', ['DUE', 'PAID'] as const)).toBe('DUE');
  });

  test('rejects malformed pagination, empty text, and unknown enum filters', () => {
    expect(() => parsePageQuery({ limit: '101' })).toThrow(BadRequestException);
    expect(() => parsePageQuery({ offset: '-1' })).toThrow(BadRequestException);
    expect(() => parseOptionalText('   ', 'query')).toThrow(BadRequestException);
    expect(() => parseOptionalEnum('UNRECOGNIZED', 'status', ['DUE', 'PAID'] as const)).toThrow(BadRequestException);
  });
});
