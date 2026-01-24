import { describe, it, expect, beforeEach } from 'vitest';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { WaterPropagationEngine } from '@model/overworld/WaterPropagationEngine';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { FlowPuzzleSpec } from '@model/puzzle/FlowTypes';
import type { RiverChannel } from '@model/overworld/RiverChannel';

describe('OverworldGameState FlowPuzzle integration', () => {
  let state: OverworldGameState;
  let waterEngine: WaterPropagationEngine;

  beforeEach(() => {
    state = new OverworldGameState();
    waterEngine = new WaterPropagationEngine();
  });

  it('should initialize water propagation system', () => {
    // Create a mock puzzle manager with getPuzzleBounds method
    const mockPuzzleManager = {
      getPuzzleBounds: (_puzzleId: string) => ({
        x: 0,
        y: 0,
        width: 128, // 4 tiles * 32px
        height: 32  // 1 tile * 32px
      })
    } as OverworldPuzzleManager;

    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    // Should not throw, initialization succeeds
    expect(true).toBe(true);
  });

  it('should store and retrieve flow puzzle outputs', () => {
    const mockPuzzleManager = {
      getPuzzleBounds: (_puzzleId: string) => ({
        x: 0,
        y: 0,
        width: 128,
        height: 32
      })
    } as OverworldPuzzleManager;

    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    // Create a simple FlowPuzzle with edge outputs
    const spec: FlowPuzzleSpec = {
      id: 'flow-test',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ['E'], isSource: true },
        { x: 1, y: 0, outgoing: ['E'] },
        { x: 2, y: 0, outgoing: ['E'] },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzle = new FlowPuzzle(spec);

    // Update water state
    const result = state.updateFlowPuzzleWaterState('flow-test', puzzle);

    // Should return propagation results (even if empty due to no channels)
    expect(result).toBeDefined();
    expect(result.flooded).toBeDefined();
    expect(result.drained).toBeDefined();
    expect(result.affectedPuzzles).toBeDefined();
  });

  it('should propagate water through channels to downstream puzzles', () => {
    const mockPuzzleManager = {
      getPuzzleBounds: (puzzleId: string) => {
        if (puzzleId === 'puzzle-A') {
          return { x: 0, y: 0, width: 128, height: 32 };
        } else if (puzzleId === 'puzzle-B') {
          return { x: 256, y: 0, width: 128, height: 32 };
        }
        return null;
      }
    } as OverworldPuzzleManager;

    // Set up a river channel
    const channel: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(4, 0), gridKey(5, 0), gridKey(6, 0), gridKey(7, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 8,
      targetWorldTileY: 0
    };

    waterEngine.setRiverChannels([channel]);
    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    // Create FlowPuzzle A with water at edge
    const specA: FlowPuzzleSpec = {
      id: 'puzzle-A',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ['E'], isSource: true },
        { x: 1, y: 0, outgoing: ['E'] },
        { x: 2, y: 0, outgoing: ['E'] },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzleA = new FlowPuzzle(specA);

    // Update water state for puzzle A
    const result = state.updateFlowPuzzleWaterState('puzzle-A', puzzleA);

    // Channel tiles should be flooded
    expect(result.flooded.size).toBeGreaterThan(0);

    // Puzzle B should receive edge inputs
    const inputsB = state.getFlowPuzzleInputs('puzzle-B');
    expect(inputsB).toEqual([{ x: 0, y: 0 }]);
  });

  it('should track overworld water state', () => {
    const mockPuzzleManager = {
      getPuzzleBounds: (_puzzleId: string) => ({
        x: 0,
        y: 0,
        width: 128,
        height: 32
      })
    } as OverworldPuzzleManager;

    const channel: RiverChannel = {
      id: 'river-1',
      tiles: [gridKey(4, 0), gridKey(5, 0)],
      sourcePuzzleID: 'puzzle-A',
      sourceEdgeTile: { localX: 3, localY: 0 },
      sourceWorldTileX: 3,
      sourceWorldTileY: 0,
      targetPuzzleID: 'puzzle-B',
      targetEdgeTile: { localX: 0, localY: 0 },
      targetWorldTileX: 6,
      targetWorldTileY: 0
    };

    waterEngine.setRiverChannels([channel]);
    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    const specA: FlowPuzzleSpec = {
      id: 'puzzle-A',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ['E'], isSource: true },
        { x: 1, y: 0, outgoing: ['E'] },
        { x: 2, y: 0, outgoing: ['E'] },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzleA = new FlowPuzzle(specA);
    state.updateFlowPuzzleWaterState('puzzle-A', puzzleA);

    // Check water state
    expect(state.tileHasWater(4, 0)).toBe(true);
    expect(state.tileHasWater(5, 0)).toBe(true);
    expect(state.tileHasWater(10, 10)).toBe(false);

    const waterTiles = state.getWaterTiles();
    expect(waterTiles.length).toBeGreaterThan(0);
  });

  it('should persist and restore flow puzzle water state', () => {
    const mockPuzzleManager = {
      getPuzzleBounds: (_puzzleId: string) => ({
        x: 0,
        y: 0,
        width: 128,
        height: 32
      })
    } as OverworldPuzzleManager;

    waterEngine.setRiverChannels([]);
    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    const specA: FlowPuzzleSpec = {
      id: 'puzzle-A',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ['E'], isSource: true },
        { x: 1, y: 0, outgoing: ['E'] },
        { x: 2, y: 0, outgoing: ['E'] },
        { x: 3, y: 0, outgoing: [] }
      ],
      edgeInputs: [{ x: 0, y: 0 }],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzleA = new FlowPuzzle(specA);
    state.updateFlowPuzzleWaterState('puzzle-A', puzzleA);

    // Export state
    const exported = state.exportState();
    expect(exported.flowPuzzleOutputs).toBeDefined();
    expect(exported.flowPuzzleInputs).toBeDefined();
    expect(exported.overworldWaterState).toBeDefined();

    // Create new state and import
    const newState = new OverworldGameState();
    newState.importState(exported);

    // Check imported state
    const importedOutputs = newState.exportState().flowPuzzleOutputs;
    expect(importedOutputs).toEqual(exported.flowPuzzleOutputs);
  });

  it('should handle updates when water propagation is not initialized', () => {
    const specA: FlowPuzzleSpec = {
      id: 'puzzle-A',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [
        { x: 0, y: 0, outgoing: ['E'], isSource: true }
      ],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzleA = new FlowPuzzle(specA);

    // Should handle gracefully without throwing
    const result = state.updateFlowPuzzleWaterState('puzzle-A', puzzleA);
    
    expect(result.flooded.size).toBe(0);
    expect(result.drained.size).toBe(0);
    expect(result.affectedPuzzles.size).toBe(0);
  });

  it('should clear flow puzzle state on reset', () => {
    const mockPuzzleManager = {
      getPuzzleBounds: (_puzzleId: string) => ({
        x: 0,
        y: 0,
        width: 128,
        height: 32
      })
    } as OverworldPuzzleManager;

    waterEngine.setRiverChannels([]);
    state.initializeWaterPropagation(waterEngine, mockPuzzleManager);

    const specA: FlowPuzzleSpec = {
      id: 'puzzle-A',
      size: { width: 4, height: 1 },
      islands: [],
      bridgeTypes: [{ id: 'wood', colour: 'brown', count: 1 }],
      flowSquares: [{ x: 0, y: 0, outgoing: [], isSource: true }],
      edgeInputs: [],
      constraints: [],
      maxNumBridges: 2
    };

    const puzzleA = new FlowPuzzle(specA);
    state.updateFlowPuzzleWaterState('puzzle-A', puzzleA);

    // Reset state
    state.reset();

    // Check that flow state is cleared
    const waterTiles = state.getWaterTiles();
    expect(waterTiles.length).toBe(0);
    
    const exported = state.exportState();
    expect(Object.keys(exported.flowPuzzleOutputs).length).toBe(0);
  });
});
