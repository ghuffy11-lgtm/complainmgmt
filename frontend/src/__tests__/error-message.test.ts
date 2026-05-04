import { describe, expect, it } from 'vitest';
import { errorMessage } from '../components/ui/Toast';

describe('errorMessage', () => {
  it('falls through to the default for unknown shapes', () => {
    expect(errorMessage(undefined, 'fallback text')).toBe('fallback text');
    expect(errorMessage(new Error('boom'), 'fallback text')).toBe('fallback text');
  });

  it('uses code + error from a structured backend response', () => {
    const err = { response: { data: { error: 'Forbidden', code: 'RBAC_DENIED' } } };
    expect(errorMessage(err)).toBe('Forbidden (RBAC_DENIED)');
  });

  it('uses the bare error string when no code is present', () => {
    const err = { response: { data: { error: 'Validation failed' } } };
    expect(errorMessage(err)).toBe('Validation failed');
  });

  it('falls through when only details are returned', () => {
    expect(errorMessage({ response: { data: { details: { x: 1 } } } }, 'fb')).toBe('fb');
  });
});
