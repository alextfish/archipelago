import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { Constraint } from "./Constraint";
import type { ConstraintResult } from "./ConstraintResult";

type FlowPuzzleLike = {
  tileHasWater: (x: number, y: number) => boolean;
};

export class StartPointMustBeAlwaysDryConstraint extends Constraint {
  readonly personified = false;

  constructor(private readonly x: number, private readonly y: number) {
    super();
    this.id = `start_point_must_be_always_dry_${x}_${y}`;
    this.description = `Start point (${x}, ${y}) must stay dry`;
  }

  static fromSpec(params: { x: number; y: number }): StartPointMustBeAlwaysDryConstraint {
    return new StartPointMustBeAlwaysDryConstraint(params.x, params.y);
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    const flowPuzzle = puzzle as BridgePuzzle & Partial<FlowPuzzleLike>;
    if (typeof flowPuzzle.tileHasWater !== "function") {
      return {
        satisfied: true,
      };
    }

    const isDry = !flowPuzzle.tileHasWater(this.x, this.y);
    return {
      satisfied: isDry,
      message: isDry
        ? undefined
        : `Start point (${this.x}, ${this.y}) must remain dry.`,
    };
  }
}
