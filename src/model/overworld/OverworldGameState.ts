import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { WaterPropagationEngine } from './WaterPropagationEngine';
import type { OverworldPuzzleManager } from './OverworldPuzzleManager';
import { PlayerTranslationDictionary } from '@model/translation/PlayerTranslationDictionary';
import { ActiveGlyphTracker } from '@model/translation/ActiveGlyphTracker';
import type { PlayerOverworldDisplayItem } from './PlayerOverworldDisplay';

/**
 * Manages state persistence for overworld puzzles
 * Tracks active puzzle, progress, and completion status
 * Includes FlowPuzzle-specific water propagation state
 */
export class OverworldGameState {
    private activePuzzleId?: string;
    private activePuzzleState?: BridgePuzzle;
    private puzzleProgress: Map<string, BridgePuzzle> = new Map();
    private completedPuzzles: Set<string> = new Set();
    private unlockedDoors: Set<string> = new Set();

    /** Jewels the player has collected, keyed by colour (e.g. 'red'). */
    private collectedJewels: Map<string, number> = new Map();
    
    // FlowPuzzle-specific state
    /** Track solved FlowPuzzles and their edge outputs (local coordinates) */
    private flowPuzzleOutputs: Map<string, { x: number; y: number }[]> = new Map();
    
    /** Cache of computed edge inputs for each FlowPuzzle (local coordinates) */
    private flowPuzzleInputs: Map<string, { x: number; y: number }[]> = new Map();
    
    /** Current water state of overworld river tiles (world tile coordinates) */
    private overworldWaterState: Set<GridKey> = new Set();
    
    /** Instance of water propagation engine */
    private waterPropagation?: WaterPropagationEngine;
    
    /** Reference to overworld puzzle manager (for bounds lookup) */
    private puzzleManager?: OverworldPuzzleManager;

    /** Player-managed dictionary of glyph translations (shared across all scenes). */
    readonly translationDictionary: PlayerTranslationDictionary = new PlayerTranslationDictionary();

    /** Tracks all currently-displayed glyph sets for Translation Mode. */
    readonly glyphTracker: ActiveGlyphTracker = new ActiveGlyphTracker();

    // -----------------------------------------------------------------------
    // Interior scene tracking (for save/restore across cold starts)
    // -----------------------------------------------------------------------

    /**
     * Map key of the interior the player is currently inside, or undefined when
     * the player is in the overworld.  Persisted so that a cold-start reload can
     * resume inside the correct building.
     */
    private currentInteriorID?: string;

    /**
     * Player pixel-X when the overworld was last left to enter an interior.
     * Used by OverworldScene to restore the player's position on return.
     */
    private interiorReturnX?: number;

    /**
     * Player pixel-Y when the overworld was last left to enter an interior.
     * Used by OverworldScene to restore the player's position on return.
     */
    private interiorReturnY?: number;

    /**
     * Set the currently active overworld puzzle
     */
    setActivePuzzle(puzzleId: string, puzzle: BridgePuzzle): void {
        console.log(`OverworldGameState: Setting active puzzle ${puzzleId}`);
        this.activePuzzleId = puzzleId;
        this.activePuzzleState = puzzle;
    }

    /**
     * Get the currently active puzzle
     */
    getActivePuzzle(): { id: string; puzzle: BridgePuzzle } | null {
        if (!this.activePuzzleId || !this.activePuzzleState) {
            return null;
        }
        return {
            id: this.activePuzzleId,
            puzzle: this.activePuzzleState
        };
    }

    /**
     * Clear the active puzzle
     */
    clearActivePuzzle(): void {
        if (this.activePuzzleId && this.activePuzzleState) {
            console.log(`OverworldGameState: Saving progress for puzzle ${this.activePuzzleId}`);
            this.puzzleProgress.set(this.activePuzzleId, this.activePuzzleState);
        }

        this.activePuzzleId = undefined;
        this.activePuzzleState = undefined;
    }

    /**
     * Save progress for a puzzle
     */
    saveOverworldPuzzleProgress(puzzleId: string, puzzle: BridgePuzzle): void {
        console.log(`OverworldGameState: Saving progress for puzzle ${puzzleId} (${puzzle.bridges.length} bridges)`);
        this.puzzleProgress.set(puzzleId, puzzle);

        // Update active puzzle if it matches
        if (this.activePuzzleId === puzzleId) {
            this.activePuzzleState = puzzle;
        }
    }

    /**
     * Load saved progress for a puzzle
     */
    loadOverworldPuzzleProgress(puzzleId: string): BridgePuzzle | null {
        const saved = this.puzzleProgress.get(puzzleId);
        if (saved) {
            console.log(`OverworldGameState: Loaded progress for puzzle ${puzzleId} (${saved.bridges.length} bridges)`);
            return saved;
        }
        return null;
    }

    /**
     * Mark a puzzle as completed
     */
    markPuzzleCompleted(puzzleId: string): void {
        console.log(`OverworldGameState: Marking puzzle ${puzzleId} as completed`);
        this.completedPuzzles.add(puzzleId);

        // Remove from progress since it's completed
        this.puzzleProgress.delete(puzzleId);
    }

    /**
     * Check if a puzzle is completed
     */
    isPuzzleCompleted(puzzleId: string): boolean {
        return this.completedPuzzles.has(puzzleId);
    }

    /**
     * Clear completion status for a puzzle (when re-entering and cancelling)
     */
    clearPuzzleCompletion(puzzleId: string): void {
        console.log(`OverworldGameState: Clearing completion status for puzzle ${puzzleId}`);
        this.completedPuzzles.delete(puzzleId);
    }

    /**
     * Check if a puzzle has saved progress
     */
    hasSavedProgress(puzzleId: string): boolean {
        return this.puzzleProgress.has(puzzleId);
    }

    /**
     * Get all completed puzzle IDs
     */
    getCompletedPuzzles(): string[] {
        return Array.from(this.completedPuzzles);
    }

    /**
     * Get all puzzle IDs with saved progress
     */
    getPuzzlesWithProgress(): string[] {
        return Array.from(this.puzzleProgress.keys());
    }

    /**
     * Unlock a door by ID
     */
    unlockDoor(doorId: string): void {
        console.log(`OverworldGameState: Unlocking door ${doorId}`);
        this.unlockedDoors.add(doorId);
    }

    /**
     * Lock a door by ID (removes it from the unlocked set)
     */
    lockDoor(doorId: string): void {
        console.log(`OverworldGameState: Locking door ${doorId}`);
        this.unlockedDoors.delete(doorId);
    }

    /**
     * Check if a door is unlocked
     */
    isDoorUnlocked(doorId: string): boolean {
        return this.unlockedDoors.has(doorId);
    }

    /**
     * Get all unlocked door IDs
     */
    getUnlockedDoors(): string[] {
        return Array.from(this.unlockedDoors);
    }

    // -----------------------------------------------------------------------
    // Interior scene tracking
    // -----------------------------------------------------------------------

    /**
     * Mark the player as having entered an interior building.
     *
     * @param interiorID  Map key of the interior (e.g. `'house'`).
     * @param returnX     Overworld pixel-X where the player stood before entering.
     * @param returnY     Overworld pixel-Y where the player stood before entering.
     */
    setCurrentInterior(interiorID: string, returnX: number, returnY: number): void {
        this.currentInteriorID = interiorID;
        this.interiorReturnX = returnX;
        this.interiorReturnY = returnY;
    }

    /** Mark the player as having returned to the overworld. */
    clearCurrentInterior(): void {
        this.currentInteriorID = undefined;
        this.interiorReturnX = undefined;
        this.interiorReturnY = undefined;
    }

    /** Returns the interior map key if the player is inside a building, else undefined. */
    getCurrentInteriorID(): string | undefined {
        return this.currentInteriorID;
    }

    /**
     * Returns the overworld position the player should be placed at on return
     * from an interior, or undefined if no interior is recorded.
     */
    getInteriorReturnPosition(): { x: number; y: number } | undefined {
        if (this.interiorReturnX === undefined || this.interiorReturnY === undefined) {
            return undefined;
        }
        return { x: this.interiorReturnX, y: this.interiorReturnY };
    }

    // -----------------------------------------------------------------------
    // Jewel collection
    // -----------------------------------------------------------------------

    /**
     * Record that the player has collected one jewel of the given colour.
     */
    collectJewel(colour: string): void {
        const current = this.collectedJewels.get(colour) ?? 0;
        this.collectedJewels.set(colour, current + 1);
        console.log(`OverworldGameState: Collected ${colour} jewel (total: ${current + 1})`);
    }

    /**
     * Return the number of collected jewels of the given colour.
     * Returns 0 for unknown colours.
     */
    getJewelCount(colour: string): number {
        return this.collectedJewels.get(colour) ?? 0;
    }

    /**
     * Return a snapshot of all jewel counts as a plain object.
     * Only colours with a count > 0 are included.
     */
    getJewelCounts(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [colour, count] of this.collectedJewels) {
            if (count > 0) {
                result[colour] = count;
            }
        }
        return result;
    }

    /**
     * Return the list of display items for the exploration-mode HUD.
     * Only colours with at least one collected jewel are included.
     */
    getOverworldDisplayItems(): PlayerOverworldDisplayItem[] {
        const items: PlayerOverworldDisplayItem[] = [];
        for (const [colour, count] of this.collectedJewels) {
            if (count > 0) {
                items.push({ type: 'jewel', colour, count });
            }
        }
        return items;
    }

    /**
     * Get debug information about current state
     */
    getDebugInfo(): {
        activePuzzle?: string;
        totalProgress: number;
        totalCompleted: number;
        progressPuzzles: string[];
        completedPuzzles: string[];
    } {
        return {
            activePuzzle: this.activePuzzleId,
            totalProgress: this.puzzleProgress.size,
            totalCompleted: this.completedPuzzles.size,
            progressPuzzles: this.getPuzzlesWithProgress(),
            completedPuzzles: this.getCompletedPuzzles()
        };
    }

    /**
     * Clear all state (for testing or reset)
     */
    reset(): void {
        console.log('OverworldGameState: Resetting all state');
        this.activePuzzleId = undefined;
        this.activePuzzleState = undefined;
        this.puzzleProgress.clear();
        this.completedPuzzles.clear();
        this.unlockedDoors.clear();
        this.collectedJewels.clear();
        
        // Reset FlowPuzzle state
        this.flowPuzzleOutputs.clear();
        this.flowPuzzleInputs.clear();
        this.overworldWaterState.clear();

        // Reset interior tracking
        this.currentInteriorID = undefined;
        this.interiorReturnX = undefined;
        this.interiorReturnY = undefined;
    }
    
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
        console.log('OverworldGameState: Water propagation initialized');
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
        puzzleId: string,
        puzzle: FlowPuzzle
    ): {
        flooded: Set<GridKey>; // World tile keys that now have water
        drained: Set<GridKey>; // World tile keys that are now drained
        affectedPuzzles: Map<string, { x: number; y: number }[]>; // Puzzle ID → new edge inputs
    } {
        if (!this.waterPropagation || !this.puzzleManager) {
            console.warn('Water propagation not initialized, skipping update');
            return {
                flooded: new Set(),
                drained: new Set(),
                affectedPuzzles: new Map()
            };
        }
        
        // 1. Get puzzle bounds (in pixel coordinates)
        const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
        if (!bounds) {
            console.warn(`No bounds for puzzle ${puzzleId}`);
            return {
                flooded: new Set(),
                drained: new Set(),
                affectedPuzzles: new Map()
            };
        }
        
        // Convert pixel bounds to tile bounds (assuming 32px tile size)
        const TILE_SIZE = 32;
        const tileBounds = {
            tileX: Math.floor(bounds.x / TILE_SIZE),
            tileY: Math.floor(bounds.y / TILE_SIZE),
            width: Math.floor(bounds.width / TILE_SIZE),
            height: Math.floor(bounds.height / TILE_SIZE)
        };
        
        // 2. Get edge outputs from puzzle (local coordinates)
        const localOutputs = puzzle.getEdgeOutput();
        
        // 3. Store outputs for this puzzle
        this.flowPuzzleOutputs.set(puzzleId, localOutputs);
        
        // 4. Compute propagation through river channels
        const propagation = this.waterPropagation.computePropagation(
            puzzleId,
            localOutputs.map(o => ({ localX: o.x, localY: o.y })),
            tileBounds
        );
        
        // 5. Update overworld water state
        // Add new flooded tiles
        for (const tile of propagation.flooded) {
            this.overworldWaterState.add(tile);
        }
        
        // Remove drained tiles
        for (const tile of propagation.drained) {
            this.overworldWaterState.delete(tile);
        }
        
        // 6. Update edge inputs for affected puzzles
        for (const [targetPuzzleId, inputs] of propagation.downstreamInputs) {
            this.flowPuzzleInputs.set(targetPuzzleId, inputs);
        }
        
        console.log(`OverworldGameState: Updated water state for ${puzzleId} - flooded: ${propagation.flooded.size}, drained: ${propagation.drained.size}`);
        
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
    getFlowPuzzleInputs(puzzleId: string): { x: number; y: number }[] {
        return this.flowPuzzleInputs.get(puzzleId) ?? [];
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

    /**
     * Export state for persistence to localStorage or file
     */
    exportState(): {
        activePuzzleId?: string;
        puzzleProgress: Record<string, any>;
        completedPuzzles: string[];
        unlockedDoors: string[];
        flowPuzzleOutputs: Record<string, { x: number; y: number }[]>;
        flowPuzzleInputs: Record<string, { x: number; y: number }[]>;
        overworldWaterState: string[];
        translationDictionary: Record<string, string>;
        currentInteriorID?: string;
        interiorReturnX?: number;
        interiorReturnY?: number;
    } {
        const puzzleProgressObj: Record<string, any> = {};
        for (const [id, puzzle] of this.puzzleProgress) {
            puzzleProgressObj[id] = {
                id: puzzle.id,
                width: puzzle.width,
                height: puzzle.height,
                islands: puzzle.islands,
                bridges: puzzle.bridges,
                constraints: puzzle.constraints,
                inventory: puzzle.inventory
            };
        }

        return {
            activePuzzleId: this.activePuzzleId,
            puzzleProgress: puzzleProgressObj,
            completedPuzzles: Array.from(this.completedPuzzles),
            unlockedDoors: Array.from(this.unlockedDoors),
            flowPuzzleOutputs: Object.fromEntries(this.flowPuzzleOutputs),
            flowPuzzleInputs: Object.fromEntries(this.flowPuzzleInputs),
            overworldWaterState: Array.from(this.overworldWaterState) as string[],
            translationDictionary: Object.fromEntries(
                Array.from(this.translationDictionary.getAllTranslations()).map(
                    ([frame, text]) => [String(frame), text]
                )
            ),
            currentInteriorID: this.currentInteriorID,
            interiorReturnX: this.interiorReturnX,
            interiorReturnY: this.interiorReturnY,
        };
    }

    /**
     * Import state from persisted data
     * Note: This imports basic state only. Puzzle objects would need reconstruction.
     */
    importState(state: {
        activePuzzleId?: string;
        puzzleProgress: Record<string, any>;
        completedPuzzles: string[];
        unlockedDoors?: string[];
        flowPuzzleOutputs?: Record<string, { x: number; y: number }[]>;
        flowPuzzleInputs?: Record<string, { x: number; y: number }[]>;
        overworldWaterState?: string[];
        translationDictionary?: Record<string, string>;
        currentInteriorID?: string;
        interiorReturnX?: number;
        interiorReturnY?: number;
    }): void {
        console.log('OverworldGameState: Importing state');

        this.activePuzzleId = state.activePuzzleId;
        this.completedPuzzles = new Set(state.completedPuzzles);
        this.unlockedDoors = new Set(state.unlockedDoors || []);

        // Import FlowPuzzle water state
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

        // Import player translation dictionary
        if (state.translationDictionary) {
            this.translationDictionary.clearAll();
            for (const [frameStr, text] of Object.entries(state.translationDictionary)) {
                this.translationDictionary.setTranslation(Number(frameStr), text);
            }
        }

        // Interior tracking
        this.currentInteriorID = state.currentInteriorID;
        this.interiorReturnX = state.interiorReturnX;
        this.interiorReturnY = state.interiorReturnY;

        // Note: puzzleProgress would need to be reconstructed as BridgePuzzle objects
        // This is left as a future enhancement when persistence is fully implemented
    }
}