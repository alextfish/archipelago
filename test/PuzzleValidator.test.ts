import { describe, it, expect } from "vitest";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import { PuzzleValidator } from "@model/puzzle/PuzzleValidator";
import { Constraint } from "@model/puzzle/constraints/Constraint";
import type { ConstraintResult } from "@model/puzzle/constraints/ConstraintResult";

// Minimal mock constraint
class MockConstraint extends Constraint {

  constructor(private result: ConstraintResult) {
      super();
  }

  check(_: BridgePuzzle): ConstraintResult {
    return this.result;
  }
}

const makeMockPuzzle = (constraints: Constraint[] = []): BridgePuzzle => ({
  id: "mock",
  width: 4,
  height: 4,
  islands: [],
  bridges: [],
  // model methods you have...
  placeBridge: () => true,
  removeBridge: () => {},
  bridgesFromIsland: () => [],
  bridgesAt: () => [],
  // attach constraints array (real BridgePuzzle would do this in constructor)
  constraints,
} as unknown as BridgePuzzle);

describe("PuzzleValidator", () => {
  it("reports allSatisfied true when all constraints pass", () => {
    const c1 = new MockConstraint({ satisfied: true });
    const c2 = new MockConstraint({ satisfied: true });

    const puzzle = makeMockPuzzle([c1, c2]);
    const v = new PuzzleValidator(puzzle);
    const res = v.validateAll();
    const solved = v.isSolved();

    expect(solved).toBe(true);

    expect(res.allSatisfied).toBe(true);
    expect(res.unsatisfiedCount).toBe(0);
    expect(res.perConstraint.length).toBe(2);
  });

  it("aggregates failed constraints", () => {
    const c1 = new MockConstraint({ satisfied: true });
    const c2 = new MockConstraint({
      satisfied: false,
      affectedElements: ["A"],
      message: "oops",
    });

    const puzzle = makeMockPuzzle([c1 as any, c2 as any]);
    const v = new PuzzleValidator(puzzle);
    const res = v.validateAll();
    const solved = v.isSolved();

    expect(solved).toBe(false);
    
    expect(res.allSatisfied).toBe(false);
    expect(res.unsatisfiedCount).toBe(1);
    const failed = res.perConstraint.filter(p => !p.result.satisfied);
    expect(failed.length).toBe(1);
    expect(failed[0].result.message).toBe("oops");
  });
});
