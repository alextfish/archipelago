import { Constraint } from './Constraint';
/**
 * Constraint for Farmlands puzzle type: Empty grid cells may have markers (N dots)
 * indicating they must be in an enclosed area of exactly size N, bounded by bridges
 * on all sides.
 *
 * Special case: N=0 means the cell must either be covered by a bridge OR be open
 * to the outside (not in a fully enclosed area).
 */
export class EnclosedAreaSizeConstraint extends Constraint {
    x;
    y;
    expectedSize;
    constructor(x, y, expectedSize) {
        super();
        this.x = x;
        this.y = y;
        this.expectedSize = expectedSize;
    }
    static fromSpec(params) {
        return new EnclosedAreaSizeConstraint(params.x, params.y, params.size);
    }
    check(puzzle) {
        // Check if cell is covered by a bridge
        const isCovered = this.isCellCoveredByBridge(puzzle, this.x, this.y);
        if (this.expectedSize === 0) {
            // Special case: must be covered OR open to outside
            if (isCovered) {
                return {
                    satisfied: true,
                    affectedElements: [],
                    message: undefined
                };
            }
            // Check if open to outside
            const areaInfo = this.getEnclosedAreaSize(puzzle, this.x, this.y);
            const ok = !areaInfo.isEnclosed;
            this.violations = ok ? [] : [`${this.x},${this.y}`];
            return {
                satisfied: ok,
                affectedElements: ok ? [] : [`${this.x},${this.y}`],
                message: ok ? undefined :
                    `Cell (${this.x}, ${this.y}) with size=0 must be covered by a bridge or open to outside, but is in an enclosed area`,
                glyphMessage: ok ? undefined : "area must-not enclosed"
            };
        }
        // Normal case: must be in enclosed area of specific size
        if (isCovered) {
            // Cell is covered by a bridge, cannot be in an empty area
            this.violations = [`${this.x},${this.y}`];
            return {
                satisfied: false,
                affectedElements: [`${this.x},${this.y}`],
                message: `Cell (${this.x}, ${this.y}) is covered by a bridge but should be in an enclosed area of size ${this.expectedSize}`,
                glyphMessage: "must-not bridge over me"
            };
        }
        const areaInfo = this.getEnclosedAreaSize(puzzle, this.x, this.y);
        const ok = areaInfo.isEnclosed && areaInfo.size === this.expectedSize;
        this.violations = ok ? [] : [`${this.x},${this.y}`];
        let glyphMessage;
        if (!ok) {
            if (!areaInfo.isEnclosed) {
                glyphMessage = "area not enclosed";
            }
            else if (areaInfo.size > this.expectedSize) {
                glyphMessage = "too-many enclosed area";
            }
            else {
                glyphMessage = "not-enough enclosed area";
            }
        }
        return {
            satisfied: ok,
            affectedElements: ok ? areaInfo.cells : [`${this.x},${this.y}`, ...areaInfo.cells],
            message: ok ? undefined :
                areaInfo.isEnclosed
                    ? `Cell (${this.x}, ${this.y}) is in an enclosed area of size ${areaInfo.size}, but requires size ${this.expectedSize}`
                    : `Cell (${this.x}, ${this.y}) is not in a fully enclosed area (requires size ${this.expectedSize})`,
            glyphMessage
        };
    }
    isCellCoveredByBridge(puzzle, x, y) {
        return puzzle.placedBridges.some(bridge => {
            if (!bridge.start || !bridge.end)
                return false;
            // Check horizontal bridge
            if (bridge.start.y === bridge.end.y && bridge.start.y === y) {
                const minX = Math.min(bridge.start.x, bridge.end.x);
                const maxX = Math.max(bridge.start.x, bridge.end.x);
                return x >= minX && x <= maxX;
            }
            // Check vertical bridge
            if (bridge.start.x === bridge.end.x && bridge.start.x === x) {
                const minY = Math.min(bridge.start.y, bridge.end.y);
                const maxY = Math.max(bridge.start.y, bridge.end.y);
                return y >= minY && y <= maxY;
            }
            return false;
        });
    }
    /**
     * Create a matrix marking occupied cells (1 = bridge or island, 0 = empty)
     */
    createOccupancyMatrix(puzzle) {
        const matrix = [];
        // Initialize matrix with 0s
        for (let y = 0; y <= puzzle.height; y++) {
            matrix[y] = new Array(puzzle.width + 1).fill(0);
        }
        // Mark islands as occupied
        for (const island of puzzle.islands) {
            matrix[island.y][island.x] = 1;
        }
        // Mark bridge positions as occupied
        for (const bridge of puzzle.placedBridges) {
            if (!bridge.start || !bridge.end)
                continue;
            const startX = bridge.start.x;
            const startY = bridge.start.y;
            const endX = bridge.end.x;
            const endY = bridge.end.y;
            // Mark all cells covered by the bridge
            if (startY === endY) {
                // Horizontal bridge
                const minX = Math.min(startX, endX);
                const maxX = Math.max(startX, endX);
                for (let x = minX; x <= maxX; x++) {
                    matrix[startY][x] = 1;
                }
            }
            else if (startX === endX) {
                // Vertical bridge
                const minY = Math.min(startY, endY);
                const maxY = Math.max(startY, endY);
                for (let y = minY; y <= maxY; y++) {
                    matrix[y][startX] = 1;
                }
            }
        }
        return matrix;
    }
    isOutOfBounds(x, y, puzzle) {
        return x <= 0 || x >= puzzle.width || y <= 0 || y >= puzzle.height;
    }
    getEnclosedAreaSize(puzzle, startX, startY) {
        // Create occupancy matrix once
        const matrix = this.createOccupancyMatrix(puzzle);
        const visited = new Set();
        const queue = [{ x: startX, y: startY }];
        const cellKey = (x, y) => `${x},${y}`;
        visited.add(cellKey(startX, startY));
        let isEnclosed = true;
        const cells = [];
        while (queue.length > 0 && isEnclosed) {
            const { x, y } = queue.shift();
            cells.push(cellKey(x, y));
            // Check if we've reached the boundary of the puzzle
            if (this.isOutOfBounds(x, y, puzzle)) {
                isEnclosed = false;
                break; // Exit the while loop immediately
            }
            // Try to expand in all four directions
            const directions = [
                { dx: 0, dy: -1 }, // up
                { dx: 0, dy: 1 }, // down
                { dx: -1, dy: 0 }, // left
                { dx: 1, dy: 0 } // right
            ];
            for (const { dx, dy } of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const key = cellKey(nx, ny);
                if (visited.has(key))
                    continue;
                // Stop expanding if we go outside the puzzle bounds
                if (this.isOutOfBounds(nx, ny, puzzle)) {
                    isEnclosed = false;
                    // Continue to process other directions but will exit while loop on next iteration
                    continue;
                }
                // Check if the next cell is occupied (bridge or island) using the matrix
                if (matrix[ny][nx] === 1) {
                    continue;
                }
                // Add to queue
                visited.add(key);
                queue.push({ x: nx, y: ny });
            }
        }
        return { size: cells.length, isEnclosed, cells };
    }
}
