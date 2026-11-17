/** Keeps untrusted dependency messages, SQL details, and payload values out of worker logs. */
export function safeErrorSummary(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error; details omitted.';
  const name = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : 'Error';
  const code = error !== null && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const safeCode = typeof code === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(code)
    ? `; code=${code}`
    : '';
  return `${name}${safeCode}; details omitted.`;
}
