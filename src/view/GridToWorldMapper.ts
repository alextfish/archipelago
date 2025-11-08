// view/GridToWorldMapper.ts
// Utility class to map puzzle grid coordinates to Phaser world positions
// Supports configurable cell size, camera offset, and viewport
// Will enable both standalone scenes and in-overworld puzzles

export interface CameraConfig {
  offsetX?: number;
  offsetY?: number;
}

export class GridToWorldMapper {
  private cellSize: number;
  private offsetX: number;
  private offsetY: number;

  constructor(cellSize: number = 32, cameraConfig?: CameraConfig) {
    this.cellSize = cellSize;
    this.offsetX = cameraConfig?.offsetX ?? 0;
    this.offsetY = cameraConfig?.offsetY ?? 0;
  }

  /**
   * Converts grid coordinates to world pixel coordinates
   * @param gridX Grid x coordinate
   * @param gridY Grid y coordinate
   * @returns World position {x, y}
   */
  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: gridX * this.cellSize + this.offsetX,
      y: gridY * this.cellSize + this.offsetY,
    };
  }

  /**
   * Converts world pixel coordinates to grid coordinates
   * @param worldX World x pixel
   * @param worldY World y pixel
   * @returns Grid position {x, y}
   */
  worldToGrid(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor((worldX - this.offsetX) / this.cellSize),
      y: Math.floor((worldY - this.offsetY) / this.cellSize),
    };
  }

  /**
   * Gets the cell size in pixels
   */
  getCellSize(): number {
    return this.cellSize;
  }

  /**
   * Updates the camera offset
   */
  setCameraOffset(offsetX: number, offsetY: number): void {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }
}

