import { assertIdentifier, copyValidDate } from '../shared/validation.js';

export interface CreateBeneficiaryProps {
  id: string;
  createdAt: Date;
}

export interface BeneficiaryState extends CreateBeneficiaryProps {}

/** Beneficiary identity only. Contact and payout details await data-policy decisions. */
export class Beneficiary {
  private constructor(
    public readonly id: string,
    private readonly _createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateBeneficiaryProps): Beneficiary {
    assertIdentifier(props.id, 'beneficiaryId');
    return new Beneficiary(props.id, copyValidDate(props.createdAt, 'createdAt'));
  }

  /** Reconstructs trusted persisted state without replaying domain transitions. */
  static rehydrate(state: BeneficiaryState): Beneficiary {
    return new Beneficiary(state.id, new Date(state.createdAt.getTime()));
  }

  equals(other: Beneficiary): boolean {
    return this.id === other.id;
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  toState(): BeneficiaryState {
    return { id: this.id, createdAt: this.createdAt };
  }
}
