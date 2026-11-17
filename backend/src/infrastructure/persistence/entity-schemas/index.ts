import { EntitySchema } from '@mikro-orm/core';
import type {
  BeneficiaryRecord,
  DividendObligationRecord,
  DividendRecord,
  IdempotencyRecord,
  InboxMessageRecord,
  LedgerEntryRecord,
  OutboxMessageRecord,
  PaymentRecord,
} from '../entities/persistence-records.js';

export const DividendEntitySchema = new EntitySchema<DividendRecord>({
  name: 'DividendRecord',
  tableName: 'dividends',
  properties: {
    id: { type: 'string', primary: true, columnType: 'text' },
    currency: { type: 'string', columnType: 'text' },
    terms: { type: 'json', columnType: 'jsonb' },
    declaredAmount: { type: 'string', columnType: 'numeric', nullable: true },
    status: { type: 'string', columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
    recordDate: { type: Date, fieldName: 'record_date', columnType: 'timestamptz', nullable: true },
    paymentDate: { type: Date, fieldName: 'payment_date', columnType: 'timestamptz', nullable: true },
    declaredAt: { type: Date, fieldName: 'declared_at', columnType: 'timestamptz', nullable: true },
  },
});

export const BeneficiaryEntitySchema = new EntitySchema<BeneficiaryRecord>({
  name: 'BeneficiaryRecord',
  tableName: 'beneficiaries',
  properties: {
    id: { type: 'string', primary: true, columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
  },
});

export const DividendObligationEntitySchema = new EntitySchema<DividendObligationRecord>({
  name: 'DividendObligationRecord',
  tableName: 'dividend_obligations',
  uniques: [
    { name: 'uq_obligation_dividend_beneficiary', properties: ['dividendId', 'beneficiaryId'] },
    { name: 'uq_obligation_id_beneficiary', properties: ['id', 'beneficiaryId'] },
  ],
  indexes: [
    { name: 'ix_obligations_dividend_status', properties: ['dividendId', 'status'] },
    { name: 'ix_obligations_beneficiary', properties: ['beneficiaryId'] },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'text' },
    dividendId: { type: 'string', fieldName: 'dividend_id', columnType: 'text' },
    beneficiaryId: { type: 'string', fieldName: 'beneficiary_id', columnType: 'text' },
    amount: { type: 'string', columnType: 'numeric' },
    currency: { type: 'string', columnType: 'text' },
    status: { type: 'string', columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
    unknownAt: { type: Date, fieldName: 'unknown_at', columnType: 'timestamptz', nullable: true },
    paidAt: { type: Date, fieldName: 'paid_at', columnType: 'timestamptz', nullable: true },
  },
});

export const PaymentEntitySchema = new EntitySchema<PaymentRecord>({
  name: 'PaymentRecord',
  tableName: 'payments',
  uniques: [
    { name: 'uq_payment_obligation', properties: ['obligationId'] },
    { name: 'uq_payment_idempotency_scope_key', properties: ['idempotencyScope', 'idempotencyKey'] },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'text' },
    obligationId: { type: 'string', fieldName: 'obligation_id', columnType: 'text' },
    beneficiaryId: { type: 'string', fieldName: 'beneficiary_id', columnType: 'text' },
    idempotencyScope: { type: 'string', fieldName: 'idempotency_scope', columnType: 'text' },
    idempotencyKey: { type: 'string', fieldName: 'idempotency_key', columnType: 'text' },
    amount: { type: 'string', columnType: 'numeric' },
    currency: { type: 'string', columnType: 'text' },
    requestedAt: { type: Date, fieldName: 'requested_at', columnType: 'timestamptz' },
  },
});

export const LedgerEntryEntitySchema = new EntitySchema<LedgerEntryRecord>({
  name: 'LedgerEntryRecord',
  tableName: 'ledger_entries',
  uniques: [
    { name: 'uq_ledger_source_kind', properties: ['sourceType', 'sourceId', 'kind'] },
  ],
  indexes: [
    { name: 'ix_ledger_obligation_kind', properties: ['obligationId', 'kind'] },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'text' },
    obligationId: { type: 'string', fieldName: 'obligation_id', columnType: 'text' },
    kind: { type: 'string', columnType: 'text' },
    sourceType: { type: 'string', fieldName: 'source_type', columnType: 'text' },
    sourceId: { type: 'string', fieldName: 'source_id', columnType: 'text' },
    amount: { type: 'string', columnType: 'numeric' },
    currency: { type: 'string', columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
  },
});

export const IdempotencyEntitySchema = new EntitySchema<IdempotencyRecord>({
  name: 'IdempotencyRecord',
  tableName: 'idempotency_records',
  uniques: [
    { name: 'uq_idempotency_scope_key', properties: ['scope', 'key'] },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'uuid' },
    scope: { type: 'string', columnType: 'text' },
    key: { type: 'string', columnType: 'text' },
    payloadHash: { type: 'string', fieldName: 'payload_hash', columnType: 'char(64)' },
    resultType: { type: 'string', fieldName: 'result_type', columnType: 'text' },
    resultId: { type: 'string', fieldName: 'result_id', columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
  },
});

export const InboxMessageEntitySchema = new EntitySchema<InboxMessageRecord>({
  name: 'InboxMessageRecord',
  tableName: 'inbox_messages',
  uniques: [
    { name: 'uq_inbox_consumer_message', properties: ['consumerName', 'messageId'] },
  ],
  indexes: [
    { name: 'ix_inbox_status_received', properties: ['status', 'receivedAt'] },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'uuid' },
    consumerName: { type: 'string', fieldName: 'consumer_name', columnType: 'text' },
    messageId: { type: 'string', fieldName: 'message_id', columnType: 'text' },
    payloadHash: { type: 'string', fieldName: 'payload_hash', columnType: 'char(64)' },
    status: { type: 'string', columnType: 'text' },
    attemptCount: { type: 'number', fieldName: 'attempt_count' },
    receivedAt: { type: Date, fieldName: 'received_at', columnType: 'timestamptz' },
    processedAt: { type: Date, fieldName: 'processed_at', columnType: 'timestamptz', nullable: true },
    lastError: { type: 'string', fieldName: 'last_error', nullable: true, columnType: 'text' },
  },
});

export const OutboxMessageEntitySchema = new EntitySchema<OutboxMessageRecord>({
  name: 'OutboxMessageRecord',
  tableName: 'transactional_outbox',
  indexes: [
    { name: 'ix_outbox_pending_available', properties: ['availableAt', 'createdAt'], where: "status = 'PENDING'" },
    { name: 'ix_outbox_expired_lease', properties: ['claimedUntil', 'createdAt'], where: "status = 'PROCESSING'" },
  ],
  properties: {
    id: { type: 'string', primary: true, columnType: 'uuid' },
    eventType: { type: 'string', fieldName: 'event_type', columnType: 'text' },
    aggregateType: { type: 'string', fieldName: 'aggregate_type', columnType: 'text' },
    aggregateId: { type: 'string', fieldName: 'aggregate_id', columnType: 'text' },
    payload: { type: 'json', columnType: 'jsonb' },
    status: { type: 'string', columnType: 'text' },
    attemptCount: { type: 'number', fieldName: 'attempt_count' },
    availableAt: { type: Date, fieldName: 'available_at', columnType: 'timestamptz' },
    claimedUntil: { type: Date, fieldName: 'claimed_until', columnType: 'timestamptz', nullable: true },
    leaseToken: { type: 'string', fieldName: 'lease_token', nullable: true, columnType: 'uuid' },
    publishedAt: { type: Date, fieldName: 'published_at', columnType: 'timestamptz', nullable: true },
    deadLetteredAt: { type: Date, fieldName: 'dead_lettered_at', columnType: 'timestamptz', nullable: true },
    lastError: { type: 'string', fieldName: 'last_error', nullable: true, columnType: 'text' },
    createdAt: { type: Date, fieldName: 'created_at', columnType: 'timestamptz' },
  },
});

export const persistenceEntitySchemas = [
  DividendEntitySchema,
  BeneficiaryEntitySchema,
  DividendObligationEntitySchema,
  PaymentEntitySchema,
  LedgerEntryEntitySchema,
  IdempotencyEntitySchema,
  InboxMessageEntitySchema,
  OutboxMessageEntitySchema,
];
