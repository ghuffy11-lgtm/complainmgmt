import { describe, expect, it } from 'vitest';
import { hasPermission } from '../hooks/usePermissions';

describe('hasPermission (frontend mirror)', () => {
  it('returns true on exact match', () => {
    expect(hasPermission(['complaint:read'], 'complaint:read')).toBe(true);
  });

  it('returns false when the user has no matching permission', () => {
    expect(hasPermission([], 'complaint:read')).toBe(false);
    expect(hasPermission(['audit:read'], 'complaint:read')).toBe(false);
  });

  it('matches resource-segment wildcard at the last colon', () => {
    expect(hasPermission(['complaint.field:*:write'], 'complaint.field:investigation:write')).toBe(true);
    expect(hasPermission(['complaint.field:*:write'], 'complaint.field:investigation:read')).toBe(false);
  });

  it('matches the top-level *:action super-permission', () => {
    expect(hasPermission(['*:read'], 'complaint:read')).toBe(true);
  });

  it('does not match across actions', () => {
    expect(hasPermission(['complaint:read'], 'complaint:update')).toBe(false);
  });
});
