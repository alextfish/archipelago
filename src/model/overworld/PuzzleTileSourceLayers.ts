export const overworldPuzzleTileSourceLayerNames = ['ground', 'puzzleTiles'] as const;

const overworldPuzzleTileSourceLayerNameSet = new Set<string>(overworldPuzzleTileSourceLayerNames);

export function isOverworldPuzzleTileSourceLayerName(layerName?: string): boolean {
    return layerName !== undefined && overworldPuzzleTileSourceLayerNameSet.has(layerName);
}