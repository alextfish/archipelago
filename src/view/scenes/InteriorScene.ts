import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { SeriesManager } from '@model/series/SeriesFactory';
import { CollisionInitialiser } from '@model/overworld/CollisionInitialiser';
import { CollisionType } from '@model/overworld/CollisionTypes';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { PlayerController } from '@view/PlayerController';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';
import { NPCSpriteController } from '@view/NPCSpriteController';
import { CollectibleManager } from '@view/CollectibleManager';
import { Portal } from '@model/overworld/Portal';
import { NPC } from '@model/conversation/NPC';
import type { ConversationSpec } from '@model/conversation/ConversationData';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import { ConversationVariableSubstitutor } from '@model/conversation/ConversationVariableSubstitutor';
import { RoofManager } from '@view/RoofManager';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import type { ConversationScene } from '@view/scenes/ConversationScene';

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

    // ── Scene state ───────────────────────────────────────────────────────────
    private collisionArray: number[][] = [];
    private interactables: Interactable[] = [];
    private npcs: NPC[] = [];
    private currentSeries: any = null;
    private currentSeriesPuzzleData: Map<string, any> = new Map();

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
        this.mapCacheKey = `interiorMap_${this.mapKey}`;

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
    }

    preload(): void {
        // Kick off async map load (same polling pattern as OverworldScene)
        this.loadMapFile();
    }

    create(): void {
        // Poll until the map JSON has been added to the tilemap cache
        if (!this.cache.tilemap.exists(this.mapCacheKey)) {
            this.time.delayedCall(100, () => this.create(), [], this);
            return;
        }

        this.map = this.make.tilemap({ key: this.mapCacheKey });
        this.gridMapper = new GridToWorldMapper(this.tiledMapData?.tilewidth ?? 32);

        const tilesets = this.loadAllTilesets();

        this.setupVisualLayers(tilesets);
        this.setupCollisionLayer(tilesets);
        this.setupRoofsLayer(tilesets);

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

        // Keyboard + player movement
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.playerController = new PlayerController(
            this,
            this.player,
            this.cursors,
            (x, y) => this.getCollisionAt(x, y)
        );

        // NPCs, collectibles, portals
        this.setupNPCs();
        this.setupCollectibles();
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

        console.log(`[InteriorScene] "${this.mapKey}" created at spawn (${startPos.x}, ${startPos.y})`);
    }

    update(_time: number, _delta: number): void {
        if (this.player) {
            this.player.setDepth(this.player.y);
        }

        if (this.playerController) {
            this.playerController.update();
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

    private exitToOverworld(returnSpawnID?: string): void {
        this.playerController?.setEnabled(false);

        // Clear the interior tracking and persist the cleared state
        this.gameState.clearCurrentInterior();
        this.saveStateCallback();

        const returnPos = this.gameState.getInteriorReturnPosition();

        console.log(
            `[InteriorScene] Exiting "${this.mapKey}", returning to overworld ` +
            (returnPos ? `at (${returnPos.x}, ${returnPos.y})` : `(spawn "${returnSpawnID ?? 'default'}')`)
        );

        // Wake the overworld (pass the return position so it can reposition the player)
        this.scene.wake('OverworldScene', {
            returnPlayerX: returnPos?.x,
            returnPlayerY: returnPos?.y,
            returnSpawnID,
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
        }
    }

    private loadEmbeddedTilesets(data: any): void {
        if (!data?.tilesets) return;
        for (const tileset of data.tilesets) {
            if (!tileset.image) continue;
            const key = `tileset_${tileset.name}`;
            if (this.textures.exists(key)) continue;
            let imagePath: string;
            if (tileset.image.startsWith('data:')) {
                imagePath = tileset.image;
            } else if (tileset.image.startsWith('../')) {
                imagePath = tileset.image.substring(3);
            } else if (tileset.image.startsWith('tilesets/')) {
                imagePath = `resources/${tileset.image}`;
            } else {
                imagePath = `resources/tilesets/${tileset.image}`;
            }
            this.load.image(key, imagePath);
        }
        if (!this.load.isLoading() && this.load.totalToLoad > 0) {
            this.load.start();
        }
    }

    private loadAllTilesets(): Phaser.Tilemaps.Tileset[] {
        const mapData = this.cache.tilemap.get(this.mapCacheKey);
        if (!mapData?.data?.tilesets) {
            console.warn('[InteriorScene] No tileset data in map cache');
            return [];
        }

        const externalMapping: Record<string, string> = {
            beach: 'beachTileset',
            SproutLandsGrassIslands: 'grassTileset',
        };

        const tilesets: Phaser.Tilemaps.Tileset[] = [];
        for (const ts of mapData.data.tilesets) {
            const key = externalMapping[ts.name] ?? `tileset_${ts.name}`;
            const tileset = this.map.addTilesetImage(ts.name, key);
            if (tileset) {
                tilesets.push(tileset);
            } else {
                console.warn(`[InteriorScene] Failed to load tileset "${ts.name}" (key: ${key})`);
            }
        }
        return tilesets;
    }

    private setupVisualLayers(tilesets: Phaser.Tilemaps.Tileset[]): void {
        for (const layerData of this.map.layers) {
            const suffix = TiledLayerUtils.getLayerSuffix(layerData.name);
            if (suffix === 'collision' || suffix === 'roofs') continue;

            const autoRenderProp: any = Array.isArray(layerData.properties)
                ? layerData.properties.find((p: any) => p.name === 'autoRender')
                : undefined;
            if (!autoRenderProp || autoRenderProp.value !== true) continue;

            const layer = this.map.createLayer(layerData.name, tilesets);
            if (!layer) continue;

            const aboveProp: any = Array.isArray(layerData.properties)
                ? layerData.properties.find((p: any) => p.name === 'renderAbovePlayer')
                : undefined;
            if (aboveProp?.value === true) {
                layer.setDepth(OVERHEAD_LAYER_DEPTH);
            }
        }
    }

    private setupCollisionLayer(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const collisionLayers = this.map.layers.filter(
            (l) => TiledLayerUtils.getLayerSuffix(l.name) === 'collision'
        );

        for (const layerData of collisionLayers) {
            const layer = this.map.createLayer(layerData.name, tilesets);
            if (layer) {
                layer.setAlpha(0);
                this.collisionLayers.push(layer);
            }
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
        const roofsLayers = this.map.layers.filter(
            (l) => TiledLayerUtils.getLayerSuffix(l.name) === 'roofs'
        );
        for (const layerData of roofsLayers) {
            const layer = this.map.createLayer(layerData.name, tilesets);
            if (layer) {
                layer.setDepth(OVERHEAD_LAYER_DEPTH);
                this.roofsLayers.push(layer);
            }
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
        for (const layerInfo of npcsLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) layer = this.map.getObjectLayer(layerInfo.name);
            if (!layer) continue;
            this.npcSpriteController.loadNPCsFromLayer(layer, layerInfo.fullPath);
        }

        if (this.npcs.length > 0) {
            this.npcSpriteController.loadNPCSeries(this.npcs);
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
            if (!this.playerController) return;

            this.isPointerHeld = true;
            const { x: worldX, y: worldY } = { x: pointer.worldX, y: pointer.worldY };

            if (!this.player) return;
            const { x: clickTileX, y: clickTileY } = this.gridMapper.worldToGrid(worldX, worldY);
            const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(
                this.player.x, this.player.y
            );

            const focusedTarget = this.interactionCursor?.getCurrentTarget();
            if (focusedTarget && this.interactionCursor?.isTargeting(clickTileX, clickTileY)) {
                this.interactWithTarget(focusedTarget);
                this.isPointerHeld = false;
                return;
            }

            const tileDx = Math.abs(clickTileX - playerTileX);
            const tileDy = Math.abs(clickTileY - playerTileY);
            if (tileDx <= 1 && tileDy <= 1) {
                const clicked = this.interactables.find(
                    (i) => i.tileX === clickTileX && i.tileY === clickTileY
                );
                if (clicked) {
                    this.isPointerHeld = false;
                    return;
                }
            }

            this.playerController.setTargetPosition(worldX, worldY);
        };

        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.isPointerHeld || !this.playerController || !pointer.isDown) return;
            this.playerController.setTargetPosition(pointer.worldX, pointer.worldY);
        };

        this.pointerUpHandler = () => { this.isPointerHeld = false; };

        this.input.on('pointerdown', this.pointerDownHandler);
        this.input.on('pointermove', this.pointerMoveHandler);
        this.input.on('pointerup', this.pointerUpHandler);
    }

    private onInteractKey(): void {
        const target = this.interactionCursor?.getCurrentTarget();
        if (target) {
            this.interactWithTarget(target);
        }
    }

    private interactWithTarget(target: Interactable): void {
        switch (target.type) {
            case 'npc':
                if (target.data?.npc) {
                    this.startConversationWithNPC(target.data.npc);
                }
                break;
            case 'collectible':
                if (target.data?.collectibleId) {
                    this.collectibleManager?.collectJewel(target.data.collectibleId);
                }
                break;
            default:
                break;
        }
    }

    // ── Conversation handling (mirrors OverworldScene) ────────────────────────

    private async startConversationWithNPC(npc: NPC): Promise<void> {
        if (!npc.hasConversation()) return;

        try {
            let useSolvedConversation = false;
            const state = this.npcSpriteController?.npcSeriesStates.get(npc.id);
            useSolvedConversation = state?.isSeriesCompleted() ?? false;

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

            this.playerController?.stopAndIdle();
            this.playerController?.setEnabled(false);

            const conversationScene = this.scene.get('ConversationScene') as
                (ConversationScene & { startConversation: Function; events: Phaser.Events.EventEmitter }) | null;
            if (!conversationScene) {
                console.error('[InteriorScene] ConversationScene not found');
                this.playerController?.setEnabled(true);
                return;
            }

            conversationScene.setGlyphTracker(this.gameState.glyphTracker);

            conversationScene.events.once('conversationEnded', () => {
                this.onConversationEnded();
            });

            conversationScene.events.on('conversationEffects', (effects: any[]) => {
                this.handleConversationEffects(effects, npc);
            });

            if (!this.scene.isActive('ConversationScene')) {
                conversationScene.events.once('create', () => {
                    conversationScene.startConversation(conversationSpec, npc, startNodeId);
                });
                this.scene.launch('ConversationScene');
            } else {
                conversationScene.startConversation(conversationSpec, npc, startNodeId);
            }

        } catch (error) {
            console.error('[InteriorScene] Error starting conversation:', error);
            this.playerController?.setEnabled(true);
        }
    }

    private onConversationEnded(): void {
        this.playerController?.setEnabled(true);
        const conversationScene = this.scene.get('ConversationScene');
        if (conversationScene) {
            conversationScene.events.off('conversationEffects');
        }
        this.scene.stop('ConversationScene');
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
                    // Doors inside interiors are not yet managed — ignore for now
                    console.log(`[InteriorScene] Door unlock "${effect.doorId}" not yet handled in interiors`);
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

        const entries = series.getAllPuzzleEntries();
        let firstUnsolvedId: string | null = null;
        for (const entry of entries) {
            if (entry.unlocked && !entry.completed) {
                firstUnsolvedId = entry.id;
                break;
            }
        }
        if (!firstUnsolvedId) {
            const firstUnlocked = entries.find((e: any) => e.unlocked);
            firstUnsolvedId = firstUnlocked?.id ?? null;
        }

        if (!firstUnsolvedId) {
            console.warn(`[InteriorScene] No unlocked puzzles found in series ${seriesId}`);
            return;
        }

        this.currentSeries = series;
        const puzzleData = this.currentSeriesPuzzleData.get(firstUnsolvedId);
        if (!puzzleData) {
            console.error(`[InteriorScene] No puzzle data for ${firstUnsolvedId}`);
            return;
        }

        // Hide jewel HUD while solving, listen for completion
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | undefined;
        (hud as any)?.setJewelHUDVisible?.(false);

        // Listen for series completion (BridgePuzzleScene emits to 'InteriorScene')
        this.events.once('seriesPuzzleCompleted', (data: { puzzleId: string; success: boolean }) => {
            this.handleSeriesPuzzleCompleted(data);
        });

        this.scene.launch('BridgePuzzleScene', {
            puzzleData,
            seriesMode: true,
            callerSceneKey: 'InteriorScene',
        });
    }

    private handleSeriesPuzzleCompleted(data: { puzzleId: string; success: boolean }): void {
        const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | undefined;
        (hud as any)?.setJewelHUDVisible?.(true);

        if (!this.currentSeries || !data.success) return;

        const allEntries = this.currentSeries.getAllPuzzleEntries();
        const matching = allEntries.find((entry: any) => {
            const pd = this.currentSeriesPuzzleData.get(entry.id);
            return pd && pd.id === data.puzzleId;
        });
        if (!matching) return;

        const result = this.currentSeries.completePuzzle(matching.id);
        if (result.success) {
            console.log(`[InteriorScene] Series puzzle "${matching.id}" completed`);
        }
    }
}
