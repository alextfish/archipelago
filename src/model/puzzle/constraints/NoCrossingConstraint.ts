import type { BridgePuzzle } from "../BridgePuzzle";
import { Constraint } from "./Constraint";
import type { ConstraintResult } from "./ConstraintResult";
import type { Point } from "../Point";

/**
 * A bridge constraint ensuring that no two bridges cross each other
 * (excluding shared endpoints).
 */
export class NoCrossingConstraint extends Constraint {
  static fromSpec(_params: { [key: string]: any }): NoCrossingConstraint {
    return new NoCrossingConstraint();
  }
  check(puzzle: BridgePuzzle): ConstraintResult {
    const bridges = puzzle.bridges;
    const violations: string[] = [];

    for (let i = 0; i < bridges.length; i++) {
      const b1 = bridges[i];
      if (!b1.start || !b1.end) continue;

      for (let j = i + 1; j < bridges.length; j++) {
        const b2 = bridges[j];
        if (!b2.start || !b2.end) continue;

        if (this.cross(b1.start, b1.end, b2.start, b2.end)) {
          violations.push(`${b1.id}:${b2.id}`);
        }
      }
    }

    this.violations = violations;

    const ok = violations.length === 0;
    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? undefined : `Crossing bridges detected: ${violations.join(", ")}`
    };
  }

  private cross(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ): boolean {
    // Exclude any shared endpoints
    const sharesEndpoint =
      (a1.x === b1.x && a1.y === b1.y) ||
      (a1.x === b2.x && a1.y === b2.y) ||
      (a2.x === b1.x && a2.y === b1.y) ||
      (a2.x === b2.x && a2.y === b2.y);
    if (sharesEndpoint) return false;

    // Helper for 2D line intersection using cross products
    //const ccw = (p1, p2, p3) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    
    function ccw(p1: Point, p2: Point, p3: Point): boolean {
        return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    }
    function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    return segmentsIntersect(a1, a2, b1, b2);
  }
}
