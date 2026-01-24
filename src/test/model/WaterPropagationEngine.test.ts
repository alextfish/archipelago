import { describe, it, expect, beforeEach } from 'vitest';
import { WaterPropagationEngine } from '@model/overworld/WaterPropagationEngine';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { RiverChannel } from '@model/overworld/RiverChannel';

describe('WaterPropagationEngine', () => {
  let engine: WaterPropagationEngine;

  beforeEach(() => {
    engine = new WaterPropagationEngine();
  });

  it('should propagate water through a simple river channel', () => {
    const channel: RiverChannel = {
      id: 'river-1',
      tiles: [
        gridKey(3, 0),  // World tile coordinates
        gridKey(4, 0),
        gridKey(5, 0)
      ],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 6,
      targetWorldTileY: 0
    };

    engine.setRiverChannels([channel]);

    const result = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }],
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );

    expect(result.flooded.size).toBe(3);
    expect(result.flooded.has(gridKey(3, 0))).toBe(true);
    expect(result.flooded.has(gridKey(4, 0))).toBe(true);
    expect(result.flooded.has(gridKey(5, 0))).toBe(true);
    
    expect(result.downstreamInputs.get('puzzle-B')).toEqual([
      { x: 0, y: 0 }
    ]);
  });

  it('should drain channels when upstream output stops', () => {
    const channel: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(3, 0), gridKey(4, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 5,
      targetWorldTileY: 0
    };

    engine.setRiverChannels([channel]);

    // First, water flows
    const result1 = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }],
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );
    expect(result1.flooded.size).toBe(2);
    expect(result1.drained.size).toBe(0);

    // Then, water stops flowing
    const result2 = engine.computePropagation(
      'puzzle-A',
      [], // No outputs
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );
    expect(result2.flooded.size).toBe(0);
    expect(result2.drained.size).toBe(2);
    expect(result2.drained.has(gridKey(3, 0))).toBe(true);
    expect(result2.drained.has(gridKey(4, 0))).toBe(true);
  });

  it('should handle branching river channels', () => {
    const channel1: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(3, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 4,
      targetWorldTileY: 0
    };

    const channel2: RiverChannel = {
      id: 'river-2',
      tiles: [gridKey(3, 1)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-C',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 4,
      targetWorldTileY: 1
    };

    engine.setRiverChannels([channel1, channel2]);

    const result = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }],
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );

    // Both branches should be flooded
    expect(result.flooded.size).toBe(2);
    expect(result.flooded.has(gridKey(3, 0))).toBe(true);
    expect(result.flooded.has(gridKey(3, 1))).toBe(true);

    // Both downstream puzzles should receive inputs
    expect(result.downstreamInputs.get('puzzle-B')).toEqual([{ x: 0, y: 0 }]);
    expect(result.downstreamInputs.get('puzzle-C')).toEqual([{ x: 0, y: 0 }]);
  });

  it('should handle multiple edge outputs from same puzzle', () => {
    const channel1: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(3, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 4,
      targetWorldTileY: 0
    };

    const channel2: RiverChannel = {
      id: 'river-2',
      tiles: [gridKey(3, 2)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 2 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 2,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 1 },
      targetWorldTileX: 4,
      targetWorldTileY: 2
    };

    engine.setRiverChannels([channel1, channel2]);

    const result = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }, { localX: 3, localY: 2 }],
      { tileX: 0, tileY: 0, width: 4, height: 3 }
    );

    expect(result.flooded.size).toBe(2);
    
    // Both channels feed puzzle-B, so it should have 2 inputs
    const inputs = result.downstreamInputs.get('puzzle-B');
    expect(inputs).toBeDefined();
    expect(inputs?.length).toBe(2);
    expect(inputs).toContainEqual({ x: 0, y: 0 });
    expect(inputs).toContainEqual({ x: 0, y: 1 });
  });

  it('should return empty results when no channels are set', () => {
    const result = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }],
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );

    expect(result.flooded.size).toBe(0);
    expect(result.drained.size).toBe(0);
    expect(result.downstreamInputs.size).toBe(0);
  });

  it('should return empty results when puzzle has no outputs', () => {
    const channel: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(3, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 4,
      targetWorldTileY: 0
    };

    engine.setRiverChannels([channel]);

    const result = engine.computePropagation(
      'puzzle-A',
      [], // No outputs
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );

    expect(result.flooded.size).toBe(0);
    expect(result.drained.size).toBe(1); // Channel should be drained
    expect(result.downstreamInputs.size).toBe(0);
  });
});
