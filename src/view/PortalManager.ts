import Phaser from 'phaser';
import { Portal } from '@model/overworld/Portal';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { SeriesManager } from '@model/series/SeriesFactory';
import type { PlayerController } from '@view/PlayerController';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';

/**
 * Manages portal objects in the overworld — tiles that automatically
 * transition the player to a building interior when stepped on.
 *
 * Portals are loaded from Tiled `portals` object layers.  Each object must
 * carry `targetMapKey` and `targetSpawnID` custom properties (see Portal model).
 *
 * View layer — depends on a Phaser Scene for scene management and holds
 * callbacks into OverworldScene for player/controller access.
 */
export class PortalManager {
    private readonly scene: Phaser.Scene;
    private readonly tiledMapData: any;
    private readonly map: Phaser.Tilemaps.Tilemap;
    private readonly gameState: OverworldGameState;
    private readonly seriesManager: SeriesManager | undefined;
    private readonly getPlayer: () => Phaser.GameObjects.Sprite | null;
    private readonly getPlayerController: () => PlayerController | undefined;
    private readonly getOverworldHUD: () => OverworldHUDScene | undefined;
    private readonly registerStepHotspot: (tileX: number, tileY: number, callback: () => void) => void;
    private readonly saveStateCallback: () => void;

    /** All portals loaded from the Tiled map. */
    readonly portals: Portal[] = [];

    constructor(
        scene: Phaser.Scene,
        tiledMapData: any,
        map: Phaser.Tilemaps.Tilemap,
        gameState: OverworldGameState,
        seriesManager: SeriesManager | undefined,
        getPlayer: () => Phaser.GameObjects.Sprite | null,
        getPlayerController: () => PlayerController | undefined,
        getOverworldHUD: () => OverworldHUDScene | undefined,
        registerStepHotspot: (tileX: number, tileY: number, callback: () => void) => void,
        saveStateCallback: () => void,
    ) {
        this.scene = scene;
        this.tiledMapData = tiledMapData;
        this.map = map;
        this.gameState = gameState;
        this.seriesManager = seriesManager;
        this.getPlayer = getPlayer;
        this.getPlayerController = getPlayerController;
        this.getOverworldHUD = getOverworldHUD;
        this.registerStepHotspot = registerStepHotspot;
        this.saveStateCallback = saveStateCallback;
    }

    /**
     * Load portals from all `<group>/portals` object layers in the Tiled map,
     * then register each portal as a step hotspot in the owning scene.
     */
    loadPortals(): void {
        const portalsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'portals');

        if (portalsLayers.length === 0) {
            console.log('No portals layers found in map');
            return;
        }

        console.log(`Found ${portalsLayers.length} portals layer(s)`);

        const tileWidth: number = this.tiledMapData.tilewidth || 32;
        const tileHeight: number = this.tiledMapData.tileheight || 32;

        for (const layerInfo of portalsLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) {
                layer = this.map.getObjectLayer(layerInfo.name);
            }
            if (!layer) {
                console.warn(`Failed to get portals layer: ${layerInfo.fullPath}`);
                continue;
            }

            for (const obj of layer.objects) {
                const portal = Portal.fromTiledObject(obj as any, tileWidth, tileHeight);
                if (!portal) {
                    console.warn(`Skipping invalid portal object in ${layerInfo.fullPath}:`, obj);
                    continue;
                }

                this.portals.push(portal);
                this.registerStepHotspot(portal.tileX, portal.tileY, () => this.triggerTransition(portal));
                console.log(
                    `Loaded portal: "${portal.id}" at (${portal.tileX},${portal.tileY})` +
                    ` → map="${portal.targetMapKey}", spawn="${portal.targetSpawnID}"`
                );
            }
        }

        console.log(`Total portals loaded: ${this.portals.length}`);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private triggerTransition(portal: Portal): void {
        const player = this.getPlayer();
        const playerController = this.getPlayerController();

        // Disable player movement so they don't keep walking during the transition
        playerController?.setEnabled(false);

        // Record where the player was standing so OverworldScene can restore the
        // position on return from the interior.
        const returnX = player?.x ?? 0;
        const returnY = player?.y ?? 0;
        this.gameState.setCurrentInterior(portal.targetMapKey, returnX, returnY);

        // Persist game state so a cold-start reload can resume inside the building
        this.saveStateCallback();

        // Hide the warp button — it is only meaningful in the overworld
        this.getOverworldHUD()?.setWarpButtonVisible(false);

        console.log(
            `[PortalManager] Transitioning to interior "${portal.targetMapKey}" ` +
            `via spawn "${portal.targetSpawnID}"`
        );

        // Launch the interior scene, then sleep the overworld
        this.scene.scene.launch('InteriorScene', {
            mapKey: portal.targetMapKey,
            spawnID: portal.targetSpawnID,
            gameState: this.gameState,
            seriesManager: this.seriesManager,
            saveStateCallback: this.saveStateCallback,
        });
        this.scene.scene.sleep('OverworldScene');
    }
}
