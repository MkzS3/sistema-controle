import {
  DomainFailureCode,
  DomainValidationError,
} from '../shared/errors/domain-error.js';
import { Money } from '../shared/value-objects/money.js';
import { assertIdentifier, copyValidDate } from '../shared/validation.js';

export enum LedgerEntryKind {
  ObligationRecognized = 'OBLIGATION_RECOGNIZED',
  PaymentSettled = 'PAYMENT_SETTLED',
  PaymentReversed = 'PAYMENT_REVERSED',
}

export type LedgerSource =
  | { readonly type: 'OBLIGATION'; readonly id: string }
  | { readonly type: 'PAYMENT'; readonly id: string }
  | { readonly type: 'REVERSAL'; readonly id: string };

export interface CreateLedgerEntryProps {
  id: string;
  obligationId: string;
  kind: LedgerEntryKind;
  source: LedgerSource;
  amount: Money;
  createdAt: Date;
}

export interface LedgerEntryState extends CreateLedgerEntryProps {}

/** Immutable operational ledger fact. It does not define a statutory chart of accounts. */
export class LedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly obligationId: string,
    public readonly kind: LedgerEntryKind,
    public readonly source: LedgerSource,
    public readonly amount: Money,
    private readonly _createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateLedgerEntryProps): LedgerEntry {
    assertIdentifier(props.id, 'ledgerEntryId');
    assertIdentifier(props.obligationId, 'obligationId');
    assertIdentifier(props.source.id, 'sourceId');
    if (!props.amount.isPositive()) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidLedgerEntry,
        'Ledger entry amount must be positive.',
      );
    }

    const expectedSourceType: Record<LedgerEntryKind, LedgerSource['type']> = {
      [LedgerEntryKind.ObligationRecognized]: 'OBLIGATION',
      [LedgerEntryKind.PaymentSettled]: 'PAYMENT',
      [LedgerEntryKind.PaymentReversed]: 'REVERSAL',
    };
    if (expectedSourceType[props.kind] !== props.source.type) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidLedgerEntry,
        'Ledger entry kind and source type do not match.',
      );
    }

    return new LedgerEntry(
      props.id,
      props.obligationId,
      props.kind,
      Object.freeze({ type: props.source.type, id: props.source.id }) as LedgerSource,
      props.amount,
      copyValidDate(props.createdAt, 'createdAt'),
    );
  }

  /** Reconstructs trusted stored data without changing its financial meaning. */
  static rehydrate(state: LedgerEntryState): LedgerEntry {
    return new LedgerEntry(
      state.id,
      state.obligationId,
      state.kind,
      Object.freeze({ type: state.source.type, id: state.source.id }) as LedgerSource,
      state.amount,
      new Date(state.createdAt.getTime()),
    );
  }

  hasSameFinancialIdentityAs(other: LedgerEntry): boolean {
    return (
      this.source.type === other.source.type &&
      this.source.id === other.source.id &&
      this.kind === other.kind
    );
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  toState(): LedgerEntryState {
    return {
      id: this.id,
      obligationId: this.obligationId,
      kind: this.kind,
      source: Object.freeze({ type: this.source.type, id: this.source.id }) as LedgerSource,
      amount: this.amount,
      createdAt: this.createdAt,
    };
  }
}
