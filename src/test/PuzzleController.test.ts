import { describe, it, expect, vi, beforeEach } from "vitest";
import { PuzzleController } from "@controller/PuzzleController";
import type { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import type { PuzzleRenderer } from "@view/PuzzleRenderer";
import type { PuzzleHost } from "@controller/PuzzleHost";
import type { Bridge } from "@model/puzzle/Bridge";
import type { BridgeType } from "@model/puzzle/BridgeType";
import type { ValidationResult } from "@model/puzzle/ValidationResult";

// Mock PuzzleRenderer
class MockPuzzleRenderer implements PuzzleRenderer {
  initCalled = false;
  updateCalled = false;
  destroyCalled = false;
  clearHighlightsCalled = false;
  previewBridgeCalled = false;
  previewBridgeArg: any = undefined;
  highlightStartCalled = false;
  flashInvalidCalled = false;
  violations: string[] = [];
  dt: number = 0;
  puzzle: BridgePuzzle | undefined;

  init(puzzle: BridgePuzzle): void {
    this.initCalled = true;
    this.puzzle = puzzle;
  }

  updateFromPuzzle(puzzle: BridgePuzzle): void {
    this.updateCalled = true;
    this.puzzle = puzzle;
  }

  highlightViolations(ids: string[]): void {
    this.violations = ids;
  }

  highlightPreviewStart(_x: number, _y: number): void {
    this.highlightStartCalled = true;
  }

  flashInvalidPlacement(_start: { x: number; y: number }, _end: { x: number; y: number }): void {
    this.flashInvalidCalled = true;
  }

  clearHighlights(): void {
    this.clearHighlightsCalled = true;
  }

  previewBridge(bridge: Bridge, _opts?: any): void {
    this.previewBridgeCalled = true;
    this.previewBridgeArg = bridge;
  }

  setPlacing(_isPlacing: boolean): void {
    // no-op for tests
  }

  setAvailableBridgeTypes(_types: BridgeType[]): void {
    // no-op for tests
  }

  setSelectedBridgeType(_type: BridgeType | null): void {
    // no-op for tests
  }

  update(dt: number): void {
    this.dt = dt;
  }

  destroy(): void {
    this.destroyCalled = true;
  }
}

// Mock PuzzleHost
class MockPuzzleHost implements PuzzleHost {
  puzzleSolvedCalled = false;
  puzzleExitedCalled = false;
  exitedSuccess = false;
  noBridgeTypeAvailableCalled = false;
  bridgeTypeId: string | undefined;

  onPuzzleSolved(): void {
    this.puzzleSolvedCalled = true;
  }

  onPuzzleExited(success: boolean): void {
    this.puzzleExitedCalled = true;
    this.exitedSuccess = success;
  }

  onNoBridgeTypeAvailable?(bridgeTypeId: string): void {
    this.noBridgeTypeAvailableCalled = true;
    this.bridgeTypeId = bridgeTypeId;
  }

  renderPuzzle(): void {
    // Mock implementation
  }

  loadPuzzle(_puzzleID: string): void {
    // Mock implementation
  }
}

// Mock BridgePuzzle
function createMockPuzzle(): Partial<BridgePuzzle> {
  const puzzle = {
    id: "test-puzzle",
    width: 4,
    height: 4,
  islands: [ { id: 'I1', x: 1, y: 2 }, { id: 'I2', x: 3, y: 2 } ] as any[],
  bridges: [] as Bridge[],
    constraints: [] as any[],
    maxNumBridges: 2,

    getAvailableBridgeTypes: vi.fn(() => [] as BridgeType[]),
    takeBridgeOfType: vi.fn((): Bridge | undefined => undefined),
    placeBridge: vi.fn(() => true),
    removeBridge: vi.fn(),
    bridgesFromIsland: vi.fn(() => [] as Bridge[]),
    allBridgesPlaced: vi.fn(() => false),
    bridgesAt: vi.fn(() => [] as Bridge[]),
    availableCounts: vi.fn(() => ({})),
    inventory: { returnBridge: vi.fn() } as any,
    couldPlaceBridgeOfType: vi.fn((startId: string, endId: string, _typeId?: string) => {
      // default behaviour: check existing placed bridges count vs maxNumBridges
      const startIsland = puzzle.islands.find((i: any) => i.id === startId);
      const endIsland = puzzle.islands.find((i: any) => i.id === endId);
      if (!startIsland || !endIsland) return false;
      const existing = puzzle.bridges.filter((b: any) => {
        if (!b.start || !b.end) return false;
        const sMatches = (b.start.x === startIsland.x && b.start.y === startIsland.y && b.end.x === endIsland.x && b.end.y === endIsland.y);
        const rMatches = (b.start.x === endIsland.x && b.start.y === endIsland.y && b.end.x === startIsland.x && b.end.y === startIsland.y);
        return sMatches || rMatches;
      }).length;
      return existing < puzzle.maxNumBridges;
    }),

    get placedBridges(): Bridge[] {
      return puzzle.bridges.filter(b => b.start && b.end);
    }
  };

  return puzzle;
}

describe("PuzzleController", () => {
  let controller: PuzzleController;
  let mockPuzzle: ReturnType<typeof createMockPuzzle>;
  let mockRenderer: MockPuzzleRenderer;
  let mockHost: MockPuzzleHost;

  beforeEach(() => {
    mockPuzzle = createMockPuzzle();
    mockRenderer = new MockPuzzleRenderer();
    mockHost = new MockPuzzleHost();
  });

  describe("constructor", () => {
    it("initialises with puzzle, renderer, and host", () => {
      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      expect(controller).toBeDefined();
    });

    it("calls selectDefaultBridge on construction", () => {
      const bridgeTypes: BridgeType[] = [
        { id: "type1", colour: "black" },
        { id: "type2", colour: "red" }
      ];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      expect(mockPuzzle.getAvailableBridgeTypes).toHaveBeenCalled();
    });
  });

  describe("enterPuzzle", () => {
    it("initialises the renderer and updates from puzzle", () => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      controller.enterPuzzle();

      expect(mockRenderer.initCalled).toBe(true);
      expect(mockRenderer.updateCalled).toBe(true);
    });
  });

  describe("exitPuzzle", () => {
    it("calls host.onPuzzleExited with success flag", () => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      controller.exitPuzzle(true);

      expect(mockHost.puzzleExitedCalled).toBe(true);
      expect(mockHost.exitedSuccess).toBe(true);
    });

    it("calls renderer.destroy", () => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      controller.exitPuzzle(false);

      expect(mockRenderer.destroyCalled).toBe(true);
    });
  });

  describe("bridge selection", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [
        { id: "type1", colour: "black" },
        { id: "type2", colour: "red" },
        { id: "type3", colour: "blue" }
      ];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);
      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("selects bridge type", () => {
      const bridgeType: BridgeType = { id: "selected", colour: "blue" };
      controller.selectBridgeType(bridgeType);
      expect(controller.currentBridgeType).toBe(bridgeType);
    });

    it("cycles to next bridge type and wraps around", () => {
      // Controller starts with the first type (type1)
      expect(controller.currentBridgeType?.id).toBe("type1");

      // Move to next (type1 -> type2)
      controller.nextBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type2");

      // Move to next (type2 -> type3)
      controller.nextBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type3");

      // Wrap around (type3 -> type1)
      controller.nextBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type1");
    });

    it("cycles to previous bridge type and wraps around", () => {
      // Controller starts with the first type (type1)
      expect(controller.currentBridgeType?.id).toBe("type1");

      // Move to previous (wraps to type3)
      controller.previousBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type3");

      // Move to previous (type3 -> type2)
      controller.previousBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type2");

      // Move to previous (type2 -> type1)
      controller.previousBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type1");

      // Wrap around (type1 -> type3)
      controller.previousBridgeType();
      expect(controller.currentBridgeType?.id).toBe("type3");
    });

    it("handles cycling when no current bridge type", () => {
      // Clear the bridge type
      controller.currentBridgeType = null;

      // Calling next should select the default
      controller.nextBridgeType();
      expect(controller.currentBridgeType).not.toBeNull();
      expect(controller.currentBridgeType!.id).toBe("type1");
    });

    it("skips unavailable bridge types when cycling", () => {
      // Arrange three types where middle type has zero availability
      const bridgeTypes: BridgeType[] = [
        { id: "t1", colour: "black" },
        { id: "t2", colour: "red" },
        { id: "t3", colour: "blue" }
      ];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);
      // Only t1 and t3 available
      mockPuzzle.availableCounts = vi.fn(() => ({ t1: 1, t2: 0, t3: 1 }));

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      // Start at t1
      expect(controller.currentBridgeType!.id).toBe('t1');
      // Next should skip t2 (unavailable) and select t3
      controller.nextBridgeType();
      expect(controller.currentBridgeType!.id).toBe('t3');
      // Next should wrap to t1
      controller.nextBridgeType();
      expect(controller.currentBridgeType!.id).toBe('t1');
    });
  });

  describe("cancelPlacement", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);
      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      controller.tryPlaceFirstEndpoint(1, 2);
    });

    it("clears highlights and resets state", () => {
      controller.cancelPlacement();

      expect(mockRenderer.clearHighlightsCalled).toBe(true);
      // should also reset the current bridge and pending start
      expect(controller.currentBridge).toBeNull();
      expect(controller.pendingStart).toBeNull();
    });
  });

  describe("bridge placement", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      const mockBridge: Bridge = {
        id: "bridge1",
        type: bridgeTypes[0]
      };
      mockPuzzle.takeBridgeOfType = vi.fn(() => mockBridge);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("places first endpoint successfully", () => {
      controller.tryPlaceAt(1, 2);

      expect(mockPuzzle.takeBridgeOfType).toHaveBeenCalledWith("type1");
      expect(mockRenderer.previewBridgeCalled).toBe(true);
    });

    it("places second endpoint successfully", () => {
      // Place first endpoint
      controller.tryPlaceAt(1, 2);

      // Place second endpoint
      controller.tryPlaceAt(3, 2);

      expect(mockPuzzle.placeBridge).toHaveBeenCalledWith(
        expect.any(String),
        { x: 1, y: 2 },
        { x: 3, y: 2 }
      );
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("handles invalid placement", () => {
      mockPuzzle.placeBridge = vi.fn(() => false);

      controller.tryPlaceAt(1, 2);
      controller.tryPlaceAt(3, 2);

      expect(mockRenderer.flashInvalidCalled).toBe(true);
      expect(mockRenderer.updateCalled).toBe(false);
    });

    it("calls validate after successful placement", () => {
      const validateSpy = vi.spyOn(controller as any, "validate");

      controller.tryPlaceAt(1, 2);
      controller.tryPlaceAt(3, 2);

      expect(validateSpy).toHaveBeenCalled();
    });

    it("calls onNoBridgeTypeAvailable when no bridge available", () => {
      mockPuzzle.takeBridgeOfType = vi.fn(() => undefined);

      controller.tryPlaceAt(1, 2);

      // The method should have been called by the controller
      expect(mockHost.noBridgeTypeAvailableCalled).toBe(true);
      expect(mockHost.bridgeTypeId).toBe("type1");
    });

    it('prevents placing a third bridge between the same island pair', () => {
      // Simulate two already-placed bridges between (1,2) and (3,2)
      (mockPuzzle.bridges as any[]).push(
        { id: 'b1', type: { id: 'type1' }, start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
        { id: 'b2', type: { id: 'type1' }, start: { x: 1, y: 2 }, end: { x: 3, y: 2 } }
      );

      // Ensure allocation still returns a bridge if attempted
      const mockBridge: Bridge = { id: 'b3', type: { id: 'type1' } } as any;
      mockPuzzle.takeBridgeOfType = vi.fn(() => mockBridge);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      // Try placing a third bridge between the same pair
      controller.tryPlaceAt(1, 2); // allocate
      expect(mockRenderer.previewBridgeCalled).toBe(true);
      expect(controller.currentBridge).toBe(mockBridge);

      controller.tryPlaceAt(3, 2); // attempt to finish placement

      // Placement should be rejected: renderer should flash invalid and placeBridge not called
      expect(mockRenderer.flashInvalidCalled).toBe(true);
      expect(mockPuzzle.placeBridge).not.toHaveBeenCalled();
      // And controller should have cleared pending state
      expect(controller.currentBridge).toBeNull();
      expect(controller.pendingStart).toBeNull();
    });
  });

  describe("bridge removal", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("removes bridge and updates renderer", () => {
      // Ensure puzzle has a bridge to remove so RemoveBridgeCommand can find it
      (mockPuzzle.bridges as any[]).push({ id: "bridge1", type: { id: "type1" }, start: { x: 1, y: 1 }, end: { x: 2, y: 2 } });

      controller.removeBridge("bridge1");

      expect(mockPuzzle.removeBridge).toHaveBeenCalledWith("bridge1");
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("validates after removal", () => {
      const validateSpy = vi.spyOn(controller as any, "validate");

      (mockPuzzle.bridges as any[]).push({ id: "bridge1", type: { id: "type1" }, start: { x: 1, y: 1 }, end: { x: 2, y: 2 } });
      controller.removeBridge("bridge1");

      expect(validateSpy).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      // Mock the validator's validateAll to return successful validation
      const mockValidator = {
        validateAll: vi.fn(() => ({
          allSatisfied: true,
          perConstraint: [{ constraintId: 'c1', result: { satisfied: true, affectedElements: [] } }],
          unsatisfiedCount: 0
        } as ValidationResult))
      };

      // Replace the validator with our mock
      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );

      (controller as any).validator = mockValidator;
    });

    it("calls host.onPuzzleSolved when all constraints satisfied", () => {
      controller.validate();

      expect(mockHost.puzzleSolvedCalled).toBe(true);
    });

    it('only calls host.onPuzzleSolved once on transition to solved', () => {
      // Prepare a validator that reports solved
      const mockValidator = {
        validateAll: vi.fn(() => ({ allSatisfied: true, perConstraint: [{ constraintId: 'c1', result: { satisfied: true, affectedElements: [] } }], unsatisfiedCount: 0 }))
      };

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
      // Inject the mock validator
      (controller as any).validator = mockValidator;

      // First call should invoke host.onPuzzleSolved once
      controller.validate();
      expect(mockHost.puzzleSolvedCalled).toBe(true);

      // Reset flag and call validate again with same solved result
      mockHost.puzzleSolvedCalled = false;
      controller.validate();
      // Should not call again because state hasn't changed
      expect(mockHost.puzzleSolvedCalled).toBe(false);
    });

    it('blocks undo when puzzle is solved', () => {
      // Make validator report solved so controller sets wasSolved
      const mockValidator = {
        validateAll: vi.fn(() => ({ allSatisfied: true, perConstraint: [{ constraintId: 'c1', result: { satisfied: true, affectedElements: [] } }], unsatisfiedCount: 0 }))
      };

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
      (controller as any).validator = mockValidator;

      // Trigger solved transition
      controller.validate();
      expect((controller as any).wasSolved).toBe(true);

      // Spy on undoManager.undo
      (controller as any).undoManager.undo = vi.fn(() => false);

      controller.undo();
      expect((controller as any).undoManager.undo).not.toHaveBeenCalled();
      expect(controller.canUndo()).toBe(false);
    });

    it("highlights violations when not all constraints satisfied", () => {
      const mockValidator = {
        validateAll: vi.fn(() => ({
          allSatisfied: false,
          perConstraint: [
            {
              constraintId: "c1",
              type: "MockConstraint",
              result: {
                satisfied: false,
                affectedElements: ["A", "B"],
                message: "Some constraint failed"
              }
            }
          ],
          unsatisfiedCount: 1
        } as ValidationResult))
      };

      (controller as any).validator = mockValidator;

      controller.validate();

      expect(mockHost.puzzleSolvedCalled).toBe(false);
      expect(mockRenderer.violations).toEqual(["A", "B"]);
    });
  });

  describe("update", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("calls renderer.update", () => {
      controller.update(16.67);

      expect(mockRenderer.dt).toBe(16.67);
    });
  });

  describe("getBridgeAt", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("returns correct bridge when clicking on placed bridge", () => {
      const mockBridge = { id: "bridge1", type: { id: "type1" } };
      (mockPuzzle.bridgesAt as ReturnType<typeof vi.fn>) = vi.fn(() => [mockBridge] as any);

      const result = controller.getBridgeAt(1, 1);

      expect(result).toEqual(mockBridge);
      expect(mockPuzzle.bridgesAt).toHaveBeenCalledWith(1, 1);
    });

    it("returns null when clicking empty space", () => {
      (mockPuzzle.bridgesAt as ReturnType<typeof vi.fn>) = vi.fn(() => []);

      const result = controller.getBridgeAt(2, 2);

      expect(result).toBeNull();
    });
  });

  describe("undo/redo", () => {
    beforeEach(() => {
      const bridgeTypes: BridgeType[] = [{ id: "type1", colour: "black" }];
      mockPuzzle.getAvailableBridgeTypes = vi.fn(() => bridgeTypes);

      controller = new PuzzleController(
        mockPuzzle as unknown as BridgePuzzle,
        mockRenderer,
        mockHost
      );
    });

    it("can undo via UndoRedoManager", () => {
      const command = { execute: vi.fn(), undo: vi.fn() };
      // execute the command through the controller's undo manager
      (controller as any).undoManager.executeCommand(command);

      controller.undo();

      expect(command.undo).toHaveBeenCalled();
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("can redo via UndoRedoManager", () => {
      const command = { execute: vi.fn(), undo: vi.fn() };
      (controller as any).undoManager.executeCommand(command);
      controller.undo();

      controller.redo();

      expect(command.execute).toHaveBeenCalled();
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("can't undo when at start of history", () => {
      // Ensure manager is clear
      (controller as any).undoManager.clear();
      controller.undo();
      // Nothing to assert on spies; just ensure no throws and renderer not updated
      expect(mockRenderer.updateCalled).toBe(false);
    });

    it("can't redo when at end of history", () => {
      (controller as any).undoManager.clear();
      controller.redo();
      expect(mockRenderer.updateCalled).toBe(false);
    });
  });
});

