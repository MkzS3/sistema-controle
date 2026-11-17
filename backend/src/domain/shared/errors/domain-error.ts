export const DomainFailureCode = {
  InvalidEntityId: 'INVALID_ENTITY_ID',
  InvalidCurrency: 'INVALID_CURRENCY',
  InvalidMoneyAmount: 'INVALID_MONEY_AMOUNT',
  CurrencyMismatch: 'CURRENCY_MISMATCH',
  InvalidDate: 'INVALID_DATE',
  InvalidDividendTerms: 'INVALID_DIVIDEND_TERMS',
  InvalidDividendState: 'INVALID_DIVIDEND_STATE',
  InvalidObligationAmount: 'INVALID_OBLIGATION_AMOUNT',
  InvalidObligationState: 'INVALID_OBLIGATION_STATE',
  DuplicateDividendObligation: 'DUPLICATE_DIVIDEND_OBLIGATION',
  InvalidPayment: 'INVALID_PAYMENT',
  InvalidLedgerEntry: 'INVALID_LEDGER_ENTRY',
} as const;

export type DomainFailureCode =
  (typeof DomainFailureCode)[keyof typeof DomainFailureCode];

export class DomainError extends Error {
  constructor(
    public readonly code: DomainFailureCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends DomainError {}

export class InvalidStateTransitionError extends DomainError {
  constructor(
    entity: string,
    currentState: string,
    attemptedTransition: string,
    code: DomainFailureCode,
  ) {
    super(
      code,
      `Cannot transition ${entity} from ${currentState} via ${attemptedTransition}.`,
    );
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(expected: string, actual: string) {
    super(
      DomainFailureCode.CurrencyMismatch,
      `Currency mismatch: expected ${expected}, received ${actual}.`,
    );
  }
}

export class DuplicateDividendObligationError extends DomainError {
  constructor(dividendId: string, beneficiaryId: string) {
    super(
      DomainFailureCode.DuplicateDividendObligation,
      `An obligation already exists for dividend ${dividendId} and beneficiary ${beneficiaryId}.`,
    );
  }
}
