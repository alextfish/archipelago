import Phaser from 'phaser';

interface AnimationFrame {
    readonly globalTileID: number;
    readonly duration: number;
}

interface AnimationSequence {
    readonly frames: AnimationFrame[];
    readonly tiles: Phaser.Tilemaps.Tile[];
    currentFrame: number;
    elapsed: number;
}

/**
 * Drives Tiled tile animations on TilemapLayers.
 *
 * Phaser 3 reads and stores animation data from the Tiled JSON (in Tileset.tileData)
 * but does not play it automatically. This class fills that gap.
 *
 * Construct it once after all map layers have been created, passing the tilemap and
 * the resolved Phaser tilesets. It scans every layer's tile data once to cache
 * references to animated tile instances, then advances each sequence in update().
 *
 * Cost: one O(layers × map size) scan at initialisation; O(animated instances) per
 * frame thereafter.
 */
export class TileAnimationManager {
    private readonly sequences: AnimationSequence[];

    constructor(map: Phaser.Tilemaps.Tilemap, tilesets: Phaser.Tilemaps.Tileset[]) {
        this.sequences = this.buildSequences(map, tilesets);
        console.log(`TileAnimationManager: found ${this.sequences.length} animated tile type(s)`);
        for (const seq of this.sequences) {
            console.log(`  → GID ${seq.frames[0].globalTileID}: ${seq.frames.length} frames, ${seq.tiles.length} instance(s)`);
        }
    }

    /**
     * Advance all tile animations by the given delta time (ms).
     * Call once per frame from the scene's update(time, delta) method.
     */
    update(delta: number): void {
        for (const seq of this.sequences) {
            seq.elapsed += delta;
            const frameDuration = seq.frames[seq.currentFrame].duration;
            if (seq.elapsed >= frameDuration) {
                seq.elapsed -= frameDuration;
                seq.currentFrame = (seq.currentFrame + 1) % seq.frames.length;
                const nextIndex = seq.frames[seq.currentFrame].globalTileID;
                for (const tile of seq.tiles) {
                    tile.index = nextIndex;
                }
            }
        }
    }

    private buildSequences(
        map: Phaser.Tilemaps.Tilemap,
        tilesets: Phaser.Tilemaps.Tileset[]
    ): AnimationSequence[] {
        // --- Phase 1: collect animation metadata from tilesets ---
        // Maps trigger GID → partially-built sequence (tiles array still empty)
        const sequencesByTriggerGID = new Map<number, AnimationSequence>();

        for (const tileset of tilesets) {
            // tileData is typed as `object` in Phaser's types but is actually an index map
            const tileData = tileset.tileData as Record<number, { animation?: Array<{ tileid: number; duration: number }> }>;

            for (const localIDStr of Object.keys(tileData)) {
                const localID = parseInt(localIDStr, 10);
                const data = tileData[localID];
                if (!data?.animation || data.animation.length < 2) continue;

                const triggerGlobalID = tileset.firstgid + localID;
                const frames: AnimationFrame[] = data.animation.map(f => ({
                    globalTileID: tileset.firstgid + f.tileid,
                    duration: f.duration
                }));

                sequencesByTriggerGID.set(triggerGlobalID, { frames, tiles: [], currentFrame: 0, elapsed: 0 });
            }
        }

        if (sequencesByTriggerGID.size === 0) {
            return [];
        }

        // --- Phase 2: single pass over all layers to assign tile instances ---
        for (const layerData of map.layers) {
            if (!layerData.data) continue;
            for (const row of layerData.data) {
                for (const tile of row) {
                    if (!tile) continue;
                    const seq = sequencesByTriggerGID.get(tile.index);
                    if (seq) {
                        seq.tiles.push(tile);
                    }
                }
            }
        }

        // Drop animated types that have no instances in the map
        return Array.from(sequencesByTriggerGID.values()).filter(seq => seq.tiles.length > 0);
    }
}
