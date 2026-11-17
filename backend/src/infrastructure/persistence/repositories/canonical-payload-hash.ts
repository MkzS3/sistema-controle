import { createHash } from 'node:crypto';

function canonicalJson(value: unknown, activeObjects: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Idempotency payload numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (activeObjects.has(value)) throw new TypeError('Idempotency payload cannot be cyclic.');
    activeObjects.add(value);
    const serialized = `[${value.map((item) => canonicalJson(item, activeObjects)).join(',')}]`;
    activeObjects.delete(value);
    return serialized;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(object) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Idempotency payload must contain only plain JSON objects.');
    }
    if (activeObjects.has(object)) throw new TypeError('Idempotency payload cannot be cyclic.');
    activeObjects.add(object);
    const fields = Object.keys(object)
      .sort()
      .map((key) => {
        const fieldValue = object[key];
        if (fieldValue === undefined) {
          throw new TypeError('Idempotency payload cannot contain undefined values.');
        }
        return `${JSON.stringify(key)}:${canonicalJson(fieldValue, activeObjects)}`;
      });
    activeObjects.delete(object);
    return `{${fields.join(',')}}`;
  }

  throw new TypeError('Idempotency payload must be JSON serializable.');
}

export function canonicalPayloadHash(payload: unknown): string {
  const canonical = canonicalJson(payload, new Set<object>());
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
