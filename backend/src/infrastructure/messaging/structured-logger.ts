export interface LogFields {
  correlationId?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  constructor(private readonly sink: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {}

  info(event: string, fields: LogFields = {}): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.write('error', event, fields);
  }

  private write(level: string, event: string, fields: LogFields): void {
    this.sink(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
  }
}
