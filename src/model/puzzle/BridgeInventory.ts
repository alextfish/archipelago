// model/BridgeInventory.ts
import type { Bridge } from "./Bridge";
import type { BridgeType } from "./BridgeType";

export class BridgeInventory {
  private allBridges: Bridge[] = [];

  constructor(types: (BridgeType & { count: number })[]) {
    let counter = 0;
    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        this.allBridges.push({
          id: `b${++counter}`,
          type: { id: t.id, colour: t.colour, width: t.width, style: t.style, length: t.length },
        });
      }
    }
  }

  /** Returns all bridges, whether placed or not */
  get bridges(): Bridge[] { return this.allBridges; }
  get bridgeTypes(): BridgeType[] { 
    // uniquify the types by id, but then return the original objects
    const unique = [
      ...new Map(
        this.allBridges.map(bridge => [bridge.type.id, bridge])
      ).values()
    ];
    return unique.map(bridge => bridge.type);
  }

  /** Returns unplaced bridges of a given type */
  getAvailableOfType(typeId: string): Bridge[] {
    return this.allBridges.filter(b => b.type.id === typeId && !b.start && !b.end);
  }

  /** Take the next available bridge of the given type */
  takeBridge(typeId: string): Bridge | undefined {
    const available = this.getAvailableOfType(typeId);
    return available.length ? available[0] : undefined;
  }

  /** Mark a bridge as returned to pool (after removal) */
  returnBridge(bridgeId: string): void {
    const bridge = this.allBridges.find(b => b.id === bridgeId);
    if (bridge) {
      delete bridge.start;
      delete bridge.end;
    }
  }

  /** Number of remaining bridges of each type */
  countsByType(): Record<string, number> {
    // Ensure every declared bridge type appears in the result (even if zero)
    const counts: Record<string, number> = {};
    for (const b of this.allBridges) {
      if (!(b.type.id in counts)) counts[b.type.id] = 0;
    }
    for (const b of this.allBridges) {
      if (!b.start && !b.end) {
        counts[b.type.id] = counts[b.type.id] + 1;
      }
    }
    return counts;
  }
}
