import {
  DomainFailureCode,
  DomainValidationError,
} from '../shared/errors/domain-error.js';
import { Money } from '../shared/value-objects/money.js';
import { assertIdentifier, copyValidDate } from '../shared/validation.js';

export interface CreatePaymentProps {
  id: string;
  obligationId: string;
  beneficiaryId: string;
  idempotencyKey: string;
  amount: Money;
  requestedAt: Date;
}

export interface PaymentState extends CreatePaymentProps {}

/** Immutable logical payment instruction; it has no bank or transfer behavior. */
export class Payment {
  private constructor(
    public readonly id: string,
    public readonly obligationId: string,
    public readonly beneficiaryId: string,
    public readonly idempotencyKey: string,
    public readonly amount: Money,
    private readonly _requestedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreatePaymentProps): Payment {
    assertIdentifier(props.id, 'paymentId');
    assertIdentifier(props.obligationId, 'obligationId');
    assertIdentifier(props.beneficiaryId, 'beneficiaryId');
    assertIdentifier(props.idempotencyKey, 'idempotencyKey');
    if (!props.amount.isPositive()) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidPayment,
        'Payment instruction amount must be positive.',
      );
    }

    return new Payment(
      props.id,
      props.obligationId,
      props.beneficiaryId,
      props.idempotencyKey,
      props.amount,
      copyValidDate(props.requestedAt, 'requestedAt'),
    );
  }

  /** Reconstructs the immutable instruction from trusted persisted state. */
  static rehydrate(state: PaymentState): Payment {
    return new Payment(
      state.id,
      state.obligationId,
      state.beneficiaryId,
      state.idempotencyKey,
      state.amount,
      new Date(state.requestedAt.getTime()),
    );
  }

  hasSameObligation(other: Payment): boolean {
    return this.obligationId === other.obligationId;
  }

  get requestedAt(): Date {
    return new Date(this._requestedAt.getTime());
  }

  toState(): PaymentState {
    return {
      id: this.id,
      obligationId: this.obligationId,
      beneficiaryId: this.beneficiaryId,
      idempotencyKey: this.idempotencyKey,
      amount: this.amount,
      requestedAt: this.requestedAt,
    };
  }
}
