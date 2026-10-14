import Phaser from 'phaser';

/**
 * Queue all shared door spritesheets used by DoorManager.
 * Safe to call from multiple scenes.
 */
export function queueDoorSpriteAssets(scene: Phaser.Scene): void {
    const queueSpritesheet = (
        key: string,
        path: string,
        frameWidth: number,
        frameHeight: number
    ): void => {
        if (scene.textures.exists(key)) {
            return;
        }

        scene.load.spritesheet(key, path, {
            frameWidth,
            frameHeight
        });
    };

    queueSpritesheet('forestDoorHOpening', 'resources/sprites/forestDoorHOpening.png', 32, 32);
    queueSpritesheet('forestDoorVOpening', 'resources/sprites/forestDoorVOpening.png', 32, 64);
    queueSpritesheet('terrains-door-tiles', 'resources/tilesets/terrains.png', 32, 32);
    queueSpritesheet('cavewalls-door-tiles', 'resources/tilesets/CaveWalls.png', 32, 32);
}
