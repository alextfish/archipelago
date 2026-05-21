import Phaser from 'phaser';
import { isOverworldPuzzleTileSourceLayerName } from '@model/overworld/PuzzleTileSourceLayers';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import type { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import type { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { Interactable } from '@view/InteractionCursor';

type PuzzleEntryTileLike = {
    properties?: Record<string, unknown>;
};

type PuzzleEntryLayerLike = {
    name?: string;
    tilemapLayer?: {
        getTileAt: (tileX: number, tileY: number) => PuzzleEntryTileLike | null | undefined;
    };
    data?: Array<Array<PuzzleEntryTileLike | null | undefined>>;
};

function hasPuzzleEntryProperty(tile: PuzzleEntryTileLike | null | undefined): boolean {
    return tile?.properties?.puzzleStart === true;
}

export function isPuzzleEntryTileOnLayer(layer: PuzzleEntryLayerLike, tileX: number, tileY: number): boolean {
    if (layer.tilemapLayer) {
        return hasPuzzleEntryProperty(layer.tilemapLayer.getTileAt(tileX, tileY));
    }

    if (!isOverworldPuzzleTileSourceLayerName(layer.name)) {
        return false;
    }

    return hasPuzzleEntryProperty(layer.data?.[tileY]?.[tileX]);
}

export function isPuzzleEntryTile(map: Phaser.Tilemaps.Tilemap, tileX: number, tileY: number): boolean {
    for (const layer of map.layers) {
        if (isPuzzleEntryTileOnLayer(layer, tileX, tileY)) {
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
    if (bridgesLayerData) {
        return map.createLayer(OverworldBridgeManager.getBridgesLayerName(), tilesets) ?? null;
    }

    return map.createBlankLayer(
        OverworldBridgeManager.getBridgesLayerName(),
        tilesets,
        0,
        0,
        map.width,
        map.height,
        map.tileWidth,
        map.tileHeight,
    ) ?? null;
}