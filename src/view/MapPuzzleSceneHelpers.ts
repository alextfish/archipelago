import Phaser from 'phaser';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import type { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import type { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { Interactable } from '@view/InteractionCursor';

export function isPuzzleEntryTile(map: Phaser.Tilemaps.Tilemap, tileX: number, tileY: number): boolean {
    for (const layer of map.layers) {
        if (!layer.tilemapLayer) {
            continue;
        }

        const tile = layer.tilemapLayer.getTileAt(tileX, tileY);
        if (tile?.properties?.puzzleStart === true) {
            return true;
        }
    }

    return false;
}

export function buildPuzzleEntryInteractables(
    puzzleManager: OverworldPuzzleManager,
    tiledMapData: { tilewidth: number; tileheight: number },
    gridMapper: GridToWorldMapper,
    map: Phaser.Tilemaps.Tilemap,
): Interactable[] {
    const interactables: Interactable[] = [];
    const puzzles = puzzleManager.getAllPuzzles();

    for (const [puzzleId] of puzzles) {
        const bounds = puzzleManager.getPuzzleBounds(puzzleId);
        if (!bounds) {
            continue;
        }

        const { x: tileX, y: tileY } = gridMapper.worldToGrid(bounds.x, bounds.y);
        const width = Math.ceil(bounds.width / tiledMapData.tilewidth);
        const height = Math.ceil(bounds.height / tiledMapData.tileheight);

        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const entryTileX = tileX + dx;
                const entryTileY = tileY + dy;

                if (!isPuzzleEntryTile(map, entryTileX, entryTileY)) {
                    continue;
                }

                interactables.push({
                    type: 'puzzle',
                    tileX: entryTileX,
                    tileY: entryTileY,
                    data: { puzzleId },
                });
            }
        }
    }

    return interactables;
}

export function createBridgesLayer(
    map: Phaser.Tilemaps.Tilemap,
    tilesets: Phaser.Tilemaps.Tileset[],
): Phaser.Tilemaps.TilemapLayer | null {
    const bridgesLayerData = map.getLayer(OverworldBridgeManager.getBridgesLayerName());
    if (!bridgesLayerData) {
        return null;
    }

    return map.createLayer(OverworldBridgeManager.getBridgesLayerName(), tilesets) ?? null;
}