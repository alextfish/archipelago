// Hold a list of all active Constraint instances.

// Provide:

// validateAll(puzzle) → array of ConstraintResult

// isSolved(puzzle) → boolean (if all constraints satisfied)

// Aggregate structured validation data so the UI can respond (flash icons, mark bridges red, etc.)

import { BridgePuzzle } from "./BridgePuzzle";
import type { ValidationResult } from "./ValidationResult";
import { Constraint } from "./constraints/Constraint";
import type { ConstraintResult } from "./constraints/ConstraintResult";

export class PuzzleValidator {
  private puzzle: BridgePuzzle;

  constructor(puzzle: BridgePuzzle) {
    this.puzzle = puzzle;
  }

   /**
   * Run every constraint attached to the puzzle and return the aggregated result.
   * This does not mutate the puzzle.
   */
  validateAll(): ValidationResult {
    const perConstraint: ValidationResult["perConstraint"] = [];

    // Defensive: puzzle.constraints may be constructed by the puzzle constructor.
    const constraints: Constraint[] = (this.puzzle as any).constraints ?? [];

    for (const c of constraints) {
      // Each constraint implements check(puzzle): ConstraintResult
      const result: ConstraintResult = c.check(this.puzzle);
      perConstraint.push({
        constraintId: (c as any).id,
        type: (c as any).constructor?.name,
        result,
      });
    }

    const unsatisfiedCount = perConstraint.reduce(
      (acc, item) => acc + (item.result.satisfied ? 0 : 1),
      0
    );

    return {
      allSatisfied: unsatisfiedCount === 0,
      perConstraint,
      unsatisfiedCount,
    };
  }

  /**
   * Convenience method: are all constraints satisfied right now?
   */
  isSolved(): boolean {
    return this.validateAll().allSatisfied;
  }
}
//   /**
//    * Validates all constraints and returns { ok, violations }
//    */
//   validateWithViolations(): { ok: boolean; violations: any[] } {
//     const results = this.validateAll(this.puzzle);
//     const ok = results.every(r => r.satisfied);
//     // Collect violations from affectedElements in each ConstraintResult
//     const violations = results
//       .map(r => r.affectedElements)
//       .filter(v => v && v.length)
//       .flat();
//     return { ok, violations };
//   }


//   validateAll() {
//     return this.constraints.map(c => c.check(this.puzzle));
//   }

//   isSolved(): boolean {
//     const results = this.validateAll(this.puzzle)
//     return results.every(r => r.satisfied);
//   }

