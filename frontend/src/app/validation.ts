export function isPositiveBrlAmount(value: string): boolean {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(2, '0')}`) > 0n;
}

export function parseStringParameters(value: string): Record<string, string> | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return undefined; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  if (Object.values(parsed).some((entry) => typeof entry !== 'string')) return undefined;
  return parsed as Record<string, string>;
}
