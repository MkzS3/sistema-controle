import type { EntityManager } from '@mikro-orm/core';
import { Beneficiary } from '../../../domain/beneficiaries/beneficiary.js';
import { Dividend, type DividendState, type DividendStatus } from '../../../domain/dividends/dividend.js';
import { DividendObligation, type DividendObligationStatus } from '../../../domain/obligations/dividend-obligation.js';
import { LedgerEntry, type LedgerEntryKind, type LedgerSource } from '../../../domain/ledger/ledger-entry.js';
import { Payment } from '../../../domain/payments/payment.js';
import { Money } from '../../../domain/shared/value-objects/money.js';
import type {
  BeneficiaryListQuery,
  DashboardSummary,
  DividendListQuery,
  LedgerListQuery,
  ObligationListQuery,
  Page,
  PaymentListQuery,
  PaymentReadItem,
} from '../../../application/ports/read-model.ports.js';
import { databaseDate, optionalDatabaseDate } from './date-mapping.js';
import { queryOne, queryRows } from './sql.js';
import { PersistenceInvariantError } from './persistence-errors.js';

interface BeneficiaryRow { id: string; created_at: Date | string }
interface DividendRow {
  id: string; currency: string; terms: Record<string, unknown>; declared_amount: string | null;
  status: DividendStatus; created_at: Date | string; record_date: Date | string | null;
  payment_date: Date | string | null; declared_at: Date | string | null;
}
interface ObligationRow {
  id: string; dividend_id: string; beneficiary_id: string; amount: string; currency: string;
  status: string; created_at: Date | string; unknown_at: Date | string | null; paid_at: Date | string | null;
  payment_id: string | null; idempotency_key: string | null; requested_at: Date | string | null;
}
interface PaymentRow {
  id: string; obligation_id: string; beneficiary_id: string; idempotency_key: string;
  amount: string; currency: string; requested_at: Date | string; obligation_status: string;
}
interface LedgerRow {
  id: string; obligation_id: string; kind: LedgerEntryKind; source_type: LedgerSource['type'];
  source_id: string; amount: string; currency: string; created_at: Date | string;
}
interface SummaryRow {
  dividends: string | number; beneficiaries: string | number; obligations: string | number; payments: string | number;
  obligations_by_status: Record<string, string | number>;
  outbox_by_status: Record<string, string | number>;
  ledger_reconciliation_issues: string | number;
}

function toCount(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new PersistenceInvariantError('A database count exceeded the safe integer range.');
  return result;
}

async function page<T extends object, R>(em: EntityManager, countSql: string, dataSql: string, params: readonly unknown[], query: { limit: number; offset: number }, map: (row: T) => R): Promise<Page<R>> {
  const count = await queryOne<{ total: string | number }>(em, countSql, params);
  const rows = await queryRows<T>(em, dataSql, [...params, query.limit, query.offset]);
  return { items: rows.map(map), total: toCount(count?.total ?? 0), limit: query.limit, offset: query.offset };
}

function mapDividend(row: DividendRow): Dividend {
  let terms: DividendState['terms'];
  if (row.terms.kind === 'FIXED_AMOUNT' && row.declared_amount !== null) {
    terms = { kind: 'FIXED_AMOUNT', amount: Money.from({ amount: row.declared_amount, currency: row.currency }) };
  } else if (row.terms.kind === 'PARAMETERS') {
    const parameters = row.terms.parameters;
    if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
      throw new PersistenceInvariantError(`Dividend ${row.id} contains malformed parameters.`);
    }
    terms = { kind: 'PARAMETERS', parameters: parameters as Record<string, string> };
  } else {
    throw new PersistenceInvariantError(`Dividend ${row.id} contains inconsistent declaration terms.`);
  }
  return Dividend.rehydrate({
    id: row.id, currency: row.currency, terms, status: row.status,
    createdAt: databaseDate(row.created_at, 'created_at'),
    recordDate: optionalDatabaseDate(row.record_date, 'record_date'),
    paymentDate: optionalDatabaseDate(row.payment_date, 'payment_date'),
    declaredAt: optionalDatabaseDate(row.declared_at, 'declared_at'),
  });
}

function mapObligation(row: ObligationRow): DividendObligation {
  const payment = row.payment_id ? {
    id: row.payment_id,
    obligationId: row.id,
    beneficiaryId: row.beneficiary_id,
    idempotencyKey: row.idempotency_key ?? '',
    amount: Money.from({ amount: row.amount, currency: row.currency }),
    requestedAt: databaseDate(row.requested_at ?? '', 'requested_at'),
  } : undefined;
  return DividendObligation.rehydrate({
    id: row.id,
    dividendId: row.dividend_id,
    beneficiaryId: row.beneficiary_id,
    amount: Money.from({ amount: row.amount, currency: row.currency }),
    status: row.status as DividendObligationStatus,
    createdAt: databaseDate(row.created_at, 'created_at'),
    unknownAt: optionalDatabaseDate(row.unknown_at, 'unknown_at'),
    paidAt: optionalDatabaseDate(row.paid_at, 'paid_at'),
    payment,
  });
}

export class AdminReadRepository {
  constructor(private readonly em: EntityManager) {}

  async listBeneficiaries(query: BeneficiaryListQuery): Promise<Page<Beneficiary>> {
    const params: unknown[] = [];
    const where = query.query ? 'WHERE lower(id) LIKE $1' : '';
    if (query.query) params.push(`%${query.query.toLocaleLowerCase('en-US')}%`);
    return page<BeneficiaryRow, Beneficiary>(this.em,
      `SELECT count(*) AS total FROM beneficiaries ${where}`,
      `SELECT id, created_at FROM beneficiaries ${where} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params, query, (row) => Beneficiary.rehydrate({ id: row.id, createdAt: databaseDate(row.created_at, 'created_at') }));
  }

  async listDividends(query: DividendListQuery): Promise<Page<Dividend>> {
    const filters: string[] = []; const params: unknown[] = [];
    if (query.query) { params.push(`%${query.query.toLocaleLowerCase('en-US')}%`); filters.push(`lower(id) LIKE $${params.length}`); }
    if (query.status) { params.push(query.status); filters.push(`status = $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return page<DividendRow, Dividend>(this.em,
      `SELECT count(*) AS total FROM dividends ${where}`,
      `SELECT id, currency, terms, declared_amount, status, created_at, record_date, payment_date, declared_at
       FROM dividends ${where} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params, query, mapDividend);
  }

  async listObligations(query: ObligationListQuery): Promise<Page<DividendObligation>> {
    const filters: string[] = []; const params: unknown[] = [];
    if (query.status) { params.push(query.status); filters.push(`o.status = $${params.length}`); }
    if (query.dividendId) { params.push(query.dividendId); filters.push(`o.dividend_id = $${params.length}`); }
    if (query.beneficiaryId) { params.push(query.beneficiaryId); filters.push(`o.beneficiary_id = $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const from = `FROM dividend_obligations o LEFT JOIN payments p ON p.obligation_id = o.id`;
    const countFrom = `FROM dividend_obligations o`;
    const countWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return page<ObligationRow, DividendObligation>(this.em,
      `SELECT count(*) AS total ${countFrom} ${countWhere}`,
      `SELECT o.id, o.dividend_id, o.beneficiary_id, o.amount, o.currency, o.status,
              o.created_at, o.unknown_at, o.paid_at, p.id AS payment_id, p.idempotency_key, p.requested_at
       ${from} ${where} ORDER BY o.created_at DESC, o.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params, query, mapObligation);
  }

  async listPayments(query: PaymentListQuery): Promise<Page<PaymentReadItem>> {
    const params: unknown[] = [];
    const where = query.obligationStatus ? (params.push(query.obligationStatus), `WHERE o.status = $1`) : '';
    return page<PaymentRow, PaymentReadItem>(this.em,
      `SELECT count(*) AS total FROM payments p JOIN dividend_obligations o ON o.id = p.obligation_id ${where}`,
      `SELECT p.id, p.obligation_id, p.beneficiary_id, p.idempotency_key, p.amount, p.currency, p.requested_at,
              o.status AS obligation_status
       FROM payments p JOIN dividend_obligations o ON o.id = p.obligation_id ${where}
       ORDER BY p.requested_at DESC, p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params, query, (row) => ({
        payment: Payment.rehydrate({
          id: row.id, obligationId: row.obligation_id, beneficiaryId: row.beneficiary_id,
          idempotencyKey: row.idempotency_key, amount: Money.from({ amount: row.amount, currency: row.currency }),
          requestedAt: databaseDate(row.requested_at, 'requested_at'),
        }),
        obligationStatus: row.obligation_status,
      }));
  }

  async listLedger(query: LedgerListQuery): Promise<Page<LedgerEntry>> {
    const filters: string[] = []; const params: unknown[] = [];
    if (query.kind) { params.push(query.kind); filters.push(`kind = $${params.length}`); }
    if (query.obligationId) { params.push(query.obligationId); filters.push(`obligation_id = $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    return page<LedgerRow, LedgerEntry>(this.em,
      `SELECT count(*) AS total FROM ledger_entries ${where}`,
      `SELECT id, obligation_id, kind, source_type, source_id, amount, currency, created_at
       FROM ledger_entries ${where} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      params, query, (row) => LedgerEntry.rehydrate({
        id: row.id, obligationId: row.obligation_id, kind: row.kind,
        source: { type: row.source_type, id: row.source_id },
        amount: Money.from({ amount: row.amount, currency: row.currency }),
        createdAt: databaseDate(row.created_at, 'created_at'),
      }));
  }

  async getSummary(): Promise<DashboardSummary> {
    const row = await queryOne<SummaryRow>(this.em, `
      SELECT
        (SELECT count(*) FROM dividends) AS dividends,
        (SELECT count(*) FROM beneficiaries) AS beneficiaries,
        (SELECT count(*) FROM dividend_obligations) AS obligations,
        (SELECT count(*) FROM payments) AS payments,
        (SELECT COALESCE(jsonb_object_agg(status, total), '{}'::jsonb)
           FROM (SELECT status, count(*)::text AS total
                 FROM dividend_obligations GROUP BY status) AS grouped_statuses) AS obligations_by_status,
        (SELECT COALESCE(jsonb_object_agg(status, total), '{}'::jsonb)
           FROM (SELECT status, count(*)::text AS total
                 FROM transactional_outbox GROUP BY status) AS grouped_outbox_statuses) AS outbox_by_status,
        (
          (SELECT count(*) FROM dividend_obligations o
            LEFT JOIN ledger_entries l ON l.obligation_id = o.id AND l.kind = 'OBLIGATION_RECOGNIZED'
            WHERE l.id IS NULL OR l.amount <> o.amount OR l.currency <> o.currency)
          +
          (SELECT count(*) FROM ledger_entries l
            LEFT JOIN dividend_obligations o ON o.id = l.obligation_id
            WHERE l.kind = 'OBLIGATION_RECOGNIZED' AND o.id IS NULL)
        ) AS ledger_reconciliation_issues
    `);
    if (!row) throw new PersistenceInvariantError('Database did not return a dashboard summary.');
    return {
      dividends: toCount(row.dividends), beneficiaries: toCount(row.beneficiaries),
      obligations: toCount(row.obligations), payments: toCount(row.payments),
      obligationsByStatus: Object.fromEntries(
        Object.entries(row.obligations_by_status).map(([status, count]) => [status, toCount(count)]),
      ),
      outbox: {
        pending: toCount(row.outbox_by_status.PENDING ?? 0),
        processing: toCount(row.outbox_by_status.PROCESSING ?? 0),
        published: toCount(row.outbox_by_status.PUBLISHED ?? 0),
        deadLettered: toCount(row.outbox_by_status.DEAD_LETTERED ?? 0),
        byStatus: Object.fromEntries(Object.entries(row.outbox_by_status).map(([status, count]) => [status, toCount(count)])),
      },
      ledgerReconciliationIssues: toCount(row.ledger_reconciliation_issues),
    };
  }
}
