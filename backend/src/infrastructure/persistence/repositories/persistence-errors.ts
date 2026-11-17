export class PersistenceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class IdempotencyPayloadConflictError extends Error {
  constructor(scope: string, key: string) {
    super(`Idempotency key ${key} in scope ${scope} was already used with a different payload.`);
    this.name = new.target.name;
  }
}

export class InboxPayloadConflictError extends Error {
  constructor(consumerName: string, messageId: string) {
    super(`Inbox message ${messageId} for consumer ${consumerName} was received with a different payload.`);
    this.name = new.target.name;
  }
}
