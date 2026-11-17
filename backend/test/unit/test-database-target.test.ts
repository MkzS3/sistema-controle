import { describe, expect, test } from 'bun:test';
import { isSamePostgresDatabase } from '../support/test-database-target.js';

describe('PostgreSQL integration database safety', () => {
  test('recognizes the same database when loopback host aliases or credentials differ', () => {
    expect(isSamePostgresDatabase(
      'postgresql://app:secret-a@localhost:5432/dividend_control',
      'postgres://other:secret-b@127.0.0.1/dividend_control?sslmode=disable',
    )).toBe(true);
  });

  test('allows a dedicated test database on the same local PostgreSQL server', () => {
    expect(isSamePostgresDatabase(
      'postgresql://app:secret@localhost:5432/dividend_control_test',
      'postgresql://app:secret@127.0.0.1:5432/dividend_control',
    )).toBe(false);
  });

  test('does not conflate distinct servers or ports', () => {
    expect(isSamePostgresDatabase(
      'postgresql://app@127.0.0.1:5433/dividend_control',
      'postgresql://app@127.0.0.1:5432/dividend_control',
    )).toBe(false);
  });

  test('rejects connection URLs without a PostgreSQL protocol or database name', () => {
    expect(() => isSamePostgresDatabase('http://localhost/db', 'postgres://localhost/db')).toThrow();
    expect(() => isSamePostgresDatabase('postgres://localhost', 'postgres://localhost/db')).toThrow();
  });
});
