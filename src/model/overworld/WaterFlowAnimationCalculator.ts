import type { Direction, GridKey } from '@model/puzzle/FlowTypes';
import { gridKey } from '@model/puzzle/FlowTypes';
import type { WaterDirectionTile } from './WaterDirectionReader';

const DIRECTION_ORDER: Direction[] = ['N', 'E', 'S', 'W'];

const DELTA_BY_DIRECTION: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 }
};

const OPPOSITE: Record<Direction, Direction> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E'
};

const DIRECTION_TOKEN_BY_SET_KEY: ReadonlyMap<string, string> = new Map([
  ['N', 'N'],
  ['E', 'E'],
  ['S', 'S'],
  ['W', 'W'],
  ['N,S', 'NS'],
  ['E,W', 'EW'],
  ['N,E', 'NE'],
  ['N,W', 'NW'],
  ['E,S', 'SE'],
  ['S,W', 'SW'],
  ['N,E,S', 'NSE'],
  ['N,S,W', 'NSW'],
  ['N,E,W', 'NEW'],
  ['E,S,W', 'SEW']
]);

/**
 * Computes flow animation keys from water-direction tiles with 2-step pruning.
 */
export class WaterFlowAnimationCalculator {
  static calculateAnimationByTile(
    tiles: Map<GridKey, WaterDirectionTile>
  ): Map<GridKey, string> {
    const result = new Map<GridKey, string>();

    for (const [tileKey, tile] of tiles) {
      const incoming = this.getIncomingDirections(tileKey, tiles).filter(incomingDir =>
        this.isIncomingValid(tileKey, incomingDir, tiles)
      );

      if (incoming.length === 0) continue;

      const outgoing = this.getOutgoingDirections(tileKey, tile, incoming, tiles);
      if (outgoing.length === 0) continue;

      const incomingToken = this.directionsToken(incoming);
      const outgoingToken = this.directionsToken(outgoing);
      if (!incomingToken || !outgoingToken) continue;

      result.set(tileKey, `flow_${incomingToken}-to-${outgoingToken}`);
    }

    return result;
  }

  static allAnimationKeys(): string[] {
    const keys: string[] = [];
    const subsets = this.nonEmptySubsets(DIRECTION_ORDER);

    for (const incoming of subsets) {
      const remaining = DIRECTION_ORDER.filter(d => !incoming.includes(d));
      const outgoingSubsets = this.nonEmptySubsets(remaining);
      for (const outgoing of outgoingSubsets) {
        const incomingToken = this.directionsToken(incoming);
        const outgoingToken = this.directionsToken(outgoing);
        if (incomingToken && outgoingToken) {
          keys.push(`flow_${incomingToken}-to-${outgoingToken}`);
        }
      }
    }

    return keys;
  }

  private static getIncomingDirections(
    tileKey: GridKey,
    tiles: Map<GridKey, WaterDirectionTile>
  ): Direction[] {
    const { x, y } = this.parseKey(tileKey);
    const incoming: Direction[] = [];

    for (const direction of DIRECTION_ORDER) {
      const neighbour = this.neighbourKey(x, y, direction);
      const neighbourTile = tiles.get(neighbour);
      if (!neighbourTile) continue;
      if (neighbourTile.outgoing.includes(OPPOSITE[direction])) {
        incoming.push(direction);
      }
    }

    return incoming;
  }

  private static getOutgoingDirections(
    tileKey: GridKey,
    tile: WaterDirectionTile,
    incoming: Direction[],
    tiles: Map<GridKey, WaterDirectionTile>
  ): Direction[] {
    const valid = new Set<Direction>();
    for (const incomingDir of incoming) {
      for (const outgoingDir of tile.outgoing) {
        if (outgoingDir === incomingDir) continue;
        if (this.isOutgoingValid(tileKey, outgoingDir, tiles)) {
          valid.add(outgoingDir);
        }
      }
    }
    return DIRECTION_ORDER.filter(d => valid.has(d));
  }

  private static isIncomingValid(
    tileKey: GridKey,
    incomingDir: Direction,
    tiles: Map<GridKey, WaterDirectionTile>
  ): boolean {
    const tile = tiles.get(tileKey);
    if (!tile) return false;

    for (const outgoingDir of tile.outgoing) {
      if (outgoingDir === incomingDir) continue;
      if (this.isOutgoingValid(tileKey, outgoingDir, tiles)) {
        return true;
      }
    }
    return false;
  }

  private static isOutgoingValid(
    fromKey: GridKey,
    outgoingDir: Direction,
    tiles: Map<GridKey, WaterDirectionTile>
  ): boolean {
    const { x, y } = this.parseKey(fromKey);
    const nextKey = this.neighbourKey(x, y, outgoingDir);
    const nextTile = tiles.get(nextKey);
    if (!nextTile) return false;

    const nextBackDirection = OPPOSITE[outgoingDir];
    const nextOnward = nextTile.outgoing.filter(d => d !== nextBackDirection);
    if (nextOnward.length === 0) return false;

    for (const nextDir of nextOnward) {
      const nextNextKey = this.neighbourFromKey(nextKey, nextDir);
      const nextNextTile = tiles.get(nextNextKey);
      if (!nextNextTile) continue;

      const backFromNextNext = OPPOSITE[nextDir];
      const nextNextOnward = nextNextTile.outgoing.filter(d => d !== backFromNextNext);
      if (nextNextOnward.length > 0) {
        return true;
      }
    }

    return false;
  }

  private static neighbourFromKey(key: GridKey, direction: Direction): GridKey {
    const { x, y } = this.parseKey(key);
    return this.neighbourKey(x, y, direction);
  }

  private static neighbourKey(x: number, y: number, direction: Direction): GridKey {
    const delta = DELTA_BY_DIRECTION[direction];
    return gridKey(x + delta.dx, y + delta.dy);
  }

  private static parseKey(key: GridKey): { x: number; y: number } {
    const [xStr, yStr] = (key as string).split(',');
    return { x: Number.parseInt(xStr, 10), y: Number.parseInt(yStr, 10) };
  }

  private static nonEmptySubsets(values: Direction[]): Direction[][] {
    const subsets: Direction[][] = [];
    const count = 1 << values.length;
    for (let mask = 1; mask < count; mask++) {
      const subset: Direction[] = [];
      for (let i = 0; i < values.length; i++) {
        if ((mask & (1 << i)) !== 0) {
          subset.push(values[i]);
        }
      }
      subsets.push(subset);
    }
    return subsets;
  }

  private static directionsToken(directions: Direction[]): string | null {
    const unique = Array.from(new Set(directions));
    if (unique.length === 0 || unique.length > 3) return null;
    const ordered = DIRECTION_ORDER.filter(d => unique.includes(d));
    const key = ordered.join(',');
    return DIRECTION_TOKEN_BY_SET_KEY.get(key) ?? null;
  }
}
