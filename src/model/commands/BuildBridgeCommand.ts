import type { Point } from "@model/puzzle/Point";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { Command } from "@model/commands/Command";

/**
 * BuildBridgeCommand
 * - On execute: allocates a bridge of the requested type and places it.
 * - On undo: removes the placed bridge (returns it to inventory).
 */
export class BuildBridgeCommand extends Command {
  private bridgeId: string | null = null;
  private executed = false;

  constructor(
    private puzzle: BridgePuzzle,
    private bridgeTypeId: string,
    private start: Point,
    private end: Point
  ) {
    super();
  }

  execute(): void {
    if (this.executed) return;

    const bridge = this.puzzle.takeBridgeOfType(this.bridgeTypeId);
    if (!bridge) {
      throw new Error(`No bridge available of type ${this.bridgeTypeId}`);
    }

    this.bridgeId = bridge.id;
    const placed = this.puzzle.placeBridge(this.bridgeId, this.start, this.end);
    if (!placed) {
      // If placement failed, ensure bridge is not considered allocated here
      this.bridgeId = null;
      throw new Error("Bridge placement failed");
    }

    this.executed = true;
  }

  undo(): void {
    if (!this.executed || !this.bridgeId) return;
    this.puzzle.removeBridge(this.bridgeId);
    this.executed = false;
  }

  getDescription(): string {
    return `Place bridge ${this.bridgeTypeId} at ${this.start.x},${this.start.y} -> ${this.end.x},${this.end.y}`;
  }
}
