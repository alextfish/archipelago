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

  previewBridge?(bridge: Bridge): void {
    this.previewBridgeCalled = true;
    this.previewBridgeArg = bridge;
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
    islands: [] as any[],
    bridges: [] as Bridge[],
    constraints: [] as any[],
    
    getAvailableBridgeTypes: vi.fn(() => [] as BridgeType[]),
    takeBridgeOfType: vi.fn((): Bridge | undefined => undefined),
    placeBridge: vi.fn(() => true),
    removeBridge: vi.fn(),
    bridgesFromIsland: vi.fn(() => [] as Bridge[]),
    allBridgesPlaced: vi.fn(() => false),
    bridgesAt: vi.fn(() => [] as Bridge[]),
    availableCounts: vi.fn(() => ({})),
    inventory: {} as any,
    
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
      expect(mockRenderer.highlightStartCalled).toBe(true);
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
      controller.removeBridge("bridge1");

      expect(mockPuzzle.removeBridge).toHaveBeenCalledWith("bridge1");
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("validates after removal", () => {
      const validateSpy = vi.spyOn(controller as any, "validate");

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
          perConstraint: [],
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

    it("can undo", () => {
      const command = {
        execute: vi.fn(),
        undo: vi.fn()
      };
      
      (controller as any).history = [command];
      (controller as any).historyIndex = 0;

      controller.undo();

      expect(command.undo).toHaveBeenCalled();
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("can redo", () => {
      const command = {
        execute: vi.fn(),
        undo: vi.fn()
      };
      
      (controller as any).history = [command];
      (controller as any).historyIndex = -1;

      controller.redo();

      expect(command.execute).toHaveBeenCalled();
      expect(mockRenderer.updateCalled).toBe(true);
    });

    it("can't undo when at start of history", () => {
      const command = {
        execute: vi.fn(),
        undo: vi.fn()
      };
      
      (controller as any).history = [command];
      (controller as any).historyIndex = -1;

      controller.undo();

      expect(command.undo).not.toHaveBeenCalled();
    });

    it("can't redo when at end of history", () => {
      const command = {
        execute: vi.fn(),
        undo: vi.fn()
      };
      
      (controller as any).history = [command];
      (controller as any).historyIndex = 0;

      controller.redo();

      expect(command.execute).not.toHaveBeenCalled();
    });
  });
});

