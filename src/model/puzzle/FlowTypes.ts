import type { Island } from "./Island";
import type { BridgeTypeSpec } from "./BridgePuzzle";

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
  islands: Island[];
  bridgeTypes: BridgeTypeSpec[];
  constraints: { type: string; params?: any }[];
  maxNumBridges: number;
  flowSquares?: FlowSquareSpec[]; // per-tile flow metadata
  edgeInputs?: { x: number; y: number }[]; // coordinates that supply water in from the edge
}

/**
 * A sequence of cell waves describing how water state changes propagate across the flow grid.
 * Each entry is a set of cells that change state simultaneously at that step.
 *
 * On bridge placement: cells that dry up, starting from the newly blocked cells and
 * progressing downstream following the outgoing flow directions.
 * On bridge removal: cells that gain water, starting from the newly unblocked cells and
 * progressing downstream.
 */
export type WaterChangeWaves = Array<Array<{ x: number; y: number }>>;
