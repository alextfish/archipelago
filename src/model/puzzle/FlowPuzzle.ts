import { BridgePuzzle } from "@model/puzzle/BridgePuzzle";
import type { FlowPuzzleSpec, FlowSquareSpec, GridKey } from "./FlowTypes";
import { gridKey, parseGridKey } from "./FlowTypes";
import { ConnectivityManager } from "@model/ConnectivityManager";
import type { Bridge } from "@model/puzzle/Bridge";

/**
 * FlowPuzzle extends BridgePuzzle with water propagation state.
 * Uses GridKey (branded string) for coordinate keys.
 */
export class FlowPuzzle extends BridgePuzzle {
  private flowSquares: Map<GridKey, FlowSquareSpec> = new Map();
  private hasWater: Set<GridKey> = new Set();
  private edgeInputs: Set<GridKey> = new Set();
  private edgeOutputCache: Set<GridKey> = new Set();

  constructor(spec: FlowPuzzleSpec) {
    super({
      id: spec.id,
      type: spec.type,
      size: spec.size,
      islands: spec.islands,
      bridgeTypes: spec.bridgeTypes,
      constraints: spec.constraints ?? [],
      maxNumBridges: spec.maxNumBridges ?? 2
    } as any);

    if (Array.isArray(spec.flowSquares)) {
      for (const fs of spec.flowSquares) {
        this.flowSquares.set(gridKey(fs.x, fs.y), { ...fs, outgoing: fs.outgoing ?? [] });
      }
    }
    if (Array.isArray(spec.edgeInputs)) {
      for (const e of spec.edgeInputs) this.edgeInputs.add(gridKey(e.x, e.y));
    }
    // Initial computation
    this.recomputeWater();
  }

  getFlowSquare(x: number, y: number): FlowSquareSpec | undefined {
    return this.flowSquares.get(gridKey(x, y));
  }

  getHasWaterGrid(): Map<GridKey, boolean> {
    const m = new Map<GridKey, boolean>();
    for (const key of this.flowSquares.keys()) {
      m.set(key, this.hasWater.has(key));
    }
    return m;
  }

  tileHasWater(x: number, y: number): boolean {
    return this.hasWater.has(gridKey(x, y));
  }

  getEdgeOutput(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const k of this.edgeOutputCache) {
      const p = parseGridKey(k);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  getEdgeOutputKeys(): GridKey[] {
    return Array.from(this.edgeOutputCache);
  }

  setEdgeInputs(inputs: { x: number; y: number }[]) {
    this.edgeInputs.clear();
    for (const e of inputs) this.edgeInputs.add(gridKey(e.x, e.y));
    this.recomputeWater();
  }

  // Override place/remove to recompute water
  placeBridge(bridgeID: string, start: { x: number; y: number }, end: { x: number; y: number }): boolean {
    const ok = super.placeBridge(bridgeID, start, end);
    if (ok) this.recomputeWater();
    return ok;
  }

  removeBridge(bridgeID: string) {
    super.removeBridge(bridgeID);
    this.recomputeWater();
  }

  // Optimised placement check prevents bridges over obstacle tiles.
  couldPlaceBridgeOfType(startIslandId: string, endIslandId: string, typeId?: string): boolean {
    const baseOk = super.couldPlaceBridgeOfType(startIslandId, endIslandId, typeId);
    if (!baseOk) return false;
    const startIsland = this.islands.find(i => i.id === startIslandId);
    const endIsland = this.islands.find(i => i.id === endIslandId);
    if (!startIsland || !endIsland) return false;

    // only axis-aligned in FlowPuzzle
    if (startIsland.x !== endIsland.x && startIsland.y !== endIsland.y) return false;

    if (startIsland.x === endIsland.x) {
      const x = startIsland.x;
      const minY = Math.min(startIsland.y, endIsland.y);
      const maxY = Math.max(startIsland.y, endIsland.y);
      for (let y = minY + 1; y < maxY; y++) {
        const fs = this.getFlowSquare(x, y);
        if (fs?.obstacle) return false;
      }
    } else {
      const y = startIsland.y;
      const minX = Math.min(startIsland.x, endIsland.x);
      const maxX = Math.max(startIsland.x, endIsland.x);
      for (let x = minX + 1; x < maxX; x++) {
        const fs = this.getFlowSquare(x, y);
        if (fs?.obstacle) return false;
      }
    }
    return true;
  }

  // Recompute water once, using a precomputed blockedCells set that includes
  // both obstacle tiles and tiles covered by placed bridges.
  recomputeWater(): void {
    this.hasWater.clear();

    // Precompute blocked cells set (obstacles + tiles covered by bridges)
    const blockedCells = new Set<GridKey>();
    for (const [k, fs] of this.flowSquares.entries()) {
      if (fs.obstacle) blockedCells.add(k);
    }
    // Add tiles covered by bridges
    for (const b of this.placedBridges) {
      if (!b.start || !b.end) continue;
      const sx = b.start.x, sy = b.start.y, ex = b.end.x, ey = b.end.y;
      if (sx === ex) {
        const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
        for (let y = minY + 1; y < maxY; y++) {
          blockedCells.add(gridKey(sx, y));
        }
      } else if (sy === ey) {
        const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
        for (let x = minX + 1; x < maxX; x++) {
          blockedCells.add(gridKey(x, sy));
        }
      }
    }

    const queue: GridKey[] = [];
    // seed from edge inputs and isSource
    for (const k of this.edgeInputs) {
      if (this.flowSquares.has(k) && !blockedCells.has(k)) {
        queue.push(k);
        this.hasWater.add(k);
      }
    }
    for (const [k, fs] of this.flowSquares.entries()) {
      if (fs.isSource && !blockedCells.has(k) && !this.hasWater.has(k)) {
        queue.push(k);
        this.hasWater.add(k);
      }
    }

    const dirDelta: Record<string, { dx: number; dy: number }> = {
      N: { dx: 0, dy: -1 },
      S: { dx: 0, dy: 1 },
      E: { dx: 1, dy: 0 },
      W: { dx: -1, dy: 0 }
    };

    while (queue.length > 0) {
      const curKey = queue.shift()!;
      const curPos = parseGridKey(curKey);
      const curFS = this.flowSquares.get(curKey);
      if (!curFS) continue;

      for (const d of curFS.outgoing ?? []) {
        const delta = dirDelta[d];
        if (!delta) continue;
        const nx = curPos.x + delta.dx;
        const ny = curPos.y + delta.dy;
        const nKey = gridKey(nx, ny);
        const nFS = this.flowSquares.get(nKey);
        if (!nFS) continue;

        // obstacle or blocked cell prevents water
        if (nFS.obstacle) continue;
        if (blockedCells.has(nKey)) continue;

        // neighbor receives water
        const already = this.hasWater.has(nKey);
        if (!already) this.hasWater.add(nKey);

        // rocky tile holds water but does not forward it
        if (!nFS.rocky && !already) {
          queue.push(nKey);
        }
      }
    }

    // update edge outputs - perimeter tiles that have water
    this.edgeOutputCache.clear();
    for (const k of this.hasWater) {
      const { x, y } = parseGridKey(k);
      if (x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1) {
        this.edgeOutputCache.add(k);
      }
    }
  }

  getBakedConnectivity() {
    // ConnectivityManager expects minimal functions: tileHasWater, getFlowSquare, placedBridges
    return ConnectivityManager.computeBakedConnectivity({
      width: this.width,
      height: this.height,
      tileHasWater: (x, y) => this.tileHasWater(x, y),
      getFlowSquare: (x, y) => this.getFlowSquare(x, y),
      placedBridges: this.placedBridges as Bridge[]
    });
  }
}
