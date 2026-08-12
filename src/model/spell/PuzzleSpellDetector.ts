import type { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import type { Island } from '@model/puzzle/Island';
import type { PuzzleSpellSpec, SpellIslandRef } from '@model/spell/PuzzleSpell';

export class PuzzleSpellDetector {
    static getMatchedSpells(puzzle: BridgePuzzle): PuzzleSpellSpec[] {
        return puzzle.getSpellSpecs().filter((spell) => this.matchesSpell(puzzle, spell));
    }

    static getTriggeredSpells(puzzle: BridgePuzzle): PuzzleSpellSpec[] {
        return this.getMatchedSpells(puzzle).filter((spell) => !puzzle.hasCastSpell(spell.id));
    }

    static matchesSpell(puzzle: BridgePuzzle, spell: PuzzleSpellSpec): boolean {
        return spell.trace.components.every((component) => {
            const requiredIslandIDs = this.resolveComponentIslandIDs(puzzle, component.islands, component.bridges);
            if (requiredIslandIDs === null || requiredIslandIDs.size === 0) {
                return false;
            }

            const requiredBridgeCounts = this.buildRequiredBridgeCounts(puzzle, component.bridges);
            if (requiredBridgeCounts === null) {
                return false;
            }

            const actualBridgeCounts = new Map<string, number>();
            const actualIslandDegrees = new Map<string, number>();
            const requiredIslandDegrees = new Map<string, number>();

            for (const [pairKey, count] of requiredBridgeCounts) {
                const [startID, endID] = pairKey.split('|');
                requiredIslandDegrees.set(startID, (requiredIslandDegrees.get(startID) ?? 0) + count);
                requiredIslandDegrees.set(endID, (requiredIslandDegrees.get(endID) ?? 0) + count);
            }

            for (const bridge of puzzle.placedBridges) {
                if (!bridge.start || !bridge.end) {
                    continue;
                }

                const startIsland = this.findIslandAt(puzzle, bridge.start.x, bridge.start.y);
                const endIsland = this.findIslandAt(puzzle, bridge.end.x, bridge.end.y);
                if (!startIsland || !endIsland) {
                    continue;
                }

                const startIncluded = requiredIslandIDs.has(startIsland.id);
                const endIncluded = requiredIslandIDs.has(endIsland.id);
                if (!startIncluded && !endIncluded) {
                    continue;
                }

                if (!startIncluded || !endIncluded) {
                    return false;
                }

                const pairKey = this.normalisedBridgeKey(startIsland.id, endIsland.id);
                actualBridgeCounts.set(pairKey, (actualBridgeCounts.get(pairKey) ?? 0) + 1);
                actualIslandDegrees.set(startIsland.id, (actualIslandDegrees.get(startIsland.id) ?? 0) + 1);
                actualIslandDegrees.set(endIsland.id, (actualIslandDegrees.get(endIsland.id) ?? 0) + 1);
            }

            if (actualBridgeCounts.size !== requiredBridgeCounts.size) {
                return false;
            }

            for (const [pairKey, count] of requiredBridgeCounts) {
                if ((actualBridgeCounts.get(pairKey) ?? 0) !== count) {
                    return false;
                }
            }

            for (const islandID of requiredIslandIDs) {
                if ((actualIslandDegrees.get(islandID) ?? 0) !== (requiredIslandDegrees.get(islandID) ?? 0)) {
                    return false;
                }
            }

            return true;
        });
    }

    private static resolveComponentIslandIDs(
        puzzle: BridgePuzzle,
        componentIslands: SpellIslandRef[] | undefined,
        bridges: ReadonlyArray<{ start: SpellIslandRef; end: SpellIslandRef }>
    ): Set<string> | null {
        const islandIDs = new Set<string>();
        const refs = [...(componentIslands ?? [])];

        for (const bridge of bridges) {
            refs.push(bridge.start, bridge.end);
        }

        for (const ref of refs) {
            const island = this.resolveIslandRef(puzzle, ref);
            if (!island) {
                return null;
            }
            islandIDs.add(island.id);
        }

        return islandIDs;
    }

    private static buildRequiredBridgeCounts(
        puzzle: BridgePuzzle,
        bridges: ReadonlyArray<{ start: SpellIslandRef; end: SpellIslandRef; count?: number }>
    ): Map<string, number> | null {
        const counts = new Map<string, number>();

        for (const bridge of bridges) {
            const startIsland = this.resolveIslandRef(puzzle, bridge.start);
            const endIsland = this.resolveIslandRef(puzzle, bridge.end);
            if (!startIsland || !endIsland) {
                return null;
            }

            const key = this.normalisedBridgeKey(startIsland.id, endIsland.id);
            counts.set(key, (counts.get(key) ?? 0) + (bridge.count ?? 1));
        }

        return counts;
    }

    private static resolveIslandRef(puzzle: BridgePuzzle, ref: SpellIslandRef): Island | null {
        if (typeof ref === 'string') {
            return puzzle.islands.find((island) => island.id === ref) ?? null;
        }

        return this.findIslandAt(puzzle, ref.x, ref.y);
    }

    private static findIslandAt(puzzle: BridgePuzzle, x: number, y: number): Island | null {
        return puzzle.islands.find((island) => island.x === x && island.y === y) ?? null;
    }

    private static normalisedBridgeKey(startID: string, endID: string): string {
        return startID < endID ? `${startID}|${endID}` : `${endID}|${startID}`;
    }
}
