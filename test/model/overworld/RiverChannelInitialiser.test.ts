import { describe, it, expect } from 'vitest';
import { RiverChannelInitialiser } from '@model/overworld/RiverChannelInitialiser';

// ── extractChannels ─────────────────────────────────────────────────────────
// These are the same cases as the old RiverChannelExtractor tests, updated to
// use the renamed class.

describe('RiverChannelInitialiser.extractChannels', () => {
  it('should extract a simple river channel between two puzzles', () => {
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [
        {
          name: 'flowingWater',
          data: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
        },
      ],
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 4, height: 1 },
        edgeTiles: [{ x: 3, y: 0, edge: 'E' as const }],
      }],
      ['puzzle-B', {
        bounds: { tileX: 7, tileY: 0, width: 3, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }],
      }],
    ]);

    const channels = RiverChannelInitialiser.extractChannels(tiledMapData, 'flowingWater', puzzleRegions);

    expect(channels.length).toBeGreaterThanOrEqual(1);

    const channelAtoB = channels.find(c =>
      c.sourcePuzzleID === 'puzzle-A' && c.targetPuzzleID === 'puzzle-B'
    );

    expect(channelAtoB).toBeDefined();
    if (channelAtoB) {
      expect(channelAtoB.sourceWorldTileX).toBe(3);
      expect(channelAtoB.sourceWorldTileY).toBe(0);
      expect(channelAtoB.targetWorldTileX).toBe(7);
      expect(channelAtoB.targetWorldTileY).toBe(0);
      expect(channelAtoB.sourceEdgeTile).toEqual({ localX: 3, localY: 0 });
      expect(channelAtoB.targetEdgeTile).toEqual({ localX: 0, localY: 0 });
      expect(channelAtoB.tiles.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array when the flow layer is not found', () => {
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [{ name: 'collision', data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    };

    const channels = RiverChannelInitialiser.extractChannels(tiledMapData, 'flowingWater', new Map());
    expect(channels).toEqual([]);
  });

  it('returns an empty array for an empty puzzle-regions map', () => {
    const tiledMapData = {
      width: 5,
      height: 1,
      layers: [{ name: 'flowingWater', data: [1, 1, 1, 1, 1] }],
    };

    const channels = RiverChannelInitialiser.extractChannels(tiledMapData, 'flowingWater', new Map());
    expect(channels).toEqual([]);
  });

  it('does not create a channel when water does not connect puzzles', () => {
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [{ name: 'flowingWater', data: [0, 0, 1, 1, 1, 0, 0, 0, 0, 0] }],
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 1, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'E' as const }],
      }],
      ['puzzle-B', {
        bounds: { tileX: 9, tileY: 0, width: 1, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }],
      }],
    ]);

    const channels = RiverChannelInitialiser.extractChannels(tiledMapData, 'flowingWater', puzzleRegions);
    expect(channels.length).toBe(0);
  });
});

// ── buildMergedWaterLayer ───────────────────────────────────────────────────

describe('RiverChannelInitialiser.buildMergedWaterLayer', () => {
  it('returns undefined when tiledMapData is absent', () => {
    expect(RiverChannelInitialiser.buildMergedWaterLayer(undefined)).toBeUndefined();
    expect(RiverChannelInitialiser.buildMergedWaterLayer(null)).toBeUndefined();
  });

  it('returns an all-zero array when there are no water layers', () => {
    const tiledMapData = {
      width: 3,
      height: 2,
      layers: [{ name: 'Forest/collision', type: 'tilelayer', data: [1, 1, 1, 1, 1, 1] }],
    };

    const result = RiverChannelInitialiser.buildMergedWaterLayer(tiledMapData);
    expect(result).toBeDefined();
    expect(result).toHaveLength(6);
    expect(result!.every(v => v === 0)).toBe(true);
  });

  it('merges tiles from a single water layer', () => {
    const tiledMapData = {
      width: 4,
      height: 1,
      layers: [{
        name: 'Forest/water',
        type: 'tilelayer',
        data: [0, 5, 0, 7],
      }],
    };

    const result = RiverChannelInitialiser.buildMergedWaterLayer(tiledMapData);
    expect(result).toEqual([0, 5, 0, 7]);
  });

  it('merges tiles from multiple water layers (last-writer-wins)', () => {
    // Two water layers; layer B overwrites layer A where both are non-zero.
    const tiledMapData = {
      width: 3,
      height: 1,
      layers: [
        { name: 'Forest/water', type: 'tilelayer', data: [1, 2, 0] },
        { name: 'Beach/water',  type: 'tilelayer', data: [0, 9, 3] },
      ],
    };

    const result = RiverChannelInitialiser.buildMergedWaterLayer(tiledMapData);
    // position 0: layer A = 1, layer B = 0  → 1
    // position 1: layer A = 2, layer B = 9  → 9 (last-writer-wins)
    // position 2: layer A = 0, layer B = 3  → 3
    expect(result).toEqual([1, 9, 3]);
  });

  it('counts the total non-zero tiles correctly', () => {
    const tiledMapData = {
      width: 5,
      height: 1,
      layers: [{
        name: 'Forest/water',
        type: 'tilelayer',
        data: [0, 1, 0, 1, 1],
      }],
    };

    const result = RiverChannelInitialiser.buildMergedWaterLayer(tiledMapData);
    const waterCount = result!.filter(v => v > 0).length;
    expect(waterCount).toBe(3);
  });
});

// ── inferEdgeDirection ──────────────────────────────────────────────────────

describe('RiverChannelInitialiser.inferEdgeDirection', () => {
  const W = 5;
  const H = 4;

  it('returns N for tiles on the top edge', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 0, W, H)).toBe('N');
    expect(RiverChannelInitialiser.inferEdgeDirection(2, 0, W, H)).toBe('N');
    expect(RiverChannelInitialiser.inferEdgeDirection(4, 0, W, H)).toBe('N');
  });

  it('returns S for tiles on the bottom edge', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 3, W, H)).toBe('S');
    expect(RiverChannelInitialiser.inferEdgeDirection(2, 3, W, H)).toBe('S');
    expect(RiverChannelInitialiser.inferEdgeDirection(4, 3, W, H)).toBe('S');
  });

  it('returns W for tiles on the left edge (not corner)', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 1, W, H)).toBe('W');
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 2, W, H)).toBe('W');
  });

  it('returns E for tiles on the right edge (not corner)', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(4, 1, W, H)).toBe('E');
    expect(RiverChannelInitialiser.inferEdgeDirection(4, 2, W, H)).toBe('E');
  });

  it('N takes priority over W at top-left corner', () => {
    // ly === 0 → N (first check wins)
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 0, W, H)).toBe('N');
  });

  it('N takes priority over E at top-right corner', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(4, 0, W, H)).toBe('N');
  });

  it('S takes priority over W at bottom-left corner', () => {
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 3, W, H)).toBe('S');
  });

  it('works for a 1×1 grid', () => {
    // Top/bottom edges both apply; N wins.
    expect(RiverChannelInitialiser.inferEdgeDirection(0, 0, 1, 1)).toBe('N');
  });
});
