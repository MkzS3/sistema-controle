import {
  DomainFailureCode,
  DomainValidationError,
} from './errors/domain-error.js';

export function assertIdentifier(value: string, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainValidationError(
      DomainFailureCode.InvalidEntityId,
      `${fieldName} must be a non-empty string.`,
    );
  }
}

export function copyValidDate(value: Date, fieldName: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new DomainValidationError(
      DomainFailureCode.InvalidDate,
      `${fieldName} must be a valid Date.`,
    );
  }

  return new Date(value.getTime());
}

export function copyOptionalDate(
  value: Date | undefined,
  fieldName: string,
): Date | undefined {
  return value === undefined ? undefined : copyValidDate(value, fieldName);
}
