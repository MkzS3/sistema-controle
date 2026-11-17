import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

export const PUBLIC_ROUTE = 'security:public-route';
export const REQUIRED_PERMISSION = 'security:required-permission';
export const AUDIT_ACTION = 'security:audit-action';

export interface AuditActionDescriptor {
  readonly action: string;
  readonly resource: string;
}

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);
export const AuditAction = (action: string, resource: string) => SetMetadata(AUDIT_ACTION, { action, resource } satisfies AuditActionDescriptor);
