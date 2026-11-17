import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, tap, throwError, type Observable } from 'rxjs';
import { AdministrativeAuditLogger } from './administrative-audit.js';
import { AUDIT_ACTION, type AuditActionDescriptor } from './security-metadata.js';
import { actorForAudit, requestAuditId, routeTemplate } from './request-audit.js';
import type { SecuredRequest } from './security.types.js';

function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function') {
    try { return error.getStatus(); } catch { return undefined; }
  }
  return undefined;
}

function responseId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('id' in value)) return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length <= 200 ? id : undefined;
}

@Injectable()
export class AdministrativeAuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AdministrativeAuditLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const descriptor = this.reflector.getAllAndOverride<AuditActionDescriptor>(AUDIT_ACTION, [context.getHandler(), context.getClass()]);
    if (!descriptor) return next.handle();

    const request = context.switchToHttp().getRequest<SecuredRequest>();
    const actor = actorForAudit(request);
    const requestId = requestAuditId(request);
    const route = routeTemplate(request);
    const shared = {
      requestId, actorId: actor.id, roles: actor.roles,
      action: descriptor.action, resource: descriptor.resource, route, method: request.method,
    } as const;

    this.audit.write({ event: 'admin.action', ...shared, outcome: 'started' });
    return next.handle().pipe(
      tap((result: unknown) => {
        const resourceId = responseId(result) ?? request.params.id;
        this.audit.write({ event: 'admin.action', ...shared, ...(resourceId ? { resourceId } : {}), outcome: 'succeeded' });
      }),
      catchError((error: unknown) => {
        this.audit.write({ event: 'admin.action', ...shared, outcome: 'failed', ...(httpStatus(error) ? { httpStatus: httpStatus(error) } : {}) });
        return throwError(() => error);
      }),
    );
  }
}
