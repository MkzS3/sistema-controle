export const ADMIN_ROLES = ['administrator', 'operator', 'auditor', 'viewer'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export const PERMISSIONS = [
  'session:read',
  'dashboard:read',
  'beneficiaries:read',
  'beneficiaries:create',
  'dividends:read',
  'dividends:create',
  'dividends:declare',
  'obligations:read',
  'obligations:create',
  'payments:read',
  'payments:request',
  'ledger:read',
  'audit:read',
  'system:metrics:read',
] as const;
export type Permission = typeof PERMISSIONS[number];

const allPermissions: readonly Permission[] = PERMISSIONS;
const operationalReadPermissions: readonly Permission[] = [
  'session:read', 'dashboard:read', 'beneficiaries:read', 'dividends:read',
  'obligations:read', 'payments:read', 'ledger:read',
];

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly Permission[]>> = {
  administrator: allPermissions,
  operator: [
    'session:read', 'dashboard:read', 'beneficiaries:read', 'beneficiaries:create',
    'dividends:read', 'dividends:create', 'dividends:declare',
    'obligations:read', 'obligations:create', 'payments:read', 'payments:request',
    'system:metrics:read',
  ],
  auditor: [...operationalReadPermissions, 'audit:read'],
  viewer: operationalReadPermissions,
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsForRoles(roles: readonly AdminRole[]): Permission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

export function parseRoleClaim(value: unknown): AdminRole[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAdminRole))];
}
