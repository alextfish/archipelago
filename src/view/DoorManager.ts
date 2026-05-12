import Phaser from 'phaser';
import { Door } from '@model/overworld/Door';
import type { CollisionManager } from '@model/overworld/CollisionManager';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { PlayerController } from '@view/PlayerController';
import type { CameraManager } from '@view/CameraManager';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { getDoorSpriteMapping } from '@view/DoorSpriteRegistry';

/**
 * Manages all door objects in the overworld:
 * - Loading door data from Tiled object layers
 * - Creating and updating Phaser sprites for each door
 * - Applying door state changes (lock/unlock) to the model, collision, and visuals
 * - Playing the animated door-open/close sequence with a camera pan
 *
 * View layer — depends on a Phaser Scene for sprite creation and on
 * CameraManager for the pan-to-door animation.
 */
export class DoorManager {
    private readonly scene: Phaser.Scene;
    private readonly tiledMapData: any;
    private readonly map: Phaser.Tilemaps.Tilemap;
    private readonly collisionManager: CollisionManager;
    private readonly gameState: OverworldGameState;
    private readonly cameraManager: CameraManager;
    private getPlayer: () => { x: number; y: number } | null;
    private getPlayerController: () => PlayerController | undefined;

    readonly doors: Door[] = [];
    private readonly doorSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

    constructor(
        scene: Phaser.Scene,
        tiledMapData: any,
        map: Phaser.Tilemaps.Tilemap,
        collisionManager: CollisionManager,
        gameState: OverworldGameState,
        cameraManager: CameraManager,
        getPlayer: () => { x: number; y: number } | null,
        getPlayerController: () => PlayerController | undefined,
    ) {
        this.scene = scene;
        this.tiledMapData = tiledMapData;
        this.map = map;
        this.collisionManager = collisionManager;
        this.gameState = gameState;
        this.cameraManager = cameraManager;
        this.getPlayer = getPlayer;
        this.getPlayerController = getPlayerController;
    }

    /**
     * Load doors from all `<group>/doors` object layers in the Tiled map.
     */
    loadDoors(): void {
        const doorsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'doors');

        if (doorsLayers.length === 0) {
            console.log('No doors layers found in map');
            return;
        }

        console.log(`Found ${doorsLayers.length} doors layers`);

        const tileWidth: number = this.tiledMapData.tilewidth || 32;
        const tileHeight: number = this.tiledMapData.tileheight || 32;

        for (const layerInfo of doorsLayers) {
            let doorsLayer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!doorsLayer) {
                doorsLayer = this.map.getObjectLayer(layerInfo.name);
            }
            if (!doorsLayer) {
                console.warn(`Failed to get object layer: ${layerInfo.fullPath} or ${layerInfo.name}`);
                continue;
            }

            console.log(`Loading doors from layer: ${layerInfo.fullPath}`);

            for (const obj of doorsLayer.objects) {
                try {
                    const door = Door.fromTiledObject(obj, tileWidth, tileHeight);
                    this.doors.push(door);
                    this.createDoorSprites(door);
                    console.log(
                        `Loaded door: ${door.id} at positions:`, door.getPositions(),
                        door.seriesId ? `linked to series: ${door.seriesId}` : 'no series link',
                        door.spriteId ? `sprite: ${door.spriteId}` : 'no sprite',
                        `locked: ${door.isLocked()}`
                    );
                } catch (error) {
                    console.error('Error loading door from object:', obj, error);
                }
            }
        }

        if (this.doors.length > 0) {
            this.collisionManager.registerDoors(this.doors);
            console.log(`Registered ${this.doors.length} doors with collision manager`);
        }
    }

    /**
     * Animate a door opening or closing:
     * 1. Disable player movement.
     * 2. Pan camera to the door.
     * 3. Play the opening animation sprite.
     * 4. Apply the door state change.
     * 5. Pan camera back to the player and re-enable movement.
     */
    async animateDoorChange(door: Door, unlock: boolean): Promise<void> {
        const PAN_DURATION = 800;
        const tileW: number = this.tiledMapData?.tilewidth ?? 32;
        const tileH: number = this.tiledMapData?.tileheight ?? 32;

        const positions = door.getPositions();
        const sumX = positions.reduce((acc, p) => acc + p.tileX, 0);
        const sumY = positions.reduce((acc, p) => acc + p.tileY, 0);
        const doorWorldX = (sumX / positions.length + 0.5) * tileW;
        const doorWorldY = (sumY / positions.length + 0.5) * tileH;

        const playerController = this.getPlayerController();
        playerController?.setEnabled(false);

        const player = this.getPlayer();

        try {
            if (player) {
                await this.cameraManager.panToWorldPositionAndBack(
                    doorWorldX,
                    doorWorldY,
                    player,
                    PAN_DURATION,
                    async () => {
                        await this.playDoorAnimation(door, doorWorldX, doorWorldY);
                        this.applyDoorChange(door, unlock);
                    }
                );
            } else {
                await this.playDoorAnimation(door, doorWorldX, doorWorldY);
                this.applyDoorChange(door, unlock);
            }
        } finally {
            playerController?.setEnabled(true);
        }
    }

    /**
     * Unlock a door by ID immediately, without animation.
     * Used for conversation-triggered unlocks.
     */
    unlockDoor(doorId: string): void {
        const door = this.doors.find(d => d.id === doorId);
        if (!door) {
            console.warn(`Door ${doorId} not found`);
            return;
        }
        if (!door.isLocked()) {
            console.log(`Door ${doorId} is already unlocked`);
            return;
        }
        this.applyDoorChange(door, true);
        console.log(`Door ${doorId} unlocked (instant)`);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private createDoorSprites(door: Door): void {
        if (!door.spriteId) {
            console.warn(`Door ${door.id} has no spriteId, cannot create sprite`);
            return;
        }

        const mapping = getDoorSpriteMapping(door.spriteId);
        if (!mapping) {
            console.warn(`Could not get sprite mapping for door ${door.id} with spriteId ${door.spriteId}`);
            return;
        }

        const tileW: number = this.tiledMapData?.tilewidth ?? 32;
        const tileH: number = this.tiledMapData?.tileheight ?? 32;

        const positions = door.getPositions();
        const sumX = positions.reduce((acc, p) => acc + p.tileX, 0);
        const sumY = positions.reduce((acc, p) => acc + p.tileY, 0);
        const worldX = (sumX / positions.length + 0.5) * tileW;
        const worldY = (sumY / positions.length + 0.5) * tileH;

        const frame = door.isLocked() ? mapping.closedFrame : mapping.openFrame;
        const sprite = this.scene.add.sprite(worldX, worldY, mapping.textureKey, frame);
        sprite.setOrigin(0.5, 0.5);
        const maxTileY = Math.max(...positions.map(p => p.tileY));
        sprite.setDepth((maxTileY + 1) * tileH);
        this.doorSprites.set(door.id, sprite);
        console.log(`Door ${door.id}: spriteId=${door.spriteId}, locked=${door.isLocked()}, frame=${frame}, world=(${worldX}, ${worldY})`);
    }

    private updateDoorSprite(door: Door): void {
        if (!door.spriteId) return;

        const mapping = getDoorSpriteMapping(door.spriteId);
        if (!mapping) return;

        const frame = door.isLocked() ? mapping.closedFrame : mapping.openFrame;
        const sprite = this.doorSprites.get(door.id);
        if (sprite) {
            sprite.setFrame(frame);
        }
        console.log(`Updated door ${door.id} sprite to ${door.isLocked() ? 'closed' : 'open'} state (frame=${frame})`);
    }

    private applyDoorChange(door: Door, unlock: boolean): void {
        if (unlock) {
            door.unlock();
            this.gameState.unlockDoor(door.id);
        } else {
            door.lock();
            this.gameState.lockDoor(door.id);
        }
        this.collisionManager.updateDoorCollision(door);
        this.updateDoorSprite(door);
        console.log(`Door ${door.id} ${unlock ? 'unlocked' : 'locked'} successfully`);
    }

    private async playDoorAnimation(door: Door, doorWorldX: number, doorWorldY: number): Promise<void> {
        const mapping = getDoorSpriteMapping(door.spriteId);
        if (!mapping || !this.scene.textures.exists(mapping.animationKey)) {
            if (mapping) {
                console.warn(`Door animation texture '${mapping.animationKey}' not loaded — skipping animation for door ${door.id}`);
            }
            return;
        }

        const animKey = `${mapping.animationKey}-play`;

        if (!this.scene.anims.exists(animKey)) {
            this.scene.anims.create({
                key: animKey,
                frames: this.scene.anims.generateFrameNumbers(mapping.animationKey, {
                    start: 0,
                    end: mapping.frameCount - 1
                }),
                frameRate: 8,
                repeat: 0
            });
        }

        await new Promise<void>((resolve) => {
            const doorSprite = this.doorSprites.get(door.id);
            const targetSprite = doorSprite ?? this.scene.add.sprite(doorWorldX, doorWorldY, mapping.textureKey, 0).setOrigin(0.5, 0.5);
            const isTemporary = !doorSprite;
            targetSprite.once('animationcomplete', () => {
                if (isTemporary) targetSprite.destroy();
                resolve();
            });
            targetSprite.play(animKey);
        });
    }
}
