import type { Bridge } from "./Bridge";
import { BridgeInventory } from "./BridgeInventory";
import type { Island } from "./Island";
import type { Constraint } from "./constraints/Constraint";
import { createConstraintsFromSpec } from './constraints/createConstraintsFromSpec';
import { BridgeLengthConstraint } from './constraints/BridgeLengthConstraint';
import { BridgeMustCoverIslandConstraint } from './constraints/BridgeMustCoverIslandConstraint';
import { createBridgeType, type BridgeType } from "./BridgeType";
import { StrutBridge } from './StrutBridge';

export interface BridgeTypeSpec {
  id: string;
  colour?: string;
  length?: number;
  count?: number;
  width?: number;
  style?: string;
  mustCoverIsland?: boolean;
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
          style: spec.style,
          mustCoverIsland: spec.mustCoverIsland,
        }),
        count: spec.count ?? 1
      }));
    this.inventory = new BridgeInventory(bridgeTypes);
    if (spec.maxNumBridges !== undefined) {
      this.maxNumBridges = spec.maxNumBridges;
    } else {
      this.maxNumBridges = 2;
    }
      // Build constraints from spec. If the spec does not include any constraints,
      // automatically add fixed-length constraints for each fixed-length bridge type
      // so standalone fixed-length tests still get validated.
      const hasSpecConstraints = Array.isArray(spec.constraints) && spec.constraints.length > 0;
      if (!hasSpecConstraints) {
        for (const bt of bridgeTypes) {
          const len = (bt.length === undefined) ? -1 : bt.length ?? -1;
          if (len !== -1) {
            // add a constraint enforcing this bridge type's fixed length
            this.constraints.push(BridgeLengthConstraint.fromSpec({ typeId: bt.id, length: len }));
          }
        }
      }
      // Always add one BridgeMustCoverIslandConstraint per StrutBridge instance.
      // These are per-bridge constraints (keyed by bridge ID) rather than the
      // type-level constraints above, so each bridge gets its own constraint
      // that tracks whether that specific bridge covers an island.
      for (const bridge of this.inventory.bridges) {
        if (bridge instanceof StrutBridge) {
          this.constraints.push(new BridgeMustCoverIslandConstraint(bridge.id));
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
    return this.couldPlaceBridgeOfType(startIslandId, endIslandId, undefined as any);
  }

  /**
   * Returns whether a bridge of the given type can be placed between two islands.
   * If typeId is undefined, this behaves like the legacy couldPlaceBridgeAt (only max-bridges and existence checks).
   */
  couldPlaceBridgeOfType(startIslandId: string, endIslandId: string, typeId?: string): boolean {
    if (startIslandId === endIslandId) return false;
    const startIsland = this.islands.find(i => i.id === startIslandId);
    const endIsland = this.islands.find(i => i.id === endIslandId);
    if (!startIsland || !endIsland) return false;
    const existing = this.getBridgeCountBetween(startIslandId, endIslandId);
    if (existing >= this.maxNumBridges) return false;

    if (!typeId) return true;

    // Find bridge type in inventory; fall back to checking length property directly
    const bt = this.inventory.bridgeTypes.find(b => b.id === typeId);
    if (!bt) return true; // unknown type — allow by default

    // Check if bridge would cross any islands (unless it can cover islands)
    if (!bt.canCoverIsland && !bt.mustCoverIsland) {
      if (this.bridgeWouldCrossIslands(startIsland, endIsland)) {
        return false;
      }
    }

    if (bt.allowsSpan) {
      return bt.allowsSpan({ x: startIsland.x, y: startIsland.y }, { x: endIsland.x, y: endIsland.y });
    }

    const len = (bt.length === undefined) ? -1 : bt.length ?? -1;
    if (len === -1) return true;
    const dx = endIsland.x - startIsland.x;
    const dy = endIsland.y - startIsland.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.abs(dist - len) <= 0.01;
  }

  /**
   * Check if a bridge between two islands would cross over any other islands.
   * Returns true if any island lies strictly between the start and end islands.
   */
  private bridgeWouldCrossIslands(
    startIsland: Island,
    endIsland: Island
  ): boolean {
    for (const island of this.islands) {
      // Skip the start and end islands themselves
      if (island.id === startIsland.id || island.id === endIsland.id) continue;

      // Check if bridge is horizontal and would pass over this island
      if (startIsland.y === endIsland.y && startIsland.y === island.y) {
        const minX = Math.min(startIsland.x, endIsland.x);
        const maxX = Math.max(startIsland.x, endIsland.x);
        if (island.x > minX && island.x < maxX) {
          return true;
        }
      }

      // Check if bridge is vertical and would pass over this island
      if (startIsland.x === endIsland.x && startIsland.x === island.x) {
        const minY = Math.min(startIsland.y, endIsland.y);
        const maxY = Math.max(startIsland.y, endIsland.y);
        if (island.y > minY && island.y < maxY) {
          return true;
        }
      }
    }

    return false;
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

  /**
   * Parse a Tiled "bridges" property string into BridgeTypeSpecs.
   *
   * Each entry is a length optionally followed by '+' to denote a StrutBridge
   * (e.g. "3,2,3+,4+"). Duplicate lengths are counted and collapsed into a
   * single spec with the appropriate count.  StrutBridge entries receive
   * `mustCoverIsland: true` and use an id prefixed with "strut_".
   *
   * @param bridges - Comma-separated bridge entries, e.g. "3,2,3+,4+"
   * @param colour  - Colour to apply to all created bridge types
   */
  static parseBridgesString(bridges: string, colour: string = '#8B4513'): BridgeTypeSpec[] {
    const normalCounts = new Map<number, number>();
    const strutCounts = new Map<number, number>();

    for (const raw of bridges.split(',')) {
      const part = raw.trim();
      if (!part) continue;

      if (part.endsWith('+')) {
        const len = parseInt(part.slice(0, -1), 10);
        if (!Number.isFinite(len)) continue;
        strutCounts.set(len, (strutCounts.get(len) ?? 0) + 1);
      } else {
        const len = parseInt(part, 10);
        if (!Number.isFinite(len)) continue;
        normalCounts.set(len, (normalCounts.get(len) ?? 0) + 1);
      }
    }

    const result: BridgeTypeSpec[] = [];

    for (const [length, count] of normalCounts) {
      result.push({ id: `fixed_${length}`, colour, length, count, width: 1, style: 'wooden' });
    }
    for (const [length, count] of strutCounts) {
      result.push({
        id: `strut_${length}`,
        colour,
        length,
        count,
        width: 1,
        style: 'wooden',
        mustCoverIsland: true,
      });
    }

    return result;
  }
}


