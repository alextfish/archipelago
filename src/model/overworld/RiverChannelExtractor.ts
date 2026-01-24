import type { RiverChannel } from './RiverChannel';
import type { GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';

/**
 * Extracts river channel connectivity from Tiled map layer.
 * Analyzes "flowingWater" layer (or similar) to find continuous channels
 * connecting FlowPuzzle edge tiles.
 * Works entirely in tile coordinates (not pixels).
 */
export class RiverChannelExtractor {
  /**
   * Extract river channels from Tiled map data.
   * Uses flood-fill algorithm to trace connected water tiles.
   * 
   * @param tiledMapData - Tiled map JSON data
   * @param flowLayerName - Name of layer containing water tiles (e.g., "flowingWater")
   * @param puzzleRegions - Map of puzzle IDs to their bounds and edge tiles (in tile coordinates)
   * @returns List of river channels connecting puzzles
   */
  static extractChannels(
    tiledMapData: any,
    flowLayerName: string,
    puzzleRegions: Map<string, {
      bounds: { tileX: number; tileY: number; width: number; height: number };
      edgeTiles: { x: number; y: number; edge: 'N' | 'S' | 'E' | 'W' }[];
    }>
  ): RiverChannel[] {
    const channels: RiverChannel[] = [];
    
    // 1. Find the flow layer in Tiled data
    const flowLayer = tiledMapData.layers?.find((l: any) => l.name === flowLayerName);
    if (!flowLayer) {
      console.warn(`Flow layer "${flowLayerName}" not found in Tiled map`);
      return channels;
    }
    
    // 2. Build a grid of water tiles from layer data (in tile coordinates)
    const waterGrid = this.buildWaterGrid(flowLayer, tiledMapData.width, tiledMapData.height);
    
    // 3. For each puzzle edge tile, trace downstream to find channels
    for (const [puzzleID, region] of puzzleRegions) {
      for (const edgeTile of region.edgeTiles) {
        // Convert local edge tile to world tile coordinates
        const worldTileX = region.bounds.tileX + edgeTile.x;
        const worldTileY = region.bounds.tileY + edgeTile.y;
        
        const channel = this.traceChannel(
          puzzleID,
          { localX: edgeTile.x, localY: edgeTile.y, edge: edgeTile.edge },
          worldTileX,
          worldTileY,
          waterGrid,
          puzzleRegions
        );
        if (channel) {
          channels.push(channel);
        }
      }
    }
    
    return channels;
  }
  
  /**
   * Build a grid of water tiles from Tiled layer data.
   * Returns a set of GridKeys for tiles with water.
   */
  private static buildWaterGrid(flowLayer: any, mapWidth: number, mapHeight: number): Set<GridKey> {
    const waterGrid = new Set<GridKey>();
    
    // Handle both data array and data property
    const data = flowLayer.data;
    if (!data) {
      return waterGrid;
    }
    
    // Tiled stores tile data in a flat array, row by row
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const index = y * mapWidth + x;
        const tileGID = data[index];
        
        // Non-zero GID means a tile is present
        if (tileGID && tileGID > 0) {
          waterGrid.add(gridKey(x, y));
        }
      }
    }
    
    return waterGrid;
  }
  
  /**
   * Trace a channel from a source puzzle edge to a target puzzle edge.
   * Uses flood-fill algorithm starting from the source edge tile.
   */
  private static traceChannel(
    sourcePuzzleID: string,
    sourceEdge: { localX: number; localY: number; edge: 'N' | 'S' | 'E' | 'W' },
    sourceWorldTileX: number,
    sourceWorldTileY: number,
    waterGrid: Set<GridKey>,
    puzzleRegions: Map<string, any>
  ): RiverChannel | null {
    // Start position is just outside the source puzzle edge
    const startKey = this.getAdjacentTile(sourceWorldTileX, sourceWorldTileY, sourceEdge.edge);
    if (!startKey || !waterGrid.has(startKey)) {
      // No water adjacent to this edge
      return null;
    }
    
    // Flood-fill to trace the channel
    const visited = new Set<GridKey>();
    const channelTiles: GridKey[] = [];
    const queue: GridKey[] = [startKey];
    
    let targetPuzzleID: string | null = null;
    let targetEdgeTile: { localX: number; localY: number } | null = null;
    let targetWorldTileX: number | null = null;
    let targetWorldTileY: number | null = null;
    
    while (queue.length > 0) {
      const currentKey = queue.shift()!;
      
      if (visited.has(currentKey)) {
        continue;
      }
      visited.add(currentKey);
      
      // Skip if not a water tile
      if (!waterGrid.has(currentKey)) {
        continue;
      }
      
      channelTiles.push(currentKey);
      
      // Check if we've reached another puzzle edge
      const targetInfo = this.checkPuzzleEdge(currentKey, puzzleRegions, sourcePuzzleID);
      if (targetInfo) {
        targetPuzzleID = targetInfo.puzzleID;
        targetEdgeTile = targetInfo.localEdge;
        targetWorldTileX = targetInfo.worldTileX;
        targetWorldTileY = targetInfo.worldTileY;
        break; // Found target, stop tracing
      }
      
      // Add adjacent water tiles to queue
      const neighbors = this.getNeighbors(currentKey);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor) && waterGrid.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    
    // Only create channel if we found a target
    if (targetPuzzleID && targetEdgeTile && targetWorldTileX !== null && targetWorldTileY !== null && channelTiles.length > 0) {
      return {
        id: `${sourcePuzzleID}-to-${targetPuzzleID}`,
        tiles: channelTiles,
        sourcePuzzleID,
        sourceEdgeTile: { localX: sourceEdge.localX, localY: sourceEdge.localY },
        sourceWorldTileX,
        sourceWorldTileY,
        targetPuzzleID,
        targetEdgeTile,
        targetWorldTileX,
        targetWorldTileY
      };
    }
    
    return null;
  }
  
  /**
   * Get the tile adjacent to the given tile in the specified direction.
   */
  private static getAdjacentTile(x: number, y: number, edge: 'N' | 'S' | 'E' | 'W'): GridKey | null {
    switch (edge) {
      case 'N': return gridKey(x, y - 1);
      case 'S': return gridKey(x, y + 1);
      case 'E': return gridKey(x + 1, y);
      case 'W': return gridKey(x - 1, y);
      default: return null;
    }
  }
  
  /**
   * Get all 4-connected neighbors of a tile.
   */
  private static getNeighbors(key: GridKey): GridKey[] {
    const [xStr, yStr] = (key as string).split(',');
    const x = Number.parseInt(xStr);
    const y = Number.parseInt(yStr);
    
    return [
      gridKey(x, y - 1), // North
      gridKey(x, y + 1), // South
      gridKey(x + 1, y), // East
      gridKey(x - 1, y)  // West
    ];
  }
  
  /**
   * Check if a tile is adjacent to an edge of a puzzle (not the source puzzle).
   * Returns puzzle info if found, null otherwise.
   */
  private static checkPuzzleEdge(
    tileKey: GridKey,
    puzzleRegions: Map<string, any>,
    excludePuzzleID: string
  ): { puzzleID: string; localEdge: { localX: number; localY: number }; worldTileX: number; worldTileY: number } | null {
    const [xStr, yStr] = (tileKey as string).split(',');
    const worldX = Number.parseInt(xStr);
    const worldY = Number.parseInt(yStr);
    
    for (const [puzzleID, region] of puzzleRegions) {
      if (puzzleID === excludePuzzleID) {
        continue; // Skip source puzzle
      }
      
      const { bounds, edgeTiles } = region;
      
      // Check each edge tile to see if the water tile is adjacent to it
      for (const edgeTile of edgeTiles) {
        const edgeWorldX = bounds.tileX + edgeTile.x;
        const edgeWorldY = bounds.tileY + edgeTile.y;
        
        // Check if water tile is adjacent to this edge tile
        const isAdjacent = 
          (worldX === edgeWorldX && Math.abs(worldY - edgeWorldY) === 1) ||
          (worldY === edgeWorldY && Math.abs(worldX - edgeWorldX) === 1);
        
        if (isAdjacent) {
          return {
            puzzleID,
            localEdge: { localX: edgeTile.x, localY: edgeTile.y },
            worldTileX: edgeWorldX,
            worldTileY: edgeWorldY
          };
        }
      }
    }
    
    return null;
  }
}
