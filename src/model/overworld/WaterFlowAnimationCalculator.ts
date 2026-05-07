import { gridKey, orderedDirectionsNSEW, parseGridKey } from '@model/puzzle/FlowTypes';
import type { Direction, GridKey } from '@model/puzzle/FlowTypes';

/**
 * Maps flow direction combinations to animation plans for the overworld water
 * visual layer.
 *
 * This class remains pure model logic: it only computes plain data (direction
 * keys, animation keys, frame sequences, phase offsets) and never creates
 * Phaser objects.
 */
export interface WaterTileAnimationPlan {
    /** Canonical direction key including outgoing + inferred incoming flow. */
    directionKey: string;
    /** Phaser animation key for this tile. */
    animationKey: string;
    /** Local frame IDs in the animated water spritesheet for this tile. */
    frameSequence: number[];
}

export class WaterFlowAnimationCalculator {
    /** Prefix for all animation keys produced by this class. */
    static readonly ANIMATION_KEY_PREFIX = 'water-flow-';

    /**
     * Base animated-water strip (32x32 local tile IDs) from sand-waterfalls.
     * Chosen to avoid directional-arrow tiles entirely.
     */
    static readonly ANIMATED_WATER_BASE_SEQUENCE: readonly number[] = [7, 34, 61, 88];

    private static readonly OPPOSITE: Record<Direction, Direction> = {
        N: 'S',
        S: 'N',
        E: 'W',
        W: 'E',
    };

    /**
     * Return the base animation-key stem for a canonical direction key.
     */
    static animationKeyForDirections(directionKey: string): string {
        return directionKey
            ? `${WaterFlowAnimationCalculator.ANIMATION_KEY_PREFIX}${directionKey}`
            : `${WaterFlowAnimationCalculator.ANIMATION_KEY_PREFIX}none`;
    }

    /**
     * Legacy frame-index mapping for the old static `water directions` tileset.
     * Kept for compatibility with existing tests.
     */
    static frameIndexForDirections(directionKey: string, isSource = false): number {
        const hasN = directionKey.includes('N');
        const hasS = directionKey.includes('S');
        const hasE = directionKey.includes('E');
        const hasW = directionKey.includes('W');
        const index = (hasN ? 8 : 0) | (hasS ? 4 : 0) | (hasW ? 2 : 0) | (hasE ? 1 : 0);
        return isSource ? index + 16 : index;
    }

    /**
     * Return all animation keys required for a given flow map.
     */
    static animationKeysForMap(directionMap: ReadonlyMap<GridKey, string>): Set<string> {
        const keys = new Set<string>();
        const plans = this.calculateTileAnimationPlans(directionMap);
        for (const { animationKey } of plans.values()) {
            keys.add(animationKey);
        }
        return keys;
    }

    /**
     * Calculate per-tile animation plans for flowing water.
     *
     * Steps:
     * 1) infer incoming flow directions from neighbouring outgoing flow
     * 2) combine outgoing + incoming into a canonical render direction key
     * 3) compute per-tile phase offsets by reverse traversal (back-propagation)
     * 4) rotate the base animated-water frame strip by phase to de-sync tiles
     */
    static calculateTileAnimationPlans(
        outgoingDirectionMap: ReadonlyMap<GridKey, string>,
    ): Map<GridKey, WaterTileAnimationPlan> {
        const combinedDirectionMap = this.calculateCombinedDirectionsWithBackPropagation(outgoingDirectionMap);
        const phaseOffsets = this.calculateBackPropagatedPhaseOffsets(outgoingDirectionMap);
        const plans = new Map<GridKey, WaterTileAnimationPlan>();

        for (const [key, directionKey] of combinedDirectionMap.entries()) {
            const phase = phaseOffsets.get(key) ?? 0;
            const frameSequence = this.rotateSequence(
                WaterFlowAnimationCalculator.ANIMATED_WATER_BASE_SEQUENCE,
                phase,
            );
            const animationKey = `${this.animationKeyForDirections(directionKey)}-phase-${phase % frameSequence.length}`;
            plans.set(key, {
                directionKey,
                animationKey,
                frameSequence,
            });
        }

        return plans;
    }

    /**
     * Combine each tile's outgoing directions with inferred incoming directions
     * from neighbouring tiles.
     *
     * Example: if tile A has outgoing `E` to tile B, tile B receives inferred
     * incoming `W`.
     */
    static calculateCombinedDirectionsWithBackPropagation(
        outgoingDirectionMap: ReadonlyMap<GridKey, string>,
    ): Map<GridKey, string> {
        const outgoingSets = new Map<GridKey, Set<Direction>>();
        const incomingSets = new Map<GridKey, Set<Direction>>();

        for (const [key, directionKey] of outgoingDirectionMap.entries()) {
            outgoingSets.set(key, new Set(directionKey.split('') as Direction[]));
            incomingSets.set(key, incomingSets.get(key) ?? new Set<Direction>());
        }

        for (const [key, outgoing] of outgoingSets.entries()) {
            const { x, y } = parseGridKey(key);
            for (const direction of outgoing.values()) {
                const neighbour = this.neighbourKey(x, y, direction);
                if (!neighbour || !outgoingSets.has(neighbour)) continue;
                const incoming = incomingSets.get(neighbour) ?? new Set<Direction>();
                incoming.add(this.OPPOSITE[direction]);
                incomingSets.set(neighbour, incoming);
            }
        }

        const combined = new Map<GridKey, string>();
        for (const [key, outgoing] of outgoingSets.entries()) {
            const incoming = incomingSets.get(key) ?? new Set<Direction>();
            const allDirections: Direction[] = [
                ...Array.from(outgoing.values()),
                ...Array.from(incoming.values()),
            ];
            combined.set(key, orderedDirectionsNSEW(allDirections).join(''));
        }

        return combined;
    }

    /**
     * Compute per-tile phase offsets using reverse graph traversal.
     *
     * Start from sinks (tiles with no in-graph outgoing neighbours), then walk
     * backward to upstream tiles, assigning incrementing phase values.
     */
    static calculateBackPropagatedPhaseOffsets(
        outgoingDirectionMap: ReadonlyMap<GridKey, string>,
    ): Map<GridKey, number> {
        const outgoingAdj = new Map<GridKey, GridKey[]>();
        const reverseAdj = new Map<GridKey, GridKey[]>();
        const inGraphOutgoingCount = new Map<GridKey, number>();

        for (const key of outgoingDirectionMap.keys()) {
            outgoingAdj.set(key, []);
            reverseAdj.set(key, []);
            inGraphOutgoingCount.set(key, 0);
        }

        for (const [key, directionKey] of outgoingDirectionMap.entries()) {
            const { x, y } = parseGridKey(key);
            const outgoing = orderedDirectionsNSEW(directionKey.split('') as Direction[]);
            for (const direction of outgoing) {
                const neighbour = this.neighbourKey(x, y, direction);
                if (!neighbour || !outgoingDirectionMap.has(neighbour)) continue;
                outgoingAdj.get(key)!.push(neighbour);
                reverseAdj.get(neighbour)!.push(key);
            }
            inGraphOutgoingCount.set(key, outgoingAdj.get(key)!.length);
        }

        const phase = new Map<GridKey, number>();
        const queue: GridKey[] = [];

        for (const [key, outCount] of inGraphOutgoingCount.entries()) {
            if (outCount === 0) {
                phase.set(key, 0);
                queue.push(key);
            }
        }

        while (queue.length > 0) {
            const current = queue.shift()!;
            const currentPhase = phase.get(current) ?? 0;
            const upstreamNodes = reverseAdj.get(current) ?? [];
            for (const upstream of upstreamNodes) {
                const candidate = currentPhase + 1;
                const existing = phase.get(upstream);
                if (existing == null || candidate > existing) {
                    phase.set(upstream, candidate);
                    queue.push(upstream);
                }
            }
        }

        // Fallback for cycles: deterministic coordinate hash.
        for (const key of outgoingDirectionMap.keys()) {
            if (phase.has(key)) continue;
            const { x, y } = parseGridKey(key);
            phase.set(key, Math.abs((x * 31) + (y * 17)));
        }

        return phase;
    }

    private static rotateSequence(sequence: readonly number[], offset: number): number[] {
        if (sequence.length === 0) return [];
        const shift = ((offset % sequence.length) + sequence.length) % sequence.length;
        if (shift === 0) return [...sequence];
        return [...sequence.slice(shift), ...sequence.slice(0, shift)];
    }

    private static neighbourKey(x: number, y: number, direction: Direction): GridKey | null {
        switch (direction) {
            case 'N': return gridKey(x, y - 1);
            case 'S': return gridKey(x, y + 1);
            case 'E': return gridKey(x + 1, y);
            case 'W': return gridKey(x - 1, y);
            default: return null;
        }
    }
}
