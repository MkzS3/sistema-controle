import { PersistenceInvariantError } from './persistence-errors.js';

export function databaseDate(value: Date | string, fieldName: string): Date {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new PersistenceInvariantError(`Database returned an invalid ${fieldName}.`);
  }
  return result;
}

export function optionalDatabaseDate(value: Date | string | null, fieldName: string): Date | undefined {
  return value === null ? undefined : databaseDate(value, fieldName);
}
