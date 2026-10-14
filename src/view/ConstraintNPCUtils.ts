/**
 * Extract the puzzle ID from a constraint-NPC ID of the form
 * `constraint-{puzzleID}-{type}-{islandID}`.
 *
 * Puzzle IDs may themselves contain hyphens, so this strips the final
 * `-{type}-{islandID}` suffix rather than assuming the first hyphen ends the ID.
 */
export function getConstraintPuzzleID(npcID: string): string | null {
    if (!npcID.startsWith('constraint-')) {
        return null;
    }

    const lastSeparator = npcID.lastIndexOf('-');
    if (lastSeparator <= 'constraint-'.length) {
        return null;
    }

    const withoutIslandID = npcID.substring(0, lastSeparator);
    const typeSeparator = withoutIslandID.lastIndexOf('-');
    if (typeSeparator <= 'constraint-'.length) {
        return null;
    }

    return withoutIslandID.substring('constraint-'.length, typeSeparator);
}
