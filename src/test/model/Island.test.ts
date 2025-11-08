import { describe, it, expect } from 'vitest';
import { parseNumBridgesConstraint } from '@model/puzzle/Island';

describe('Island model helpers', () => {
  it('parses num_bridges when present', () => {
    expect(parseNumBridgesConstraint({ id: 'A', x: 0, y: 0, constraints: ['num_bridges=3'] })).toBe(3);
  });

  it('returns null when no num_bridges constraint', () => {
    expect(parseNumBridgesConstraint({ id: 'B', x: 1, y: 1, constraints: ['foo=bar'] })).toBeNull();
    expect(parseNumBridgesConstraint({ id: 'C', x: 2, y: 2 })).toBeNull();
  });
});
