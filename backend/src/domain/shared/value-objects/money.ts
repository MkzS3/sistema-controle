import {
  CurrencyMismatchError,
  DomainFailureCode,
  DomainValidationError,
} from '../errors/domain-error.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

/**
 * Exact decimal amount represented as a bigint coefficient and decimal scale.
 * The scale is retained for serialization; arithmetic never converts to Number.
 */
export class Money {
  private constructor(
    private readonly coefficient: bigint,
    private readonly scale: number,
    public readonly currency: string,
  ) {
    Object.freeze(this);
  }

  static from(props: MoneyProps): Money {
    if (props === null || typeof props !== 'object') {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'Money must be created from an amount and currency object.',
      );
    }

    if (typeof props.currency !== 'string' || !/^[A-Z]{3}$/.test(props.currency)) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidCurrency,
        'Currency must be an uppercase three-letter code.',
      );
    }

    if (typeof props.amount !== 'string') {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'Money amount must be provided as a decimal string.',
      );
    }

    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(props.amount);
    if (!match) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'Money amount must be a plain decimal string without exponent notation.',
      );
    }

    const sign = match[1] === '-' ? -1n : 1n;
    const integerPart = match[2];
    const fractionalPart = match[3] ?? '';
    if (integerPart === undefined) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'Money amount is malformed.',
      );
    }

    const coefficient = sign * BigInt(`${integerPart}${fractionalPart}`);
    return new Money(coefficient, fractionalPart.length, props.currency);
  }

  /** Creates a representational zero; callers may supply the desired scale. */
  static zero(currency: string, scale = 0): Money {
    if (!Number.isInteger(scale) || scale < 0) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'Money scale must be a non-negative integer.',
      );
    }
    return Money.from({ amount: scale === 0 ? '0' : `0.${'0'.repeat(scale)}`, currency });
  }

  add(other: Money): Money {
    const [left, right, scale] = this.align(other);
    return Money.from({
      amount: Money.format(left + right, scale),
      currency: this.currency,
    });
  }

  subtract(other: Money): Money {
    const [left, right, scale] = this.align(other);
    return Money.from({
      amount: Money.format(left - right, scale),
      currency: this.currency,
    });
  }

  negate(): Money {
    return Money.from({
      amount: Money.format(-this.coefficient, this.scale),
      currency: this.currency,
    });
  }

  isZero(): boolean {
    return this.coefficient === 0n;
  }

  isPositive(): boolean {
    return this.coefficient > 0n;
  }

  isNegative(): boolean {
    return this.coefficient < 0n;
  }

  isLessThan(other: Money): boolean {
    const [left, right] = this.align(other);
    return left < right;
  }

  isGreaterThan(other: Money): boolean {
    const [left, right] = this.align(other);
    return left > right;
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) {
      return false;
    }

    const [left, right] = this.align(other);
    return left === right;
  }

  toString(): string {
    return Money.format(this.coefficient, this.scale);
  }

  toJSON(): MoneyProps {
    return { amount: this.toString(), currency: this.currency };
  }

  private align(other: Money): [bigint, bigint, number] {
    this.assertSameCurrency(other);
    const scale = Math.max(this.scale, other.scale);
    const left = this.coefficient * 10n ** BigInt(scale - this.scale);
    const right = other.coefficient * 10n ** BigInt(scale - other.scale);
    return [left, right, scale];
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static format(coefficient: bigint, scale: number): string {
    const negative = coefficient < 0n;
    let digits = (negative ? -coefficient : coefficient).toString();
    if (scale === 0) {
      return `${negative ? '-' : ''}${digits}`;
    }

    if (digits.length <= scale) {
      digits = `${'0'.repeat(scale + 1 - digits.length)}${digits}`;
    }

    const splitAt = digits.length - scale;
    return `${negative ? '-' : ''}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
  }
}
