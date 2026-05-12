export enum ConnectivityState {
  Blocked = "blocked",
  PassableHigh = "passableHigh",
  PassableLow = "passableLow",
  Transition = "transition"
}

export interface ConnectivityTile {
  x: number;
  y: number;
  state: ConnectivityState;
  meta?: Record<string, any>;
}

/**
 * ConnectivityManager: compute baked connectivity efficiently by precomputing
 * tiles covered by bridges once per call instead of re-scanning bridges per tile.
 */
export class ConnectivityManager {
  static computeBakedConnectivity(params: {
    width: number;
    height: number;
    tileHasWater: (x: number, y: number) => boolean;
    getFlowSquare?: (x: number, y: number) => { pontoon?: boolean; rocky?: boolean; obstacle?: boolean } | undefined;
    placedBridges?: { start?: { x: number; y: number }; end?: { x: number; y: number } }[];
  }): ConnectivityTile[] {
    const tiles: ConnectivityTile[] = [];
    const { width, height, tileHasWater, getFlowSquare, placedBridges } = params;

    // Precompute set of tiles covered by bridges for O(1) tests
    const covered = new Set<string>();
    if (placedBridges) {
      for (const b of placedBridges) {
        if (!b.start || !b.end) continue;
        const sx = b.start.x, sy = b.start.y, ex = b.end.x, ey = b.end.y;
        if (sx === ex) {
          const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
          for (let y = minY + 1; y < maxY; y++) covered.add(`${sx},${y}`);
        } else if (sy === ey) {
          const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
          for (let x = minX + 1; x < maxX; x++) covered.add(`${x},${sy}`);
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fs = getFlowSquare ? getFlowSquare(x, y) : undefined;
        const hasWater = tileHasWater(x, y);
        const key = `${x},${y}`;
        let state: ConnectivityState;

        if (fs?.obstacle) {
          state = ConnectivityState.Blocked;
        } else if (covered.has(key)) {
          state = ConnectivityState.PassableHigh;
        } else if (fs?.pontoon) {
          // pontoons float: high if water present, low otherwise
          state = hasWater ? ConnectivityState.PassableHigh : ConnectivityState.PassableLow;
        } else if (hasWater) {
          // water (without pontoon) blocks traversal
          state = ConnectivityState.Blocked;
        } else if (fs?.rocky) {
          // rocky ground without water is blocked (as requested)
          state = ConnectivityState.Blocked;
        } else {
          state = ConnectivityState.PassableLow;
        }

        tiles.push({ x, y, state, meta: { pontoon: !!fs?.pontoon, rocky: !!fs?.rocky, obstacle: !!fs?.obstacle } });
      }
    }
    return tiles;
  }
}
