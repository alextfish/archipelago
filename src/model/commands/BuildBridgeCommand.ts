import type { Point } from "@model/puzzle/Point";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { Command } from "@model/commands/Command";

/**
 * BuildBridgeCommand
 * - On execute: allocates a bridge of the requested type and places it.
 * - On undo: removes the placed bridge (returns it to inventory).
 */
export class BuildBridgeCommand extends Command {
  private bridgeID: string | null = null;
  private executed = false;

  /**
   * If preallocatedBridgeId is provided, the command will use that bridge id
   * instead of calling takeBridge() when executed. This allows the controller
   * to allocate a preview bridge on first endpoint and then create a command
   * that completes placement without re-allocating.
   */
  constructor(
    private puzzle: BridgePuzzle,
    private bridgeTypeID: string,
    private start: Point,
    private end: Point,
    preallocatedBridgeID?: string
  ) {
    super();
    if (preallocatedBridgeID) this.bridgeID = preallocatedBridgeID;
  }

  execute(): void {
    if (this.executed) return;
    let bridgeIDToUse = this.bridgeID;
    if (!bridgeIDToUse) {
      const bridge = this.puzzle.takeBridgeOfType(this.bridgeTypeID);
      if (!bridge) {
        throw new Error(`No bridge available of type ${this.bridgeTypeID}`);
      }
      bridgeIDToUse = bridge.id;
      this.bridgeID = bridgeIDToUse;
    }

    console.log(`[BuildBridgeCommand] executing placeBridge id=${bridgeIDToUse} start=${this.start.x},${this.start.y} end=${this.end.x},${this.end.y}`);
    const placed = this.puzzle.placeBridge(bridgeIDToUse, this.start, this.end);
    if (!placed) {
      // If placement failed, ensure bridge is not considered allocated here
      this.bridgeID = null;
      throw new Error("Bridge placement failed");
    }

    this.executed = true;
  }

  undo(): void {
    if (!this.executed || !this.bridgeID) return;
    this.puzzle.removeBridge(this.bridgeID);
    this.executed = false;
  }

  getDescription(): string {
    return `Place bridge ${this.bridgeTypeID} at ${this.start.x},${this.start.y} -> ${this.end.x},${this.end.y}`;
  }
}
