import { describe, it, expect } from "vitest";
import {
  MustTouchAHorizontalBridge,
  MustTouchAVerticalBridge,
} from "@model/puzzle/constraints/GridCellConstraints";
import { makeMockPuzzle } from "../helpers/MockFactories";


describe("GridCellConstraints", () => {
  describe("MustTouchAHorizontalBridge", () => {
    it("passes when a horizontal bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
          { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
        ]
      });
      const c = new MustTouchAHorizontalBridge(2, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(true);
    });

    it("fails when no horizontal bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
            { id: "b1", start: { x: 5, y: 5 }, end: { x: 7, y: 5 } },
        ]
      });
      const c = new MustTouchAHorizontalBridge(1, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("No horizontal bridge");
      expect(result.glyphMessage).toBe("no adjacent bridge");
    });
  });

  describe("MustTouchAVerticalBridge", () => {
    it("passes when a vertical bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
        { id: "b1", start: { x: 3, y: 1 }, end: { x: 3, y: 4 } },
        ]
      });
      const c = new MustTouchAVerticalBridge(2, 3);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(true);
    });

    it("fails when no vertical bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
            { id: "b1", start: { x: 7, y: 7 }, end: { x: 7, y: 9 } },
        ]
      });
      const c = new MustTouchAVerticalBridge(1, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("No vertical bridge");
      expect(result.glyphMessage).toBe("no adjacent bridge");
    });
  });
});
