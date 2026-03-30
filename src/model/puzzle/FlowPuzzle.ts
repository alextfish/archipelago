import { BridgePuzzle, type PuzzleSpec } from "@model/puzzle/BridgePuzzle";
import type { FlowPuzzleSpec, FlowSquareSpec, GridKey, WaterChangeWaves } from "./FlowTypes";
import { gridKey, parseGridKey } from "./FlowTypes";
import { ConnectivityManager } from "@model/ConnectivityManager";

const DIR_DELTA: Record<string, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 }
};

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
    // Convert FlowPuzzleSpec to PuzzleSpec for base class
    const baseSpec: PuzzleSpec = {
      id: spec.id,
      type: spec.type,
      size: spec.size,
      islands: spec.islands,
      bridgeTypes: spec.bridgeTypes,
      constraints: spec.constraints,
      maxNumBridges: spec.maxNumBridges
    };
    super(baseSpec);

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

    const dirDelta = DIR_DELTA;

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

  /**
   * Places a bridge and returns the ordered sequence of cells that dry up.
   * Wave 0 contains the cells directly blocked by the bridge that had water.
   * Each subsequent wave contains cells that lose water downstream of the previous wave.
   * Cells that retain water via an alternative path are excluded from all waves.
   */
  placeBridgeWithWaterChanges(
    bridgeID: string,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): { success: boolean; dryingSequence: WaterChangeWaves } {
    const oldWater = new Set(this.hasWater);
    const bridgedCells = this.getBridgeCoveredCells(start, end);

    const ok = this.placeBridge(bridgeID, start, end);
    if (!ok) return { success: false, dryingSequence: [] };

    const driedUp = new Set<GridKey>();
    for (const k of oldWater) {
      if (!this.hasWater.has(k)) driedUp.add(k);
    }

    return { success: true, dryingSequence: this.computeWaterChangeWaves(bridgedCells, driedUp) };
  }

  /**
   * Removes a bridge and returns the ordered sequence of cells that gain water.
   * Wave 0 contains the cells directly unblocked by the bridge that now receive water.
   * Each subsequent wave contains cells that gain water downstream of the previous wave.
   */
  removeBridgeWithWaterChanges(bridgeID: string): WaterChangeWaves {
    const bridge = this.placedBridges.find(b => b.id === bridgeID);
    const bridgedCells: GridKey[] =
      bridge?.start && bridge?.end
        ? this.getBridgeCoveredCells(bridge.start, bridge.end)
        : [];

    const oldWater = new Set(this.hasWater);
    this.removeBridge(bridgeID);

    const gained = new Set<GridKey>();
    for (const k of this.hasWater) {
      if (!oldWater.has(k)) gained.add(k);
    }

    return this.computeWaterChangeWaves(bridgedCells, gained);
  }

  /**
   * Returns the GridKeys of the intermediate cells covered by a bridge between start and end.
   * Island endpoints are excluded; only the cells strictly between them are returned.
   */
  private getBridgeCoveredCells(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): GridKey[] {
    const cells: GridKey[] = [];
    if (start.x === end.x) {
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      for (let y = minY + 1; y < maxY; y++) cells.push(gridKey(start.x, y));
    } else if (start.y === end.y) {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      for (let x = minX + 1; x < maxX; x++) cells.push(gridKey(x, start.y));
    }
    return cells;
  }

  /**
   * Performs a BFS from startingKeys through the outgoing flow directions,
   * restricted to cells in changedCells, and returns the result as an ordered
   * array of waves. Each wave is an array of {x, y} coordinates that change
   * state at the same propagation step.
   */
  private computeWaterChangeWaves(
    startingKeys: GridKey[],
    changedCells: Set<GridKey>
  ): WaterChangeWaves {
    const waves: WaterChangeWaves = [];
    const visited = new Set<GridKey>();

    const wave0Keys = startingKeys.filter(k => changedCells.has(k));
    if (wave0Keys.length === 0) return [];

    for (const k of wave0Keys) visited.add(k);
    waves.push(wave0Keys.map(k => parseGridKey(k)));

    let currentWaveKeys = wave0Keys;
    while (currentWaveKeys.length > 0) {
      const nextWaveKeys: GridKey[] = [];
      for (const k of currentWaveKeys) {
        const pos = parseGridKey(k);
        const fs = this.flowSquares.get(k);
        if (!fs) continue;
        for (const d of fs.outgoing ?? []) {
          const delta = DIR_DELTA[d];
          if (!delta) continue;
          const nk = gridKey(pos.x + delta.dx, pos.y + delta.dy);
          if (!visited.has(nk) && changedCells.has(nk)) {
            nextWaveKeys.push(nk);
            visited.add(nk);
          }
        }
      }
      if (nextWaveKeys.length > 0) {
        waves.push(nextWaveKeys.map(k => parseGridKey(k)));
      }
      currentWaveKeys = nextWaveKeys;
    }

    return waves;
  }

  getBakedConnectivity() {
    // ConnectivityManager expects minimal functions: tileHasWater, getFlowSquare, placedBridges
    return ConnectivityManager.computeBakedConnectivity({
      width: this.width,
      height: this.height,
      tileHasWater: (x, y) => this.tileHasWater(x, y),
      getFlowSquare: (x, y) => this.getFlowSquare(x, y),
      placedBridges: this.placedBridges
    });
  }
}
