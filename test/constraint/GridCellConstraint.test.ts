import { describe, it, expect } from "vitest";
import {
  MustTouchAHorizontalBridge,
  MustTouchAVerticalBridge,
} from "@model/puzzle/constraints/GridCellConstraints";
import { makeMockPuzzle } from "../helpers/MockFactories";
import { createBridgeType } from "@model/puzzle/BridgeType";


describe("GridCellConstraints", () => {
  const mockType = createBridgeType({ id: "mock" });

  describe("MustTouchAHorizontalBridge", () => {
    it("passes when a horizontal bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
          { id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: mockType },
        ]
      });
      const c = new MustTouchAHorizontalBridge(2, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(true);
    });

    it("fails when no horizontal bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
            { id: "b1", start: { x: 5, y: 5 }, end: { x: 7, y: 5 }, type: mockType },
        ]
      });
      const c = new MustTouchAHorizontalBridge(1, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("No horizontal bridge");
      expect(result.glyphMessage).toBe("no adjacent horizontal bridge");
    });
  });

  describe("MustTouchAVerticalBridge", () => {
    it("passes when a vertical bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
        { id: "b1", start: { x: 3, y: 1 }, end: { x: 3, y: 4 }, type: mockType },
        ]
      });
      const c = new MustTouchAVerticalBridge(2, 3);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(true);
    });

    it("fails when no vertical bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [
            { id: "b1", start: { x: 7, y: 7 }, end: { x: 7, y: 9 }, type: mockType },
        ]
      });
      const c = new MustTouchAVerticalBridge(1, 1);
      const result = c.check(puzzle);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain("No vertical bridge");
      expect(result.glyphMessage).toBe("no adjacent vertical bridge");
    });
  });
});

describe("GridCellConstraints.getDisplayItems", () => {
  const mockType = createBridgeType({ id: "mock" });

  describe("MustTouchAHorizontalBridge", () => {
    it("returns 'good' when a horizontal bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [{ id: "b1", start: { x: 1, y: 2 }, end: { x: 3, y: 2 }, type: mockType }],
      });
      const c = new MustTouchAHorizontalBridge(2, 1);
      const items = c.getDisplayItems(puzzle);

      expect(items).toEqual([{ elementID: "2,1", glyphMessage: "good", constraintType: "MustTouchAHorizontalBridge" }]);
    });

    it("returns 'no adjacent horizontal bridge' when none is adjacent", () => {
      const puzzle = makeMockPuzzle({ bridges: [] });
      const c = new MustTouchAHorizontalBridge(2, 2);
      const items = c.getDisplayItems(puzzle);

      expect(items).toEqual([{ elementID: "2,2", glyphMessage: "no adjacent horizontal bridge", constraintType: "MustTouchAHorizontalBridge" }]);
    });
  });

  describe("MustTouchAVerticalBridge", () => {
    it("returns 'good' when a vertical bridge is adjacent", () => {
      const puzzle = makeMockPuzzle({
        bridges: [{ id: "b1", start: { x: 3, y: 1 }, end: { x: 3, y: 4 }, type: mockType }],
      });
      const c = new MustTouchAVerticalBridge(2, 3);
      const items = c.getDisplayItems(puzzle);

      expect(items).toEqual([{ elementID: "2,3", glyphMessage: "good", constraintType: "MustTouchAVerticalBridge" }]);
    });

    it("returns 'no adjacent vertical bridge' when none is adjacent", () => {
      const puzzle = makeMockPuzzle({ bridges: [] });
      const c = new MustTouchAVerticalBridge(2, 2);
      const items = c.getDisplayItems(puzzle);

      expect(items).toEqual([{ elementID: "2,2", glyphMessage: "no adjacent vertical bridge", constraintType: "MustTouchAVerticalBridge" }]);
    });
  });
});
