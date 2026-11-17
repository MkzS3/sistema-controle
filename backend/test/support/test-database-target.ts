function normalizedHost(hostname: string): string {
  const host = hostname.toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) ? '<loopback>' : host;
}

function target(url: string): { protocol: string; host: string; port: string; database: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new TypeError('PostgreSQL database URLs must use postgres:// or postgresql://.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!database) throw new TypeError('PostgreSQL database URL must include a database name.');
  return {
    protocol: 'postgresql:',
    host: normalizedHost(parsed.hostname),
    port: parsed.port || '5432',
    database,
  };
}

/** Compares database targets, intentionally ignoring credentials and URL query options. */
export function isSamePostgresDatabase(leftUrl: string, rightUrl: string): boolean {
  const left = target(leftUrl);
  const right = target(rightUrl);
  return left.protocol === right.protocol
    && left.host === right.host
    && left.port === right.port
    && left.database === right.database;
}
