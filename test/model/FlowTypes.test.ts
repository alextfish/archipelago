import { describe, expect, it } from 'vitest';
import { directionKeyNSEW } from '@model/puzzle/FlowTypes';

describe('directionKeyNSEW', () => {
  it('returns directions in canonical NSEW order', () => {
    expect(directionKeyNSEW(['E', 'W', 'N', 'S'])).toBe('NSEW');
  });

  it('ignores duplicates while preserving canonical order', () => {
    expect(directionKeyNSEW(['S', 'N', 'S', 'E', 'N'])).toBe('NSE');
  });

  it('returns empty string for undefined or empty input', () => {
    expect(directionKeyNSEW(undefined)).toBe('');
    expect(directionKeyNSEW([])).toBe('');
  });
});
