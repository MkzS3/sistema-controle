import type { EntityManager } from '@mikro-orm/core';
import type { ApplicationTransactionContext } from '../../../application/ports/persistence.ports.js';

export async function queryRows<T extends object>(
  em: EntityManager,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  const result: unknown = await em.getConnection().execute<T>(
    sql,
    [...parameters],
    'all',
    em.getTransactionContext(),
  );

  if (Array.isArray(result)) return result as T[];
  if (result !== null && typeof result === 'object') {
    const candidate = result as { rows?: unknown; row?: unknown };
    if (Array.isArray(candidate.rows)) return candidate.rows as T[];
    if (candidate.row !== undefined) return [candidate.row as T];
  }

  return [];
}

export async function queryOne<T extends object>(
  em: EntityManager,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T | undefined> {
  return (await queryRows<T>(em, sql, parameters))[0];
}

export async function executeSql(
  em: EntityManager,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<void> {
  await em.getConnection().execute(
    sql,
    [...parameters],
    'run',
    em.getTransactionContext(),
  );
}

export function inTransaction<T>(
  em: EntityManager,
  work: (transactionalEm: EntityManager) => Promise<T>,
): Promise<T> {
  return em.fork({ clear: true }).transactional(work, { clear: true });
}

export function entityManagerFor(
  fallback: EntityManager,
  context?: ApplicationTransactionContext,
): EntityManager {
  if (!context) return fallback;
  const candidate = context.persistenceContext as EntityManager | null;
  if (!candidate || typeof candidate.getConnection !== 'function' || typeof candidate.getTransactionContext !== 'function') {
    throw new TypeError('Application transaction context is not valid for the PostgreSQL adapter.');
  }
  return candidate;
}

export function inOptionalTransaction<T>(
  em: EntityManager,
  context: ApplicationTransactionContext | undefined,
  work: (transactionalEm: EntityManager) => Promise<T>,
): Promise<T> {
  return context ? work(entityManagerFor(em, context)) : inTransaction(em, work);
}
