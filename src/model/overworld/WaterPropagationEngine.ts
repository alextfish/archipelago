import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { RiverChannel } from './RiverChannel';

/**
 * Pure model class for computing water propagation across overworld.
 * Traces water from FlowPuzzle outputs through river channels to downstream puzzles.
 * Works entirely in tile coordinates (not pixels).
 */
export class WaterPropagationEngine {
  private riverChannels: RiverChannel[] = [];
  
  /** Map from puzzle edge tile (world tile coords) to list of channels starting there */
  private channelsBySource: Map<GridKey, RiverChannel[]> = new Map();
  
  /** Map from puzzle edge tile (world tile coords) to channel ending there */
  private channelsByTarget: Map<GridKey, RiverChannel> = new Map();
  
  constructor() {
    // No dependencies - pure model logic
  }
  
  /**
   * Initialize with river channels extracted from Tiled map at load time.
   */
  setRiverChannels(channels: RiverChannel[]): void {
    this.riverChannels = channels;
    this.buildChannelMaps();
  }
  
  /**
   * Build lookup maps for efficient channel queries.
   */
  private buildChannelMaps(): void {
    this.channelsBySource.clear();
    this.channelsByTarget.clear();
    
    for (const channel of this.riverChannels) {
      // Source and target are already in world tile coordinates
      const sourceKey = gridKey(channel.sourceWorldTileX, channel.sourceWorldTileY);
      
      if (!this.channelsBySource.has(sourceKey)) {
        this.channelsBySource.set(sourceKey, []);
      }
      this.channelsBySource.get(sourceKey)!.push(channel);
      
      const targetKey = gridKey(channel.targetWorldTileX, channel.targetWorldTileY);
      this.channelsByTarget.set(targetKey, channel);
    }
  }
  
  /**
   * Compute water propagation from a FlowPuzzle's edge outputs.
   * All coordinates are in tile units (not pixels).
   * 
   * @param _sourcePuzzleID - ID of the puzzle whose water state changed (not currently used but kept for future expansion)
   * @param edgeOutputs - Edge output tiles in puzzle-local coordinates
   * @param puzzleBounds - Puzzle bounds in world tile coordinates
   * @returns flooded/drained tiles and downstream inputs
   */
  computePropagation(
    _sourcePuzzleID: string,
    edgeOutputs: { localX: number; localY: number }[],
    puzzleBounds: { tileX: number; tileY: number; width: number; height: number }
  ): {
    flooded: Set<GridKey>; // World tile keys
    drained: Set<GridKey>; // World tile keys
    downstreamInputs: Map<string, { x: number; y: number }[]>;
  } {
    const flooded = new Set<GridKey>();
    const downstreamInputs = new Map<string, { x: number; y: number }[]>();
    
    // For each edge output from the source puzzle
    for (const localOutput of edgeOutputs) {
      // Convert to world tile coordinates
      const worldTileX = puzzleBounds.tileX + localOutput.localX;
      const worldTileY = puzzleBounds.tileY + localOutput.localY;
      const outputKey = gridKey(worldTileX, worldTileY);
      
      // Find channels starting from this edge
      const channels = this.channelsBySource.get(outputKey) || [];
      
      for (const channel of channels) {
        // Mark all tiles in this channel as flooded
        for (const tileKey of channel.tiles) {
          flooded.add(tileKey);
        }
        
        // Add edge input to downstream puzzle
        if (!downstreamInputs.has(channel.targetPuzzleID)) {
          downstreamInputs.set(channel.targetPuzzleID, []);
        }
        downstreamInputs.get(channel.targetPuzzleID)!.push({
          x: channel.targetEdgeTile.localX,
          y: channel.targetEdgeTile.localY
        });
      }
    }
    
    // Compute drained tiles: all channel tiles not in flooded set
    const drained = new Set<GridKey>();
    for (const channel of this.riverChannels) {
      for (const tileKey of channel.tiles) {
        if (!flooded.has(tileKey)) {
          drained.add(tileKey);
        }
      }
    }
    
    return { flooded, drained, downstreamInputs };
  }
  
  /**
   * Get all river channels (for debugging/testing).
   */
  getRiverChannels(): RiverChannel[] {
    return [...this.riverChannels];
  }
}
