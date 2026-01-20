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
export class IslandColourSeparationConstraint extends Constraint {
  private colour1: string;
  private colour2: string;

  constructor(colour1: string, colour2: string) {
    super();
    this.colour1 = colour1;
    this.colour2 = colour2;
  }

  static fromSpec(params: { colour1: string; colour2: string; [key: string]: any }): IslandColourSeparationConstraint {
    return new IslandColourSeparationConstraint(params.colour1, params.colour2);
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
      const hasColour1 = component.some(i => this.getIslandColour(i) === this.colour1);
      const hasColour2 = component.some(i => this.getIslandColour(i) === this.colour2);

      if (hasColour1 && hasColour2) {
        // Violation: this component mixes both colours
        violations.push(...component.map(i => i.id));
      }
    }

    this.violations = violations;
    const ok = violations.length === 0;

    let glyphMessage: string | undefined;
    if (!ok) {
      // Generate glyph message like "red island must-not connected blue island"
      glyphMessage = `${this.colour1} island must-not connected ${this.colour2} island`;
    }

    return {
      satisfied: ok,
      affectedElements: violations,
      message: ok ? undefined : `Islands of colour ${this.colour1} must not connect to islands of colour ${this.colour2}`,
      glyphMessage
    };
  }

  /**
   * Extract colour from island constraints.
   * Expects a constraint like "colour=red" or "colour=blue"
   */
  private getIslandColour(island: Island): string | undefined {
    const colourConstraint = island.constraints?.find(c => 
      c.startsWith('colour=')
    );
    
    if (!colourConstraint) return undefined;
    
    return colourConstraint.split('=')[1];
  }
}
