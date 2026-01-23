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

### 1.3 Rendering Details

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

### 1.4 Animation Support

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

### 1.5 Testing Strategy

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

### 2.1 WaterPropagationEngine (New Class)

**Purpose**: Pure model logic for computing water connectivity across multiple FlowPuzzles.

**Location**: `src/model/overworld/WaterPropagationEngine.ts`

**Responsibilities**:
- Map edge outputs from solved puzzles to edge inputs of neighboring puzzles
- Handle coordinate transformations between puzzle-local and world coordinates
- Compute global water state by traversing puzzle graph
- Provide deterministic, testable water propagation

```typescript
/**
 * Pure model class for computing water propagation across overworld FlowPuzzles.
 * Uses graph traversal to determine which puzzles receive water from upstream sources.
 */
export class WaterPropagationEngine {
  /**
   * Represents a puzzle's position and water input/output edges in world coordinates
   */
  interface PuzzleNode {
    puzzleID: string;
    bounds: { x: number; y: number; width: number; height: number };
    edgeOutputs: { worldX: number; worldY: number }[]; // World coordinates
  }
  
  /**
   * Map of edges between puzzles. Key is world coordinate, value is list of puzzles
   * that have an edge at that coordinate.
   */
  private edgeMap: Map<string, string[]> = new Map();
  
  /**
   * Builds the edge connectivity graph from a set of puzzle nodes
   */
  buildConnectivityGraph(nodes: PuzzleNode[]): void {
    // For each puzzle's edge outputs, find which puzzles have inputs at same world coords
    // Build bi-directional mapping
  }
  
  /**
   * Given a solved puzzle with new edge outputs, compute updated inputs for connected puzzles.
   * Returns map of puzzleID → list of edge input coordinates (in puzzle-local space).
   */
  computePropagation(
    sourcePuzzleID: string,
    sourceEdgeOutputs: { worldX: number; worldY: number }[],
    allNodes: PuzzleNode[]
  ): Map<string, { x: number; y: number }[]> {
    const result = new Map<string, { x: number; y: number }[]>();
    
    // For each output edge from source puzzle:
    // 1. Convert to world coordinates
    // 2. Look up which puzzles have inputs at those world coordinates
    // 3. Convert back to target puzzle's local coordinates
    // 4. Accumulate inputs per target puzzle
    
    return result;
  }
  
  /**
   * Helper: Convert puzzle-local coordinates to world coordinates
   */
  static localToWorld(
    localX: number, 
    localY: number, 
    bounds: { x: number; y: number }
  ): { worldX: number; worldY: number } {
    // Assuming each puzzle grid cell = 32px world units
    const tileSize = 32;
    return {
      worldX: bounds.x + localX * tileSize,
      worldY: bounds.y + localY * tileSize
    };
  }
  
  /**
   * Helper: Convert world coordinates to puzzle-local coordinates
   */
  static worldToLocal(
    worldX: number,
    worldY: number,
    bounds: { x: number; y: number }
  ): { x: number; y: number } | null {
    const tileSize = 32;
    const localX = Math.floor((worldX - bounds.x) / tileSize);
    const localY = Math.floor((worldY - bounds.y) / tileSize);
    
    // Validate that coordinates are within puzzle bounds
    if (localX < 0 || localY < 0) return null;
    
    return { x: localX, y: localY };
  }
}
```

**Testing**:

```typescript
describe('WaterPropagationEngine', () => {
  it('propagates water from upstream puzzle to downstream puzzle', () => {
    const engine = new WaterPropagationEngine();
    
    const upstream: PuzzleNode = {
      puzzleID: 'river-top',
      bounds: { x: 0, y: 0, width: 96, height: 32 },
      edgeOutputs: [{ worldX: 96, worldY: 16 }] // Right edge, middle row
    };
    
    const downstream: PuzzleNode = {
      puzzleID: 'river-middle',
      bounds: { x: 96, y: 0, width: 96, height: 32 },
      edgeOutputs: []
    };
    
    const propagation = engine.computePropagation(
      'river-top',
      upstream.edgeOutputs,
      [upstream, downstream]
    );
    
    expect(propagation.get('river-middle')).toEqual([
      { x: 0, y: 0 } // Left edge of downstream puzzle
    ]);
  });
  
  it('handles multiple connected puzzles in a river network', () => {
    // Test complex graph with branches and joins
  });
  
  it('converts coordinates correctly between local and world space', () => {
    const bounds = { x: 64, y: 128 };
    const world = WaterPropagationEngine.localToWorld(2, 3, bounds);
    expect(world).toEqual({ worldX: 128, worldY: 224 });
    
    const local = WaterPropagationEngine.worldToLocal(128, 224, bounds);
    expect(local).toEqual({ x: 2, y: 3 });
  });
});
```

### 2.2 OverworldGameState Enhancements

**Purpose**: Extend existing `OverworldGameState` to track FlowPuzzle-specific state.

**New Fields**:

```typescript
export class OverworldGameState {
  // Existing fields...
  
  // NEW: Track solved FlowPuzzles and their edge outputs
  private flowPuzzleOutputs: Map<string, { x: number; y: number }[]> = new Map();
  
  // NEW: Cache of computed edge inputs for each FlowPuzzle
  private flowPuzzleInputs: Map<string, { x: number; y: number }[]> = new Map();
  
  // NEW: Instance of water propagation engine
  private waterPropagation: WaterPropagationEngine = new WaterPropagationEngine();
}
```

**New Methods**:

```typescript
/**
 * Update water propagation when a FlowPuzzle is solved.
 * Extracts edge outputs, propagates to connected puzzles, updates inputs.
 */
updateFlowPuzzleWaterState(
  puzzleID: string,
  puzzle: FlowPuzzle,
  puzzleBounds: { x: number; y: number; width: number; height: number }
): void {
  // 1. Get edge outputs from solved puzzle (local coordinates)
  const localOutputs = puzzle.getEdgeOutput();
  
  // 2. Convert to world coordinates using puzzle bounds
  const worldOutputs = localOutputs.map(({ x, y }) => 
    WaterPropagationEngine.localToWorld(x, y, puzzleBounds)
  );
  
  // 3. Store outputs
  this.flowPuzzleOutputs.set(puzzleID, localOutputs);
  
  // 4. Compute propagation to connected puzzles
  const allNodes = this.buildPuzzleNodeList();
  const propagation = this.waterPropagation.computePropagation(
    puzzleID,
    worldOutputs,
    allNodes
  );
  
  // 5. Update edge inputs for affected puzzles
  for (const [targetPuzzleID, inputs] of propagation) {
    this.flowPuzzleInputs.set(targetPuzzleID, inputs);
  }
}

/**
 * Get computed edge inputs for a FlowPuzzle when it's entered.
 * Used by controller to call puzzle.setEdgeInputs().
 */
getFlowPuzzleInputs(puzzleID: string): { x: number; y: number }[] {
  return this.flowPuzzleInputs.get(puzzleID) ?? [];
}

/**
 * Get edge outputs for a solved FlowPuzzle.
 */
getFlowPuzzleOutputs(puzzleID: string): { x: number; y: number }[] {
  return this.flowPuzzleOutputs.get(puzzleID) ?? [];
}

/**
 * Helper: Build list of all FlowPuzzle nodes with bounds and outputs.
 * Requires access to OverworldPuzzleManager to get puzzle bounds.
 */
private buildPuzzleNodeList(): PuzzleNode[] {
  // Implementation would iterate through all puzzles and build node list
  // Requires coordination with OverworldPuzzleManager
}
```

**Persistence**:

Extend `exportState()` and `importState()` to include water propagation state:

```typescript
exportState(): {
  // ... existing fields
  flowPuzzleOutputs: Record<string, { x: number; y: number }[]>;
  flowPuzzleInputs: Record<string, { x: number; y: number }[]>;
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
}
```

**Testing**:

```typescript
describe('OverworldGameState FlowPuzzle integration', () => {
  it('stores and retrieves flow puzzle outputs', () => {
    const state = new OverworldGameState();
    const outputs = [{ x: 2, y: 0 }, { x: 3, y: 0 }];
    
    // Simulate solving a puzzle
    const mockPuzzle = createMockFlowPuzzle(outputs);
    state.updateFlowPuzzleWaterState('river-1', mockPuzzle, {
      x: 0, y: 0, width: 128, height: 32
    });
    
    expect(state.getFlowPuzzleOutputs('river-1')).toEqual(outputs);
  });
  
  it('propagates water to downstream puzzles', () => {
    // Test multi-puzzle propagation
  });
  
  it('exports and imports flow puzzle state correctly', () => {
    // Test persistence
  });
});
```

---

## 3. Controller Layer: FlowPuzzleController

### 3.1 Purpose

Extends `OverworldPuzzleController` to handle FlowPuzzle-specific interactions:
- Apply edge inputs when entering a FlowPuzzle
- Trigger water propagation when puzzle is solved
- Update view based on water state changes
- Coordinate with enhanced collision manager

### 3.2 Class Definition

```typescript
/**
 * Controller for FlowPuzzle-specific overworld interactions.
 * Extends OverworldPuzzleController to add water propagation coordination.
 */
export class FlowPuzzleController extends OverworldPuzzleController {
  private flowRenderer?: FlowPuzzleRenderer;
  
  /**
   * Override enterPuzzle to handle FlowPuzzle-specific setup
   */
  override async enterPuzzle(
    puzzleID: string,
    onModeChange: (mode: 'puzzle') => void
  ): Promise<void> {
    const puzzle = this.puzzleManager.getPuzzleById(puzzleID);
    
    // Check if this is a FlowPuzzle
    if (puzzle instanceof FlowPuzzle) {
      await this.enterFlowPuzzle(puzzleID, puzzle, onModeChange);
    } else {
      // Delegate to parent for regular BridgePuzzles
      await super.enterPuzzle(puzzleID, onModeChange);
    }
  }
  
  /**
   * Enter a FlowPuzzle with water propagation setup
   */
  private async enterFlowPuzzle(
    puzzleID: string,
    puzzle: FlowPuzzle,
    onModeChange: (mode: 'puzzle') => void
  ): Promise<void> {
    // Get computed edge inputs from game state
    const edgeInputs = this.gameState.getFlowPuzzleInputs(puzzleID);
    
    // Apply edge inputs to puzzle before entering
    if (edgeInputs.length > 0) {
      puzzle.setEdgeInputs(edgeInputs);
    }
    
    // Get puzzle bounds
    const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleID);
    if (!puzzleBounds) {
      throw new Error(`No bounds found for puzzle: ${puzzleID}`);
    }
    
    const boundsRect = new Phaser.Geom.Rectangle(
      puzzleBounds.x,
      puzzleBounds.y,
      puzzleBounds.width,
      puzzleBounds.height
    );
    
    // Set active puzzle in game state
    this.gameState.setActivePuzzle(puzzleID, puzzle);
    this.currentPuzzleId = puzzleID;
    
    // Blank puzzle region
    if (this.bridgeManager) {
      this.bridgeManager.blankPuzzleRegion(puzzleID, boundsRect);
    }
    
    // Notify view
    onModeChange('puzzle');
    
    // Camera transition
    this.cameraManager.storeCameraState();
    await this.cameraManager.transitionToPuzzle(boundsRect);
    
    // Create FlowPuzzleRenderer instead of EmbeddedPuzzleRenderer
    this.flowRenderer = new FlowPuzzleRenderer(
      this.scene,
      boundsRect,
      'sprout-tiles'
    );
    this.puzzleRenderer = this.flowRenderer;
    
    // Continue with standard puzzle setup...
    this.activePuzzleController = new PuzzleController(
      puzzle,
      this.flowRenderer,
      this.createFlowPuzzleHost(puzzleID, puzzle, boundsRect)
    );
    
    // ... rest of setup (input handler, HUD, etc.)
  }
  
  /**
   * Create puzzle host with FlowPuzzle-specific callbacks
   */
  private createFlowPuzzleHost(
    puzzleID: string,
    puzzle: FlowPuzzle,
    bounds: Phaser.Geom.Rectangle
  ): PuzzleHost {
    return {
      ...this.createPuzzleHost(puzzleID),
      
      onPuzzleSolved: () => {
        console.log(`FlowPuzzle ${puzzleID} solved!`);
        
        // Extract and store edge outputs
        this.updateWaterPropagation(puzzleID, puzzle, bounds);
        
        // Call parent's onPuzzleSolved via scene
        setTimeout(() => {
          (this.scene as any).exitOverworldPuzzle(true);
        }, 0);
      }
    };
  }
  
  /**
   * Update water propagation when puzzle is solved.
   * Extracted as separate method for unit testing.
   */
  updateWaterPropagation(
    puzzleID: string,
    puzzle: FlowPuzzle,
    bounds: Phaser.Geom.Rectangle
  ): void {
    const boundsObj = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    
    // Update game state with new water connectivity
    this.gameState.updateFlowPuzzleWaterState(puzzleID, puzzle, boundsObj);
    
    // Get affected puzzles (those that received new inputs)
    const affectedPuzzles = this.getAffectedPuzzles(puzzleID);
    
    // Update their water state in the overworld
    this.updateOverworldWaterDisplay(affectedPuzzles);
  }
  
  /**
   * Get list of puzzles affected by water propagation.
   * Extracted for testing.
   */
  getAffectedPuzzles(sourcePuzzleID: string): string[] {
    // Query game state or water propagation engine
    // Return list of puzzle IDs that received new edge inputs
    return [];
  }
  
  /**
   * Update overworld display for puzzles with changed water state.
   * Extracted for testing.
   */
  updateOverworldWaterDisplay(puzzleIDs: string[]): void {
    // For each affected puzzle:
    // - Get its baked connectivity
    // - Update collision manager
    // - Update visual tiles in overworld scene
    
    for (const puzzleID of puzzleIDs) {
      const puzzle = this.puzzleManager.getPuzzleById(puzzleID);
      if (puzzle instanceof FlowPuzzle) {
        const bounds = this.puzzleManager.getPuzzleBounds(puzzleID);
        if (bounds) {
          this.updatePuzzleOverworldDisplay(puzzleID, puzzle, bounds);
        }
      }
    }
  }
  
  /**
   * Update overworld display for a single FlowPuzzle.
   * Called after water propagation affects the puzzle.
   */
  private updatePuzzleOverworldDisplay(
    puzzleID: string,
    puzzle: FlowPuzzle,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    // Get baked connectivity
    const connectivity = puzzle.getBakedConnectivity();
    
    // Update collision manager
    const boundsRect = new Phaser.Geom.Rectangle(
      bounds.x, bounds.y, bounds.width, bounds.height
    );
    this.collisionManager.updateFromConnectivity(connectivity, boundsRect);
    
    // Update visual tiles (water/mud sprites) in OverworldScene
    // This would require a method on OverworldScene to update tile visuals
    // e.g., this.scene.updateFlowTiles(puzzleID, connectivity);
  }
  
  /**
   * Override exitPuzzle to handle FlowPuzzle-specific cleanup
   */
  override async exitPuzzle(
    success: boolean,
    onModeChange: (mode: 'exploration') => void
  ): Promise<void> {
    const activeData = this.gameState.getActivePuzzle();
    
    if (activeData && activeData.puzzle instanceof FlowPuzzle && success) {
      // Ensure water propagation is up to date
      const bounds = this.puzzleManager.getPuzzleBounds(activeData.id);
      if (bounds) {
        const boundsRect = new Phaser.Geom.Rectangle(
          bounds.x, bounds.y, bounds.width, bounds.height
        );
        this.updateWaterPropagation(activeData.id, activeData.puzzle, boundsRect);
      }
    }
    
    // Cleanup flow renderer
    if (this.flowRenderer) {
      this.flowRenderer.destroy();
      this.flowRenderer = undefined;
    }
    
    // Call parent exit logic
    await super.exitPuzzle(success, onModeChange);
  }
}
```

### 3.3 Testing Strategy

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

**Option A: Extend CollisionManager** (Recommended)

Add new methods to handle `ConnectivityState` from `ConnectivityManager`:

```typescript
export class CollisionManager {
  // Existing fields...
  
  // NEW: Store multi-level walkability state
  private walkabilityState: Map<string, ConnectivityState> = new Map();
  
  /**
   * Update collision from FlowPuzzle baked connectivity.
   * Maps ConnectivityState to overworld collision.
   */
  updateFromConnectivity(
    connectivity: ConnectivityTile[],
    puzzleBounds: Phaser.Geom.Rectangle
  ): void {
    console.log(`CollisionManager: Updating from connectivity (${connectivity.length} tiles)`);
    
    for (const tile of connectivity) {
      // Convert puzzle-local coordinates to world tile coordinates
      const worldX = puzzleBounds.x + tile.x * this.tileSize;
      const worldY = puzzleBounds.y + tile.y * this.tileSize;
      const tileX = Math.floor(worldX / this.tileSize);
      const tileY = Math.floor(worldY / this.tileSize);
      
      // Store walkability state
      const key = `${tileX},${tileY}`;
      this.walkabilityState.set(key, tile.state);
      
      // Map to binary collision for now (compatibility with existing player movement)
      // Later, player movement will be enhanced to read walkabilityState directly
      const hasCollision = this.mapStateToCollision(tile.state);
      this.overworldScene.setCollisionAt(tileX, tileY, hasCollision);
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

**Option B: Create Separate WalkabilityManager** (Alternative)

If multi-level walkability is complex enough, create a dedicated manager:

```typescript
export class WalkabilityManager {
  // Dedicated class for height-based walkability
  // Separate from binary collision management
}
```

**Recommendation**: Option A (extend CollisionManager) is simpler and maintains cohesion.

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
1. OverworldScene initializes
2. OverworldGameState loads persisted state (if any)
   - Restores flowPuzzleOutputs and flowPuzzleInputs
3. WaterPropagationEngine builds connectivity graph
4. For each solved FlowPuzzle:
   - Apply edge inputs to puzzle instance
   - Get baked connectivity
   - Update CollisionManager with connectivity
   - Update overworld tiles with water/mud visuals
```

### 5.2 Entering a FlowPuzzle

```
1. Player interacts with FlowPuzzle trigger
2. FlowPuzzleController.enterPuzzle(puzzleID) is called
3. Check if puzzle is FlowPuzzle type
4. Retrieve computed edge inputs from OverworldGameState
5. Apply edge inputs to puzzle: puzzle.setEdgeInputs(inputs)
   - This triggers puzzle.recomputeWater() internally
6. Create FlowPuzzleRenderer (extends EmbeddedPuzzleRenderer)
7. FlowPuzzleRenderer renders:
   - Base bridge puzzle elements (islands, bridges)
   - Water tiles (filled or drained based on hasWater)
   - Flow arrows (only on tiles with water)
   - Pontoons, rocky tiles, obstacles
8. Player solves puzzle by placing bridges (dams)
```

### 5.3 Solving a FlowPuzzle

```
1. Player places/removes bridges
2. FlowPuzzle.placeBridge() / removeBridge() triggers recomputeWater()
3. Water state updates, view refreshes
4. PuzzleController detects puzzle is solved (all constraints satisfied)
5. FlowPuzzleController.onPuzzleSolved() callback is invoked
6. Call updateWaterPropagation():
   a. Extract edge outputs from puzzle
   b. Store in OverworldGameState.flowPuzzleOutputs
   c. Call WaterPropagationEngine.computePropagation()
   d. Update flowPuzzleInputs for downstream puzzles
   e. For each affected puzzle:
      - Get baked connectivity (reflects new water state)
      - Update CollisionManager
      - Update overworld tile visuals
7. Exit puzzle and return to overworld
8. Player sees updated water state in affected areas
```

### 5.4 Returning to a Previously Solved FlowPuzzle

```
1. Player re-enters a solved FlowPuzzle
2. Edge inputs are applied (from OverworldGameState)
3. Puzzle displays current water state based on inputs
4. Player can modify solution (change bridges)
5. Water recalculates, potentially affecting downstream puzzles
6. On exit, propagation runs again to update affected areas
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

- [ ] Implement `WaterPropagationEngine` class
- [ ] Add unit tests for water propagation logic
- [ ] Enhance `OverworldGameState` with flow puzzle methods
- [ ] Add tests for state management
- [ ] Add persistence (export/import) tests

### Phase 2: View Layer (Week 2)

- [ ] Implement `FlowPuzzleRenderer` extending `EmbeddedPuzzleRenderer`
- [ ] Add water tile rendering
- [ ] Add flow arrow rendering with animations
- [ ] Add pontoon, rocky, obstacle rendering
- [ ] Manual testing of visuals
- [ ] Extract and unit test helper functions

### Phase 3: Controller Layer (Week 3)

- [ ] Implement `FlowPuzzleController` extending `OverworldPuzzleController`
- [ ] Add water propagation coordination
- [ ] Integrate with `WaterPropagationEngine`
- [ ] Add tests for controller logic
- [ ] Enhance `CollisionManager` with walkability states
- [ ] Add tests for multi-level collision

### Phase 4: Integration & Polish (Week 4)

- [ ] Integrate all components in `OverworldScene`
- [ ] Add overworld tile visual updates
- [ ] Update player movement logic for height-based walkability
- [ ] End-to-end testing of complete flow:
  - Enter FlowPuzzle with inputs
  - Solve puzzle
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

## 11. Open Questions

1. **Puzzle boundaries**: How are neighboring FlowPuzzle boundaries defined in Tiled map?
   - Proposed: Use object layer with puzzle regions and edge markers

2. **Performance**: What's the maximum number of FlowPuzzles expected in an overworld?
   - Affects optimization strategy for water propagation

3. **Player Z-index**: How should player sprite depth change when moving between high/low areas?
   - Option A: Simple depth override based on current tile
   - Option B: Parallax effect with gradual depth transitions
   - Option C: No visual distinction (gameplay only)

4. **Water animation**: Static sprites or animated?
   - Proposed: Static initially, animated in future enhancement

5. **Bridge baking persistence**: Should baked bridges persist across game sessions?
   - Proposed: Yes, via OverworldGameState persistence

---

## Conclusion

This architectural specification provides a comprehensive design for integrating FlowPuzzles into the Archipelago overworld. The design maintains clean MVC separation, prioritizes testability, and follows established patterns in the codebase.

Key design decisions:

- **Pure model logic**: `WaterPropagationEngine` is framework-agnostic and fully unit-testable
- **Renderer extension**: `FlowPuzzleRenderer` builds on `EmbeddedPuzzleRenderer` for code reuse
- **Controller coordination**: `FlowPuzzleController` orchestrates without containing puzzle logic
- **Incremental enhancement**: Collision system enhanced without breaking existing functionality

The implementation plan breaks down the work into manageable phases, each with clear deliverables and tests. This approach minimizes integration risk and allows for iterative refinement.
