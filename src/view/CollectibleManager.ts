import Phaser from 'phaser';
import { Collectible } from '@model/overworld/Collectible';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import type { Interactable } from '@view/InteractionCursor';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { emitTestEvent } from '@helpers/TestEvents';

/**
 * Manages collectible items (currently: jewels) in the overworld:
 * - Loading collectible data from Tiled object layers
 * - Creating and animating Phaser sprites for each item
 * - Registering jewel looping animations once at scene creation
 * - Collecting items: removing sprites, updating game state, refreshing the HUD
 *
 * View layer — depends on a Phaser Scene for sprite creation.
 */
export class CollectibleManager {
    private readonly scene: Phaser.Scene;
    private readonly tiledMapData: any;
    private readonly map: Phaser.Tilemaps.Tilemap;
    private readonly gameState: OverworldGameState;
    private readonly getOverworldHUD: () => OverworldHUDScene | undefined;
    private readonly addInteractable: (interactable: Interactable) => void;
    private readonly removeInteractables: (predicate: (i: Interactable) => boolean) => void;

    readonly collectibles: Collectible[] = [];
    private readonly collectibleSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

    constructor(
        scene: Phaser.Scene,
        tiledMapData: any,
        map: Phaser.Tilemaps.Tilemap,
        gameState: OverworldGameState,
        getOverworldHUD: () => OverworldHUDScene | undefined,
        addInteractable: (interactable: Interactable) => void,
        removeInteractables: (predicate: (i: Interactable) => boolean) => void,
    ) {
        this.scene = scene;
        this.tiledMapData = tiledMapData;
        this.map = map;
        this.gameState = gameState;
        this.getOverworldHUD = getOverworldHUD;
        this.addInteractable = addInteractable;
        this.removeInteractables = removeInteractables;
    }

    /**
     * Initialise collectible animations.  Call this once from `create()`.
     * Internally registers looping Phaser animations for each jewel colour.
     * As more collectible types are added, this method will register their
     * animations too — callers never need updating.
     */
    initialise(): void {
        this.registerJewelAnimations();
    }

    /**
     * Register looping Phaser animations for each jewel colour.
     * Each `jewel-<colour>` spritesheet uses startFrame/endFrame so frame 0 is
     * always the first frame of that colour.
     */
    private registerJewelAnimations(): void {
        const colours = ['red', 'green', 'blue', 'yellow'];
        for (const colour of colours) {
            const textureKey = `jewel-${colour}`;
            if (!this.scene.textures.exists(textureKey)) continue;
            this.scene.anims.create({
                key: `${textureKey}-anim`,
                frames: this.scene.anims.generateFrameNumbers(textureKey, { start: 0, end: 3 }),
                frameRate: 5,
                repeat: -1,
            });
        }
    }

    /**
     * Load collectibles from all `<group>/collectibles` object layers in the
     * Tiled map.  Registers sprites and interactables for each item.
     */
    loadCollectibles(): void {
        const collectiblesLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'collectibles');

        if (collectiblesLayers.length === 0) {
            console.log('No collectibles layers found in map');
            return;
        }

        console.log(`Found ${collectiblesLayers.length} collectibles layer(s)`);

        const tileWidth: number = this.tiledMapData.tilewidth || 32;
        const tileHeight: number = this.tiledMapData.tileheight || 32;

        for (const layerInfo of collectiblesLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) {
                layer = this.map.getObjectLayer(layerInfo.name);
            }
            if (!layer) {
                console.warn(`Failed to get collectibles layer: ${layerInfo.fullPath}`);
                continue;
            }

            for (const obj of layer.objects) {
                const collectible = Collectible.fromTiledObject(obj, tileWidth, tileHeight);
                if (!collectible) {
                    console.warn(`Skipping invalid collectible object in ${layerInfo.fullPath}:`, obj);
                    continue;
                }

                this.collectibles.push(collectible);

                const worldX = collectible.tileX * tileWidth + tileWidth / 2;
                const worldY = collectible.tileY * tileHeight + tileHeight / 2;
                const spriteKey = `jewel-${collectible.colour}`;

                if (this.scene.textures.exists(spriteKey)) {
                    const sprite = this.scene.add.sprite(worldX, worldY, spriteKey);
                    const animKey = `jewel-${collectible.colour}-anim`;
                    if (this.scene.anims.exists(animKey)) {
                        sprite.play(animKey);
                    }
                    sprite.setDepth(worldY);
                    this.collectibleSprites.set(collectible.id, sprite);

                    this.addInteractable({
                        type: 'collectible',
                        tileX: collectible.tileX,
                        tileY: collectible.tileY,
                        data: { collectibleId: collectible.id },
                    });

                    console.log(`Loaded collectible: ${collectible.colour} jewel (id=${collectible.id}) at (${collectible.tileX}, ${collectible.tileY})`);
                } else {
                    // Fallback: placeholder rectangle
                    const colourMap: Record<string, number> = {
                        red: 0xff4444, blue: 0x4444ff, green: 0x44ff44, yellow: 0xffff44,
                    };
                    const colour = colourMap[collectible.colour] ?? 0xffffff;
                    const gfx = this.scene.make.graphics({ x: 0, y: 0 }, false);
                    gfx.fillStyle(colour, 1);
                    gfx.fillRect(0, 0, 16, 16);
                    const rt = this.scene.add.renderTexture(worldX - 8, worldY - 8, 16, 16);
                    rt.draw(gfx);
                    rt.setDepth(worldY);
                    gfx.destroy();
                    const placeholder = this.scene.add.sprite(worldX, worldY, '__DEFAULT');
                    placeholder.setVisible(false);
                    this.collectibleSprites.set(collectible.id, placeholder);
                    console.log(`Collectible ${collectible.id} (${collectible.colour} jewel) loaded — using placeholder`);
                }
            }
        }

        console.log(`Total collectibles loaded: ${this.collectibles.length}`);
    }

    /**
     * Collect a jewel: update model state, remove its sprite from the world
     * and interactables list, then refresh the overworld HUD.
     */
    collectJewel(collectibleId: string): void {
        const collectible = this.collectibles.find(c => c.id === collectibleId);
        if (!collectible || collectible.collected) return;

        collectible.collect();
        this.gameState.collectJewel(collectible.colour);

        const sprite = this.collectibleSprites.get(collectibleId);
        if (sprite) {
            sprite.destroy();
            this.collectibleSprites.delete(collectibleId);
        }

        this.removeInteractables(
            i => i.type === 'collectible' && i.data?.collectibleId === collectibleId
        );

        this.getOverworldHUD()?.refreshJewelHUD();

        emitTestEvent('jewel_collected', { colour: collectible.colour, id: collectibleId });
        console.log(`Collected ${collectible.colour} jewel (id=${collectibleId}). Total: ${this.gameState.getJewelCount(collectible.colour)}`);
    }
}
