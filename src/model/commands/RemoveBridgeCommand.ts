import type { Point } from "@model/puzzle/Point";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { Command } from "@model/commands/Command";

/**
 * RemoveBridgeCommand
 * - On execute: captures the bridge's current placement and removes it.
 * - On undo: restores the bridge to its previous placement (same bridge id).
 */
export class RemoveBridgeCommand extends Command {
  private savedStart: Point | null = null;
  private savedEnd: Point | null = null;
  private executed = false;

  constructor(
    private puzzle: BridgePuzzle,
    private bridgeId: string
  ) {
    super();
  }

  execute(): void {
    if (this.executed) return;

    const bridge = this.puzzle.bridges.find(b => b.id === this.bridgeId);
    if (!bridge) {
      throw new Error(`No such bridge ${this.bridgeId}`);
    }

    // Capture state necessary to undo (endpoints)
    if (bridge.start && bridge.end) {
      this.savedStart = { x: bridge.start.x, y: bridge.start.y };
      this.savedEnd = { x: bridge.end.x, y: bridge.end.y };
    } else {
      // Bridge is not placed — nothing to do
      this.savedStart = null;
      this.savedEnd = null;
    }

    // Remove from puzzle (returns to inventory)
    this.puzzle.removeBridge(this.bridgeId);
    this.executed = true;
  }

  undo(): void {
    if (!this.executed) return;
    if (!this.savedStart || !this.savedEnd) {
      // nothing to restore
      this.executed = false;
      return;
    }

    // Place back the same bridge id with its prior endpoints
    this.puzzle.placeBridge(this.bridgeId, this.savedStart, this.savedEnd);
    this.executed = false;
  }

  getDescription(): string {
    return `Remove bridge ${this.bridgeId}`;
  }
}
