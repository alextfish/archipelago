// PuzzleHost: Orchestrates the session of a puzzle. Handles user input, puzzle state updates, and rendering.
// Knows about the environment, transitions, saves. Responsible for applying puzzle results to the overworld.
// Responsible for what to do on solve / exit.
import type { PuzzleRenderer } from "@view/PuzzleRenderer";

import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { PuzzleController } from "./PuzzleController";

export interface PuzzleHost {
    onPuzzleSolved(): void;
    onPuzzleExited(success: boolean): void;
    /** Possibly handle transitions (e.g., from overworld to puzzle view). */
    loadPuzzle(puzzleID: string): void;
    update?(dt: number): void;
    onNoBridgeTypeAvailable?(typeId: string): void;
    /**
     * Optional: request the host to tell HUD to set the selected bridge type.
     * Controller can call this when it changes the selection so HUD stays in sync.
     */
    setSelectedBridgeType?(typeId: string | null): void;
    /**
     * Optional: called when bridge counts change (after placement/removal/undo/redo).
     * Allows host to update the HUD with current available counts.
     */
    onBridgeCountsChanged?(counts: Record<string, number>): void;
}

// PhaserPuzzleHost: Implements PuzzleHost using Phaser for rendering and input handling.
export class PhaserPuzzleHost implements PuzzleHost {
    private puzzle: BridgePuzzle | null = null
    private renderer: PuzzleRenderer;


    /**
     * Constructs a PuzzleHost with a PuzzleController and PuzzleRenderer.
     * @param _controller The PuzzleController instance to orchestrate puzzle logic.
     * @param renderer The PuzzleRenderer instance to handle rendering.
     * Called by PuzzleScene
     */
    constructor(_controller: PuzzleController, renderer: PuzzleRenderer) {
        this.renderer = renderer;
        // Initialize scene if needed
        // this.scene = new BridgePuzzleScene();
    }

    onPuzzleSolved(): void {
        // Handle puzzle solved logic, e.g., transition to overworld or show success
        // This could trigger a scene change or update game state
    }

    onPuzzleExited(_success: boolean): void {
        // Handle puzzle exit logic, e.g., save state, transition, etc.
    }

    loadPuzzle(puzzleID: string): void {
        // Load the puzzle by its ID (this could involve fetching from a server or database)
        this.puzzle = this.fetchPuzzleByID(puzzleID);
        new PuzzleController(this.puzzle, this.renderer, this);
    }
    fetchPuzzleByID(_puzzleID: string): BridgePuzzle {
        // TODO: Implement actual puzzle fetching logic
        throw new Error("fetchPuzzleByID not implemented.");
    }

    setSelectedBridgeType?(_typeId: string | null): void {
        // Default host does nothing; scene implementations may override to notify HUD
    }
}