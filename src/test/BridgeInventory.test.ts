import { BridgeInventory } from "@model/puzzle/BridgeInventory";
import { describe, it, expect } from "vitest";

describe("BridgeInventory", () => {
  it("correctly allocates bridges", () => {
    const inv = new BridgeInventory([{ id:"black_var", colour:"black", count:2 }]);
    
    // Take first bridge and place it
    const bridge1 = inv.takeBridge("black_var");
    expect(bridge1).not.toBeUndefined();
    expect(bridge1!.id).toBe("b1");
    bridge1!.start = { x: 1, y: 1 };
    bridge1!.end = { x: 2, y: 2 };
    
    // Take second bridge (different from first) and place it
    const bridge2 = inv.takeBridge("black_var");
    expect(bridge2).not.toBeUndefined();
    expect(bridge2!.id).toBe("b2");
    expect(bridge1!.id).not.toBe(bridge2!.id);
    bridge2!.start = { x: 3, y: 3 };
    bridge2!.end = { x: 4, y: 4 };
    
    // Now there should be no more left
    expect(inv.takeBridge("black_var")).toBeUndefined();
  });

  it("correctly returns bridges", () => {
    const inv = new BridgeInventory([{ id:"black_var", colour:"black", count:1 }]);
    const bridge = inv.takeBridge("black_var");
    expect(bridge).not.toBeUndefined();
    inv.returnBridge(bridge!.id);
    const bridge2 = inv.takeBridge("black_var");
    expect(bridge2).not.toBeUndefined();
  });

  describe("availability after taking and returning bridges", () => {
    it("reduces availability when taking a bridge of one type", () => {
      const inv = new BridgeInventory([
        { id: "black_short", colour: "black", length: 1, count: 2 },
        { id: "red_long", colour: "red", length: 3, count: 1 }
      ]);

      // Initially both types should have counts
      let counts = inv.countsByType();
      expect(counts["black_short"]).toBe(2);
      expect(counts["red_long"]).toBe(1);

      // Take one bridge of black_short and place it
      const bridge = inv.takeBridge("black_short");
      expect(bridge).not.toBeUndefined();
      bridge!.start = { x: 1, y: 1 };
      bridge!.end = { x: 2, y: 2 };

      // Now black_short should have one less
      counts = inv.countsByType();
      expect(counts["black_short"]).toBe(1);
      expect(counts["red_long"]).toBe(1);
    });

    it("returns bridge to pool and restores availability", () => {
      const inv = new BridgeInventory([
        { id: "black_short", colour: "black", length: 1, count: 2 },
        { id: "red_long", colour: "red", length: 3, count: 1 }
      ]);

      // Take a bridge and place it
      const bridge = inv.takeBridge("black_short");
      expect(bridge).not.toBeUndefined();
      bridge!.start = { x: 1, y: 1 };
      bridge!.end = { x: 2, y: 2 };
      
      // Verify count decreased (of black but not red)
      let counts = inv.countsByType();
      expect(counts["black_short"]).toBe(1);
      expect(counts["red_long"]).toBe(1);
      
      // Return the bridge
      inv.returnBridge(bridge!.id);

      // Count should be restored
      counts = inv.countsByType();
      expect(counts["black_short"]).toBe(2);
      expect(counts["red_long"]).toBe(1);
    });

    it("becomes unavailable when all bridges of a type are taken", () => {
      const inv = new BridgeInventory([
        { id: "black_short", colour: "black", length: 1, count: 1 },
        { id: "red_long", colour: "red", length: 3, count: 1 }
      ]);

      // Take the only bridge of black_short and place it
      const bridge = inv.takeBridge("black_short");
      expect(bridge).not.toBeUndefined();
      bridge!.start = { x: 1, y: 1 };
      bridge!.end = { x: 2, y: 2 };

      // Now there should be no more black_short available
      const counts = inv.countsByType();
      expect(counts["black_short"]).toBeUndefined();
      expect(counts["red_long"]).toBe(1);

      // Should not be able to take another black_short
      expect(inv.takeBridge("black_short")).toBeUndefined();

      // Return it and it should be available again
      inv.returnBridge(bridge!.id);
      expect(inv.takeBridge("black_short")).not.toBeUndefined();
    });

    it("restores type to available after returning last bridge", () => {
      const inv = new BridgeInventory([
        { id: "black_short", colour: "black", length: 1, count: 1 },
        { id: "red_long", colour: "red", length: 3, count: 1 }
      ]);

      // Take the only bridge of black_short and place it
      const bridge = inv.takeBridge("black_short");
      expect(bridge).not.toBeUndefined();
      bridge!.start = { x: 1, y: 1 };
      bridge!.end = { x: 2, y: 2 };

      // Verify it's gone
      expect(inv.takeBridge("black_short")).toBeUndefined();

      // Return it
      inv.returnBridge(bridge!.id);

      // Now it should be available again
      const counts = inv.countsByType();
      expect(counts["black_short"]).toBe(1);
      expect(inv.takeBridge("black_short")).not.toBeUndefined();
    });
  });
});
