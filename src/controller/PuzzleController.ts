// controller/PuzzleController.ts
import type { BridgePuzzle } from "../model/puzzle/BridgePuzzle";
import type { PuzzleRenderer } from "../view/PuzzleRenderer";
import type { PuzzleHost } from "./PuzzleHost";
import { PuzzleValidator } from "@model/puzzle/PuzzleValidator";
import type { BridgeType } from "@model/puzzle/BridgeType";
import type { Bridge } from "@model/puzzle/Bridge";





interface PuzzleCommand {
    execute(): void;
    undo(): void;
}

export class PuzzleController {
    private puzzle: BridgePuzzle;
    private renderer: PuzzleRenderer;
    private host: PuzzleHost
    private selectedBridgeId: string | null = null;
    private validator: PuzzleValidator;
    currentBridgeType: BridgeType | null = null;
    currentBridge: Bridge | null = null;
    pendingStart: { x: number; y: number } | null = null;
    
    // Undo/redo system
    private history: PuzzleCommand[] = [];
    private historyIndex: number = -1;

    constructor(puzzle: BridgePuzzle, renderer: PuzzleRenderer, host: PuzzleHost) {
        this.puzzle = puzzle;
        this.renderer = renderer;
        this.host = host;
        this.validator = new PuzzleValidator(puzzle);
        this.selectDefaultBridge();
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
        const currentIndex = availableBridgeTypes.findIndex(b => b.id === this.currentBridgeType!.id);
        const nextIndex = next ? (currentIndex + 1) % availableBridgeTypes.length : (currentIndex - 1 + availableBridgeTypes.length) % availableBridgeTypes.length;
        this.currentBridgeType = availableBridgeTypes[nextIndex];
        this.selectBridgeType(this.currentBridgeType!);
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
        this.pendingStart = { x, y };
        this.renderer.highlightPreviewStart(x, y);
        // Reserve nothing yet: only create/allocate the bridge when the second
        // endpoint is confirmed. For now remember the start and show preview.
    }

    /** Player attempts to place second endpoint. */
    tryPlaceSecondEndpoint(x: number, y: number) {
        if (!this.currentBridgeType || !this.pendingStart) return;
        // Allocate a real bridge of the selected type from inventory now.
        const bridge = this.puzzle.takeBridgeOfType(this.currentBridgeType.id);
        if (!bridge) {
            this.host.onNoBridgeTypeAvailable?.(this.currentBridgeType.id);
            // Keep pendingStart so the user can try another endpoint or cancel
            return;
        }
        
        const endPoint = { x, y };
        const success = this.puzzle.placeBridge(
            bridge.id,
            this.pendingStart,
            endPoint
        );
        
        if (!success) {
            // Return the bridge to inventory by clearing its end
            // (placeBridge didn't place it); there is no explicit returnBridge here
            // because bridge was not marked placed. Just flash and leave state.
            this.renderer.flashInvalidPlacement(this.pendingStart, endPoint);
            bridge.end = undefined;
            return;
        }
        
        // Placement succeeded. Clear pending state and update visuals.
        this.pendingStart = null;
        this.renderer.updateFromPuzzle(this.puzzle);
        this.autoSelectNextBridgeType();
        this.validate();
    }

    private autoSelectNextBridgeType() {
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
        this.puzzle.removeBridge(bridgeId);
        this.renderer.updateFromPuzzle(this.puzzle);
        this.autoSelectNextBridgeType();
        this.validate();
    }

    getBridgeAt(x: number, y: number): Bridge | null {
        const bridges = this.puzzle.bridgesAt(x, y);
        return bridges.length > 0 ? bridges[0] : null;
    }

    undo(): void {
        console.log('Undo requested');
        if (this.historyIndex >= 0) {
            const command = this.history[this.historyIndex];
            command.undo();
            this.historyIndex--;
            this.renderer.updateFromPuzzle(this.puzzle);
            this.validate();
        }
    }

    redo(): void {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const command = this.history[this.historyIndex];
            command.execute();
            this.renderer.updateFromPuzzle(this.puzzle);
            this.validate();
        }
    }

    validate() {
        const results = this.validator.validateAll();

        if (results.allSatisfied) {
            // puzzle solved — call host callback
            this.host.onPuzzleSolved();
        } else {
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
