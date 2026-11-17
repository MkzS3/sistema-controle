import { Beneficiary } from '../beneficiaries/beneficiary.js';
import {
  DomainFailureCode,
  DomainValidationError,
  DuplicateDividendObligationError,
  InvalidStateTransitionError,
} from '../shared/errors/domain-error.js';
import { Money } from '../shared/value-objects/money.js';
import { assertIdentifier, copyOptionalDate, copyValidDate } from '../shared/validation.js';
import {
  DividendObligation,
  type CreateDividendObligationProps,
} from '../obligations/dividend-obligation.js';

export enum DividendStatus {
  Draft = 'DRAFT',
  Declared = 'DECLARED',
}

export type DividendTerms =
  | { readonly kind: 'FIXED_AMOUNT'; readonly amount: Money }
  | {
      readonly kind: 'PARAMETERS';
      readonly parameters: Readonly<Record<string, string>>;
    };

export interface CreateDividendProps {
  id: string;
  currency: string;
  terms: DividendTerms;
  createdAt: Date;
  recordDate?: Date;
  paymentDate?: Date;
}

export interface DividendState extends CreateDividendProps {
  status: DividendStatus;
  declaredAt?: Date;
}

export interface IssueObligationProps {
  id: string;
  beneficiary: Beneficiary;
  amount: Money;
  createdAt: Date;
}

function cloneTerms(terms: DividendTerms): DividendTerms {
  if (terms.kind === 'FIXED_AMOUNT') {
    return Object.freeze({ kind: 'FIXED_AMOUNT', amount: terms.amount });
  }

  const parameters = Object.freeze(Object.fromEntries(Object.entries(terms.parameters)));
  return Object.freeze({ kind: 'PARAMETERS', parameters });
}

function validateAndCopyTerms(terms: DividendTerms, currency: string): DividendTerms {
  if (terms === null || typeof terms !== 'object') {
    throw new DomainValidationError(
      DomainFailureCode.InvalidDividendTerms,
      'Dividend terms must be provided.',
    );
  }

  if (terms.kind === 'FIXED_AMOUNT') {
    if (terms.amount.currency !== currency) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidDividendTerms,
        'Fixed dividend amount must use the declared dividend currency.',
      );
    }
    if (!terms.amount.isPositive()) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidDividendTerms,
        'Fixed dividend amount must be positive.',
      );
    }
    return cloneTerms(terms);
  }

  if (terms.kind === 'PARAMETERS') {
    if (terms.parameters === null || typeof terms.parameters !== 'object' || Array.isArray(terms.parameters)) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidDividendTerms,
        'Dividend parameters must be a string-keyed object.',
      );
    }

    const copied: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, value] of Object.entries(terms.parameters)) {
      if (key.trim().length === 0 || typeof value !== 'string') {
        throw new DomainValidationError(
          DomainFailureCode.InvalidDividendTerms,
          'Dividend parameter keys must be non-empty and values must be strings.',
        );
      }
      copied[key] = value;
    }
    return cloneTerms({ kind: 'PARAMETERS', parameters: copied });
  }

  throw new DomainValidationError(
    DomainFailureCode.InvalidDividendTerms,
    'Unsupported dividend declaration terms.',
  );
}

function copyState(state: DividendState): DividendState {
  return {
    id: state.id,
    currency: state.currency,
    terms: cloneTerms(state.terms),
    createdAt: new Date(state.createdAt.getTime()),
    recordDate: copyOptionalDate(state.recordDate, 'recordDate'),
    paymentDate: copyOptionalDate(state.paymentDate, 'paymentDate'),
    status: state.status,
    declaredAt: copyOptionalDate(state.declaredAt, 'declaredAt'),
  };
}

/** Aggregate root for a declared distribution and its beneficiary obligations. */
export class Dividend {
  private readonly obligationsByBeneficiary = new Map<string, DividendObligation>();
  private _status: DividendStatus;
  private _declaredAt: Date | undefined;

  private constructor(
    public readonly id: string,
    public readonly currency: string,
    private readonly _terms: DividendTerms,
    private readonly _createdAt: Date,
    private readonly _recordDate: Date | undefined,
    private readonly _paymentDate: Date | undefined,
    status: DividendStatus,
    declaredAt?: Date,
  ) {
    this._status = status;
    this._declaredAt = declaredAt;
  }

  static create(props: CreateDividendProps): Dividend {
    assertIdentifier(props.id, 'dividendId');
    Money.zero(props.currency);
    return new Dividend(
      props.id,
      props.currency,
      validateAndCopyTerms(props.terms, props.currency),
      copyValidDate(props.createdAt, 'createdAt'),
      copyOptionalDate(props.recordDate, 'recordDate'),
      copyOptionalDate(props.paymentDate, 'paymentDate'),
      DividendStatus.Draft,
    );
  }

  /** Reconstructs stored state; it does not replay declaration transitions. */
  static rehydrate(
    state: DividendState,
    obligations: readonly DividendObligation[] = [],
  ): Dividend {
    const snapshot = copyState(state);
    const dividend = new Dividend(
      snapshot.id,
      snapshot.currency,
      snapshot.terms,
      snapshot.createdAt,
      snapshot.recordDate,
      snapshot.paymentDate,
      snapshot.status,
      snapshot.declaredAt,
    );

    for (const obligation of obligations) {
      if (obligation.dividendId !== dividend.id) {
        throw new DomainValidationError(
          DomainFailureCode.InvalidDividendTerms,
          'A rehydrated obligation must belong to the dividend aggregate.',
        );
      }
      if (dividend.obligationsByBeneficiary.has(obligation.beneficiaryId)) {
        throw new DuplicateDividendObligationError(dividend.id, obligation.beneficiaryId);
      }
      dividend.obligationsByBeneficiary.set(obligation.beneficiaryId, obligation);
    }

    return dividend;
  }

  get terms(): DividendTerms {
    return cloneTerms(this._terms);
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  get status(): DividendStatus {
    return this._status;
  }

  get declaredAt(): Date | undefined {
    return copyOptionalDate(this._declaredAt, 'declaredAt');
  }

  get recordDate(): Date | undefined {
    return copyOptionalDate(this._recordDate, 'recordDate');
  }

  get paymentDate(): Date | undefined {
    return copyOptionalDate(this._paymentDate, 'paymentDate');
  }

  get obligations(): readonly DividendObligation[] {
    return Object.freeze([...this.obligationsByBeneficiary.values()]);
  }

  declare(at: Date): void {
    if (this._status !== DividendStatus.Draft) {
      throw new InvalidStateTransitionError(
        'Dividend',
        this._status,
        DividendStatus.Declared,
        DomainFailureCode.InvalidDividendState,
      );
    }

    this._declaredAt = copyValidDate(at, 'declaredAt');
    this._status = DividendStatus.Declared;
  }

  issueObligation(props: IssueObligationProps): DividendObligation {
    if (this._status !== DividendStatus.Declared) {
      throw new InvalidStateTransitionError(
        'Dividend',
        this._status,
        'ISSUE_OBLIGATION',
        DomainFailureCode.InvalidDividendState,
      );
    }

    // This protects the current aggregate snapshot only. PostgreSQL's unique
    // constraint is required for correctness across instances and restarts.
    const beneficiaryId = props.beneficiary.id;
    if (this.obligationsByBeneficiary.has(beneficiaryId)) {
      throw new DuplicateDividendObligationError(this.id, beneficiaryId);
    }

    if (props.amount.currency !== this.currency) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidObligationAmount,
        'Obligation amount must use the dividend currency.',
      );
    }

    const obligationProps: CreateDividendObligationProps = {
      id: props.id,
      dividendId: this.id,
      beneficiaryId,
      amount: props.amount,
      createdAt: props.createdAt,
    };
    const obligation = DividendObligation.create(obligationProps);
    this.obligationsByBeneficiary.set(beneficiaryId, obligation);
    return obligation;
  }

  toState(): DividendState {
    return copyState({
      id: this.id,
      currency: this.currency,
      terms: this._terms,
      createdAt: this._createdAt,
      recordDate: this._recordDate,
      paymentDate: this._paymentDate,
      status: this._status,
      declaredAt: this._declaredAt,
    });
  }
}
