import { BadRequestException } from '@nestjs/common';
import { DividendStatus } from '../../../domain/dividends/dividend.js';
import { DividendObligationStatus } from '../../../domain/obligations/dividend-obligation.js';
import { LedgerEntryKind } from '../../../domain/ledger/ledger-entry.js';
import type { PageQuery } from '../../../application/ports/read-model.ports.js';

export function parsePageQuery(query: Record<string, unknown>): PageQuery {
  return { limit: parseInteger(query.limit, 'limit', 20, 1, 100), offset: parseInteger(query.offset, 'offset', 0, 0, 2_147_483_647) };
}

export function parseOptionalText(value: unknown, name: string, maxLength = 200): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new BadRequestException(`${name} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function parseOptionalEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${name} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function parseInteger(value: unknown, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export const DIVIDEND_STATUSES = Object.values(DividendStatus);
export const OBLIGATION_STATUSES = Object.values(DividendObligationStatus);
export const LEDGER_KINDS = Object.values(LedgerEntryKind);
