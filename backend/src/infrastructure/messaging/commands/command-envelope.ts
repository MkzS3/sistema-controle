export const DIVIDEND_COMMAND_TYPES = [
  'dividend.create',
  'dividend.declare',
  'dividend-obligation.create',
  'payment-instruction.request',
] as const;

export type DividendCommandType = (typeof DIVIDEND_COMMAND_TYPES)[number];

export interface DividendCommandEnvelope {
  messageId: string;
  correlationId: string;
  type: DividendCommandType;
  data: Record<string, unknown>;
}

export class InvalidCommandMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseDividendCommand(rawBody: string): DividendCommandEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidCommandMessageError('Message body is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new InvalidCommandMessageError('Command envelope must be a JSON object.');
  if (typeof parsed.messageId !== 'string' || parsed.messageId.trim().length === 0) {
    throw new InvalidCommandMessageError('Command messageId must be a non-empty string.');
  }
  if (typeof parsed.type !== 'string' || !DIVIDEND_COMMAND_TYPES.includes(parsed.type as DividendCommandType)) {
    throw new InvalidCommandMessageError('Command type is not supported by the dividend command consumer.');
  }
  if (!isRecord(parsed.data)) throw new InvalidCommandMessageError('Command data must be an object.');
  const correlationId = typeof parsed.correlationId === 'string' && parsed.correlationId.trim()
    ? parsed.correlationId
    : parsed.messageId;

  return {
    messageId: parsed.messageId,
    correlationId,
    type: parsed.type as DividendCommandType,
    data: parsed.data,
  };
}

export function requiredCommandString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidCommandMessageError(`Command data.${key} must be a non-empty string.`);
  }
  return value;
}
