import { describe, it, expect } from "vitest";
import { ConnectivityManager, ConnectivityState } from "@model/ConnectivityManager";

describe("ConnectivityManager", () => {
  it("computes pontoon passability according to water presence", () => {
    const width = 3, height = 1;
    const flowSquares = new Map<string, any>();
    flowSquares.set("1,0", { pontoon: true });
    const tiles = ConnectivityManager.computeBakedConnectivity({
      width, height,
      tileHasWater: (x, y) => x === 1 && y === 0,
      getFlowSquare: (x, y) => flowSquares.get(`${x},${y}`),
      placedBridges: []
    });
    const t = tiles.find(t => t.x === 1 && t.y === 0)!;
    expect(t.state).toBe(ConnectivityState.PassableHigh);

    const tiles2 = ConnectivityManager.computeBakedConnectivity({
      width, height,
      tileHasWater: (_x, _y) => false,
      getFlowSquare: (x, y) => flowSquares.get(`${x},${y}`),
      placedBridges: []
    });
    const t2 = tiles2.find(t => t.x === 1 && t.y === 0)!;
    expect(t2.state).toBe(ConnectivityState.PassableLow);
  });

  it("marks bridged tiles as passableHigh", () => {
    const width = 5, height = 1;
    const tiles = ConnectivityManager.computeBakedConnectivity({
      width, height,
      tileHasWater: () => false,
      getFlowSquare: () => undefined,
      placedBridges: [{ start: { x: 1, y: 0 }, end: { x: 4, y: 0 } }]
    });
    const mid = tiles.find(t => t.x === 2 && t.y === 0)!;
    expect(mid.state).toBe(ConnectivityState.PassableHigh);
  });
});
