import { hasPermission } from './permission-resolver';

describe('hasPermission', () => {
  it('returns true on exact match', () => {
    const perms = new Set(['complaint:read']);
    expect(hasPermission(perms, 'complaint:read')).toBe(true);
  });

  it('returns false when missing', () => {
    expect(hasPermission(new Set(), 'complaint:read')).toBe(false);
  });

  it('matches resource-segment wildcard', () => {
    const perms = new Set(['complaint.field:*:write']);
    expect(hasPermission(perms, 'complaint.field:investigation:write')).toBe(true);
    expect(hasPermission(perms, 'complaint.field:investigation:read')).toBe(false);
  });

  it('matches super wildcard *:action', () => {
    const perms = new Set(['*:read']);
    expect(hasPermission(perms, 'complaint:read')).toBe(true);
  });

  it('does not match across actions', () => {
    const perms = new Set(['complaint:read']);
    expect(hasPermission(perms, 'complaint:update')).toBe(false);
  });
});
