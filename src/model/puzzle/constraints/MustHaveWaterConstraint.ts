import type { ConstraintResult } from "./ConstraintResult";
import type { ConstraintDisplayItem } from "./ConstraintDisplayItem";
import { Constraint } from "./Constraint";
import type { BridgePuzzle } from "../BridgePuzzle";

// Type guard to check if a puzzle has the tileHasWater method (i.e., is a FlowPuzzle)
function hasTileHasWater(puzzle: BridgePuzzle): puzzle is BridgePuzzle & { tileHasWater(x: number, y: number): boolean } {
  return typeof (puzzle as unknown as { tileHasWater?: unknown }).tileHasWater === "function";
}

export class MustHaveWaterConstraint extends Constraint {
  override readonly conversationFile = 'constraints/mustHaveWater_unsatisfied.json';
  override readonly conversationFileSolved = 'constraints/mustHaveWater_satisfied.json';

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
    // Use type guard to safely check for FlowPuzzle
    const has = hasTileHasWater(puzzle) ? puzzle.tileHasWater(this.x, this.y) : false;
    this.violations = has ? [] : [`${this.x},${this.y}`];
    return {
      satisfied: has,
      affectedElements: this.violations ?? [],
      message: has ? undefined : `Tile (${this.x},${this.y}) must have water.`,
      glyphMessage: has ? undefined : "no water",
    };
  }

  override getDisplayItems(puzzle: BridgePuzzle): ConstraintDisplayItem[] {
    const result = this.check(puzzle);
    return [{
      elementID: `${this.x},${this.y}`,
      glyphMessage: result.satisfied ? "good" : "no water",
      constraintType: 'MustHaveWaterConstraint',
      position: { x: this.x, y: this.y },
    }];
  }
}
