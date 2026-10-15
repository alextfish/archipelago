import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { CollisionManager, CollisionType } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import type { SeriesManager } from '@model/series/SeriesFactory';
import { CollisionInitialiser } from '@model/overworld/CollisionInitialiser';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { OverworldPuzzleController } from '@controller/OverworldPuzzleController';
import { PlayerController } from '@view/PlayerController';
import { CameraManager } from '@view/CameraManager';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';
import { findInteractableInRangeAtTile, isWithinInteractionRange } from '@view/PointerInteractionHelpers';
import { NPCSpriteController } from '@view/NPCSpriteController';
import { CollectibleManager } from '@view/CollectibleManager';
import { ConstraintNPCManager } from '@view/ConstraintNPCManager';
import { DoorManager } from '@view/DoorManager';
import { Portal } from '@model/overworld/Portal';
import { NPC } from '@model/conversation/NPC';
import type { ConversationSpec } from '@model/conversation/ConversationData';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import { ConversationVariableSubstitutor } from '@model/conversation/ConversationVariableSubstitutor';
import { RoofManager } from '@view/RoofManager';
import { SceneTransitionCoordinator } from '@view/SceneTransitionCoordinator';
import { getConstraintPuzzleID } from '@view/ConstraintNPCUtils';
import {
    buildPuzzleEntryInteractables,
    createBridgesLayer,
    hidePuzzleConstraintNPCsAfterEntry,
    isPuzzleEntryTile,
    showPuzzleConstraintNPCsBeforeExit,
} from '@view/MapPuzzleSceneHelpers';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import type { ConversationScene } from '@view/scenes/ConversationScene';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import { queueDoorSpriteAssets } from '@view/DoorAssetLoader';
import { Door } from '@model/overworld/Door';
import { TileAnimationManager } from '@view/TileAnimationManager';
import {
    areTilesetTexturesReady,
    getTilesetImageLoadRequests,
} from '@view/MapSceneAssetUtils';
import {
    createHiddenLayersBySuffix,
    createOverheadLayersBySuffix,
    createVisualLayers,
    loadMapTilesets,
} from '@view/MapSceneLayerUtils';

/**
 * Depth value for overhead layers (roofs, canopies, etc.) that should always
 * render above Y-sorted world sprites.
 */
const OVERHEAD_LAYER_DEPTH = 100_000;

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
export class InteriorScene extends Phaser.Scene {
    // ── Init data ─────────────────────────────────────────────────────────────
    private mapKey!: string;
    private spawnID?: string;
    private savedX?: number;
    private savedY?: number;
    private gameState!: OverworldGameState;
    private seriesManager: SeriesManager | undefined;
    private saveStateCallback!: () => void;

    // ── Phaser objects ────────────────────────────────────────────────────────
    private player!: Phaser.GameObjects.Sprite;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private playerController?: PlayerController;
    private map!: Phaser.Tilemaps.Tilemap;
    private collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];
    private roofsLayers: Phaser.Tilemaps.TilemapLayer[] = [];
    private tiledMapData?: any;

    // ── Managers ──────────────────────────────────────────────────────────────
    private gridMapper!: GridToWorldMapper;
    private roofManager?: RoofManager;
    private interactionCursor?: InteractionCursor;
    private npcSpriteController?: NPCSpriteController;
    private collectibleManager?: CollectibleManager;
    private constraintNPCManager?: ConstraintNPCManager;
    private doorManager?: DoorManager;
    private tileAnimationManager?: TileAnimationManager;
    private puzzleManager!: OverworldPuzzleManager;
    private collisionManager!: CollisionManager;
    private bridgeManager?: OverworldBridgeManager;
    private cameraManager!: CameraManager;
    private puzzleController?: OverworldPuzzleController;

    // ── Scene state ───────────────────────────────────────────────────────────
    private collisionArray: number[][] = [];
    private interactables: Interactable[] = [];
    private npcs: NPC[] = [];
    private currentSeries: any = null;
    private currentSeriesPuzzleData: Map<string, any> = new Map();
    private gameMode: 'exploration' | 'conversation' | 'puzzle' = 'exploration';
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
        this.collisionLayers = [];
        this.roofsLayers = [];
        this.mapLoadFailed = false;
        this.isSceneTransitioning = false;
        this.bridgeManager = undefined;
        this.puzzleController = undefined;
        this.constraintNPCManager = undefined;
        this.doorManager = undefined;
        this.tileAnimationManager = undefined;
        this.gameMode = 'exploration';
        this.isExitingPuzzle = false;
    }

    preload(): void {
        queueDoorSpriteAssets(this);
        // Kick off async map load (same polling pattern as OverworldScene)
        this.loadMapFile();
    }

    create(): void {
        if (this.mapLoadFailed) {
            return;
        }

        // Poll until the map JSON has been added to the tilemap cache
        if (!this.cache.tilemap.exists(this.mapCacheKey)) {
            this.time.delayedCall(100, () => this.create(), [], this);
            return;
        }

        if (!this.areTilesetTexturesReady()) {
            this.time.delayedCall(100, () => this.create(), [], this);
            return;
        }

        this.map = this.make.tilemap({ key: this.mapCacheKey });
        this.gridMapper = new GridToWorldMapper(this.tiledMapData?.tilewidth ?? 32);

        const tilesets = this.loadAllTilesets();

        this.setupVisualLayers(tilesets);
        this.setupCollisionLayer(tilesets);
        this.setupRoofsLayer(tilesets);
        this.tileAnimationManager = new TileAnimationManager(this.map, tilesets);

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
        this.tileAnimationManager?.update(delta);
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
            this.tiledMapData = await MapUtils.loadTiledMap(mapPath);
            this.loadEmbeddedTilesets(this.tiledMapData);
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

    private loadEmbeddedTilesets(data: any): void {
        if (!data?.tilesets) return;

        const requests = getTilesetImageLoadRequests(
            data.tilesets,
            (textureKey) => this.textures.exists(textureKey),
        );

        for (const request of requests) {
            this.load.image(request.textureKey, request.imagePath);
        }

        if (requests.length > 0 && !this.load.isLoading()) {
            this.load.start();
        }
    }

    private loadAllTilesets(): Phaser.Tilemaps.Tileset[] {
        const mapData = this.cache.tilemap.get(this.mapCacheKey);
        if (!mapData?.data?.tilesets) {
            console.warn('[InteriorScene] No tileset data in map cache');
            return [];
        }

        const tilesetLoads = loadMapTilesets(
            mapData.data.tilesets,
            (tilesetName, textureKey) => this.map.addTilesetImage(tilesetName, textureKey),
        );
        const tilesets: Phaser.Tilemaps.Tileset[] = [];

        for (const tilesetLoad of tilesetLoads) {
            if (tilesetLoad.tileset) {
                tilesets.push(tilesetLoad.tileset);
            } else {
                console.warn(`[InteriorScene] Failed to load tileset "${tilesetLoad.name}" (key: ${tilesetLoad.textureKey})`);
            }
        }

        return tilesets;
    }

    private areTilesetTexturesReady(): boolean {
        const mapData = this.cache.tilemap.get(this.mapCacheKey);
        return areTilesetTexturesReady(
            mapData?.data?.tilesets,
            (textureKey) => this.textures.exists(textureKey),
        );
    }

    private setupVisualLayers(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const visualLayers = createVisualLayers(
            this.map.layers,
            (layerName, visualTilesets) => this.map.createLayer(layerName, visualTilesets),
            tilesets,
            {
            overheadLayerDepth: OVERHEAD_LAYER_DEPTH,
            },
        );

        for (const layerName of visualLayers.failedLayerNames) {
            console.warn(`[InteriorScene] Failed to create visual layer "${layerName}"`);
        }
    }

    private setupCollisionLayer(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const collisionLayers = createHiddenLayersBySuffix(
            this.map.layers,
            (layerName, collisionTilesets) => this.map.createLayer(layerName, collisionTilesets),
            tilesets,
            'collision',
        );
        this.collisionLayers = collisionLayers.createdLayers;

        for (const layerName of collisionLayers.failedLayerNames) {
            console.warn(`[InteriorScene] Failed to create collision layer "${layerName}"`);
        }

        if (this.collisionLayers.length === 0) {
            console.warn('[InteriorScene] No collision layers found');
            return;
        }

        const { collisionArray } = CollisionInitialiser.buildCollisionData(
            this.tiledMapData ?? {},
            this.map.width,
            this.map.height,
            (x, y) => this.collisionLayers.map((cl) => {
                const tile = cl.getTileAt(x, y);
                if (!tile || tile.index === -1) return null;
                return { properties: tile.properties ?? undefined };
            })
        );
        this.collisionArray = collisionArray;
    }

    private setupRoofsLayer(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const roofLayers = createOverheadLayersBySuffix(
            this.map.layers,
            (layerName, roofTilesets) => this.map.createLayer(layerName, roofTilesets),
            tilesets,
            'roofs',
            OVERHEAD_LAYER_DEPTH,
        );
        this.roofsLayers = roofLayers.createdLayers;

        for (const layerName of roofLayers.failedLayerNames) {
            console.warn(`[InteriorScene] Failed to create roofs layer "${layerName}"`);
        }
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

        const bridgesLayer = createBridgesLayer(this.map, tilesets);
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

    private async startConversationWithNPC(npc: NPC): Promise<void> {
        if (!npc.hasConversation()) return;

        try {
            this.gameMode = 'conversation';
            let useSolvedConversation = false;

            if (npc.id.startsWith('constraint-')) {
                const puzzleId = getConstraintPuzzleID(npc.id);
                useSolvedConversation = puzzleId
                    ? this.gameState.isPuzzleCompleted(puzzleId)
                    : false;
            } else {
                const state = this.npcSpriteController?.npcSeriesStates.get(npc.id);
                useSolvedConversation = state?.isSeriesCompleted() ?? false;
            }

            const conversationPath = npc.getConversationPath(useSolvedConversation);
            const response = await fetch(conversationPath);
            if (!response.ok) throw new Error(`Failed to load conversation: ${response.statusText}`);

            const conversationSpec: ConversationSpec = await response.json();

            const startNodeId = ConversationConditionEvaluator.resolveStartNode(
                conversationSpec,
                { getJewelCount: (colour) => this.gameState.getJewelCount(colour) }
            );

            if (npc.conversationVariables) {
                ConversationVariableSubstitutor.applyTo(conversationSpec, npc.conversationVariables);
            }

            const conversationNPC = this.constraintNPCManager?.getConversationNPC(npc, useSolvedConversation) ?? npc;

            const conversationScene = this.scene.get('ConversationScene') as
                (ConversationScene & { startConversation: Function; events: Phaser.Events.EventEmitter }) | null;
            if (!conversationScene) {
                throw new Error('[InteriorScene] ConversationScene not found');
            }

            conversationScene.setGlyphTracker(this.gameState.glyphTracker);

            conversationScene.events.once('conversationEnded', () => {
                this.onConversationEnded();
            });

            conversationScene.events.on('conversationEffects', (effects: any[]) => {
                this.handleConversationEffects(effects, npc);
            });

            // All setup complete — now disable player movement and launch conversation
            this.playerController?.stopAndIdle();
            this.playerController?.setEnabled(false);

            if (!this.scene.isActive('ConversationScene')) {
                conversationScene.events.once('create', () => {
                    conversationScene.startConversation(conversationSpec, conversationNPC, startNodeId);
                });
                this.scene.launch('ConversationScene');
            } else {
                conversationScene.startConversation(conversationSpec, conversationNPC, startNodeId);
            }

        } catch (error) {
            console.error('[InteriorScene] Error starting conversation:', error);
            this.playerController?.setEnabled(true);
            this.gameMode = 'exploration';
        }
    }

    private onConversationEnded(): void {
        this.playerController?.setEnabled(true);
        this.gameMode = 'exploration';
        const conversationScene = this.scene.get('ConversationScene');
        if (conversationScene) {
            conversationScene.events.off('conversationEffects');
        }
        this.scene.stop('ConversationScene');
    }

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

    private async animateDoorChange(door: Door, unlock: boolean): Promise<void> {
        await this.doorManager?.animateDoorChange(door, unlock);
    }

    private unlockDoor(doorId: string): void {
        this.doorManager?.unlockDoor(doorId);
    }

    private updateNPCIcon(npc: NPC): void {
        this.npcSpriteController?.updateNPCIcon(npc);
    }

    private async handleConversationEffects(effects: any[], npc?: NPC): Promise<void> {
        for (const effect of effects) {
            switch (effect.type) {
                case 'startSeries':
                    if (effect.seriesId) {
                        await this.startPuzzleSeries(effect.seriesId, npc);
                    }
                break;
                case 'unlockDoor':
                    if (effect.doorId) {
                        this.unlockDoor(effect.doorId);
                    }
                    break;
                default:
                    console.log(`[InteriorScene] Unhandled conversation effect: ${effect.type}`);
            }
        }
    }

    // ── Series puzzle launching (mirrors OverworldScene) ─────────────────────

    private async startPuzzleSeries(seriesId: string, npc?: NPC): Promise<void> {
        let series = null;

        if (npc) {
            const state = this.npcSpriteController?.npcSeriesStates.get(npc.id);
            series = state?.getSeries();
            if (series && series.id !== seriesId) series = null;
        }

        if (!series) {
            try {
                const seriesPath = `data/series/${seriesId}.json`;
                const response = await fetch(seriesPath);
                if (!response.ok) throw new Error(`Failed to load series: ${response.statusText}`);
                const seriesJson = await response.json();
                series = await this.seriesManager!.loadSeries(seriesJson);

                if (seriesJson.puzzles) {
                    for (const puzzle of seriesJson.puzzles) {
                        if (puzzle.id && puzzle.puzzleData) {
                            this.currentSeriesPuzzleData.set(puzzle.id, puzzle.puzzleData);
                        }
                    }
                }
            } catch (error) {
                console.error(`[InteriorScene] Error loading series ${seriesId}:`, error);
                return;
            }
        }

        const firstUnsolvedId = this.getSeriesEntryIdToLaunch(series, true);

        if (!firstUnsolvedId) {
            console.warn(`[InteriorScene] No unlocked puzzles found in series ${seriesId}`);
            return;
        }

        this.currentSeries = series;
        this.launchSeriesPuzzleEntry(firstUnsolvedId);
    }

    private async handleSeriesPuzzleCompleted(data: { puzzleId: string; success: boolean }): Promise<void> {
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;

        if (!this.currentSeries) {
            hud?.setJewelHUDVisible(true);
            return;
        }

        if (!data.success) {
            hud?.setJewelHUDVisible(true);
            return;
        }

        const allEntries = this.currentSeries.getAllPuzzleEntries();
        const matching = allEntries.find((entry: any) => {
            const pd = this.currentSeriesPuzzleData.get(entry.id);
            return pd && pd.id === data.puzzleId;
        });
        if (!matching) return;

        const result = this.currentSeries.completePuzzle(matching.id);
        if (result.success) {
            console.log(`[InteriorScene] Series puzzle "${matching.id}" completed`);
            if (this.seriesManager) {
                await this.seriesManager.saveSeriesProgress(this.currentSeries);
            }
        }

        if (this.currentSeries.isSeriesCompleted()) {
            const seriesDoor = this.doorManager?.doors.find((door) => door.id === this.currentSeries!.id);
            if (seriesDoor && seriesDoor.isLocked()) {
                await this.animateDoorChange(seriesDoor, true);
            } else if (!seriesDoor) {
                this.unlockDoor(this.currentSeries.id);
            }

            for (const [npcId, state] of (this.npcSpriteController?.npcSeriesStates.entries() ?? [])) {
                if (state.getSeries()?.id === this.currentSeries.id) {
                    const npc = this.npcs.find((candidate) => candidate.id === npcId);
                    if (npc) {
                        this.updateNPCIcon(npc);
                    }
                }
            }
        } else {
            const nextPuzzleId = this.getSeriesEntryIdToLaunch(this.currentSeries, false);
            if (!nextPuzzleId) {
                hud?.setJewelHUDVisible(true);
                this.saveStateCallback();
                return;
            }

            this.time.delayedCall(0, () => {
                this.launchSeriesPuzzleEntry(nextPuzzleId);
            });
            this.saveStateCallback();
            return;
        }

        hud?.setJewelHUDVisible(true);
        this.saveStateCallback();
    }

    private getSeriesEntryIdToLaunch(series: any, allowCompletedFallback: boolean): string | null {
        const entries = series.getAllPuzzleEntries();
        for (const entry of entries) {
            if (entry.unlocked && !entry.completed) {
                return entry.id;
            }
        }

        if (!allowCompletedFallback) {
            return null;
        }

        const firstUnlocked = entries.find((entry: any) => entry.unlocked);
        return firstUnlocked?.id ?? null;
    }

    private launchSeriesPuzzleEntry(entryId: string): void {
        const puzzleData = this.currentSeriesPuzzleData.get(entryId);
        if (!puzzleData) {
            console.error(`[InteriorScene] No puzzle data for ${entryId}`);
            const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
            hud?.setJewelHUDVisible(true);
            return;
        }

        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
        hud?.setJewelHUDVisible(false);

        this.events.once('seriesPuzzleCompleted', (data: { puzzleId: string; success: boolean }) => {
            void this.handleSeriesPuzzleCompleted(data);
        });

        this.scene.launch('BridgePuzzleScene', {
            puzzleData,
            seriesMode: true,
            callerSceneKey: 'InteriorScene',
        });
    }
}
