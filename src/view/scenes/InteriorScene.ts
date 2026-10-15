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
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';
import { findInteractableInRangeAtTile, isWithinInteractionRange } from '@view/PointerInteractionHelpers';
import { NPCSpriteController } from '@view/NPCSpriteController';
import { CollectibleManager } from '@view/CollectibleManager';
import { ConstraintNPCManager } from '@view/ConstraintNPCManager';
import { DoorManager } from '@view/DoorManager';
import { Portal } from '@model/overworld/Portal';
import { RoofManager } from '@view/RoofManager';
import { SceneTransitionCoordinator } from '@view/SceneTransitionCoordinator';
import {
    buildPuzzleEntryInteractables,
    hidePuzzleConstraintNPCsAfterEntry,
    isPuzzleEntryTile,
    showPuzzleConstraintNPCsBeforeExit,
} from '@view/MapPuzzleSceneHelpers';
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
    private collectibleManager?: CollectibleManager;
    private puzzleManager!: OverworldPuzzleManager;
    private collisionManager!: CollisionManager;
    private bridgeManager?: OverworldBridgeManager;
    private cameraManager!: CameraManager;
    private puzzleController?: OverworldPuzzleController;

    // ── Scene state ───────────────────────────────────────────────────────────
    private collisionArray: number[][] = [];
    private interactables: Interactable[] = [];
    private isExitingPuzzle: boolean = false;

    // ── Step-hotspot system (exit portals) ────────────────────────────────────
    private readonly stepHotspots: Map<string, () => void> = new Map();
    private lastCheckedTile: string = '';

    // ── Input ─────────────────────────────────────────────────────────────────
    private isPointerHeld: boolean = false;
    private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerUpHandler?: () => void;

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

    protected setSeriesHUDVisible(visible: boolean): void {
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
        hud?.setJewelHUDVisible(visible);
    }

    protected getSeriesPuzzleCallerSceneKey(): string {
        return 'InteriorScene';
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
        this.cursors = this.input.keyboard!.createCursorKeys();
        const wasdKeys = this.input.keyboard!.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        }) as {
            up: Phaser.Input.Keyboard.Key;
            down: Phaser.Input.Keyboard.Key;
            left: Phaser.Input.Keyboard.Key;
            right: Phaser.Input.Keyboard.Key;
        };
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

        // NPCs, collectibles, portals
        this.setupNPCs();
        this.setupCollectibles();
        this.initializeInteriorPuzzles(tilesets);
        this.setupDoors();
        this.loadPortals();

        // Interaction cursor
        this.interactionCursor = new InteractionCursor(
            this,
            this.tiledMapData?.tilewidth ?? 32,
            this.tiledMapData?.tileheight ?? 32
        );

        // Roof hiding
        if (this.roofsLayers.length > 0) {
            this.roofManager = new RoofManager(this);
            this.roofManager.initialize(this.map, this.roofsLayers, this.tiledMapData);
        }

        // Pointer input for tap-to-move and interaction
        this.setupPointerInput();

        // E key to interact
        this.input.keyboard?.on('keydown-E', () => this.onInteractKey());

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
        this.updateExplorationMap(_time, delta);
        this.npcSpriteController?.update(
            delta,
            this.canPlayerMoveAroundAndInteract(),
        );

        this.player?.setDepth(this.player.y);

        if (!this.canPlayerMoveAroundAndInteract()) {
            return;
        }

        if (this.playerController) {
            this.playerController.update();
            const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
            hud?.setPlayerLayerDisplay(this.playerController.getPlayerLayer());
            this.checkStepHotspots();

            if (this.interactionCursor && this.tiledMapData && this.player) {
                const pos = this.playerController.getPosition();
                const { x: tx, y: ty } = this.gridMapper.worldToGrid(pos.x, pos.y);
                this.interactionCursor.setFacing(this.playerController.getFacingDirection());
                this.interactionCursor.update(tx, ty, this.interactables);
            }

            if (this.roofManager && this.player) {
                this.roofManager.update(this.player.x, this.player.y);
            }
        }
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

    public isInPuzzleMode(): boolean {
        return this.puzzleController?.isInPuzzleMode() ?? false;
    }

    // ── Step-hotspot system ───────────────────────────────────────────────────

    private registerStepHotspot(tileX: number, tileY: number, callback: () => void): void {
        this.stepHotspots.set(`${tileX},${tileY}`, callback);
    }

    private checkStepHotspots(): void {
        if (!this.player || !this.tiledMapData) return;
        const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);
        const tileKey = `${tileX},${tileY}`;
        if (tileKey !== this.lastCheckedTile) {
            this.lastCheckedTile = tileKey;
            const callback = this.stepHotspots.get(tileKey);
            if (callback) callback();
        }
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

        this.interactables.push(
            ...buildPuzzleEntryInteractables(
                this.puzzleManager,
                this.tiledMapData,
                this.gridMapper,
                this.map,
            )
        );

        if (this.npcSpriteController) {
            this.constraintNPCManager = new ConstraintNPCManager(
                this,
                this.puzzleManager,
                this.gridMapper,
                this.gameState,
                this.npcSpriteController.npcAppearanceRegistry,
                this.tiledMapData,
                (npc) => this.npcs.push(npc),
                (npcId) => this.npcs.some((npc) => npc.id === npcId),
                (interactable) => this.interactables.push(interactable),
            );
            this.constraintNPCManager.loadConstraintNPCs();
        }
    }

    private setupDoors(): void {
        if (!this.map || !this.tiledMapData) {
            return;
        }

        this.doorManager = new DoorManager(
            this,
            this.tiledMapData,
            this.map,
            this.collisionManager,
            this.gameState,
            this.cameraManager,
            () => this.player ?? null,
            () => this.playerController,
        );
        this.doorManager.loadDoors();
    }

    private getPuzzleIDPrefix(): string {
        return `interior:${this.mapKey}`;
    }

    // ── NPC setup ─────────────────────────────────────────────────────────────

    private setupNPCs(): void {
        if (!this.map || !this.tiledMapData) return;

        this.npcSpriteController = new NPCSpriteController(
            this,
            this.map,
            this.gridMapper,
            this.seriesManager,
            this.tiledMapData,
            (npc) => this.npcs.push(npc),
            (i) => this.interactables.push(i),
            (id, data) => this.currentSeriesPuzzleData.set(id, data),
        );
        this.npcSpriteController.registerAnimations();

        const npcsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'npcs');
        this.loadNPCLayers(npcsLayers);

        if (this.npcs.length > 0) {
            this.npcSpriteController.loadNPCSeries(this.npcs);
        }
    }

    private loadNPCLayers(npcsLayers: ReturnType<typeof TiledLayerUtils.findObjectLayersByName>): void {
        if (!this.npcSpriteController) return;

        for (const layerInfo of npcsLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) layer = this.map.getObjectLayer(layerInfo.name);
            if (!layer) continue;
            this.npcSpriteController.loadNPCsFromLayerWithOffset(
                layer,
                layerInfo.fullPath,
                layerInfo.offsetX,
                layerInfo.offsetY,
            );
        }
    }

    // ── Collectible setup ─────────────────────────────────────────────────────

    private setupCollectibles(): void {
        if (!this.map || !this.tiledMapData) return;

        this.collectibleManager = new CollectibleManager(
            this,
            this.tiledMapData,
            this.map,
            this.gameState,
            () => this.scene.get('OverworldHUDScene') as OverworldHUDScene | undefined,
            (i) => this.interactables.push(i),
            (pred) => { this.interactables = this.interactables.filter((i) => !pred(i)); },
        );
        this.collectibleManager.initialise();
        this.collectibleManager.loadCollectibles();
    }

    // ── Input handling ────────────────────────────────────────────────────────

    private setupPointerInput(): void {
        this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.playerController || !this.canPlayerMoveAroundAndInteract()) return;

            const { x: worldX, y: worldY } = { x: pointer.worldX, y: pointer.worldY };

            if (!this.player || !this.interactionCursor) return;
            this.isPointerHeld = true;
            const { x: clickTileX, y: clickTileY } = this.gridMapper.worldToGrid(worldX, worldY);
            const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(
                this.player.x, this.player.y
            );

            // Is there something specific in the clicked tile?
            // If so that's the only target we want to interact with, even if there are other interactables in range.
            const clickedTarget = findInteractableInRangeAtTile(
                this.interactables,
                playerTileX,
                playerTileY,
                clickTileX,
                clickTileY,
            );
            if (clickedTarget) {
                this.interactionCursor.setPreferredTargetTile(clickTileX, clickTileY);
                this.interactWithTarget(clickedTarget);
                this.isPointerHeld = false;
                return;
            }

            // Otherwise revert to normal target selection
            if (isWithinInteractionRange(playerTileX, playerTileY, clickTileX, clickTileY)) {
                this.interactionCursor.clearPreferredTargetTile();

                if (clickTileX === playerTileX && clickTileY === playerTileY) {
                    this.checkForPuzzleEntry();
                    this.isPointerHeld = false;
                    return;
                }
            }

            this.playerController.setTargetPosition(worldX, worldY);
        };

        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.canPlayerMoveAroundAndInteract()) return;
            if (!this.player || !this.interactionCursor) return;

            const { x: hoverTileX, y: hoverTileY } = this.gridMapper.worldToGrid(pointer.worldX, pointer.worldY);
            const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);
            const hoveredTarget = findInteractableInRangeAtTile(
                this.interactables,
                playerTileX,
                playerTileY,
                hoverTileX,
                hoverTileY,
            );

            if (hoveredTarget) {
                this.interactionCursor.setPreferredTargetTile(hoverTileX, hoverTileY);
            } else {
                this.interactionCursor.clearPreferredTargetTile();
            }

            if (!this.isPointerHeld || !this.playerController || !pointer.isDown) return;
            this.playerController.setTargetPosition(pointer.worldX, pointer.worldY);
        };

        this.pointerUpHandler = () => { this.isPointerHeld = false; };

        this.input.on('pointerdown', this.pointerDownHandler);
        this.input.on('pointermove', this.pointerMoveHandler);
        this.input.on('pointerup', this.pointerUpHandler);
    }

    private onInteractKey(): void {
        if (!this.canPlayerMoveAroundAndInteract()) {
            return;
        }

        const target = this.interactionCursor?.getCurrentTarget();
        if (target) {
            this.interactWithTarget(target);
            return;
        }

        this.checkForPuzzleEntry();
    }

    private interactWithTarget(target: Interactable): void {
        switch (target.type) {
            case 'puzzle':
                if (target.data?.puzzleId) {
                    void this.enterOverworldPuzzle(target.data.puzzleId);
                }
                break;
            case 'npc':
                if (target.data?.npc) {
                    void this.startConversationWithNPC(target.data.npc);
                }
                break;
            case 'collectible':
                if (target.data?.collectibleId) {
                    this.collectibleManager?.collectJewel(target.data.collectibleId);
                    this.saveStateCallback();
                }
                break;
            default:
                break;
        }
    }

    /** Canonical gate for interior movement/input; scene transitions or disabled player control keep this off even in exploration mode. */
    private canPlayerMoveAroundAndInteract(): boolean {
        return !this.isSceneTransitioning
            && this.gameMode === 'exploration'
            && (this.playerController?.isEnabled() ?? false);
    }

    // ── Conversation handling (mirrors OverworldScene) ────────────────────────

    private checkForPuzzleEntry(): void {
        if (!this.tiledMapData || !this.player || !this.map) {
            return;
        }

        const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);
        if (!isPuzzleEntryTile(this.map, tileX, tileY)) {
            return;
        }

        const puzzle = this.puzzleManager.getPuzzleAtPosition(this.player.x, this.player.y, this.tiledMapData);
        if (puzzle) {
            void this.enterOverworldPuzzle(puzzle.id);
        }
    }

    public async enterOverworldPuzzle(puzzleId: string): Promise<void> {
        if (!this.puzzleController) {
            console.error('[InteriorScene] Puzzle controller not initialized');
            return;
        }

        try {
            this.gameMode = 'puzzle';
            this.interactionCursor?.hide();

            const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
            hud?.setJewelHUDVisible(false);

            this.playerController?.stopAndIdle();
            this.playerController?.setEnabled(false);

            const hudScene = this.scene.get('PuzzleHUDScene');
            hudScene?.events.on('exit', this.handleHUDExit, this);
            hudScene?.events.on('undo', this.handleHUDUndo, this);
            hudScene?.events.on('redo', this.handleHUDRedo, this);
            hudScene?.events.on('typeSelected', this.handleTypeSelected, this);
            hudScene?.events.on('navigateNext', this.handleNavigateNext, this);
            hudScene?.events.on('navigatePrevious', this.handleNavigatePrevious, this);

            this.events.on('bridge-clicked', this.handleBridgeClicked, this);
            this.input.keyboard?.on('keydown-ESC', this.handleEscapeKey, this);

            await this.puzzleController.enterPuzzle(puzzleId, (mode: 'puzzle') => {
                this.gameMode = mode;
                this.cameras.main.stopFollow();
            });

            hidePuzzleConstraintNPCsAfterEntry(puzzleId, this.constraintNPCManager);

        } catch (error) {
            console.error(`[InteriorScene] Failed to enter overworld puzzle: ${puzzleId}`, error);
            await this.exitOverworldPuzzle(false);
        }
    }

    public async exitOverworldPuzzle(success: boolean): Promise<void> {
        if (!this.puzzleController) {
            return;
        }

        if (this.isExitingPuzzle) {
            return;
        }

        this.isExitingPuzzle = true;

        try {
            const hudScene = this.scene.get('PuzzleHUDScene');
            hudScene?.events.off('exit', this.handleHUDExit, this);
            hudScene?.events.off('undo', this.handleHUDUndo, this);
            hudScene?.events.off('redo', this.handleHUDRedo, this);
            hudScene?.events.off('typeSelected', this.handleTypeSelected, this);
            hudScene?.events.off('navigateNext', this.handleNavigateNext, this);
            hudScene?.events.off('navigatePrevious', this.handleNavigatePrevious, this);

            this.events.off('bridge-clicked', this.handleBridgeClicked, this);
            this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey, this);

            showPuzzleConstraintNPCsBeforeExit(
                this.puzzleController,
                this.constraintNPCManager,
            );
            const exitResult = await this.puzzleController.exitPuzzle(success, (mode: 'exploration') => {
                this.gameMode = mode;
                this.cameras.main.startFollow(this.player);
            });

            this.constraintNPCManager?.showConstraintNPCsForPuzzle(exitResult.puzzleId);

            const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
            hud?.setJewelHUDVisible(true);
            this.isPointerHeld = false;
            this.playerController?.setEnabled(!this.isSceneTransitioning && this.gameMode === 'exploration');

            if (exitResult.wasSolved || exitResult.wasUnsolved) {
                await this.doorManager?.animatePuzzleLinkedDoors(
                    exitResult.puzzleId,
                    exitResult.wasSolved,
                    exitResult.wasUnsolved,
                );
                this.saveStateCallback();
            }

            if (this.pointerDownHandler) {
                this.input.off('pointerdown', this.pointerDownHandler);
                this.input.on('pointerdown', this.pointerDownHandler);
            }
            if (this.pointerMoveHandler) {
                this.input.off('pointermove', this.pointerMoveHandler);
                this.input.on('pointermove', this.pointerMoveHandler);
            }
            if (this.pointerUpHandler) {
                this.input.off('pointerup', this.pointerUpHandler);
                this.input.on('pointerup', this.pointerUpHandler);
            }

        } catch (error) {
            console.error('[InteriorScene] Error exiting overworld puzzle:', error);
        } finally {
            this.isExitingPuzzle = false;
        }
    }

    private handleHUDExit(): void {
        this.currentSeries = null;
        if (this.puzzleController) {
            void this.exitOverworldPuzzle(false);
        }
    }

    private handleHUDUndo(): void {
        this.puzzleController?.handleUndo();
    }

    private handleHUDRedo(): void {
        this.puzzleController?.handleRedo();
    }

    private handleTypeSelected(typeId: string): void {
        this.puzzleController?.handleTypeSelected(typeId);
    }

    private handleEscapeKey(): void {
        if (this.isInPuzzleMode()) {
            this.currentSeries = null;
            void this.exitOverworldPuzzle(false);
        }
    }

    private async handleNavigateNext(): Promise<void> {
        if (!this.currentSeries) {
            return;
        }

        const result = this.currentSeries.navigateToNext();
        if (result.success && result.puzzleId) {
            await this.exitOverworldPuzzle(false);
            await this.enterOverworldPuzzle(result.puzzleId);
        }
    }

    private async handleNavigatePrevious(): Promise<void> {
        if (!this.currentSeries) {
            return;
        }

        const result = this.currentSeries.navigateToPrevious();
        if (result.success && result.puzzleId) {
            await this.exitOverworldPuzzle(false);
            await this.enterOverworldPuzzle(result.puzzleId);
        }
    }

    private handleBridgeClicked(bridgeId: string): void {
        this.puzzleController?.handleBridgeClicked(bridgeId);
    }

}
