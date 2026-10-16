import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { CollisionManager, CollisionType } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import type { SeriesManager } from '@model/series/SeriesFactory';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { OverworldPuzzleController } from '@controller/OverworldPuzzleController';
import { PlayerController } from '@view/PlayerController';
import { CameraManager } from '@view/CameraManager';
import { Portal } from '@model/overworld/Portal';
import { RoofManager } from '@view/RoofManager';
import { SceneTransitionCoordinator } from '@view/SceneTransitionCoordinator';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import { queueDoorSpriteAssets } from '@view/DoorAssetLoader';
import {
    getTilesetImageLoadRequests,
} from '@view/MapSceneAssetUtils';
import {
    prepareMapSceneData,
    queueMapSceneImageRequests,
} from '@view/MapSceneLoadUtils';
import { ExplorationMapScene } from '@view/scenes/ExplorationMapScene';

/**
 * Initialisation data passed to InteriorScene by PortalManager or
 * OverworldScene on cold-start resume.
 */
export interface InteriorSceneInitData {
    mapKey: string;
    spawnID?: string;
    /** Pixel-X of a previously persisted player position inside this interior. */
    savedX?: number;
    /** Pixel-Y of a previously persisted player position inside this interior. */
    savedY?: number;
    gameState: OverworldGameState;
    seriesManager: SeriesManager | undefined;
    /** Callback that persists OverworldGameState to localStorage. */
    saveStateCallback: () => void;
    fadeInDurationMs?: number;
}

/**
 * Phaser scene for building interiors (shops, houses, dungeons, …).
 *
 * Each time the player enters a building, this scene is launched fresh via
 * `scene.launch('InteriorScene', data)`.  When the player exits, the scene
 * stops itself and wakes OverworldScene with the player's return position.
 *
 * State that must survive across scenes (series progress, jewel counts,
 * glyph translations) lives in the shared {@link OverworldGameState} that
 * is passed in via init data.
 */
export class InteriorScene extends ExplorationMapScene {
    // ── Init data ─────────────────────────────────────────────────────────────
    private mapKey!: string;
    private spawnID?: string;
    private savedX?: number;
    private savedY?: number;
    private saveStateCallback!: () => void;

    // ── Phaser objects ────────────────────────────────────────────────────────
    private player!: Phaser.GameObjects.Sprite;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    // ── Managers ──────────────────────────────────────────────────────────────
    private roofManager?: RoofManager;
    private puzzleManager!: OverworldPuzzleManager;
    private collisionManager!: CollisionManager;
    private bridgeManager?: OverworldBridgeManager;
    private cameraManager!: CameraManager;
    private puzzleController?: OverworldPuzzleController;

    // ── Scene state ───────────────────────────────────────────────────────────
    private collisionArray: number[][] = [];

    // Map cache key for this interior (e.g. 'interiorMap_house')
    private mapCacheKey!: string;
    private mapLoadFailed: boolean = false;
    private fadeInDurationMs?: number;
    private isSceneTransitioning: boolean = false;

    constructor() {
        super({ key: 'InteriorScene' });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init(data: InteriorSceneInitData): void {
        this.mapKey = data.mapKey;
        this.spawnID = data.spawnID;
        this.savedX = data.savedX;
        this.savedY = data.savedY;
        this.gameState = data.gameState;
        this.seriesManager = data.seriesManager;
        this.saveStateCallback = data.saveStateCallback;
        this.fadeInDurationMs = data.fadeInDurationMs;
        this.mapCacheKey = `interiorMap_${this.mapKey}`;
        this.puzzleManager = new OverworldPuzzleManager(defaultTileConfig, this.getPuzzleIDPrefix());
        this.collisionManager = new CollisionManager(this);
        this.cameraManager = new CameraManager(this);

        // Reset per-session state
        this.collisionArray = [];
        this.interactables = [];
        this.npcs = [];
        this.currentSeries = null;
        this.currentSeriesPuzzleData = new Map();
        this.stepHotspots.clear();
        this.lastCheckedTile = '';
        this.resetExplorationMapState();
        this.mapLoadFailed = false;
        this.isSceneTransitioning = false;
        this.bridgeManager = undefined;
        this.puzzleController = undefined;
        this.constraintNPCManager = undefined;
        this.doorManager = undefined;
        this.gameMode = 'exploration';
        this.isExitingPuzzle = false;
    }

    preload(): void {
        queueDoorSpriteAssets(this);
        // Kick off async map load (same polling pattern as OverworldScene)
        this.loadMapFile();
    }

    protected getMapCacheKey(): string {
        return this.mapCacheKey;
    }

    protected onNoTilesetDataInCache(): void {
        console.warn('[InteriorScene] No tileset data in map cache');
    }

    protected onTilesetLoadFailed(tilesetName: string, textureKey: string): void {
        console.warn(`[InteriorScene] Failed to load tileset "${tilesetName}" (key: ${textureKey})`);
    }

    protected onVisualLayerCreateFailed(layerName: string): void {
        console.warn(`[InteriorScene] Failed to create visual layer "${layerName}"`);
    }

    protected onRoofLayerCreateFailed(layerName: string): void {
        console.warn(`[InteriorScene] Failed to create roofs layer "${layerName}"`);
    }

    protected persistMeaningfulProgress(): void {
        this.saveStateCallback();
    }

    protected setJewelHUDVisible(visible: boolean): void {
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
        hud?.setJewelHUDVisible(visible);
    }

    protected getSeriesPuzzleCallerSceneKey(): string {
        return 'InteriorScene';
    }

    protected getEmbeddedPuzzleController(): OverworldPuzzleController | undefined {
        return this.puzzleController;
    }

    protected getExplorationPlayerSprite(): Phaser.GameObjects.Sprite | null {
        return this.player ?? null;
    }

    protected getExplorationPlayerWorldPosition(): { x: number; y: number } | null {
        return this.player
            ? { x: this.player.x, y: this.player.y }
            : null;
    }

    protected getPuzzleIdAtWorldPosition(worldX: number, worldY: number): string | null {
        const puzzle = this.puzzleManager.getPuzzleAtPosition(worldX, worldY, this.tiledMapData);
        return puzzle?.id ?? null;
    }

    protected getExplorationPuzzleManager(): OverworldPuzzleManager {
        return this.puzzleManager;
    }

    protected getExplorationCollisionManager(): CollisionManager {
        return this.collisionManager;
    }

    protected getExplorationCameraManager(): CameraManager {
        return this.cameraManager;
    }

    protected getCollectibleHUDScene(): OverworldHUDScene | undefined {
        return this.scene.get('OverworldHUDScene') as OverworldHUDScene | undefined;
    }

    protected setExplorationPlayerLayerDisplay(playerLayer: ReturnType<PlayerController['getPlayerLayer']>): void {
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
        hud?.setPlayerLayerDisplay(playerLayer);
    }

    protected onEmbeddedPuzzleExitedMode(): void {
        this.cameras.main.startFollow(this.player);
    }

    protected onExplorationFrameWhileActive(): void {
        if (this.roofManager && this.player) {
            this.roofManager.update(this.player.x, this.player.y);
        }
    }

    create(): void {
        if (this.mapLoadFailed) {
            return;
        }

        if (!this.waitForMapSceneAssets()) {
            return;
        }

        const tilesets = this.bootstrapExplorationMap();
        if (!tilesets) {
            return;
        }
        this.setupCollisionLayer(tilesets);

        // Player position: prefer persisted coords, then named spawn, then map centre
        const startPos = this.findSpawnPosition();
        this.player = this.add.sprite(startPos.x, startPos.y, 'player', 0);
        this.player.setOrigin(0.5, 0.75);
        this.player.setDepth(startPos.y);

        // Camera follows player, bounded to the interior map
        this.cameras.main.startFollow(this.player);
        this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        this.cameras.main.setZoom(2);
        this.cameras.main.roundPixels = true;

        this.scene.bringToTop('OverworldHUDScene');
        PuzzleHUDManager.getInstance().ensureHidden(this);

        // Keyboard + player movement
        const { cursors, wasdKeys } = this.createMovementKeys();
        this.cursors = cursors;
        this.playerController = new PlayerController(
            this,
            this.player,
            this.cursors,
            (x, y) => this.getCollisionAt(x, y),
            wasdKeys,
        );

        if (this.fadeInDurationMs) {
            this.isSceneTransitioning = true;
            SceneTransitionCoordinator.disableInteraction({
                scene: this,
                playerController: this.playerController,
                onDisable: () => {
                    this.isPointerHeld = false;
                },
            });
        }

        this.initializeInteriorPuzzles(tilesets);
        this.initialiseExplorationInteractablesAndCursor();
        this.loadPortals();

        // Roof hiding
        if (this.roofsLayers.length > 0) {
            this.roofManager = new RoofManager(this);
            this.roofManager.initialize(this.map, this.roofsLayers, this.tiledMapData);
        }

        // Pointer input for tap-to-move and interaction
        this.setupExplorationInteractionInput();

        if (this.fadeInDurationMs) {
            const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
            void SceneTransitionCoordinator.fadeInAndEnable({
                scene: this,
                playerController: this.playerController,
                hud,
                onEnable: () => {
                    this.isPointerHeld = false;
                },
            }, this.fadeInDurationMs).then(() => {
                this.isSceneTransitioning = false;
            });
        }

        console.log(`[InteriorScene] "${this.mapKey}" created at spawn (${startPos.x}, ${startPos.y})`);
    }

    update(_time: number, delta: number): void {
        this.updateExplorationScene(_time, delta);
    }

    // ── Collision API (required by PlayerController and CollisionManager) ─────

    public getCollisionAt(tileX: number, tileY: number): CollisionType {
        if (tileY < 0 || tileY >= this.collisionArray.length) return CollisionType.BLOCKED;
        if (tileX < 0 || tileX >= (this.collisionArray[0]?.length ?? 0)) return CollisionType.BLOCKED;
        return this.collisionArray[tileY][tileX] as CollisionType;
    }

    public setCollisionAt(tileX: number, tileY: number, collisionType: CollisionType): void {
        if (tileY < 0 || tileY >= this.collisionArray.length) return;
        if (tileX < 0 || tileX >= (this.collisionArray[0]?.length ?? 0)) return;
        this.collisionArray[tileY][tileX] = collisionType;
    }

    // ── Exit to overworld ─────────────────────────────────────────────────────

    private async exitToOverworld(returnSpawnID?: string): Promise<void> {
        if (this.isSceneTransitioning) {
            return;
        }

        this.isSceneTransitioning = true;

        // Clear the interior tracking and persist the cleared state
        this.gameState.clearCurrentInterior();
        this.saveStateCallback();

        const returnPos = this.gameState.getInteriorReturnPosition();

        console.log(
            `[InteriorScene] Exiting "${this.mapKey}", returning to overworld ` +
            (returnPos ? `at (${returnPos.x}, ${returnPos.y})` : `(spawn "${returnSpawnID ?? 'default'}')`)
        );

        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
        await SceneTransitionCoordinator.fadeOutAndDisable({
            scene: this,
            playerController: this.playerController,
            hud,
            onDisable: () => {
                this.isPointerHeld = false;
            },
        }, SceneTransitionCoordinator.DEFAULT_FADE_DURATION_MS);

        // Wake the overworld (pass the return position so it can reposition the player)
        this.scene.wake('OverworldScene', {
            returnPlayerX: returnPos?.x,
            returnPlayerY: returnPos?.y,
            returnSpawnID,
            fadeInDurationMs: SceneTransitionCoordinator.DEFAULT_FADE_DURATION_MS,
        });

        // Stop this scene — it is re-launched fresh on the next entry
        this.scene.stop();
    }

    // ── Map loading ───────────────────────────────────────────────────────────

    private async loadMapFile(): Promise<void> {
        try {
            const mapPath = `resources/interiors/${this.mapKey}.json`;
            console.log(`[InteriorScene] Loading interior map: ${mapPath}`);
            const preparedMap = await prepareMapSceneData(
                mapPath,
                MapUtils.loadTiledMap,
                (textureKey) => this.textures.exists(textureKey),
            );
            this.tiledMapData = preparedMap.mapData;
            this.loadEmbeddedTilesets(preparedMap.tilesetImageRequests);
            this.queueConstraintDisguiseSprites();
            this.cache.tilemap.add(this.mapCacheKey, { format: 1, data: this.tiledMapData });
            console.log(`[InteriorScene] Map "${this.mapKey}" loaded`);
        } catch (error) {
            console.error(`[InteriorScene] Failed to load interior map "${this.mapKey}":`, error);
            this.handleMapLoadFailure();
        }
    }

    private handleMapLoadFailure(): void {
        if (this.mapLoadFailed) {
            return;
        }

        this.mapLoadFailed = true;
        this.gameState.clearCurrentInterior();
        this.saveStateCallback();

        console.warn(`[InteriorScene] Clearing saved interior state for failed map "${this.mapKey}"`);

        const overworldScene = this.scene.get('OverworldScene');
        if (overworldScene) {
            this.scene.wake('OverworldScene');
        }

        this.scene.stop();
    }

    private loadEmbeddedTilesets(requests: ReturnType<typeof getTilesetImageLoadRequests>): void {
        queueMapSceneImageRequests(
            requests,
            (textureKey, imagePath) => this.load.image(textureKey, imagePath),
            () => this.load.isLoading(),
            () => this.load.start(),
        );
    }

    private setupCollisionLayer(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const collisionBootstrap = this.setupCollisionBootstrap(tilesets);

        for (const layerName of collisionBootstrap.failedLayerNames) {
            console.warn(`[InteriorScene] Failed to create collision layer "${layerName}"`);
        }

        if (this.collisionLayers.length === 0) {
            console.warn('[InteriorScene] No collision layers found');
            return;
        }

        this.collisionArray = collisionBootstrap.collisionInitData?.collisionArray ?? [];
    }

    private findSpawnPosition(): { x: number; y: number } {
        // Prefer persisted pixel position (cold-start resume)
        if (this.savedX !== undefined && this.savedY !== undefined) {
            return { x: this.savedX, y: this.savedY };
        }

        // Find the named spawn-point object
        const spawnID = this.spawnID;
        if (spawnID && this.tiledMapData) {
            const spawn = this.findSpawnObject(spawnID);
            if (spawn) {
                return { x: spawn.x, y: spawn.y };
            }
            console.warn(`[InteriorScene] Spawn point "${spawnID}" not found`);
        }

        const defaultSpawn = this.findFirstSpawnObject();
        if (defaultSpawn) {
            return defaultSpawn;
        }

        return { x: this.map.widthInPixels / 2, y: this.map.heightInPixels / 2 };
    }

    /**
     * Search all `spawnPoints` / `sceneTransitions` object layers for an object
     * whose `name` matches `spawnID`.
     */
    private findSpawnObject(spawnID: string): { x: number; y: number } | null {
        const layerNames = ['spawnPoints', 'sceneTransitions'];
        for (const ln of layerNames) {
            const layer = this.map.getObjectLayer(ln);
            if (!layer) continue;
            const obj = layer.objects.find((o) => o.name === spawnID);
            if (obj && typeof obj.x === 'number' && typeof obj.y === 'number') {
                return { x: obj.x, y: obj.y };
            }
        }
        return null;
    }

    private findFirstSpawnObject(): { x: number; y: number } | null {
        const layerNames = ['spawnPoints', 'sceneTransitions'];
        for (const ln of layerNames) {
            const layer = this.map.getObjectLayer(ln);
            if (!layer) continue;
            const obj = layer.objects.find((o) => typeof o.x === 'number' && typeof o.y === 'number');
            if (obj && typeof obj.x === 'number' && typeof obj.y === 'number') {
                return { x: obj.x, y: obj.y };
            }
        }
        return null;
    }

    // ── Portal loading ────────────────────────────────────────────────────────

    private loadPortals(): void {
        if (!this.tiledMapData) return;

        const portalsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'portals');
        if (portalsLayers.length === 0) return;

        const tileWidth: number = this.tiledMapData.tilewidth || 32;
        const tileHeight: number = this.tiledMapData.tileheight || 32;

        for (const layerInfo of portalsLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) layer = this.map.getObjectLayer(layerInfo.name);
            if (!layer) continue;

            for (const obj of layer.objects) {
                const portal = Portal.fromTiledObject(obj as any, tileWidth, tileHeight);
                if (!portal) continue;

                const capturedPortal = portal;
                if (capturedPortal.targetMapKey === 'overworld') {
                    this.registerStepHotspot(capturedPortal.tileX, capturedPortal.tileY, () => {
                        this.exitToOverworld(capturedPortal.targetSpawnID);
                    });
                } else {
                    // Transition to another interior — not yet implemented; log for now
                    console.warn(
                        `[InteriorScene] Interior-to-interior portals not yet supported ` +
                        `(portal "${capturedPortal.id}" → "${capturedPortal.targetMapKey}")`
                    );
                }
            }
        }
    }

    private initializeInteriorPuzzles(tilesets: Phaser.Tilemaps.Tileset[]): void {
        if (!this.tiledMapData) {
            return;
        }

        const puzzles = this.puzzleManager.loadPuzzlesFromMap(this.tiledMapData);
        if (puzzles.size === 0) {
            return;
        }

        this.gameState.restorePuzzleProgress(puzzles);

        const bridgesLayer = this.createBridgesLayerForMap(tilesets);
        if (bridgesLayer) {
            this.bridgeManager = new OverworldBridgeManager(bridgesLayer, this.tiledMapData, this);
            this.bridgeManager.restoreCompletedPuzzles(
                this.gameState,
                (puzzleId: string) => {
                    const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
                    return bounds
                        ? new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height)
                        : null;
                }
            );
        }

        this.puzzleController = new OverworldPuzzleController(
            this,
            this.gameState,
            this.puzzleManager,
            this.cameraManager,
            this.collisionManager,
            this.bridgeManager,
            this.tiledMapData
        );
    }

    private getPuzzleIDPrefix(): string {
        return `interior:${this.mapKey}`;
    }
}
