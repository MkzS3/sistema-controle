import { describe, expect, test } from 'bun:test';
import { permissionsForRoles } from '../../src/presentation/http/security/permissions.js';

describe('proposed administrative role permissions', () => {
  test('administrator receives all configured permissions', () => {
    expect(permissionsForRoles(['administrator'])).toContain('audit:read');
    expect(permissionsForRoles(['administrator'])).toContain('payments:request');
    expect(permissionsForRoles(['administrator'])).toContain('system:metrics:read');
  });

  test('operator can perform approved operational writes but cannot read the ledger or audit log', () => {
    const permissions = permissionsForRoles(['operator']);
    expect(permissions).toContain('beneficiaries:create');
    expect(permissions).toContain('dividends:declare');
    expect(permissions).toContain('payments:request');
    expect(permissions).not.toContain('ledger:read');
    expect(permissions).not.toContain('audit:read');
  });

  test('auditor and viewer can read but cannot perform financial mutations', () => {
    const auditor = permissionsForRoles(['auditor']);
    const viewer = permissionsForRoles(['viewer']);
    expect(auditor).toContain('ledger:read');
    expect(auditor).toContain('audit:read');
    expect(auditor).not.toContain('dividends:declare');
    expect(viewer).toContain('dashboard:read');
    expect(viewer).toContain('ledger:read');
    expect(viewer).not.toContain('audit:read');
    expect(viewer).not.toContain('payments:request');
  });
});
