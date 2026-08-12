// model/BridgeInventory.ts
import type { Bridge } from "./Bridge";
import type { BridgeType } from "./BridgeType";
import { StrutBridge } from "./StrutBridge";

export class BridgeInventory {
  private allBridges: Bridge[] = [];
  private bridgeCounter: number = 0;

  constructor(types: (BridgeType & { count: number })[]) {
    for (const t of types) {
      for (let i = 0; i < t.count; i++) {
        this.addBridgeTypeInstance(t);
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

  hasBridge(bridgeId: string): boolean {
    return this.allBridges.some((bridge) => bridge.id === bridgeId);
  }

  addBridge(
    type: BridgeType,
    bridgeId?: string,
    start?: { x: number; y: number },
    end?: { x: number; y: number },
  ): Bridge {
    const created = this.createBridge(type, bridgeId);
    if (start) {
      created.start = { ...start };
    }
    if (end) {
      created.end = { ...end };
    }
    this.allBridges.push(created);
    return created;
  }

  private addBridgeTypeInstance(type: BridgeType): Bridge {
    const created = this.createBridge(type);
    this.allBridges.push(created);
    return created;
  }

  private createBridge(type: BridgeType, bridgeId?: string): Bridge {
    const resolvedID = bridgeId ?? this.nextBridgeID();
    this.syncCounterFromBridgeID(resolvedID);
    const bridgeType: BridgeType = {
      id: type.id,
      colour: type.colour,
      width: type.width,
      style: type.style,
      length: type.length,
      mustCoverIsland: type.mustCoverIsland,
      canCoverIsland: type.canCoverIsland,
      hasLength: type.hasLength,
      allowsSpan: type.allowsSpan,
    };

    if (type.mustCoverIsland) {
      return new StrutBridge(resolvedID, bridgeType);
    }

    return { id: resolvedID, type: bridgeType };
  }

  private nextBridgeID(): string {
    this.bridgeCounter += 1;
    return `b${this.bridgeCounter}`;
  }

  private syncCounterFromBridgeID(bridgeID: string): void {
    const match = /^b(\d+)$/.exec(bridgeID);
    if (!match) {
      return;
    }

    this.bridgeCounter = Math.max(this.bridgeCounter, Number(match[1]));
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
