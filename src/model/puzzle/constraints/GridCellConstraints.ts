import type { BridgePuzzle } from "../BridgePuzzle";
import type { Bridge } from "../Bridge";
import type { ConstraintResult } from "./ConstraintResult";
import { Constraint } from "./Constraint";

type Point = { x: number; y: number };

/**
 * Base class for constraints that apply to a specific grid cell.
 */
abstract class GridCellConstraint extends Constraint {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        super();
        this.x = x;
        this.y = y;
    }

    // Subclasses should implement their own static fromSpec

    protected adjacentPoints(): Point[] {
        return [
            { x: this.x + 1, y: this.y },
            { x: this.x - 1, y: this.y },
            { x: this.x, y: this.y + 1 },
            { x: this.x, y: this.y - 1 },
        ];
    }

    protected findTouchingBridge(puzzle: BridgePuzzle, orientation: string): Bridge[] {
        return puzzle.bridges.filter(thisBridge => {
            if (!thisBridge.start || !thisBridge.end) return false;
            const { start, end } = thisBridge;
            switch (orientation) {
                case "horizontal":
                    const isHorizontal = start.y === end.y;
                    if (!isHorizontal) return false;
                    // Bridge is horizontal: y is constant, x varies
                    const y = start.y;
                    const minX = Math.min(start.x, end.x);
                    const maxX = Math.max(start.x, end.x);
                    // Adjacent if cell is directly above/below the bridge and within its x-range
                    return (
                        (this.y === y + 1 || this.y === y - 1) &&
                        this.x >= minX && this.x <= maxX
                    );
                    break;
                case "vertical":
                    const isVertical = start.x === end.x;
                    if (!isVertical) return false;
                    // Bridge is vertical: x is constant, y varies
                    const x = start.x;
                    const minY = Math.min(start.y, end.y);
                    const maxY = Math.max(start.y, end.y);
                    // Adjacent if cell is directly left/right of the bridge and within its y-range
                    return (
                        (this.x === x + 1 || this.x === x - 1) &&
                        this.y >= minY && this.y <= maxY
                    );
                    break;
                default:
                    console.error(`Unknown orientation: ${orientation}`);
                    return false;
            }
        });
    }
}
/**
 * Requires that at least one horizontally oriented bridge runs orthogonally
 * adjacent to the given grid space.
 */
export class MustTouchAHorizontalBridge extends GridCellConstraint {
    static fromSpec(params: { x: number; y: number; [key: string]: any  }): MustTouchAHorizontalBridge {
        return new MustTouchAHorizontalBridge(params.x, params.y);
    }
    check(puzzle: BridgePuzzle): ConstraintResult {
        const touching = this.findTouchingBridge(puzzle, "horizontal");

        const ok = touching.length > 0;
        this.violations = ok ? [] : [`${this.x},${this.y}`];

        return {
            satisfied: ok,
            affectedElements: ok ? touching.map(b => b.id) : [],
            message: ok
                ? undefined
                : `No horizontal bridge adjacent to space (${this.x}, ${this.y})`,
            glyphMessage: ok ? undefined : "no adjacent bridge",
        };
    }
}

/**
 * Requires that at least one vertically oriented bridge runs orthogonally
 * adjacent to the given grid space.
 */
export class MustTouchAVerticalBridge extends GridCellConstraint {
    static fromSpec(params: { x: number; y: number; [key: string]: any  }): MustTouchAVerticalBridge {
        return new MustTouchAVerticalBridge(params.x, params.y);
    }
    check(puzzle: BridgePuzzle): ConstraintResult {
        const touching = this.findTouchingBridge(puzzle, "vertical");

        const ok = touching.length > 0;
        this.violations = ok ? [] : [`${this.x},${this.y}`];

        return {
            satisfied: ok,
            affectedElements: ok ? touching.map(b => b.id) : [],
            message: ok
                ? undefined
                : `No vertical bridge adjacent to space (${this.x}, ${this.y})`,
            glyphMessage: ok ? undefined : "no adjacent bridge",
        };
    }
}
