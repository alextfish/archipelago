import type { GridKey } from '@model/puzzle/FlowTypes';

/**
 * Represents a river channel between FlowPuzzle edges.
 * All coordinates are in tile units (world tile coordinates).
 */
export interface RiverChannel {
  /** Unique identifier for this channel */
  id: string;
  
  /** Ordered list of tiles in the channel (world tile coords as GridKey) */
  tiles: GridKey[];
  
  /** ID of upstream FlowPuzzle */
  sourcePuzzleID: string;
  
  /** Edge tile in source puzzle (local coords) */
  sourceEdgeTile: { localX: number; localY: number };
  
  /** World tile X coordinate of source edge */
  sourceWorldTileX: number;
  
  /** World tile Y coordinate of source edge */
  sourceWorldTileY: number;
  
  /** ID of downstream FlowPuzzle */
  targetPuzzleID: string;
  
  /** Edge tile in target puzzle (local coords) */
  targetEdgeTile: { localX: number; localY: number };
  
  /** World tile X coordinate of target edge */
  targetWorldTileX: number;
  
  /** World tile Y coordinate of target edge */
  targetWorldTileY: number;
}
