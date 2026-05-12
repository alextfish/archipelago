import { describe, it, expect } from 'vitest';
import { tileCountBetween, orientationForDelta, isOrthogonal } from '@view/PuzzleRenderer';
import { normalizeRenderOrder } from '@view/PuzzleRenderer';

describe('PuzzleRenderer helpers', () => {
  it('calculates tile count for horizontal bridges', () => {
    expect(tileCountBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(2);
    expect(tileCountBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });

  it('calculates tile count for vertical bridges', () => {
    expect(tileCountBetween({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(3);
  });

  it('calculates tile count for diagonal / Pythagorean distances', () => {
    // 3-4-5 triangle
    expect(tileCountBetween({ x: 2, y: 2 }, { x: 5, y: 6 })).toBe(4);

    // short diagonal (~1.414) rounds to 1 -> 0 centre tiles
    expect(tileCountBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0);
  });

  it('chooses orientation by dominant delta', () => {
    expect(orientationForDelta({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe('horizontal');
    expect(orientationForDelta({ x: 0, y: 0 }, { x: 1, y: 3 })).toBe('vertical');
    expect(orientationForDelta({ x: 3, y: 0 }, { x: 0, y: 1 })).toBe('horizontal');
    expect(orientationForDelta({ x: 0, y: 4 }, { x: 0, y: 3 })).toBe('vertical');
    // equal delta chooses horizontal (implementation detail)
    expect(orientationForDelta({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe('horizontal');
  });

  it('detects exact orthogonality', () => {
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 0, y: 5 })).toBe(true);
    expect(isOrthogonal({ x: 1, y: 2 }, { x: 5, y: 2 })).toBe(true);
    expect(isOrthogonal({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('normalizes render order for vertical bridges (start becomes lower)', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 3 };
    const normalized = normalizeRenderOrder(a, b);
    expect(normalized.start).toEqual({ x: 0, y: 3 });
    expect(normalized.end).toEqual({ x: 0, y: 0 });
  });

  it('normalizes render order for horizontal bridges (start becomes left-most)', () => {
    const a = { x: 4, y: 1 };
    const b = { x: 1, y: 1 };
    const normalized = normalizeRenderOrder(a, b);
    expect(normalized.start).toEqual({ x: 1, y: 1 });
    expect(normalized.end).toEqual({ x: 4, y: 1 });
  });

  it('leaves already-normalized order unchanged', () => {
    const a = { x: 1, y: 1 };
    const b = { x: 4, y: 1 };
    const normalized = normalizeRenderOrder(a, b);
    expect(normalized.start).toEqual({ x: 1, y: 1 });
    expect(normalized.end).toEqual({ x: 4, y: 1 });
  });
});
