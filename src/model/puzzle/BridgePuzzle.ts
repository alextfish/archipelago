import type { Bridge } from "./Bridge";
import { BridgeInventory } from "./BridgeInventory";
import type { Island } from "./Island";
import type { Constraint } from "./constraints/Constraint";
import { createConstraintsFromSpec } from './constraints/createConstraintsFromSpec';
import { BridgeLengthConstraint } from './constraints/BridgeLengthConstraint';
import { createBridgeType, type BridgeType } from "./BridgeType";

export interface BridgeTypeSpec {
  id: string;
  colour?: string;
  length?: number;
  count?: number;
  width?: number;
  style?: string;
}

export interface PuzzleSpec { // can be loaded from JSON
  id: string;
  type?: string;
  size: { width: number; height: number };
  islands: Island[];
  bridgeTypes: BridgeTypeSpec[];
  constraints: { type: string; params?: any }[];
  maxNumBridges: number;
}

export class BridgePuzzle {
  id: string;
  width: number;
  height: number;
  islands: Island[];
  constraints: Constraint[];
  inventory: BridgeInventory;
  maxNumBridges: number;

  constructor(spec: PuzzleSpec) {
    this.id = spec.id;
    this.width = spec.size.width;
    this.height = spec.size.height;
    this.islands = spec.islands;
    this.constraints = createConstraintsFromSpec(spec.constraints);
    const bridgeTypes = spec.bridgeTypes.map(
      (spec) => ({
        ...createBridgeType({
          id: spec.id,
          colour: spec.colour,
          length: spec.length,
          width: spec.width,
          style: spec.style
        }),
        count: spec.count ?? 1
      }));
    this.inventory = new BridgeInventory(bridgeTypes);
      if (spec.maxNumBridges !== undefined) {
      this.maxNumBridges = spec.maxNumBridges;
    } else {
      this.maxNumBridges = 2;
    }
      // Build constraints from spec and also add length constraints for any fixed-length bridge types
      for (const bt of bridgeTypes) {
        const len = (bt.length === undefined) ? -1 : bt.length ?? -1;
        if (len !== -1) {
          // add a constraint enforcing this bridge type's fixed length
          this.constraints.push(BridgeLengthConstraint.fromSpec({ typeId: bt.id, length: len }));
        }
      }
  }

  /** Get all bridges (placed or unplaced) */
  get bridges(): Bridge[] {
    return this.inventory.bridges;
  }

  /** Get all placed bridges */
  get placedBridges(): Bridge[] {
    return this.inventory.bridges.filter(b => b.start && b.end);
  }

  placeBridge(bridgeID: string, start: { x: number; y: number }, end: { x: number; y: number }): boolean {
    const bridge = this.inventory.bridges.find(b => b.id === bridgeID);
    if (!bridge) throw new Error(`No such bridge ${bridgeID}`);
    // TODO validate whether this bridge allows these positions
    bridge.start = start;
    bridge.end = end;
    return true;
  }

  removeBridge(bridgeID: string) {
    const bridge = this.inventory.bridges.find(b => b.id === bridgeID);
    if (!bridge) throw new Error(`No such bridge ${bridgeID}`);
    delete bridge.start;
    delete bridge.end;
    this.inventory.returnBridge(bridgeID);
  }

  allBridgesPlaced(): boolean {
    return this.inventory.bridges.every(b => b.start && b.end);
  }

  bridgesFromIsland(island: Island): Bridge[] {
    return this.placedBridges.filter(b => {
      const startMatches = b.start?.x === island.x && b.start?.y === island.y;
      const endMatches = b.end?.x === island.x && b.end?.y === island.y;
      return startMatches || endMatches;
    });
  }

  /**
   * Count placed bridges between two islands (counts both directions)
   */
  getBridgeCountBetween(startIslandId: string, endIslandId: string): number {
    const startIsland = this.islands.find(i => i.id === startIslandId);
    const endIsland = this.islands.find(i => i.id === endIslandId);
    if (!startIsland || !endIsland) return 0;
    let count = 0;
    for (const b of this.placedBridges) {
      if (!b.start || !b.end) continue;
      const sMatchesStart = b.start.x === startIsland.x && b.start.y === startIsland.y && b.end.x === endIsland.x && b.end.y === endIsland.y;
      const sMatchesEnd = b.start.x === endIsland.x && b.start.y === endIsland.y && b.end.x === startIsland.x && b.end.y === startIsland.y;
      if (sMatchesStart || sMatchesEnd) count++;
    }
    return count;
  }

  /**
   * Return whether a bridge could be placed between two islands according to
   * the puzzle's current rules (encapsulated here so criteria can change later).
   */
  couldPlaceBridgeAt(startIslandId: string, endIslandId: string): boolean {
    if (startIslandId === endIslandId) return false;
    const startIsland = this.islands.find(i => i.id === startIslandId);
    const endIsland = this.islands.find(i => i.id === endIslandId);
    if (!startIsland || !endIsland) return false;
    const existing = this.getBridgeCountBetween(startIslandId, endIslandId);
    return existing < this.maxNumBridges;
  }
  takeBridgeOfType(typeId: string): Bridge | undefined {
    return this.inventory.takeBridge(typeId);
  }

  getAvailableBridgeTypes(): BridgeType[] {
    console.log('getAvailableBridgeTypes', this.inventory.bridgeTypes);
    return this.inventory.bridgeTypes;
  }

  availableCounts(): Record<string, number> {
    return this.inventory.countsByType();
  }

  /**
   * Returns all bridges where (x, y) is the same proportion between start and end for both coordinates.
   */
  bridgesAt(x: number, y: number): Bridge[] {
    const foundBridges: Bridge[] = [];
    for (const bridge of this.placedBridges) {
      if (!bridge.start || !bridge.end) continue;
      const { start, end } = bridge;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      // Avoid division by zero
      if (dx === 0 && dy === 0) continue;
      // Calculate proportion along x and y
      let px: number | undefined = undefined;
      let py: number | undefined = undefined;
      if (dx !== 0) px = (x - start.x) / dx;
      if (dy !== 0) py = (y - start.y) / dy;
      // If both dx and dy are nonzero, proportions must match
      if (dx !== 0 && dy !== 0 &&
        px !== undefined && py !== undefined &&
        px === py &&
        px >= 0 && px <= 1
      ) {
        foundBridges.push(bridge);
      }
      // If only one direction varies, check that the input matches that direction and is within bounds
      else if (dx === 0 && dy !== 0 && x === start.x && py !== undefined && py >= 0 && py <= 1) {
        foundBridges.push(bridge);
      }
      else if (dy === 0 && dx !== 0 && y === start.y && px !== undefined && px >= 0 && px <= 1) {
        foundBridges.push(bridge);
      }
    }
    return foundBridges;
  }
}



