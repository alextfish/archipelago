import type { ConstraintResult } from "./ConstraintResult";
import { Constraint } from "./Constraint";
import type { BridgePuzzle } from "../BridgePuzzle";

export class MustHaveWaterConstraint extends Constraint {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
  }

  static fromSpec(params: { x: number; y: number }): MustHaveWaterConstraint {
    return new MustHaveWaterConstraint(params.x, params.y);
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    // FlowPuzzle extends BridgePuzzle, so cast safely at runtime
    const maybe = puzzle as unknown as { tileHasWater?: (x: number, y: number) => boolean };
    const has = typeof maybe.tileHasWater === "function" ? maybe.tileHasWater(this.x, this.y) : false;
    this.violations = has ? [] : [`${this.x},${this.y}`];
    return {
      satisfied: has,
      affectedElements: this.violations ?? [],
      message: has ? undefined : `Tile (${this.x},${this.y}) must have water.`
    };
  }
}
