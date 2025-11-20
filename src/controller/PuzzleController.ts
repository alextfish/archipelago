// controller/PuzzleController.ts
import type { BridgePuzzle } from "../model/puzzle/BridgePuzzle";
import type { PuzzleRenderer } from "../view/PuzzleRenderer";
import type { PuzzleHost } from "./PuzzleHost";
import { PuzzleValidator } from "@model/puzzle/PuzzleValidator";
import type { BridgeType } from "@model/puzzle/BridgeType";
import type { Bridge } from "@model/puzzle/Bridge";
import { UndoRedoManager } from "@model/UndoRedoManager";
import { BuildBridgeCommand } from "@model/commands/BuildBridgeCommand";
import { RemoveBridgeCommand } from "@model/commands/RemoveBridgeCommand";


export class PuzzleController {
    private puzzle: BridgePuzzle;
    private renderer: PuzzleRenderer;
    private host: PuzzleHost
    private selectedBridgeId: string | null = null;
    private validator: PuzzleValidator;
    currentBridgeType: BridgeType | null = null;
    currentBridge: Bridge | null = null;
    pendingStart: { x: number; y: number } | null = null;

    // Undo/redo manager (single source of truth for history)
    private undoManager: UndoRedoManager;
    // Track whether puzzle was previously solved to detect transitions
    private wasSolved: boolean = false;

    constructor(puzzle: BridgePuzzle, renderer: PuzzleRenderer, host: PuzzleHost, undoManager?: UndoRedoManager) {
        this.puzzle = puzzle;
        this.renderer = renderer;
        this.host = host;
        this.validator = new PuzzleValidator(puzzle);
        this.selectDefaultBridge();
        this.undoManager = undoManager ?? new UndoRedoManager();
    }

    // --- Pointer-driven placement API (for drag and mouseover preview flows)
    /** Pointer down at world coords + grid coords */
    onPointerDown(_worldX: number, _worldY: number, gridX: number, gridY: number) {
        // If we've already got a pending bridge placement, this is click-and-click: ignore further pointer downs
        if (this.pendingStart) return;
        // If pointer down is on an island, begin placement (allocates a bridge)
        const island = this.puzzle.islands.find(i => i.x === gridX && i.y === gridY);
        if (island && this.currentBridgeType) {
            // allocate first endpoint and start previewing
            this.tryPlaceFirstEndpoint(gridX, gridY);
            return;
        }
        // Otherwise do nothing on pointerdown (nothing to click on in the islands)
    }

    /** Pointer move: update preview if we have a pending start */
    onPointerMove(_worldX: number, _worldY: number, gridX: number, gridY: number) {
        // Nothing to do on mouse move if we don't have a pending start
        if (!this.pendingStart || !this.currentBridgeType) return;
        // Compute preview end point depending on fixed/variable length and snapping
        const typeLength = (this.currentBridgeType.length === undefined) ? -1 : this.currentBridgeType.length ?? -1;

        const start = this.pendingStart; // grid coords
        // Candidate island under cursor
        const candidateIsland = this.puzzle.islands.find(i => i.x === gridX && i.y === gridY) ?? null;

        let previewEnd: { x: number; y: number } | undefined;
        let isDouble = false;
        let isInvalid = false;

        if (typeLength !== -1) {
            // fixed length: angle from start to cursor or island, endpoint at fixed length
            const startID = this.getIslandIDAt(start.x, start.y);
            if (candidateIsland && startID && this.puzzle.couldPlaceBridgeOfType(startID, candidateIsland.id, this.currentBridgeType!.id)) {
                // snap to island
                previewEnd = { x: candidateIsland.x, y: candidateIsland.y };
                const count = this.puzzle.getBridgeCountBetween(startID, candidateIsland.id);
                isDouble = count === 1;
            } else {
                // angle from start to cursor, endpoint = start + unit(angle)*length
                // calculate true angle to cursor point from world coordinates
                const worldStart = (this.renderer as any).gridMapper.gridToWorld(start.x, start.y);
                const angle = Math.atan2(_worldY - worldStart.y, _worldX - worldStart.x);
                previewEnd = { x: start.x + Math.cos(angle) * typeLength, y: start.y + Math.sin(angle) * typeLength };
            }
        } else {
            // variable length: snap to candidate island if it's a valid placement, else follow cursor
            if (candidateIsland) {
                const startID = this.getIslandIDAt(start.x, start.y);
                if (startID && this.puzzle.couldPlaceBridgeOfType(startID, candidateIsland.id, this.currentBridgeType!.id)) {
                    previewEnd = { x: candidateIsland.x, y: candidateIsland.y };
                    const count = this.puzzle.getBridgeCountBetween(startID, candidateIsland.id);
                    isDouble = count === 1;
                } else {
                    // invalid to place here
                    previewEnd = { x: gridX, y: gridY };
                    isInvalid = true;
                }
            } else {
                previewEnd = { x: gridX, y: gridY };
            }
        }

        // Build a temporary bridge-like object for preview
        const previewBridge: Bridge = {
            id: this.currentBridge ? this.currentBridge.id : 'preview',
            type: this.currentBridgeType,
            start: { x: start.x, y: start.y },
            end: previewEnd
        } as any;

        // Call renderer preview with double/invalid flags
        this.renderer.previewBridge(previewBridge, { isDouble, isInvalid });
    }

    /** Pointer up: attempt to finalize placement if pending start exists */
    onPointerUp(_worldX: number, _worldY: number, gridX: number, gridY: number) {
        if (!this.pendingStart) return;
        // If pointer up is on an island, attempt to finish placement
        const island = this.puzzle.islands.find(i => i.x === gridX && i.y === gridY);
        if (island) {
            // If it's the same island as start, start click-and-click placement
            if (this.pendingStart.x === gridX && this.pendingStart.y === gridY) {
                this.startClickAndClickPlacement();
                return;
            } else {
                this.tryPlaceSecondEndpoint(gridX, gridY);
                return;
            }
        }
        // Otherwise cancel placement and release allocated bridge
        if (this.currentBridge) {
            // Release allocated bridge back to inventory
            if (this.currentBridge.id) this.puzzle.inventory.returnBridge(this.currentBridge.id);
            this.currentBridge.end = undefined as any;
            this.currentBridge = null;
        }
        this.pendingStart = null;
        this.renderer.clearHighlights();
        this.renderer.setPlacing(false);
    }

    private getIslandIDAt(x: number, y: number): string | null {
        const isl = this.puzzle.islands.find(i => i.x === x && i.y === y);
        return isl ? isl.id : null;
    }

    private startClickAndClickPlacement() {
        // We don't actually need to do anything here
    }

    /** Called when player begins interacting with this puzzle. */
    enterPuzzle() {
        this.selectDefaultBridge();
        this.renderer.init(this.puzzle);
        this.renderer.updateFromPuzzle(this.puzzle);
    }

    /** Called when player leaves or cancels. */
    exitPuzzle(success: boolean) { // true = solved, false = cancelled 
        this.host.onPuzzleExited(success);
        this.renderer.destroy();
    }

    selectDefaultBridge() {
        const availableBridgeTypes = this.puzzle.getAvailableBridgeTypes();
        if (availableBridgeTypes.length > 0) {
            this.currentBridgeType = availableBridgeTypes[0];
            this.selectedBridgeId = this.currentBridgeType!.id;
            // Inform host/HUD of the new selection
            this.host.setSelectedBridgeType?.(this.currentBridgeType!.id);
        }
    }

    /** Player selects a specific bridge to place. */
    selectBridgeType(bridgeType: BridgeType) {
        this.currentBridgeType = bridgeType;
        // Keep HUD in sync
        this.host.setSelectedBridgeType?.(bridgeType.id);
    }
    nextOrPreviousBridgeType(next: boolean) {
        if (!this.currentBridgeType) {
            this.selectDefaultBridge();
            return;
        }
        const availableBridgeTypes = this.puzzle.getAvailableBridgeTypes();
        const counts = this.puzzle.availableCounts();
        if (!availableBridgeTypes.length) return;

        // If counts is empty (no availability info), fall back to simple cycling
        const hasCountsInfo = Object.keys(counts ?? {}).length > 0;

        // Find current index in list
        let currentIndex = availableBridgeTypes.findIndex(b => b.id === this.currentBridgeType!.id);
        const len = availableBridgeTypes.length;

        if (!hasCountsInfo) {
            // Simple cycle without considering availability
            const nextIndex = next ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
            this.currentBridgeType = availableBridgeTypes[nextIndex];
            this.selectBridgeType(this.currentBridgeType!);
            return;
        }

        // Start searching from next/previous index and wrap until we find an available type
        let i = 0;
        while (i < len) {
            currentIndex = next ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
            const candidate = availableBridgeTypes[currentIndex];
            const avail = counts[candidate.id] ?? 0;
            if (avail > 0) {
                this.currentBridgeType = candidate;
                this.selectBridgeType(candidate);
                return;
            }
            i++;
        }
        // No available types found — clear selection
        this.currentBridgeType = null;
        this.host.setSelectedBridgeType?.(null);
    }
    nextBridgeType() {
        this.nextOrPreviousBridgeType(true);
    }
    previousBridgeType() {
        this.nextOrPreviousBridgeType(false);
    }
    cancelPlacement() {
        this.pendingStart = null;
        this.renderer.clearHighlights();
        this.renderer.setPlacing(false);
        // Cancel any in-progress placement. We did not allocate a bridge yet
        // (allocation happens on the second endpoint), so just clear state and visuals.
    }

    tryPlaceAt(x: number, y: number) {
        if (!this.selectedBridgeId) {
            this.selectDefaultBridge();
        }
        if (!this.pendingStart) {
            this.tryPlaceFirstEndpoint(x, y);
        } else if (this.pendingStart.x === x && this.pendingStart.y === y) {
            // Clicked the same point — cancel placement
            this.cancelPlacement();
        } else {
            this.tryPlaceSecondEndpoint(x, y);
        }
    }

    /** Player attempts to place first endpoint. */
    tryPlaceFirstEndpoint(x: number, y: number) {
        if (!this.currentBridgeType) return;
        // Allocate a bridge immediately so the HUD can update and the renderer
        // can preview using the concrete bridge. If none is available, notify
        // host and don't start placement.
        const bridge = this.puzzle.takeBridgeOfType(this.currentBridgeType.id);
        if (!bridge) {
            this.host.onNoBridgeTypeAvailable?.(this.currentBridgeType.id);
            return;
        }
        bridge.start = { x, y };
        // Keep the allocated bridge until second endpoint
        this.currentBridge = bridge;
        this.pendingStart = bridge.start;
        // Enter placing mode so renderer disables clickable outlines.
        this.renderer.setPlacing(true);
        this.renderer.previewBridge(bridge);
    }

    /** Player attempts to place second endpoint. */
    tryPlaceSecondEndpoint(x: number, y: number) {
        if (!this.currentBridgeType || !this.pendingStart) return;
        // Use the bridge already allocated on first endpoint
        const bridge = this.currentBridge!;
        if (!bridge) {
            this.host.onNoBridgeTypeAvailable?.(this.currentBridgeType.id);
            // Keep pendingStart so the user can try another endpoint or cancel
            return;
        }

        const endPoint = { x, y };
        // Ensure second endpoint is on an island; placements must be island-to-island
        const islandAtEnd = this.puzzle.islands.find(i => i.x === x && i.y === y);
        if (!islandAtEnd) {
            // Not an island: fail to place but stay in placing mode
            // // cancel placement and return allocated bridge to inventory
            // if (bridge.id) {
            //     this.puzzle.inventory.returnBridge(bridge.id);
            // }
            // this.currentBridge = null;
            // this.pendingStart = null;
            // this.renderer.clearHighlights();
            return;
        }
        // Enforce maximum of two bridges between the same island pair.
        // If there are already two placed bridges between these coordinates,
        // reject the placement and give feedback.

        const startID = this.getIslandIDAt(this.pendingStart.x, this.pendingStart.y);
        if (!startID || !this.currentBridgeType ||
            !this.puzzle.couldPlaceBridgeOfType(startID, islandAtEnd.id, this.currentBridgeType.id)) {
            // Invalid according to model rules (length/multiplicity/etc.). Show feedback and return the allocated bridge.
            this.renderer.flashInvalidPlacement(this.pendingStart, endPoint);
            // Release allocated bridge
            bridge.end = undefined as any;
            if (bridge.id) this.puzzle.inventory.returnBridge(bridge.id);
            this.currentBridge = null;
            this.pendingStart = null;
            this.renderer.clearHighlights();
            this.renderer.setPlacing(false);
            return;
        }

        // Create a BuildBridgeCommand that will place the bridge. Pass the
        // preallocated bridge id so the command does not re-allocate.
        const cmd = new BuildBridgeCommand(this.puzzle, this.currentBridgeType.id, this.pendingStart!, endPoint, bridge.id);
        console.log('[PuzzleController] executing BuildBridgeCommand', { start: this.pendingStart, end: endPoint, bridgeId: bridge.id });
        try {
            this.undoManager.executeCommand(cmd);
        } catch (e) {
            // Placement failed: show invalid placement and release allocated bridge
            this.renderer.flashInvalidPlacement(this.pendingStart, endPoint);
            bridge.end = undefined;
            if (bridge.id) this.puzzle.inventory.returnBridge(bridge.id);
            this.pendingStart = null;
            this.currentBridge = null;
            this.renderer.setPlacing(false);
            return;
        }

        // Placement succeeded. Clear pending state and update visuals.
        this.pendingStart = null;
        // Clear any allocated bridge reference — it's now placed.
        this.currentBridge = null;
        this.renderer.setPlacing(false);
        this.renderer.updateFromPuzzle(this.puzzle);
        this.selectAvailableBridgeType();
        this.validate();
    }

    private selectAvailableBridgeType() {
        // If the selected type is now depleted, auto-select the next available type
        const counts = this.puzzle.availableCounts();
        const remaining = (this.currentBridgeType ? counts[this.currentBridgeType.id] : 0) ?? 0;
        if (remaining === 0) {
            const availableTypes = this.puzzle.getAvailableBridgeTypes();
            const next = availableTypes.find(t => (counts[t.id] ?? 0) > 0) ?? null;
            this.currentBridgeType = next;
            this.host.setSelectedBridgeType?.(next ? next.id : null);
        }
    }

    removeBridge(bridgeId: string) {
        this.cancelPlacement();
        const cmd = new RemoveBridgeCommand(this.puzzle, bridgeId);
        this.undoManager.executeCommand(cmd);
        this.renderer.updateFromPuzzle(this.puzzle);
        this.selectAvailableBridgeType();
        this.validate();
    }

    getBridgeAt(x: number, y: number): Bridge | null {
        const bridges = this.puzzle.bridgesAt(x, y);
        return bridges.length > 0 ? bridges[0] : null;
    }

    undo(): void {
        // Block undo when puzzle is currently solved
        if (this.wasSolved) return;
        if (this.undoManager.undo()) {
            this.renderer.updateFromPuzzle(this.puzzle);
            this.validate();
        }
    }

    redo(): void {
        // Block redo when puzzle is currently solved
        if (this.wasSolved) return;
        if (this.undoManager.redo()) {
            this.renderer.updateFromPuzzle(this.puzzle);
            this.validate();
        }
    }

    canUndo(): boolean {
        return !this.wasSolved && this.undoManager.canUndo();
    }

    canRedo(): boolean {
        return !this.wasSolved && this.undoManager.canRedo();
    }

    validate() {
        const results = this.validator.validateAll();

        // Consider puzzle solved only if there is at least one constraint and all are satisfied.
        const nowSolved = results.allSatisfied && (results.perConstraint?.length ?? 0) > 0;
        // Transition: unsolved -> solved
        if (nowSolved && !this.wasSolved) {
            this.wasSolved = true;
            // Debug log: notify host that puzzle is solved
            try {
                console.log('[PuzzleController] validate: nowSolved=true, calling host.onPuzzleSolved()');
            } catch (e) { }
            this.host.onPuzzleSolved();
        } else if (!nowSolved && this.wasSolved) {
            // Solved -> unsolved transition (clear flag)
            this.wasSolved = false;
        }

        if (!nowSolved) {
            // inform view which constraints failed
            const failed = results.perConstraint.filter(p => !p.result.satisfied);
            const affected = failed.flatMap(f => f.result.affectedElements ?? []);
            this.renderer.highlightViolations(affected);
            // and optionally show messages:
            //const messages = failed.map(f => f.result.message).filter(Boolean);
            //this.renderer.showValidationMessages(messages);
        }
    }

    update(dt: number): void {
        // Optional per-frame logic (animations, timers, etc.)
        this.renderer.update(dt);
    }
}
