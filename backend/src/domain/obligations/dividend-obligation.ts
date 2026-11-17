import {
  DomainFailureCode,
  DomainValidationError,
  InvalidStateTransitionError,
} from '../shared/errors/domain-error.js';
import { Money } from '../shared/value-objects/money.js';
import { assertIdentifier, copyOptionalDate, copyValidDate } from '../shared/validation.js';
import { Payment, type PaymentState } from '../payments/payment.js';

export enum DividendObligationStatus {
  Due = 'DUE',
  PaymentRequested = 'PAYMENT_REQUESTED',
  PaymentUnknown = 'PAYMENT_UNKNOWN',
  Paid = 'PAID',
}

export interface CreateDividendObligationProps {
  id: string;
  dividendId: string;
  beneficiaryId: string;
  amount: Money;
  createdAt: Date;
}

export interface RequestPaymentProps {
  id: string;
  idempotencyKey: string;
  requestedAt: Date;
}

export interface DividendObligationState extends CreateDividendObligationProps {
  status: DividendObligationStatus;
  payment?: PaymentState;
  unknownAt?: Date;
  paidAt?: Date;
}

export interface DividendObligationIdentity {
  readonly dividendId: string;
  readonly beneficiaryId: string;
}

export class DividendObligation {
  private _status: DividendObligationStatus;
  private _payment: Payment | undefined;
  private _unknownAt: Date | undefined;
  private _paidAt: Date | undefined;

  private constructor(
    public readonly id: string,
    public readonly dividendId: string,
    public readonly beneficiaryId: string,
    public readonly amount: Money,
    private readonly _createdAt: Date,
    status: DividendObligationStatus,
    payment?: Payment,
    unknownAt?: Date,
    paidAt?: Date,
  ) {
    this._status = status;
    this._payment = payment;
    this._unknownAt = unknownAt;
    this._paidAt = paidAt;
  }

  static create(props: CreateDividendObligationProps): DividendObligation {
    assertIdentifier(props.id, 'obligationId');
    assertIdentifier(props.dividendId, 'dividendId');
    assertIdentifier(props.beneficiaryId, 'beneficiaryId');
    if (!props.amount.isPositive()) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidObligationAmount,
        'Dividend obligation amount must be positive.',
      );
    }

    return new DividendObligation(
      props.id,
      props.dividendId,
      props.beneficiaryId,
      props.amount,
      copyValidDate(props.createdAt, 'createdAt'),
      DividendObligationStatus.Due,
    );
  }

  /** Reconstructs stored state without replaying payment transitions. */
  static rehydrate(state: DividendObligationState): DividendObligation {
    const payment = state.payment ? Payment.rehydrate(state.payment) : undefined;
    return new DividendObligation(
      state.id,
      state.dividendId,
      state.beneficiaryId,
      state.amount,
      new Date(state.createdAt.getTime()),
      state.status,
      payment,
      state.unknownAt ? new Date(state.unknownAt.getTime()) : undefined,
      state.paidAt ? new Date(state.paidAt.getTime()) : undefined,
    );
  }

  get status(): DividendObligationStatus {
    return this._status;
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  get payment(): Payment | undefined {
    return this._payment;
  }

  get unknownAt(): Date | undefined {
    return copyOptionalDate(this._unknownAt, 'unknownAt');
  }

  get paidAt(): Date | undefined {
    return copyOptionalDate(this._paidAt, 'paidAt');
  }

  get businessIdentity(): DividendObligationIdentity {
    return Object.freeze({
      dividendId: this.dividendId,
      beneficiaryId: this.beneficiaryId,
    });
  }

  hasSameBusinessIdentity(other: DividendObligation): boolean {
    return (
      this.dividendId === other.dividendId &&
      this.beneficiaryId === other.beneficiaryId
    );
  }

  requestPayment(props: RequestPaymentProps): Payment {
    if (this._status !== DividendObligationStatus.Due) {
      throw new InvalidStateTransitionError(
        'DividendObligation',
        this._status,
        'REQUEST_PAYMENT',
        DomainFailureCode.InvalidObligationState,
      );
    }

    const payment = Payment.create({
      id: props.id,
      obligationId: this.id,
      beneficiaryId: this.beneficiaryId,
      idempotencyKey: props.idempotencyKey,
      amount: this.amount,
      requestedAt: props.requestedAt,
    });
    this._payment = payment;
    this._status = DividendObligationStatus.PaymentRequested;
    return payment;
  }

  markPaymentUnknown(paymentId: string, at: Date): void {
    this.assertPaymentId(paymentId);
    if (this._status !== DividendObligationStatus.PaymentRequested) {
      throw new InvalidStateTransitionError(
        'DividendObligation',
        this._status,
        DividendObligationStatus.PaymentUnknown,
        DomainFailureCode.InvalidObligationState,
      );
    }

    this._unknownAt = copyValidDate(at, 'unknownAt');
    this._status = DividendObligationStatus.PaymentUnknown;
  }

  markPaid(paymentId: string, at: Date): void {
    // Application code may call this only after an authoritative confirmation.
    this.assertPaymentId(paymentId);
    if (
      this._status !== DividendObligationStatus.PaymentRequested &&
      this._status !== DividendObligationStatus.PaymentUnknown
    ) {
      throw new InvalidStateTransitionError(
        'DividendObligation',
        this._status,
        DividendObligationStatus.Paid,
        DomainFailureCode.InvalidObligationState,
      );
    }

    this._paidAt = copyValidDate(at, 'paidAt');
    this._status = DividendObligationStatus.Paid;
  }

  toState(): DividendObligationState {
    return {
      id: this.id,
      dividendId: this.dividendId,
      beneficiaryId: this.beneficiaryId,
      amount: this.amount,
      createdAt: this.createdAt,
      status: this._status,
      payment: this._payment?.toState(),
      unknownAt: copyOptionalDate(this._unknownAt, 'unknownAt'),
      paidAt: copyOptionalDate(this._paidAt, 'paidAt'),
    };
  }

  private assertPaymentId(paymentId: string): void {
    assertIdentifier(paymentId, 'paymentId');
    if (!this._payment || this._payment.id !== paymentId) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidPayment,
        'Payment does not belong to this obligation.',
      );
    }
  }
}
