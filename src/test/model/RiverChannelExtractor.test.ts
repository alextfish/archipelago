import { describe, it, expect } from 'vitest';
import { RiverChannelExtractor } from '@model/overworld/RiverChannelExtractor';

describe('RiverChannelExtractor', () => {
  it('should extract a simple river channel between two puzzles', () => {
    // Create a simple Tiled map with a horizontal water channel
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [
        {
          name: 'flowingWater',
          data: [
            0, 0, 0, 0, 1, 1, 1, 0, 0, 0  // Water tiles at positions 4, 5, 6
          ]
        }
      ]
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 4, height: 1 },
        edgeTiles: [{ x: 3, y: 0, edge: 'E' as const }]
      }],
      ['puzzle-B', {
        bounds: { tileX: 7, tileY: 0, width: 3, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }]
      }]
    ]);

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    // We should find at least one channel (possibly 2 if both edges can trace to each other)
    expect(channels.length).toBeGreaterThanOrEqual(1);
    
    // Find the channel from puzzle-A to puzzle-B
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
      
      // Channel tiles should include the water tiles between puzzles
      expect(channelAtoB.tiles.length).toBeGreaterThan(0);
    }
  });

  it('should return empty array when flow layer is not found', () => {
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [
        {
          name: 'collision',
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        }
      ]
    };

    const puzzleRegions = new Map();

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    expect(channels).toEqual([]);
  });

  it('should handle multiple channels from different puzzle edges', () => {
    // Create a map with two separate water channels
    const tiledMapData = {
      width: 15,
      height: 2,
      layers: [
        {
          name: 'flowingWater',
          data: [
            // Row 0: channel 1 (tiles 4-6)
            0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
            // Row 1: channel 2 (tiles 9-11)
            0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0
          ]
        }
      ]
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 4, height: 1 },
        edgeTiles: [{ x: 3, y: 0, edge: 'E' as const }]
      }],
      ['puzzle-B', {
        bounds: { tileX: 7, tileY: 0, width: 3, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }]
      }],
      ['puzzle-C', {
        bounds: { tileX: 5, tileY: 1, width: 4, height: 1 },
        edgeTiles: [{ x: 3, y: 0, edge: 'E' as const }]
      }],
      ['puzzle-D', {
        bounds: { tileX: 12, tileY: 1, width: 3, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }]
      }]
    ]);

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    // Should find at least one channel (possibly more depending on tracing)
    expect(channels.length).toBeGreaterThanOrEqual(1);
  });

  it('should not create channels when water does not connect puzzles', () => {
    // Water tiles that don't reach any puzzle edge
    const tiledMapData = {
      width: 10,
      height: 1,
      layers: [
        {
          name: 'flowingWater',
          data: [0, 0, 1, 1, 1, 0, 0, 0, 0, 0]  // Water not adjacent to puzzle edges
        }
      ]
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 1, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'E' as const }]
      }],
      ['puzzle-B', {
        bounds: { tileX: 9, tileY: 0, width: 1, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }]
      }]
    ]);

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    // Should not find any valid channels since water doesn't connect to puzzle edges
    expect(channels.length).toBe(0);
  });

  it('should handle empty puzzle regions', () => {
    const tiledMapData = {
      width: 5,
      height: 1,
      layers: [
        {
          name: 'flowingWater',
          data: [1, 1, 1, 1, 1]
        }
      ]
    };

    const puzzleRegions = new Map();

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    expect(channels).toEqual([]);
  });

  it('should handle layer with no water tiles', () => {
    const tiledMapData = {
      width: 5,
      height: 1,
      layers: [
        {
          name: 'flowingWater',
          data: [0, 0, 0, 0, 0]
        }
      ]
    };

    const puzzleRegions = new Map([
      ['puzzle-A', {
        bounds: { tileX: 0, tileY: 0, width: 2, height: 1 },
        edgeTiles: [{ x: 1, y: 0, edge: 'E' as const }]
      }],
      ['puzzle-B', {
        bounds: { tileX: 3, tileY: 0, width: 2, height: 1 },
        edgeTiles: [{ x: 0, y: 0, edge: 'W' as const }]
      }]
    ]);

    const channels = RiverChannelExtractor.extractChannels(
      tiledMapData,
      'flowingWater',
      puzzleRegions
    );

    expect(channels).toEqual([]);
  });
});
