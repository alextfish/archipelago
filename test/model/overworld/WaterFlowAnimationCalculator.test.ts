import { describe, it, expect } from 'vitest';
import { WaterFlowAnimationCalculator } from '@model/overworld/WaterFlowAnimationCalculator';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { WaterDirectionTile } from '@model/overworld/WaterDirectionReader';

function tile(tileX: number, tileY: number, outgoing: Array<'N' | 'S' | 'E' | 'W'>): WaterDirectionTile {
  return {
    key: gridKey(tileX, tileY),
    tileX,
    tileY,
    layerName: 'Forest/water',
    outgoing,
    isSource: false
  };
}

describe('WaterFlowAnimationCalculator', () => {
  it('prunes dead-end and bounce-back branches with two-step backpropagation', () => {
    const tiles = new Map([
      [gridKey(1, 0), tile(1, 0, ['S'])],
      [gridKey(1, 1), tile(1, 1, ['S', 'E', 'W'])],
      [gridKey(1, 2), tile(1, 2, [])],
      [gridKey(2, 1), tile(2, 1, ['E'])],
      [gridKey(3, 1), tile(3, 1, ['W'])],
      [gridKey(0, 1), tile(0, 1, ['W'])],
      [gridKey(-1, 1), tile(-1, 1, ['W'])]
    ]);

    const result = WaterFlowAnimationCalculator.calculateAnimationByTile(tiles);
    expect(result.get(gridKey(1, 1))).toBe('flow_N-to-W');
  });

  it('does not emit an animation key when no valid onward flow remains', () => {
    const tiles = new Map([
      [gridKey(1, 0), tile(1, 0, ['S'])],
      [gridKey(1, 1), tile(1, 1, ['S'])],
      [gridKey(1, 2), tile(1, 2, [])]
    ]);

    const result = WaterFlowAnimationCalculator.calculateAnimationByTile(tiles);
    expect(result.has(gridKey(1, 1))).toBe(false);
  });

  it('never emits animation keys with overlapping incoming and outgoing directions', () => {
    const tiles = new Map([
      [gridKey(1, 0), tile(1, 0, ['S'])],
      [gridKey(0, 1), tile(0, 1, ['E', 'W'])],
      [gridKey(1, 1), tile(1, 1, ['S', 'W'])],
      [gridKey(1, 2), tile(1, 2, ['S'])],
      [gridKey(1, 3), tile(1, 3, ['S'])],
      [gridKey(-1, 1), tile(-1, 1, ['W'])],
      [gridKey(-2, 1), tile(-2, 1, ['W'])]
    ]);

    const result = WaterFlowAnimationCalculator.calculateAnimationByTile(tiles);
    expect(result.get(gridKey(1, 1))).toBe('flow_NW-to-S');
  });

  it('enumerates all disjoint in/out animation keys', () => {
    // 4 single-direction inputs + 6 two-direction inputs + 4 three-direction inputs,
    // each paired with any non-empty disjoint output subset, yields 50 combinations.
    const keys = WaterFlowAnimationCalculator.allAnimationKeys();
    expect(keys).toHaveLength(50);
    expect(keys).toContain('flow_N-to-W');
    expect(keys).toContain('flow_NE-to-SW');
    expect(keys).toContain('flow_W-to-NSE');
  });
});
