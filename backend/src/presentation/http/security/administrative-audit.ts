import { Inject, Injectable } from '@nestjs/common';
import { ADMIN_AUDIT_SINK } from './access-token-verifier.js';

export interface AdministrativeAuditRecord {
  readonly timestamp: string;
  readonly event: 'admin.action' | 'security.authentication_denied' | 'security.authorization_denied';
  readonly requestId: string;
  readonly actorId: string;
  readonly roles: readonly string[];
  readonly action: string;
  readonly resource: string;
  readonly resourceId?: string;
  readonly outcome: 'started' | 'succeeded' | 'failed' | 'denied';
  readonly reason?: string;
  readonly httpStatus?: number;
  readonly permission?: string;
  readonly route?: string;
  readonly method?: string;
}

export type AdministrativeAuditSink = (record: AdministrativeAuditRecord) => void;

@Injectable()
export class AdministrativeAuditLogger {
  constructor(@Inject(ADMIN_AUDIT_SINK) private readonly sink: AdministrativeAuditSink) {}

  write(record: Omit<AdministrativeAuditRecord, 'timestamp'>): void {
    try {
      this.sink({ timestamp: new Date().toISOString(), ...record });
    } catch {
      // Audit sink failure never changes authorization or business outcomes.
    }
  }
}

export function stdoutAuditSink(record: AdministrativeAuditRecord): void {
  process.stdout.write(`${JSON.stringify({ level: record.outcome === 'denied' || record.outcome === 'failed' ? 'warn' : 'info', ...record })}\n`);
}
