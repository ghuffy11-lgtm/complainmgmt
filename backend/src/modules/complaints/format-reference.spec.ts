import { formatReference } from './format-reference';

describe('formatReference', () => {
  it('formats the default template', () => {
    expect(formatReference('CMP-{YYYY}-{seq:6}', 2026, 5, 42)).toBe('CMP-2026-000042');
  });

  it('supports {MM} and {seq} without padding', () => {
    expect(formatReference('{YYYY}/{MM}-{seq}', 2026, 4, 7)).toBe('2026/04-7');
  });

  it('handles seq widths smaller than the number gracefully (no truncation)', () => {
    expect(formatReference('{seq:2}', 2026, 1, 1234)).toBe('1234');
  });

  it('replaces every occurrence of {seq:N}', () => {
    expect(formatReference('{seq:3}-{seq:3}', 2026, 1, 7)).toBe('007-007');
  });
});
