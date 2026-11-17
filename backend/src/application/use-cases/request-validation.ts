import { ApplicationInputError } from '../errors/application-error.js';

export function requestObject(value: unknown, fieldName = 'request body'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApplicationInputError(`${fieldName} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApplicationInputError(`${fieldName} must be a non-empty string.`);
  }
  return value;
}
