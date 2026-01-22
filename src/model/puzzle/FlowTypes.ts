export type Direction = "N" | "S" | "E" | "W";

/**
 * Branded GridKey to make coordinate keys explicit in the type system.
 * Runtime value is still a simple "x,y" string but typed as GridKey.
 */
export type GridKey = string & { readonly __gridKey: unique symbol };

export function gridKey(x: number, y: number): GridKey {
  return `${x},${y}` as GridKey;
}

export function parseGridKey(k: GridKey): { x: number; y: number } {
  const [xs, ys] = (k as string).split(",").map(Number);
  return { x: xs, y: ys };
}

export interface FlowSquareSpec {
  x: number;
  y: number;
  outgoing?: Direction[]; // default []
  obstacle?: boolean;     // bridges cannot be placed across these
  rocky?: boolean;        // bridges can cross but water doesn't flow through
  pontoon?: boolean;      // fixed floating pontoon tile (walkable when baked)
  isSource?: boolean;     // source of water
}

export interface FlowPuzzleSpec {
  id: string;
  type?: string;
  size: { width: number; height: number };
  islands: any[];             // reuse existing Island spec type
  bridgeTypes: any[];         // reuse BridgeTypeSpec
  constraints?: { type: string; params?: any }[];
  maxNumBridges?: number;
  flowSquares?: FlowSquareSpec[]; // per-tile flow metadata
  edgeInputs?: { x: number; y: number }[]; // coordinates that supply water in from the edge
}
