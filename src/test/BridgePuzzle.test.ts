import { describe, it, expect } from "vitest";
import { BridgePuzzle, type PuzzleSpec } from "@model/puzzle/BridgePuzzle";
import { PuzzleValidator } from "@model/puzzle/PuzzleValidator";
import test_simple_4_island from "../data/puzzles/simple4IslandPuzzle.json";

describe("Simple puzzle validation", () => {
  it("detects unsatisfied constraints when bridges are missing", () => {
    const puzzle = new BridgePuzzle(test_simple_4_island as PuzzleSpec);
    const validator = new PuzzleValidator(puzzle);

    const results = validator.validateAll();
    expect(results.allSatisfied).toBe(false);
    expect(results.unsatisfiedCount).toBeGreaterThan(0);
    expect(results.perConstraint.some(r => !r.result.satisfied)).toBe(true);
  });

  it("passes all constraints when correctly placed", () => {
    const puzzle = new BridgePuzzle(test_simple_4_island as PuzzleSpec);
    const validator = new PuzzleValidator(puzzle);

    // Place all 4 bridges. 1,3 wants 3 bridges; 3,1 wants 1; 3,3 wants 2.
    puzzle.placeBridge("b1", { x: 1, y: 1 }, { x: 1, y: 3 });
    puzzle.placeBridge("b2", { x: 1, y: 3 }, { x: 3, y: 3 });
    puzzle.placeBridge("b3", { x: 1, y: 3 }, { x: 3, y: 3 });
    puzzle.placeBridge("b4", { x: 1, y: 1 }, { x: 3, y: 1 });

  const results = validator.validateAll();
  //console.log('DEBUG perConstraint results:', results.perConstraint.map(r=>({ type: r.type, ok: r.result.satisfied, message: r.result.message })));
  expect(results.allSatisfied).toBe(true);
  expect(results.unsatisfiedCount).toBe(0);
  expect(results.perConstraint.every(r => r.result.satisfied)).toBe(true);
  });
});
