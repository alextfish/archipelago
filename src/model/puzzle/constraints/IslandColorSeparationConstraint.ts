import type { BridgePuzzle } from '../BridgePuzzle';
import { Constraint } from './Constraint';
import type { ConstraintResult } from './ConstraintResult';
import type { Island } from '../Island';

/**
 * Constraint for Fire Culture puzzle type: Islands of different colours/types
 * must NOT be connected via bridges.
 * 
 * This constraint uses a flood-fill algorithm to find connected components
 * and ensures that islands of different colours never appear in the same
 * connected component.
 */
export class IslandColorSeparationConstraint extends Constraint {
  private color1: string;
  private color2: string;

  constructor(color1: string, color2: string) {
    super();
    this.color1 = color1;
    this.color2 = color2;
  }

  static fromSpec(params: { color1: string; color2: string; [key: string]: any }): IslandColorSeparationConstraint {
    return new IslandColorSeparationConstraint(params.color1, params.color2);
  }

  check(puzzle: BridgePuzzle): ConstraintResult {
    // Build adjacency map of connected islands
    const adjacencyMap = new Map<string, Set<string>>();
    
    for (const island of puzzle.islands) {
      adjacencyMap.set(island.id, new Set<string>());
    }

    // Populate adjacency map from placed bridges
    for (const bridge of puzzle.placedBridges) {
      if (!bridge.start || !bridge.end) continue;

      const startIsland = puzzle.islands.find(i => i.x === bridge.start!.x && i.y === bridge.start!.y);
      const endIsland = puzzle.islands.find(i => i.x === bridge.end!.x && i.y === bridge.end!.y);

      if (startIsland && endIsland) {
        adjacencyMap.get(startIsland.id)!.add(endIsland.id);
        adjacencyMap.get(endIsland.id)!.add(startIsland.id);
      }
    }

    // Find all connected components using BFS
    const visited = new Set<string>();
    const violations: string[] = [];

    for (const island of puzzle.islands) {
      if (visited.has(island.id)) continue;

      // BFS to find connected component
      const component: Island[] = [];
      const queue: string[] = [island.id];
      visited.add(island.id);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentIsland = puzzle.islands.find(i => i.id === currentId)!;
        component.push(currentIsland);

        for (const neighborId of adjacencyMap.get(currentId)!) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }

      // Check if this component contains islands of both colours
      const hasColor1 = component.some(i => this.getIslandColor(i) === this.color1);
      const hasColor2 = component.some(i => this.getIslandColor(i) === this.color2);

      if (hasColor1 && hasColor2) {
        // Violation: this component mixes both colours
        violations.push(...component.map(i => i.id));
      }
    }

    this.violations = violations;
    const ok = violations.length === 0;

    let glyphMessage: string | undefined;
    if (!ok) {
      // Generate glyph message like "red island must-not connected blue island"
      glyphMessage = `${this.color1} island must-not connected ${this.color2} island`;
    }

    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? undefined : `Islands of colour ${this.color1} must not connect to islands of colour ${this.color2}`,
      glyphMessage
    };
  }

  /**
   * Extract colour from island constraints.
   * Expects a constraint like "color=red" or "colour=blue"
   */
  private getIslandColor(island: Island): string | undefined {
    const colorConstraint = island.constraints?.find(c => 
      c.startsWith('color=') || c.startsWith('colour=')
    );
    
    if (!colorConstraint) return undefined;
    
    return colorConstraint.split('=')[1];
  }
}
