# FlowPuzzle Overworld Integration - Architectural Specification

## Executive Summary

This document specifies the architecture for integrating FlowPuzzle into the overworld system. The integration builds on the existing FlowPuzzle model implementation and extends the overworld view and controller layers to support:

1. **Rendering**: Water flow visualization with flow direction arrows and water state changes
2. **State Management**: Water propagation across multiple connected FlowPuzzles
3. **Walkability**: Multi-level collision system supporting high/low/transition states
4. **Controllers**: Coordination of FlowPuzzle-specific interactions

## Design Principles

Following the project's clean architecture:

- **Model Layer**: Pure TypeScript, no UI dependencies, fully unit-testable
- **View Layer**: Phaser rendering, reads from model through interfaces
- **Controller Layer**: Orchestration between model and view, extractable logic for testing
- **Separation of Concerns**: Each component has a single, well-defined responsibility

## Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        View Layer                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ FlowPuzzleRenderer (extends EmbeddedPuzzleRenderer)  │   │
│  │ - Renders water tiles with flow arrows               │   │
│  │ - Animates water state changes (filled/drained)      │   │
│  │ - Displays pontoons and obstacles                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ reads from
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Controller Layer                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ FlowPuzzleController (extends OverworldPuzzleCtrl)   │   │
│  │ - Coordinates FlowPuzzle-specific interactions       │   │
│  │ - Triggers water propagation on solve                │   │
│  │ - Updates view based on water state                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ EnhancedCollisionManager                             │   │
│  │ - Maps ConnectivityState to collision/walkability    │   │
│  │ - Handles PassableHigh/Low/Transition/Blocked        │   │
│  │ - Updates based on baked connectivity                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ updates/queries
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Model Layer                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ FlowPuzzle (already implemented)                     │   │
│  │ - Water propagation logic                            │   │
│  │ - Edge inputs/outputs                                │   │
│  │ - Baked connectivity via ConnectivityManager         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ OverworldGameState (enhanced)                        │   │
│  │ - Tracks solved FlowPuzzles and edge outputs         │   │
│  │ - Propagates water across puzzle boundaries          │   │
│  │ - Computes global water connectivity                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ WaterPropagationEngine (new)                         │   │
│  │ - Pure logic: edge output → edge input mapping      │   │
│  │ - Graph traversal for multi-puzzle water flow       │   │
│  │ - Deterministic, testable water state computation   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. View Layer: FlowPuzzleRenderer

### 1.1 Purpose

Extends `EmbeddedPuzzleRenderer` to add FlowPuzzle-specific rendering:
- Water tiles with state (filled vs drained)
- Flow direction arrows (up to 3 per tile: N, S, E, W combinations)
- Pontoon tiles (walkable platforms)
- Rocky and obstacle tiles (visual differentiation)

### 1.2 Class Definition

```typescript
export class FlowPuzzleRenderer extends EmbeddedPuzzleRenderer {
  private flowPuzzle: FlowPuzzle | null = null;
  
  // Additional graphics containers for flow-specific elements
  private waterTiles: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private flowArrows: Map<string, Phaser.GameObjects.Container> = new Map();
  private pontoonSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  
  // Asset keys for new sprites (to be provided by user)
  private readonly SPRITE_KEYS = {
    WATER_FILLED: 'water-filled',
    WATER_DRAINED: 'drained-riverbed',
    PONTOON: 'pontoon',
    ROCKY_TILE: 'rocky-ground',
    OBSTACLE_TILE: 'obstacle',
    ARROW_N: 'flow-arrow-n',
    ARROW_S: 'flow-arrow-s',
    ARROW_E: 'flow-arrow-e',
    ARROW_W: 'flow-arrow-w'
  };
  
  constructor(
    scene: Phaser.Scene,
    puzzleBounds: Phaser.Geom.Rectangle,
    textureKey = 'sprout-tiles'
  ) {
    super(scene, puzzleBounds, textureKey);
  }
  
  // Override init to handle FlowPuzzle-specific setup
  override init(puzzle: BridgePuzzle): void {
    super.init(puzzle);
    
    if (puzzle instanceof FlowPuzzle) {
      this.flowPuzzle = puzzle;
      this.initializeFlowGraphics();
    }
  }
  
  // Override updateFromPuzzle to refresh water state
  override updateFromPuzzle(puzzle: BridgePuzzle): void {
    super.updateFromPuzzle(puzzle);
    
    if (this.flowPuzzle) {
      this.updateWaterTiles();
      this.updateFlowArrows();
    }
  }
  
  private initializeFlowGraphics(): void {
    // Create sprites for all flow squares
    // Position using gridMapper inherited from parent
  }
  
  private updateWaterTiles(): void {
    // Update water tile sprites based on hasWater state
    // Animate transitions if water state changed
  }
  
  private updateFlowArrows(): void {
    // Update flow arrow visibility and animation based on water state
    // Show arrows only on tiles with water
  }
  
  override destroy(): void {
    this.cleanupFlowGraphics();
    super.destroy();
  }
  
  private cleanupFlowGraphics(): void {
    // Destroy all flow-specific sprites and containers
  }
}
```

### 1.3 Real-Time Water State Updates

**Important**: The FlowPuzzleRenderer needs to emit events when water state changes so the overworld view can update in real-time while the player is solving the puzzle. This allows visible river tiles outside the puzzle bounds to update as bridges are placed/removed.

```typescript
export class FlowPuzzleRenderer extends EmbeddedPuzzleRenderer {
  // ... existing fields
  
  override updateFromPuzzle(puzzle: BridgePuzzle): void {
    super.updateFromPuzzle(puzzle);
    
    if (this.flowPuzzle) {
      const previousWaterState = this.getCurrentWaterState();
      
      // Update water visuals
      this.updateWaterTiles();
      this.updateFlowArrows();
      
      // Emit event with water state changes for overworld to update
      const currentWaterState = this.getCurrentWaterState();
      const changes = this.computeWaterStateChanges(previousWaterState, currentWaterState);
      
      if (changes.flooded.size > 0 || changes.drained.size > 0) {
        this.scene.events.emit('flow-puzzle-water-changed', {
          puzzleID: this.flowPuzzle.id,
          flooded: Array.from(changes.flooded),
          drained: Array.from(changes.drained)
        });
      }
    }
  }
  
  private getCurrentWaterState(): Set<string> {
    const state = new Set<string>();
    if (!this.flowPuzzle) return state;
    
    const waterGrid = this.flowPuzzle.getHasWaterGrid();
    for (const [key, hasWater] of waterGrid) {
      if (hasWater) {
        state.add(key);
      }
    }
    return state;
  }
  
  private computeWaterStateChanges(
    previous: Set<string>,
    current: Set<string>
  ): { flooded: Set<string>; drained: Set<string> } {
    const flooded = new Set<string>();
    const drained = new Set<string>();
    
    // Find newly flooded tiles
    for (const tile of current) {
      if (!previous.has(tile)) {
        flooded.add(tile);
      }
    }
    
    // Find newly drained tiles
    for (const tile of previous) {
      if (!current.has(tile)) {
        drained.add(tile);
      }
    }
    
    return { flooded, drained };
  }
}
```

**Water Tiles**: Each flow square gets a base sprite that switches between:
- `water-filled`: When `flowPuzzle.tileHasWater(x, y)` is true
- `drained-riverbed`: When `tileHasWater(x, y)` is false

**Flow Arrows**: Container with up to 3 arrow sprites per tile:
- Read `flowSquare.outgoing` directions
- Create arrow sprite for each direction
- Position arrows overlapping on the tile center
- Show/hide based on water presence
- Optional: Animate with subtle pulsing or flowing effect

**Pontoons**: Fixed floating platforms
- Read `flowSquare.pontoon` flag
- Render distinct sprite
- Visual state changes based on water (e.g., floating vs grounded)

**Rocky/Obstacle Tiles**: Special rendering for constraints
- Read `flowSquare.rocky` and `flowSquare.obstacle` flags
- Render with distinct visuals to communicate rules

### 1.4 Rendering Details

```typescript
private animateWaterStateChange(gridKey: string, nowHasWater: boolean): void {
  const sprite = this.waterTiles.get(gridKey);
  if (!sprite) return;
  
  // Fade transition or splash effect
  this.scene.tweens.add({
    targets: sprite,
    alpha: nowHasWater ? 1 : 0.5,
    duration: 300,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      // Switch sprite frame after fade
      sprite.setFrame(nowHasWater ? 
        this.SPRITE_KEYS.WATER_FILLED : 
        this.SPRITE_KEYS.WATER_DRAINED
      );
    }
  });
}
```

### 1.5 Animation Support

While the renderer is view-layer code (primarily tested manually), extract helper methods for unit testing:

```typescript
// In a separate utility file for testing
export class FlowRenderingUtils {
  static computeArrowPositions(
    directions: Direction[], 
    centerX: number, 
    centerY: number
  ): { dir: Direction; x: number; y: number }[] {
    // Pure function: given directions and center point, compute arrow positions
  }
  
  static shouldShowArrows(hasWater: boolean, flowSquare: FlowSquareSpec): boolean {
    // Testable logic for when to display arrows
    return hasWater && (flowSquare.outgoing?.length ?? 0) > 0;
  }
}
```

---

## 2. Model Layer Enhancements

### 2.1 RiverChannel (New Type)

**Purpose**: Represents a continuous river channel in the overworld between puzzles.

**Location**: `src/model/overworld/RiverChannel.ts`

A river channel is a set of connected overworld tiles that can carry water from FlowPuzzle edge outputs to other FlowPuzzle edge inputs. These are extracted from the Tiled map at load time. All coordinates are in tile units (not pixels).

```typescript
import type { GridKey } from '@model/puzzle/FlowTypes';

/**
 * Represents a river channel between FlowPuzzle edges.
 * All coordinates are in tile units (world tile coordinates).
 */
export interface RiverChannel {
  id: string; // Unique identifier for this channel
  tiles: GridKey[]; // Ordered list of tiles in the channel (world tile coords as GridKey)
  sourcePuzzleID: string; // ID of upstream FlowPuzzle
  sourceEdgeTile: { localX: number; localY: number }; // Edge tile in source puzzle (local coords)
  sourceWorldTileX: number; // World tile X coordinate of source edge
  sourceWorldTileY: number; // World tile Y coordinate of source edge
  targetPuzzleID: string; // ID of downstream FlowPuzzle
  targetEdgeTile: { localX: number; localY: number }; // Edge tile in target puzzle (local coords)
  targetWorldTileX: number; // World tile X coordinate of target edge
  targetWorldTileY: number; // World tile Y coordinate of target edge
}
```

### 2.2 WaterPropagationEngine (New Class)

**Purpose**: Pure model logic for computing water flow across FlowPuzzles and river channels.

**Location**: `src/model/overworld/WaterPropagationEngine.ts`

**Responsibilities**:
- Store river channel connectivity information (extracted from Tiled at load time)
- Trace water flow from FlowPuzzle edge outputs through river channels to downstream puzzles
- Compute which river tiles should have water vs be drained
- Compute edge inputs for downstream FlowPuzzles
- Work entirely in tile/grid coordinates (not pixels)
- Provide deterministic, testable water propagation

**Important**: As a model class, WaterPropagationEngine works in tile coordinates only. All coordinates are in grid/tile units (worldTileX, worldTileY), not pixel units. Pixel conversion is handled by view layer classes.

```typescript
import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey, parseGridKey } from '@model/puzzle/FlowTypes';
import type { RiverChannel } from './RiverChannel';

/**
 * Pure model class for computing water propagation across overworld.
 * Traces water from FlowPuzzle outputs through river channels to downstream puzzles.
 * Works entirely in tile coordinates (not pixels).
 */
export class WaterPropagationEngine {
  private riverChannels: RiverChannel[] = [];
  
  // Map from puzzle edge tile (world tile coords) to list of channels starting there
  private channelsBySource: Map<GridKey, RiverChannel[]> = new Map();
  
  // Map from puzzle edge tile (world tile coords) to channel ending there
  private channelsByTarget: Map<GridKey, RiverChannel> = new Map();
  
  constructor() {
    // No dependencies - pure model logic
  }
  
  /**
   * Initialize with river channels extracted from Tiled map at load time.
   */
  setRiverChannels(channels: RiverChannel[]): void {
    this.riverChannels = channels;
    this.buildChannelMaps();
  }
  
  /**
   * Build lookup maps for efficient channel queries.
   */
  private buildChannelMaps(): void {
    this.channelsBySource.clear();
    this.channelsByTarget.clear();
    
    for (const channel of this.riverChannels) {
      // Source and target are already in world tile coordinates
      const sourceKey = gridKey(channel.sourceWorldTileX, channel.sourceWorldTileY);
      
      if (!this.channelsBySource.has(sourceKey)) {
        this.channelsBySource.set(sourceKey, []);
      }
      this.channelsBySource.get(sourceKey)!.push(channel);
      
      const targetKey = gridKey(channel.targetWorldTileX, channel.targetWorldTileY);
      this.channelsByTarget.set(targetKey, channel);
    }
  }
  
  /**
   * Compute water propagation from a FlowPuzzle's edge outputs.
   * All coordinates are in tile units (not pixels).
   * 
   * @param sourcePuzzleID - ID of the puzzle whose water state changed
   * @param edgeOutputs - Edge output tiles in puzzle-local coordinates
   * @param puzzleBounds - Puzzle bounds in world tile coordinates
   * @returns flooded/drained tiles and downstream inputs
   */
  computePropagation(
    sourcePuzzleID: string,
    edgeOutputs: { localX: number; localY: number }[],
    puzzleBounds: { tileX: number; tileY: number; width: number; height: number }
  ): {
    flooded: Set<GridKey>; // World tile keys
    drained: Set<GridKey>; // World tile keys
    downstreamInputs: Map<string, { x: number; y: number }[]>;
  } {
    const flooded = new Set<GridKey>();
    const downstreamInputs = new Map<string, { x: number; y: number }[]>();
    
    // For each edge output from the source puzzle
    for (const localOutput of edgeOutputs) {
      // Convert to world tile coordinates
      const worldTileX = puzzleBounds.tileX + localOutput.localX;
      const worldTileY = puzzleBounds.tileY + localOutput.localY;
      const outputKey = gridKey(worldTileX, worldTileY);
      
      // Find channels starting from this edge
      const channels = this.channelsBySource.get(outputKey) || [];
      
      for (const channel of channels) {
        // Mark all tiles in this channel as flooded
        for (const tileKey of channel.tiles) {
          flooded.add(tileKey);
        }
        
        // Add edge input to downstream puzzle
        if (!downstreamInputs.has(channel.targetPuzzleID)) {
          downstreamInputs.set(channel.targetPuzzleID, []);
        }
        downstreamInputs.get(channel.targetPuzzleID)!.push({
          x: channel.targetEdgeTile.localX,
          y: channel.targetEdgeTile.localY
        });
      }
    }
    
    // Compute drained tiles: all channel tiles not in flooded set
    const drained = new Set<GridKey>();
    for (const channel of this.riverChannels) {
      for (const tileKey of channel.tiles) {
        if (!flooded.has(tileKey)) {
          drained.add(tileKey);
        }
      }
    }
    
    return { flooded, drained, downstreamInputs };
  }
}
```

### 2.3 RiverChannelExtractor (New Utility)

**Purpose**: Extract river channel connectivity from Tiled map at load time.

**Location**: `src/model/overworld/RiverChannelExtractor.ts`

```typescript
import type { RiverChannel } from './RiverChannel';
import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';

/**
 * Extracts river channel connectivity from Tiled map layer.
 * Analyzes "flowingWater" layer (or similar) to find continuous channels
 * connecting FlowPuzzle edge tiles.
 * Works entirely in tile coordinates (not pixels).
 */
export class RiverChannelExtractor {
  /**
   * Extract river channels from Tiled map data.
   * Uses flood-fill algorithm to trace connected water tiles.
   * 
   * @param tiledMapData - Tiled map JSON data
   * @param flowLayerName - Name of layer containing water tiles (e.g., "flowingWater")
   * @param puzzleRegions - Map of puzzle IDs to their bounds and edge tiles (in tile coordinates)
   * @returns List of river channels connecting puzzles
   */
  static extractChannels(
    tiledMapData: any,
    flowLayerName: string,
    puzzleRegions: Map<string, {
      bounds: { tileX: number; tileY: number; width: number; height: number };
      edgeTiles: { x: number; y: number; edge: 'N' | 'S' | 'E' | 'W' }[];
    }>
  ): RiverChannel[] {
    const channels: RiverChannel[] = [];
    
    // 1. Find the flow layer in Tiled data
    const flowLayer = tiledMapData.layers.find((l: any) => l.name === flowLayerName);
    if (!flowLayer) {
      console.warn(`Flow layer "${flowLayerName}" not found in Tiled map`);
      return channels;
    }
    
    // 2. Build a grid of water tiles from layer data (in tile coordinates)
    const waterGrid = this.buildWaterGrid(flowLayer);
    
    // 3. For each puzzle edge tile, trace downstream to find channels
    for (const [puzzleID, region] of puzzleRegions) {
      for (const edgeTile of region.edgeTiles) {
        // Convert local edge tile to world tile coordinates
        const worldTileX = region.bounds.tileX + edgeTile.x;
        const worldTileY = region.bounds.tileY + edgeTile.y;
        
        const channel = this.traceChannel(
          puzzleID,
          { localX: edgeTile.x, localY: edgeTile.y, edge: edgeTile.edge },
          worldTileX,
          worldTileY,
          waterGrid,
          puzzleRegions
        );
        if (channel) {
          channels.push(channel);
        }
      }
    }
    
    return channels;
  }
  
  private static buildWaterGrid(flowLayer: any): Set<GridKey> {
    // Implementation: parse layer data to identify water tiles
    // Returns set of GridKeys for tiles with water
    return new Set<GridKey>();
  }
  
  private static traceChannel(
    sourcePuzzleID: string,
    sourceEdge: { localX: number; localY: number; edge: 'N' | 'S' | 'E' | 'W' },
    sourceWorldTileX: number,
    sourceWorldTileY: number,
    waterGrid: Set<GridKey>,
    puzzleRegions: Map<string, any>
  ): RiverChannel | null {
    // Implementation: flood-fill from source edge until reaching another puzzle edge
    // Returns channel with tiles as GridKeys, all in world tile coordinates
    return null;
  }
}
```

**Testing**:

```typescript
import { gridKey } from '@model/puzzle/FlowTypes';

describe('WaterPropagationEngine', () => {
  it('propagates water through river channels', () => {
    const engine = new WaterPropagationEngine();
    
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
      targetWorldTileX: 5,
      targetWorldTileY: 0
    };
    
    engine.setRiverChannels([channel]);
    
    const result = engine.computePropagation(
      'puzzle-A',
      [{ localX: 3, localY: 0 }],
      { tileX: 0, tileY: 0, width: 4, height: 1 }
    );
    
    expect(result.flooded.size).toBe(3);
    expect(result.downstreamInputs.get('puzzle-B')).toEqual([
      { x: 0, y: 0 }
    ]);
  });
  
  it('drains channels when upstream output stops', () => {
    // Test that channels not receiving water are marked as drained
  });
  
  it('handles branching river channels', () => {
    // Test when one output feeds multiple downstream channels
  });
});

describe('RiverChannelExtractor', () => {
  it('extracts river channels from Tiled map', () => {
    const mockTiledData = createMockTiledMapWithRiver();
    const puzzleRegions = new Map([
      ['puzzle-A', { 
        bounds: { tileX: 0, tileY: 0, width: 4, height: 1 }, 
        edgeTiles: [{ x: 3, y: 0, edge: 'E' }] 
      }],
      ['puzzle-B', { 
        bounds: { tileX: 8, tileY: 0, width: 4, height: 1 }, 
        edgeTiles: [{ x: 0, y: 0, edge: 'W' }] 
      }]
    ]);
    
    const channels = RiverChannelExtractor.extractChannels(
      mockTiledData,
      'flowingWater',
      puzzleRegions
    );
    
    expect(channels.length).toBeGreaterThan(0);
    expect(channels[0].sourcePuzzleID).toBe('puzzle-A');
    expect(channels[0].targetPuzzleID).toBe('puzzle-B');
    expect(channels[0].sourceWorldTileX).toBe(3); // World tile coordinates
  });
});
```

### 2.4 OverworldGameState Enhancements

**Purpose**: Extend existing `OverworldGameState` to track FlowPuzzle-specific state and coordinate water propagation.

**New Fields**:

```typescript
import type { GridKey } from '@model/puzzle/FlowTypes';

export class OverworldGameState {
  // Existing fields...
  
  // NEW: Track solved FlowPuzzles and their edge outputs (local coordinates)
  private flowPuzzleOutputs: Map<string, { x: number; y: number }[]> = new Map();
  
  // NEW: Cache of computed edge inputs for each FlowPuzzle (local coordinates)
  private flowPuzzleInputs: Map<string, { x: number; y: number }[]> = new Map();
  
  // NEW: Current water state of overworld river tiles (world tile coordinates)
  private overworldWaterState: Set<GridKey> = new Set();
  
  // NEW: Instance of water propagation engine
  private waterPropagation?: WaterPropagationEngine;
  
  // NEW: Reference to overworld puzzle manager (for bounds lookup)
  private puzzleManager?: OverworldPuzzleManager;
}
```

**New Methods**:

```typescript
/**
 * Initialize water propagation system with river channels and puzzle manager.
 * Called once at game load after Tiled map is parsed.
 */
initializeWaterPropagation(
  waterPropagation: WaterPropagationEngine,
  puzzleManager: OverworldPuzzleManager
): void {
  this.waterPropagation = waterPropagation;
  this.puzzleManager = puzzleManager;
}

/**
 * Update water propagation when a FlowPuzzle's state changes.
 * Returns the tiles that changed state (for view updates).
 * All coordinates are in tile units (world tile coordinates).
 * 
 * This is called:
 * - When player places/removes a bridge in active FlowPuzzle (real-time updates)
 * - When player exits a solved FlowPuzzle (final baking)
 */
updateFlowPuzzleWaterState(
  puzzleID: string,
  puzzle: FlowPuzzle
): {
  flooded: Set<GridKey>; // World tile keys that now have water
  drained: Set<GridKey>; // World tile keys that are now drained
  affectedPuzzles: Map<string, { x: number; y: number }[]>; // Puzzle ID → new edge inputs
} {
  if (!this.waterPropagation || !this.puzzleManager) {
    throw new Error('Water propagation not initialized');
  }
  
  // 1. Get puzzle bounds (in tile coordinates)
  const bounds = this.puzzleManager.getPuzzleBounds(puzzleID);
  if (!bounds) {
    throw new Error(`No bounds for puzzle ${puzzleID}`);
  }
  
  // Convert pixel bounds to tile bounds
  const tileBounds = {
    tileX: Math.floor(bounds.x / 32), // Assuming 32px tile size (view layer constant)
    tileY: Math.floor(bounds.y / 32),
    width: Math.floor(bounds.width / 32),
    height: Math.floor(bounds.height / 32)
  };
  
  // 2. Get edge outputs from puzzle (local coordinates)
  const localOutputs = puzzle.getEdgeOutput();
  
  // 3. Store outputs for this puzzle
  this.flowPuzzleOutputs.set(puzzleID, localOutputs);
  
  // 4. Compute propagation through river channels
  const propagation = this.waterPropagation.computePropagation(
    puzzleID,
    localOutputs,
    tileBounds
  );
  
  // 5. Update overworld water state
  // Remove old water tiles
  const oldTiles = new Set(this.overworldWaterState);
  
  // Add new flooded tiles
  for (const tile of propagation.flooded) {
    this.overworldWaterState.add(tile);
    oldTiles.delete(tile); // Not changed if already had water
  }
  
  // Remove drained tiles
  for (const tile of propagation.drained) {
    this.overworldWaterState.delete(tile);
  }
  
  // 6. Update edge inputs for affected puzzles
  for (const [targetPuzzleID, inputs] of propagation.downstreamInputs) {
    this.flowPuzzleInputs.set(targetPuzzleID, inputs);
  }
  
  return {
    flooded: propagation.flooded,
    drained: propagation.drained,
    affectedPuzzles: propagation.downstreamInputs
  };
}

/**
 * Get computed edge inputs for a FlowPuzzle when it's entered.
 * Used by controller to call puzzle.setEdgeInputs().
 */
getFlowPuzzleInputs(puzzleID: string): { x: number; y: number }[] {
  return this.flowPuzzleInputs.get(puzzleID) ?? [];
}

/**
 * Check if a world tile currently has water.
 * Coordinates are in world tile units.
 */
tileHasWater(worldTileX: number, worldTileY: number): boolean {
  return this.overworldWaterState.has(gridKey(worldTileX, worldTileY));
}

/**
 * Get all world tiles that currently have water (as GridKeys).
 */
getWaterTiles(): GridKey[] {
  return Array.from(this.overworldWaterState);
}
```

**Persistence**:

Both bridges AND water state must persist across game sessions. Extend `exportState()` and `importState()`:

```typescript
exportState(): {
  // ... existing fields (activePuzzleId, puzzleProgress, completedPuzzles)
  
  // NEW: FlowPuzzle water state
  flowPuzzleOutputs: Record<string, { x: number; y: number }[]>;
  flowPuzzleInputs: Record<string, { x: number; y: number }[]>;
  overworldWaterState: string[]; // Array of GridKey strings ("worldTileX,worldTileY")
}

importState(state: { ... }): void {
  // ... existing logic
  
  // Restore flow puzzle water state
  if (state.flowPuzzleOutputs) {
    this.flowPuzzleOutputs = new Map(Object.entries(state.flowPuzzleOutputs));
  }
  if (state.flowPuzzleInputs) {
    this.flowPuzzleInputs = new Map(Object.entries(state.flowPuzzleInputs));
  }
  if (state.overworldWaterState) {
    // Import GridKeys from saved strings
    this.overworldWaterState = new Set(state.overworldWaterState as GridKey[]);
  }
  
  // After restoring state, recompute water visuals if needed
  // This ensures the overworld displays correctly on load
}
```

**Alternative**: Store only puzzle states and recompute everything on load. This is simpler but slower:

```typescript
// On load, after restoring puzzle states:
for (const [puzzleID, puzzle] of this.puzzleProgress) {
  if (puzzle instanceof FlowPuzzle) {
    // Recompute water propagation
    this.updateFlowPuzzleWaterState(puzzleID, puzzle);
  }
}
```

**Testing**:

```typescript
describe('OverworldGameState FlowPuzzle integration', () => {
  it('stores and retrieves flow puzzle outputs', () => {
    const state = new OverworldGameState();
    const outputs = [{ x: 2, y: 0 }, { x: 3, y: 0 }];
    
    const mockPuzzle = createMockFlowPuzzle(outputs);
    state.updateFlowPuzzleWaterState('river-1', mockPuzzle);
    
    const retrieved = state.getFlowPuzzleInputs('river-1');
    expect(retrieved).toBeDefined();
  });
  
  it('real-time updates: propagates water during puzzle solving', () => {
    // Test that water propagation works when puzzle state changes mid-solve
    const state = new OverworldGameState();
    const puzzle = createMockFlowPuzzle([{ x: 2, y: 0 }]);
    
    // First update
    const changes1 = state.updateFlowPuzzleWaterState('river-1', puzzle);
    expect(changes1.flooded.size).toBeGreaterThan(0);
    
    // Player places bridge, water state changes
    puzzle.placeBridge('bridge-1', { x: 1, y: 0 }, { x: 1, y: 2 });
    
    // Second update shows different tiles
    const changes2 = state.updateFlowPuzzleWaterState('river-1', puzzle);
    expect(changes2.drained.size).toBeGreaterThan(0);
  });
  
  it('exports and imports flow puzzle state correctly', () => {
    const state = new OverworldGameState();
    // ... setup state
    
    const exported = state.exportState();
    expect(exported.flowPuzzleOutputs).toBeDefined();
    expect(exported.overworldWaterState).toBeDefined();
    
    const newState = new OverworldGameState();
    newState.importState(exported);
    // Verify state was restored correctly
  });
});
```

---

## 3. Controller Layer Enhancements

### 3.1 OverworldPuzzleController Refactoring

**Purpose**: Make `OverworldPuzzleController` extensible for FlowPuzzle-specific logic without code duplication.

**Key Changes**: Extract renderer creation and puzzle host creation into overridable methods.

```typescript
export class OverworldPuzzleController {
  // ... existing fields
  
  /**
   * Enter puzzle solving mode for a specific puzzle.
   * Now calls template methods for extension points.
   */
  public async enterPuzzle(
    puzzleId: string,
    onModeChange: (mode: 'puzzle') => void
  ): Promise<void> {
    console.log(`OverworldPuzzleController: Entering puzzle: ${puzzleId}`);
    
    // ... existing validation and setup code
    
    const puzzle = this.puzzleManager.getPuzzleById(puzzleId);
    if (!puzzle) {
      throw new Error(`Puzzle not found: ${puzzleId}`);
    }
    
    const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
    if (!puzzleBounds) {
      throw new Error(`No bounds found for puzzle: ${puzzleId}`);
    }
    
    try {
      // Set active puzzle in game state
      this.gameState.setActivePuzzle(puzzleId, puzzle);
      this.currentPuzzleId = puzzleId;
      
      const boundsRect = new Phaser.Geom.Rectangle(
        puzzleBounds.x,
        puzzleBounds.y,
        puzzleBounds.width,
        puzzleBounds.height
      );
      
      // Apply puzzle-specific setup BEFORE entering (extension point)
      await this.beforeEnterPuzzle(puzzleId, puzzle, boundsRect);
      
      // Blank puzzle region
      if (this.bridgeManager) {
        this.bridgeManager.blankPuzzleRegion(puzzleId, boundsRect);
      }
      
      // Notify view to enter puzzle mode
      onModeChange('puzzle');
      
      // Camera transition
      this.cameraManager.storeCameraState();
      await this.cameraManager.transitionToPuzzle(boundsRect);
      
      // Create renderer (extension point - can be overridden)
      this.puzzleRenderer = this.createPuzzleRenderer(boundsRect);
      
      // Create puzzle controller with host callbacks
      this.activePuzzleController = new PuzzleController(
        puzzle,
        this.puzzleRenderer,
        this.createPuzzleHost(puzzleId, puzzle, boundsRect)
      );
      
      // Set up input handling
      this.puzzleInputHandler = new PuzzleInputHandler(
        this.scene,
        this.activePuzzleController,
        this.puzzleRenderer
      );
      
      // Initialize puzzle systems
      this.puzzleRenderer.init(puzzle);
      this.puzzleInputHandler.setupInputHandlers();
      this.activePuzzleController.enterPuzzle();
      
      // Update collision for bridges
      this.collisionManager.updateCollisionFromBridges(puzzle, boundsRect);
      
      // Show HUD
      PuzzleHUDManager.getInstance().enterPuzzle(
        this.scene,
        this.activePuzzleController,
        'overworld'
      );
      
      // Emit puzzle setup events for HUD
      const bridgeTypes = puzzle.getAvailableBridgeTypes();
      this.scene.events.emit('setTypes', bridgeTypes);
      
      const counts = puzzle.availableCounts();
      this.scene.events.emit('updateCounts', counts);
      
      console.log(`Successfully entered puzzle: ${puzzleId}`);
      
    } catch (error) {
      console.error(`Failed to enter puzzle: ${puzzleId}`, error);
      await this.exitPuzzle(false, () => {});
      throw error;
    }
  }
  
  /**
   * Extension point: Create puzzle renderer.
   * Subclasses can override to create specialized renderers.
   */
  protected createPuzzleRenderer(boundsRect: Phaser.Geom.Rectangle): EmbeddedPuzzleRenderer {
    return new EmbeddedPuzzleRenderer(
      this.scene,
      boundsRect,
      'sprout-tiles'
    );
  }
  
  /**
   * Extension point: Setup before entering puzzle.
   * Subclasses can override to add puzzle-specific initialization.
   */
  protected async beforeEnterPuzzle(
    puzzleId: string,
    puzzle: BridgePuzzle,
    boundsRect: Phaser.Geom.Rectangle
  ): Promise<void> {
    // Base implementation does nothing
  }
  
  /**
   * Extension point: Create puzzle host callbacks.
   * Now includes boundsRect for FlowPuzzle needs.
   */
  protected createPuzzleHost(
    puzzleId: string,
    puzzle: BridgePuzzle,
    boundsRect: Phaser.Geom.Rectangle
  ): PuzzleHost {
    return {
      loadPuzzle: (_puzzleID: string) => {
        // Already loaded
      },
      onPuzzleSolved: () => {
        console.log(`Puzzle ${puzzleId} solved!`);
        setTimeout(() => {
          (this.scene as any).exitOverworldPuzzle(true);
        }, 0);
      },
      onPuzzleExited: (success: boolean) => {
        setTimeout(() => {
          (this.scene as any).exitOverworldPuzzle(success);
        }, 0);
      },
      onBridgeCountsChanged: (counts: Record<string, number>) => {
        this.scene.events.emit('updateCounts', counts);
      }
    };
  }
  
  /**
   * Extension point: Handle puzzle solving completion.
   * Called after puzzle is solved but before exit.
   */
  protected async onPuzzleSolved(
    puzzleId: string,
    puzzle: BridgePuzzle,
    boundsRect: Phaser.Geom.Rectangle
  ): Promise<void> {
    // Base implementation does nothing
  }
}
```

### 3.2 FlowPuzzleController (Extends OverworldPuzzleController)

**Purpose**: Add FlowPuzzle-specific behavior by overriding extension points.

**Key Points**:
- No code duplication - reuses parent's enterPuzzle flow
- Only overrides specific extension points
- Gets bounds from puzzle manager, doesn't require as parameter

```typescript
export class FlowPuzzleController extends OverworldPuzzleController {
  /**
   * Override renderer creation to use FlowPuzzleRenderer
   */
  protected override createPuzzleRenderer(boundsRect: Phaser.Geom.Rectangle): FlowPuzzleRenderer {
    return new FlowPuzzleRenderer(
      this.scene,
      boundsRect,
      'sprout-tiles'
    );
  }
  
  /**
   * Override beforeEnterPuzzle to apply edge inputs
   */
  protected override async beforeEnterPuzzle(
    puzzleId: string,
    puzzle: BridgePuzzle,
    boundsRect: Phaser.Geom.Rectangle
  ): Promise<void> {
    if (puzzle instanceof FlowPuzzle) {
      // Get computed edge inputs from game state
      const edgeInputs = this.gameState.getFlowPuzzleInputs(puzzleId);
      
      // Apply edge inputs to puzzle
      if (edgeInputs.length > 0) {
        puzzle.setEdgeInputs(edgeInputs);
      }
      
      // Listen for water state changes during solving
      this.scene.events.on('flow-puzzle-water-changed', this.onWaterStateChanged, this);
    }
  }
  
  /**
   * Override puzzle host to add water propagation on solve
   */
  protected override createPuzzleHost(
    puzzleId: string,
    puzzle: BridgePuzzle,
    boundsRect: Phaser.Geom.Rectangle
  ): PuzzleHost {
    const baseHost = super.createPuzzleHost(puzzleId, puzzle, boundsRect);
    
    if (puzzle instanceof FlowPuzzle) {
      return {
        ...baseHost,
        onPuzzleSolved: () => {
          // Update water propagation before calling parent
          this.updateWaterPropagation(puzzleId, puzzle as FlowPuzzle);
          
          // Call parent's onPuzzleSolved
          baseHost.onPuzzleSolved?.();
        }
      };
    }
    
    return baseHost;
  }
  
  /**
   * Handle real-time water state changes while solving.
   * Called when player places/removes bridges.
   */
  private onWaterStateChanged(event: {
    puzzleID: string;
    flooded: string[];
    drained: string[];
  }): void {
    if (event.puzzleID !== this.currentPuzzleId) return;
    
    const puzzle = this.getActivePuzzle();
    if (!(puzzle instanceof FlowPuzzle)) return;
    
    // Update water propagation in real-time
    const changes = this.gameState.updateFlowPuzzleWaterState(
      event.puzzleID,
      puzzle
    );
    
    // Update overworld visuals for changed tiles
    this.updateOverworldWaterTiles(changes.flooded, changes.drained);
  }
  
  /**
   * Update water propagation when puzzle is solved.
   * Extracted as separate method for unit testing.
   */
  private updateWaterPropagation(puzzleID: string, puzzle: FlowPuzzle): void {
    // Update game state with new water connectivity
    const changes = this.gameState.updateFlowPuzzleWaterState(puzzleID, puzzle);
    
    // Update overworld visuals
    this.updateOverworldWaterTiles(changes.flooded, changes.drained);
    
    // Update edge inputs for affected downstream puzzles
    for (const [targetPuzzleID, inputs] of changes.affectedPuzzles) {
      const targetPuzzle = this.puzzleManager.getPuzzleById(targetPuzzleID);
      if (targetPuzzle instanceof FlowPuzzle) {
        targetPuzzle.setEdgeInputs(inputs);
      }
    }
  }
  
  /**
   * Update overworld water tile visuals.
   * Extracted for testing.
   */
  private updateOverworldWaterTiles(flooded: Set<string>, drained: Set<string>): void {
    // Call OverworldScene method to update tile visuals
    // This would be implemented in OverworldScene
    if (this.scene && typeof (this.scene as any).updateWaterTiles === 'function') {
      (this.scene as any).updateWaterTiles(
        Array.from(flooded).map(key => {
          const [x, y] = key.split(',').map(Number);
          return { worldX: x, worldY: y };
        }),
        Array.from(drained).map(key => {
          const [x, y] = key.split(',').map(Number);
          return { worldX: x, worldY: y };
        })
      );
    }
  }
  
  /**
   * Override exitPuzzle to clean up water event listeners
   */
  override async exitPuzzle(
    success: boolean,
    onModeChange: (mode: 'exploration') => void
  ): Promise<void> {
    // Clean up event listeners
    this.scene.events.off('flow-puzzle-water-changed', this.onWaterStateChanged, this);
    
    // Call parent exit logic
    await super.exitPuzzle(success, onModeChange);
  }
}
```

Extract testable logic into separate methods:

```typescript
describe('FlowPuzzleController', () => {
  describe('updateWaterPropagation', () => {
    it('updates game state with puzzle edge outputs', () => {
      // Mock controller, game state, puzzle
      // Call updateWaterPropagation
      // Verify game state was updated correctly
    });
  });
  
  describe('getAffectedPuzzles', () => {
    it('returns downstream puzzles that received new inputs', () => {
      // Test graph traversal logic
    });
  });
  
  describe('updateOverworldWaterDisplay', () => {
    it('updates collision manager for affected puzzles', () => {
      // Test coordination with collision manager
    });
  });
});
```

---

## 4. Enhanced CollisionManager

### 4.1 Current State Analysis

The existing `CollisionManager` handles binary collision (passable/blocked). For FlowPuzzles, we need multi-level walkability:

- **Blocked**: Cannot walk (water without pontoon, obstacles, trees)
- **PassableHigh**: Walkable at high level (bridges, pontoons with water)
- **PassableLow**: Walkable at low level (drained riverbed, pontoons without water)
- **Transition**: Allows movement between high and low (stairs, ramps)

### 4.2 Enhanced Implementation

**Important**: CollisionManager is a model/controller boundary class. It should work in tile coordinates, not pixel coordinates. The view layer (OverworldScene) handles pixel conversions.

Add new methods to handle `ConnectivityState` from `ConnectivityManager`:

```typescript
import type { ConnectivityState, ConnectivityTile } from '@model/ConnectivityManager';

export class CollisionManager {
  // Existing fields...
  private tileSize: number = 32; // Still needed for internal coordinate conversions
  
  // NEW: Store multi-level walkability state
  private walkabilityState: Map<string, ConnectivityState> = new Map();
  
  constructor(overworldScene: OverworldScene) {
    this.overworldScene = overworldScene;
  }
  
  /**
   * Update collision from FlowPuzzle baked connectivity.
   * Maps ConnectivityState to overworld collision.
   * 
   * @param connectivity - Connectivity tiles in puzzle-local coordinates
   * @param puzzleBounds - Puzzle bounds in pixel coordinates (from OverworldPuzzleManager)
   */
  updateFromConnectivity(
    connectivity: ConnectivityTile[],
    puzzleBounds: Phaser.Geom.Rectangle
  ): void {
    console.log(`CollisionManager: Updating from connectivity (${connectivity.length} tiles)`);
    
    for (const tile of connectivity) {
      // Convert puzzle-local tile coords to world pixel coords
      const worldPixelX = puzzleBounds.x + tile.x * this.tileSize;
      const worldPixelY = puzzleBounds.y + tile.y * this.tileSize;
      
      // Convert world pixels to world tile coordinates
      const worldTileX = Math.floor(worldPixelX / this.tileSize);
      const worldTileY = Math.floor(worldPixelY / this.tileSize);
      
      // Store walkability state
      const key = `${worldTileX},${worldTileY}`;
      this.walkabilityState.set(key, tile.state);
      
      // Map to binary collision for now (compatibility with existing player movement)
      // Later, player movement will be enhanced to read walkabilityState directly
      const hasCollision = this.mapStateToCollision(tile.state);
      this.overworldScene.setCollisionAt(worldTileX, worldTileY, hasCollision);
    }
  }
  
  /**
   * Map ConnectivityState to binary collision (temporary compatibility layer).
   * Eventually, player movement will query walkabilityState directly.
   */
  private mapStateToCollision(state: ConnectivityState): boolean {
    switch (state) {
      case ConnectivityState.Blocked:
        return true; // Collision = blocked
      case ConnectivityState.PassableHigh:
      case ConnectivityState.PassableLow:
      case ConnectivityState.Transition:
        return false; // No collision = walkable
    }
  }
  
  /**
   * Get walkability state at a tile position.
   * Used by player movement logic to determine valid movement.
   */
  getWalkabilityState(tileX: number, tileY: number): ConnectivityState {
    const key = `${tileX},${tileY}`;
    return this.walkabilityState.get(key) ?? ConnectivityState.PassableLow;
  }
  
  /**
   * Check if player can move from one tile to another.
   * Considers height levels and transitions.
   */
  canPlayerMove(
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number
  ): boolean {
    const fromState = this.getWalkabilityState(fromTileX, fromTileY);
    const toState = this.getWalkabilityState(toTileX, toTileY);
    
    // Blocked tiles are never accessible
    if (toState === ConnectivityState.Blocked) {
      return false;
    }
    
    // Transition tiles allow movement to any non-blocked tile
    if (fromState === ConnectivityState.Transition || toState === ConnectivityState.Transition) {
      return true;
    }
    
    // Can only move between tiles at the same height level
    if (fromState === toState) {
      return true;
    }
    
    // Cannot move between different height levels without transition
    return false;
  }
  
  /**
   * Clear walkability state (on puzzle reset or exit)
   */
  clearWalkabilityState(): void {
    this.walkabilityState.clear();
  }
}
```

### 4.3 Player Movement Integration

The player movement logic (currently using binary collision) needs to be updated:

```typescript
// In PlayerController or wherever player movement is handled
class PlayerMovementHandler {
  canMoveToTile(toTileX: number, toTileY: number): boolean {
    const playerTileX = Math.floor(this.player.x / 32);
    const playerTileY = Math.floor(this.player.y / 32);
    
    // Use collision manager's height-aware movement check
    return this.collisionManager.canPlayerMove(
      playerTileX,
      playerTileY,
      toTileX,
      toTileY
    );
  }
}
```

### 4.4 Testing

```typescript
describe('CollisionManager walkability', () => {
  it('maps connectivity states to collision correctly', () => {
    const manager = new CollisionManager(mockScene);
    const connectivity: ConnectivityTile[] = [
      { x: 0, y: 0, state: ConnectivityState.Blocked },
      { x: 1, y: 0, state: ConnectivityState.PassableHigh },
      { x: 2, y: 0, state: ConnectivityState.PassableLow },
      { x: 3, y: 0, state: ConnectivityState.Transition }
    ];
    
    const bounds = new Phaser.Geom.Rectangle(0, 0, 128, 32);
    manager.updateFromConnectivity(connectivity, bounds);
    
    expect(manager.getWalkabilityState(0, 0)).toBe(ConnectivityState.Blocked);
    expect(manager.getWalkabilityState(1, 0)).toBe(ConnectivityState.PassableHigh);
  });
  
  it('allows movement between same-height tiles', () => {
    const manager = new CollisionManager(mockScene);
    // Set up tiles at same height
    expect(manager.canPlayerMove(0, 0, 1, 0)).toBe(true);
  });
  
  it('blocks movement between different-height tiles without transition', () => {
    // Set up high and low tiles
    expect(manager.canPlayerMove(highX, highY, lowX, lowY)).toBe(false);
  });
  
  it('allows movement through transition tiles', () => {
    // Set up transition tile between high and low
    expect(manager.canPlayerMove(highX, highY, transitionX, transitionY)).toBe(true);
    expect(manager.canPlayerMove(transitionX, transitionY, lowX, lowY)).toBe(true);
  });
});
```

---

## 5. Integration Flow: Complete Walkthrough

### 5.1 Initial Setup (Game Load)

```
1. OverworldScene initializes, loads Tiled map
2. RiverChannelExtractor analyzes "flowingWater" layer
   - Traces river channels from FlowPuzzle edges across overworld tiles
   - Builds RiverChannel objects with tile lists (all in tile coordinates)
3. WaterPropagationEngine initialized with channels
4. OverworldGameState loads persisted state (if any)
   - Restores flowPuzzleOutputs, flowPuzzleInputs, overworldWaterState (as GridKeys)
   - If no persisted state, river channels are empty (no water)
5. OverworldGameState.initializeWaterPropagation(engine, puzzleManager)
6. For each saved FlowPuzzle with outputs:
   - Apply edge inputs to puzzle instance
   - Recompute propagation (may have changed if not saved)
   - Update overworld water tile sprites (view converts tiles to pixels)
   - Get baked connectivity and update CollisionManager
```

### 5.2 Entering a FlowPuzzle

```
1. Player interacts with FlowPuzzle trigger
2. FlowPuzzleController.enterPuzzle(puzzleID) calls parent method
3. Parent calls beforeEnterPuzzle() extension point:
   - Retrieve computed edge inputs from OverworldGameState
   - Apply edge inputs: puzzle.setEdgeInputs(inputs)
   - Puzzle internally calls recomputeWater()
   - Register for 'flow-puzzle-water-changed' event
4. Parent calls createPuzzleRenderer() extension point:
   - FlowPuzzleController returns FlowPuzzleRenderer instance
5. FlowPuzzleRenderer.init() renders initial state:
   - Base elements (islands, placed bridges)
   - Water tiles (filled or drained based on hasWater)
   - Flow arrows (only on tiles with water)
   - Pontoons, rocky tiles, obstacles
6. Player begins placing/removing bridges
```

### 5.3 Solving a FlowPuzzle (Real-Time Updates)

```
1. Player places or removes a bridge
2. FlowPuzzle.placeBridge() / removeBridge() automatically calls recomputeWater()
3. FlowPuzzleRenderer.updateFromPuzzle() detects water state changes:
   - Computes diff: which tiles newly flooded/drained
   - Emits 'flow-puzzle-water-changed' event with diff
4. FlowPuzzleController.onWaterStateChanged() event handler:
   a. Calls gameState.updateFlowPuzzleWaterState(puzzleID, puzzle)
   b. WaterPropagationEngine.computePropagation() traces water through channels
   c. Returns { flooded, drained, affectedPuzzles }
   d. Calls updateOverworldWaterTiles(flooded, drained)
5. OverworldScene.updateWaterTiles() updates visible river sprites:
   - Flooded tiles → switch to "water-filled" sprite
   - Drained tiles → switch to "drained-riverbed" sprite
   - Changes are visible IMMEDIATELY outside puzzle bounds
6. Downstream FlowPuzzles receive updated edge inputs
7. PuzzleController validates constraints continuously
8. When all constraints satisfied → onPuzzleSolved() callback
9. FlowPuzzleController.updateWaterPropagation() (final update):
   - Ensures water state is current
   - Gets baked connectivity from all affected puzzles
   - Updates CollisionManager (only on exit, not during solving)
10. Exit puzzle, player sees updated overworld with correct collision
```

### 5.4 Returning to a Previously Solved FlowPuzzle

```
1. Player re-enters a solved FlowPuzzle
2. Edge inputs are applied (from OverworldGameState cache)
3. Puzzle displays current water state based on inputs
4. Player can modify solution (add/remove bridges)
5. Real-time updates propagate as in 5.3
6. If player changes solution significantly:
   - Downstream puzzles' water may change
   - Overworld visuals update in real-time
7. On exit, final propagation and collision baking occurs
```

---

## 6. Asset Requirements

The user will provide sprite assets. Here's what's needed:

### 6.1 Water Tiles

- `water-filled.png`: Animated water surface (32x32)
- `drained-riverbed.png`: Dry riverbed texture (32x32)

### 6.2 Flow Arrows

- `flow-arrow-n.png`: North-pointing arrow (16x16, centered)
- `flow-arrow-s.png`: South-pointing arrow
- `flow-arrow-e.png`: East-pointing arrow
- `flow-arrow-w.png`: West-pointing arrow

Optional: Single arrow sprite that can be rotated

### 6.3 Special Tiles

- `pontoon.png`: Fixed floating pontoon (32x32)
- `rocky-ground.png`: Rocky tile visual (32x32)
- `obstacle.png`: Obstacle tile (32x32)

### 6.4 Sprite Loading

Update `OverworldScene.preload()` or create asset manifest:

```typescript
preload() {
  // ... existing assets
  
  // Flow puzzle assets
  this.load.image('water-filled', 'assets/tiles/water-filled.png');
  this.load.image('drained-riverbed', 'assets/tiles/drained-riverbed.png');
  this.load.image('flow-arrow-n', 'assets/tiles/flow-arrow-n.png');
  this.load.image('flow-arrow-s', 'assets/tiles/flow-arrow-s.png');
  this.load.image('flow-arrow-e', 'assets/tiles/flow-arrow-e.png');
  this.load.image('flow-arrow-w', 'assets/tiles/flow-arrow-w.png');
  this.load.image('pontoon', 'assets/tiles/pontoon.png');
  this.load.image('rocky-ground', 'assets/tiles/rocky-ground.png');
  this.load.image('obstacle', 'assets/tiles/obstacle.png');
}
```

---

## 7. Implementation Plan

### Phase 1: Model Layer (Week 1)

- [ ] Implement `RiverChannel` type definition (using GridKey)
- [ ] Implement `RiverChannelExtractor` utility for Tiled map analysis
  - [ ] Parse "flowingWater" layer
  - [ ] Trace connected components from puzzle edges
  - [ ] Build channel objects with tile lists (all tile coordinates, no pixels)
- [ ] Implement `WaterPropagationEngine` class
  - [ ] Work entirely in tile coordinates (no pixels)
  - [ ] Use `GridKey` from `FlowTypes` for coordinate keys
  - [ ] Store and query river channels
  - [ ] Compute water flow through channels
- [ ] Add unit tests for water propagation logic
  - [ ] Test channel extraction
  - [ ] Test multi-puzzle propagation
  - [ ] Verify all coordinates are tile-based
- [ ] Enhance `OverworldGameState` with FlowPuzzle methods
  - [ ] Add water state tracking fields (using GridKey)
  - [ ] Implement `updateFlowPuzzleWaterState()`
  - [ ] Implement persistence (export/import with water state)
- [ ] Add tests for state management and persistence

### Phase 2: View Layer (Week 2)

- [ ] Implement `FlowPuzzleRenderer` extending `EmbeddedPuzzleRenderer`
  - [ ] Water tile rendering (filled/drained states)
  - [ ] Flow arrow rendering (N/S/E/W overlays)
  - [ ] Pontoon, rocky, obstacle tile rendering
  - [ ] Real-time event emission: `'flow-puzzle-water-changed'`
- [ ] Add `OverworldScene.updateWaterTiles()` method
  - [ ] Update river tile sprites based on flooded/drained sets
  - [ ] Handle real-time updates during puzzle solving
- [ ] Manual testing of visuals
- [ ] Extract and unit test helper functions

### Phase 3: Controller Layer (Week 3)

- [ ] Refactor `OverworldPuzzleController` for extensibility
  - [ ] Add `createPuzzleRenderer()` extension point
  - [ ] Add `beforeEnterPuzzle()` extension point
  - [ ] Add `createPuzzleHost()` with boundsRect parameter
  - [ ] Template method pattern: no code duplication
- [ ] Implement `FlowPuzzleController` extending parent
  - [ ] Override extension points only
  - [ ] Listen for `'flow-puzzle-water-changed'` event
  - [ ] Call `updateFlowPuzzleWaterState()` on event
  - [ ] Update overworld water tiles in real-time
- [ ] Add tests for controller logic (extracted methods)
- [ ] Enhance `CollisionManager` with walkability states
  - [ ] Work in tile coordinates internally
  - [ ] Add `updateFromConnectivity()` method
  - [ ] Add height-aware movement validation
- [ ] Add tests for multi-level collision

### Phase 4: Integration & Polish (Week 4)

- [ ] Integrate all components in `OverworldScene`
  - [ ] Call `RiverChannelExtractor` at load time
  - [ ] Initialize `WaterPropagationEngine`
  - [ ] Connect event listeners
- [ ] Add overworld tile visual updates
  - [ ] Implement sprite swapping for water/riverbed
  - [ ] Test visibility of changes outside puzzle bounds
- [ ] Test real-time water propagation
  - [ ] Place bridge, verify overworld updates immediately
  - [ ] Remove bridge, verify water returns
- [ ] Update player movement logic for height-based walkability (optional)
- [ ] End-to-end testing of complete flow:
  - [ ] Enter FlowPuzzle with inputs
  - [ ] Solve puzzle with real-time overworld updates
  - [ ] Verify downstream puzzle receives inputs
  - [ ] Verify collision and visuals update correctly
  - [ ] Test persistence: save, reload, verify state
- [ ] Performance optimization (if needed)
- [ ] Polish animations and transitions
  - Verify water propagates
  - Check downstream puzzle receives inputs
  - Verify collision and visuals update
- [ ] Performance optimization (if needed)
- [ ] Polish animations and transitions

---

## 8. Future Enhancements (Out of Scope)

These are potential future improvements not included in the initial implementation:

- **Series Integration**: Connect FlowPuzzles in puzzle series with cross-puzzle water flow
- **Dynamic Water Animation**: Flowing water particles or shaders
- **Sound Effects**: Water flow sounds, dam placement feedback
- **Weather Effects**: Rain affecting water sources
- **Complex Topology**: Non-grid-aligned rivers, curved channels
- **Player Height Visualization**: Z-ordering or parallax to show high/low levels
- **Puzzle Hints**: Visual indicators for water flow direction

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Coordinate transformation errors between local/world space | High | Comprehensive unit tests, helper functions |
| Performance with many water tiles | Medium | Sprite pooling, dirty rectangles for updates |
| Phaser rendering depth issues with overlapping sprites | Medium | Explicit depth management, container hierarchy |
| Complex graph traversal bugs in water propagation | High | Pure model functions, extensive graph tests |
| Player movement not respecting height levels | High | Thorough integration testing |

### 9.2 Design Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MVC separation violations (view logic in model) | Medium | Code review, enforce no framework imports in model/ |
| Tight coupling between components | Medium | Dependency injection, well-defined interfaces |
| Difficult to test controller coordination | Medium | Extract testable methods, mock dependencies |
| Overworld visual updates not synchronized | Low | Event-driven updates, centralized state |

---

## 10. Testing Strategy Summary

### 10.1 Unit Tests (Model Layer)

- `WaterPropagationEngine`: Graph traversal, coordinate conversion
- `OverworldGameState`: State management, persistence
- Helper functions: Pure logic extraction from controllers

### 10.2 Integration Tests (Controller Layer)

- `FlowPuzzleController`: Water propagation flow, view updates
- `CollisionManager`: Walkability state management, height transitions

### 10.3 Manual/Visual Tests (View Layer)

- `FlowPuzzleRenderer`: Visual correctness, animations
- Overworld display: Water tile updates, collision visualization

### 10.4 End-to-End Tests

- Complete puzzle solving flow
- Multi-puzzle water propagation
- State persistence and restoration
- Player movement with height levels

---

## 11. Design Clarifications (Addressed from Review)

### 11.1 River Channel Connectivity

**Clarification**: Water doesn't just flow puzzle-to-puzzle at edge boundaries. River channels span many overworld tiles between FlowPuzzles.

**Solution**: 
- `RiverChannelExtractor` analyzes Tiled map "flowingWater" layer at load time
- Traces connected components from FlowPuzzle edge tiles downstream
- Stores channels as ordered lists of world tile coordinates
- `WaterPropagationEngine` uses these channels to compute water flow across the overworld

### 11.2 Real-Time Visual Updates

**Clarification**: Overworld visuals must update WHILE player is solving a FlowPuzzle, not just on exit.

**Solution**:
- `FlowPuzzleRenderer.updateFromPuzzle()` emits `'flow-puzzle-water-changed'` event
- `FlowPuzzleController` listens for this event and immediately calls `updateFlowPuzzleWaterState()`
- This propagates water changes through river channels in real-time
- `OverworldScene` updates water/riverbed tile sprites based on changes
- Collision is only baked on puzzle exit (optimization)

### 11.3 Code Reuse

**Clarification**: Don't duplicate logic between `OverworldPuzzleController` and `FlowPuzzleController`.

**Solution**:
- Refactor `OverworldPuzzleController` to use template method pattern
- Extract extension points: `createPuzzleRenderer()`, `beforeEnterPuzzle()`, `createPuzzleHost()`
- `FlowPuzzleController` only overrides these methods
- Zero code duplication in puzzle entry/exit flow

### 11.4 Model Layer Purity

**Clarification**: Model classes should never know about pixel coordinates or view-layer helpers like GridToWorldMapper.

**Solution**:
- `WaterPropagationEngine` works entirely in tile coordinates (worldTileX, worldTileY)
- All `RiverChannel` coordinates are in tile units
- `OverworldGameState` stores water state as `GridKey` (branded tile coordinate keys)
- `CollisionManager` converts from tile to pixel internally only when interfacing with OverworldScene
- View layer handles all pixel coordinate conversions
- Use `GridKey` from `FlowTypes` as branded type for coordinate keys (type safety)

### 11.5 Persistence Requirements

**Clarification**: Both bridges AND water state must persist across sessions.

**Solution**:
- `OverworldGameState.exportState()` includes:
  - `flowPuzzleOutputs`: Edge outputs for each solved puzzle
  - `flowPuzzleInputs`: Computed inputs for each puzzle
  - `overworldWaterState`: Current water state of all river tiles
- On import, can either:
  - **Option A**: Restore all state directly (faster load)
  - **Option B**: Restore puzzle states, recompute water (simpler)
- Recommended: Option A for performance

### 11.6 Scale Expectations

**Clarification**: Overworld may have 12-20 FlowPuzzles with 2-4 output edges each.

**Design Impact**:
- River channel extraction happens once at load time
- Water propagation is O(channels + puzzles), very fast
- Real-time updates only recompute affected channels
- No performance concerns at this scale

---

## 12. Updated Open Questions

~~1. **Puzzle boundaries**: How are neighboring FlowPuzzle boundaries defined in Tiled map?~~
   - **ANSWERED**: River channels span overworld tiles, extracted from "flowingWater" layer

~~2. **Performance**: What's the maximum number of FlowPuzzles expected in an overworld?~~
   - **ANSWERED**: 12-20 FlowPuzzles, no performance concerns

3. **Player Z-index**: How should player sprite depth change when moving between high/low areas?
   - **ANSWERED**: No visual distinction needed (gameplay only)

~~4. **Water animation**: Static sprites or animated?~~
   - **ANSWERED**: Static initially, no animation needed yet

~~5. **Bridge baking persistence**: Should baked bridges persist across game sessions?~~
   - **ANSWERED**: Yes, both bridges AND water state persist

---

## 13. Conclusion

This architectural specification provides a comprehensive design for integrating FlowPuzzles into the Archipelago overworld, **updated based on review feedback**. The design maintains clean MVC separation, prioritizes testability, and follows established patterns in the codebase.

Key design decisions:

- **River channel model**: Water flows across many overworld tiles between puzzles, not just at boundaries. `RiverChannelExtractor` analyzes Tiled map at load time to build connectivity graph.
- **Real-time updates**: Water propagation happens DURING puzzle solving, not just on exit. FlowPuzzleRenderer emits events, controller updates overworld visuals immediately.
- **Pure model logic**: `WaterPropagationEngine` is framework-agnostic, **works entirely in tile coordinates** (not pixels), fully unit-testable.
- **Branded types**: Use `GridKey` from `FlowTypes` for type-safe tile coordinate keys throughout model layer.
- **Model layer purity**: Model classes never reference pixel coordinates or view helpers like `GridToWorldMapper`. All coordinates are tile-based.
- **Code reuse**: `OverworldPuzzleController` refactored with template method pattern. `FlowPuzzleController` only overrides extension points, zero duplication.
- **Renderer extension**: `FlowPuzzleRenderer` builds on `EmbeddedPuzzleRenderer` for code reuse.
- **Collision enhancement**: `CollisionManager` uses tile coordinates internally, enhanced without breaking existing functionality.
- **Persistence**: Both bridges AND water state persist across sessions via `OverworldGameState.exportState()`.

The implementation plan breaks down the work into manageable phases, each with clear deliverables and tests. This approach minimizes integration risk and allows for iterative refinement.

### Key Architectural Improvements from Review

1. **Water spans overworld tiles**: Not just puzzle-to-puzzle connections
2. **Real-time visual feedback**: Updates visible during puzzle solving
3. **Template method pattern**: Extensibility without duplication
4. **Model layer purity**: Tile coordinates only, no pixel logic or view dependencies
5. **Type safety**: GridKey branded type for coordinate keys
