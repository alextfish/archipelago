import Phaser from 'phaser';
import { OverworldPuzzleController, type PuzzleExitResult } from '@controller/OverworldPuzzleController';
import { emitTestEvent } from '@helpers/TestEvents';
import { CollisionInitialiser, type CollisionInitData } from '@model/overworld/CollisionInitialiser';
import type { ConversationSpec } from '@model/conversation/ConversationData';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import { ConversationVariableSubstitutor } from '@model/conversation/ConversationVariableSubstitutor';
import { NPC } from '@model/conversation/NPC';
import type { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import type { CollisionManager } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import type { SeriesManager } from '@model/series/SeriesFactory';
import type { CameraManager } from '@view/CameraManager';
import type { CollectibleManager } from '@view/CollectibleManager';
import type { ConstraintNPCManager } from '@view/ConstraintNPCManager';
import type { DoorManager } from '@view/DoorManager';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';
import type { NPCSpriteController } from '@view/NPCSpriteController';
import type { PlayerController } from '@view/PlayerController';
import { findInteractableInRangeAtTile, isWithinInteractionRange } from '@view/PointerInteractionHelpers';
import { TileAnimationManager } from '@view/TileAnimationManager';
import { getConstraintPuzzleID } from '@view/ConstraintNPCUtils';
import { createHiddenLayersBySuffix, createOverheadLayersBySuffix, createVisualLayers, loadMapTilesets } from '@view/MapSceneLayerUtils';
import {
    getConstraintDisguiseImageLoadRequests,
} from '@view/MapSceneAssetUtils';
import { areMapSceneTilesetsReady, queueMapSceneImageRequests } from '@view/MapSceneLoadUtils';
import {
    buildPuzzleEntryInteractables,
    createBridgesLayer,
    hidePuzzleConstraintNPCsAfterEntry,
    isPuzzleEntryTile,
    showPuzzleConstraintNPCsBeforeExit,
} from '@view/MapPuzzleSceneHelpers';
import type { ConversationScene } from '@view/scenes/ConversationScene';
import type { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import { CollectibleManager as WorldCollectibleManager } from '@view/CollectibleManager';
import { ConstraintNPCManager as WorldConstraintNPCManager } from '@view/ConstraintNPCManager';
import { DoorManager as WorldDoorManager } from '@view/DoorManager';
import { NPCSpriteController as WorldNPCSpriteController } from '@view/NPCSpriteController';

interface CollisionBootstrapResult {
    createdLayerNames: string[];
    failedLayerNames: string[];
    collisionInitData: CollisionInitData | null;
}

type MovementKeys = {
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    wasdKeys: {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
    };
};

export abstract class ExplorationMapScene extends Phaser.Scene {
    protected map!: Phaser.Tilemaps.Tilemap;
    protected collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];
    protected roofsLayers: Phaser.Tilemaps.TilemapLayer[] = [];
    protected tiledMapData?: any;
    protected gridMapper!: GridToWorldMapper;
    protected tileAnimationManager?: TileAnimationManager;
    protected gameState!: OverworldGameState;
    protected seriesManager?: SeriesManager;
    protected playerController?: PlayerController;
    protected interactionCursor?: InteractionCursor;
    protected npcSpriteController?: NPCSpriteController;
    protected collectibleManager?: CollectibleManager;
    protected constraintNPCManager?: ConstraintNPCManager;
    protected doorManager?: DoorManager;
    protected npcs: NPC[] = [];
    protected interactables: Interactable[] = [];
    protected currentSeries: any = null;
    protected currentSeriesPuzzleData: Map<string, any> = new Map();
    protected gameMode: 'exploration' | 'conversation' | 'puzzle' = 'exploration';
    protected isExitingPuzzle: boolean = false;
    protected isPointerHeld: boolean = false;
    protected pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
    protected pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    protected pointerUpHandler?: () => void;
    protected readonly stepHotspots: Map<string, () => void> = new Map();
    protected lastCheckedTile: string = '';

    public abstract create(): void;

    protected abstract getMapCacheKey(): string;
    protected abstract persistMeaningfulProgress(): void;
    protected abstract setJewelHUDVisible(visible: boolean): void;
    protected abstract getSeriesPuzzleCallerSceneKey(): string;
    protected abstract getEmbeddedPuzzleController(): OverworldPuzzleController | undefined;
    protected abstract getExplorationPlayerSprite(): Phaser.GameObjects.Sprite | null;
    protected abstract getExplorationPlayerWorldPosition(): { x: number; y: number } | null;
    protected abstract getPuzzleIdAtWorldPosition(worldX: number, worldY: number): string | null;
    protected abstract getExplorationPuzzleManager(): OverworldPuzzleManager;
    protected abstract getExplorationCollisionManager(): CollisionManager;
    protected abstract getExplorationCameraManager(): CameraManager;
    protected abstract getCollectibleHUDScene(): OverworldHUDScene | undefined;

    protected getSkippedVisualLayerNames(): string[] {
        return [];
    }

    protected getOverheadLayerDepth(): number {
        return 100_000;
    }

    protected onMapCachePending(): void {}

    protected onTilesetTexturesPending(): void {}

    protected onNoTilesetDataInCache(): void {}

    protected onTilesetLoaded(_tilesetName: string, _textureKey: string): void {}

    protected onTilesetLoadFailed(_tilesetName: string, _textureKey: string): void {}

    protected onNoTilesetsLoaded(): void {}

    protected onVisualLayerCreated(_layerName: string): void {}

    protected onVisualLayerCreateFailed(_layerName: string): void {}

    protected onRoofLayerCreated(_layerName: string, _layer: Phaser.Tilemaps.TilemapLayer): void {}

    protected onRoofLayerCreateFailed(_layerName: string): void {}

    protected onEmbeddedPuzzleEnteredMode(): void {
        this.cameras.main.stopFollow();
    }

    protected onEmbeddedPuzzleExitedMode(): void {}

    protected canPlayerMoveAroundAndInteract(): boolean {
        return this.gameMode === 'exploration' && (this.playerController?.isEnabled() ?? false);
    }

    protected setExplorationPlayerLayerDisplay(_playerLayer: ReturnType<PlayerController['getPlayerLayer']>): void {}

    protected onExplorationFrameWhileActive(): void {}

    protected shouldIgnoreExplorationPointerDown(_pointer: Phaser.Input.Pointer): boolean {
        return false;
    }

    protected onLeverInteraction(_target: Interactable): void {
        console.log(`[${this.sys.settings.key}] Lever interaction not yet implemented`);
    }

    protected getEmbeddedPuzzleFlowTileChangedCallback(_puzzleId: string):
        ((lx: number, ly: number, hasWater: boolean) => void) | undefined {
        return undefined;
    }

    protected getEmbeddedPuzzleBeforeExitTransitionCallback(_activePuzzleId: string | undefined):
        (() => void) | undefined {
        return undefined;
    }

    protected async onEmbeddedPuzzleExited(_exitResult: PuzzleExitResult, _success: boolean): Promise<void> {}

    protected resetExplorationMapState(): void {
        this.collisionLayers = [];
        this.roofsLayers = [];
        this.tiledMapData = undefined;
        this.tileAnimationManager = undefined;
    }

    protected waitForMapSceneAssets(): boolean {
        const mapCacheKey = this.getMapCacheKey();

        if (!this.cache.tilemap.exists(mapCacheKey)) {
            this.onMapCachePending();
            this.time.delayedCall(100, () => this.create(), [], this);
            return false;
        }

        if (!areMapSceneTilesetsReady(this.tiledMapData, (textureKey) => this.textures.exists(textureKey))) {
            this.onTilesetTexturesPending();
            this.time.delayedCall(100, () => this.create(), [], this);
            return false;
        }

        return true;
    }

    protected queueConstraintDisguiseSprites(): void {
        const requests = getConstraintDisguiseImageLoadRequests(
            this.tiledMapData,
            (textureKey) => this.textures.exists(textureKey),
        );

        queueMapSceneImageRequests(
            requests,
            (textureKey, imagePath) => this.load.image(textureKey, imagePath),
            () => this.load.isLoading(),
            () => this.load.start(),
        );
    }

    protected bootstrapExplorationMap(options: { requireTilesets?: boolean } = {}): Phaser.Tilemaps.Tileset[] | null {
        const mapCacheKey = this.getMapCacheKey();
        this.map = this.make.tilemap({ key: mapCacheKey });
        this.gridMapper = new GridToWorldMapper(this.tiledMapData?.tilewidth ?? 32);

        const tilesets = this.loadAllTilesets();
        if ((options.requireTilesets ?? false) && tilesets.length === 0) {
            this.onNoTilesetsLoaded();
            return null;
        }

        this.setupVisualLayers(tilesets);
        this.setupRoofsLayer(tilesets);
        this.tileAnimationManager = new TileAnimationManager(this.map, tilesets);
        return tilesets;
    }

    protected updateExplorationMap(_time: number, delta: number): void {
        this.tileAnimationManager?.update(delta);
    }

    protected updateExplorationScene(_time: number, delta: number): void {
        this.updateExplorationMap(_time, delta);
        this.npcSpriteController?.update(delta, this.canPlayerMoveAroundAndInteract());

        const player = this.getExplorationPlayerSprite();
        player?.setDepth(player.y);

        if (!this.canPlayerMoveAroundAndInteract() || !this.playerController) {
            return;
        }

        this.playerController.update();
        this.setExplorationPlayerLayerDisplay(this.playerController.getPlayerLayer());
        this.checkStepHotspots();
        this.updateExplorationInteractionCursor();
        this.onExplorationFrameWhileActive();
    }

    protected initialiseExplorationInteractablesAndCursor(): void {
        if (!this.map || !this.tiledMapData) {
            return;
        }

        this.initialiseSharedExplorationManagers();

        this.interactionCursor = new InteractionCursor(
            this,
            this.tiledMapData.tilewidth,
            this.tiledMapData.tileheight,
        );

        this.interactables = [
            ...buildPuzzleEntryInteractables(
                this.getExplorationPuzzleManager(),
                this.tiledMapData,
                this.gridMapper,
                this.map,
            ),
        ];

        this.loadNPCsFromTiledLayers();
        if (this.npcs.length > 0) {
            void this.npcSpriteController?.loadNPCSeries(this.npcs);
        }

        this.constraintNPCManager?.loadConstraintNPCs();
        this.doorManager?.loadDoors();
        this.collectibleManager?.loadCollectibles();
    }

    protected async startConversationWithNPC(npc: NPC): Promise<void> {
        if (!npc.hasConversation()) {
            return;
        }

        try {
            this.gameMode = 'conversation';
            this.interactionCursor?.hide();

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
            if (!response.ok) {
                throw new Error(`Failed to load conversation: ${response.statusText}`);
            }

            const conversationSpec: ConversationSpec = await response.json();
            const startNodeId = ConversationConditionEvaluator.resolveStartNode(
                conversationSpec,
                { getJewelCount: (colour) => this.gameState.getJewelCount(colour) },
            );

            if (npc.conversationVariables) {
                ConversationVariableSubstitutor.applyTo(conversationSpec, npc.conversationVariables);
            }

            const conversationNPC = this.constraintNPCManager?.getConversationNPC(npc, useSolvedConversation) ?? npc;
            const conversationScene = this.scene.get('ConversationScene') as
                (ConversationScene & { startConversation: Function; events: Phaser.Events.EventEmitter }) | null;
            if (!conversationScene) {
                throw new Error('ConversationScene not found');
            }

            conversationScene.setGlyphTracker(this.gameState.glyphTracker);
            conversationScene.events.once('conversationEnded', () => {
                this.onConversationEnded();
            });
            conversationScene.events.on('conversationEffects', (effects: any[]) => {
                void this.handleConversationEffects(effects, npc);
            });

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
            console.error(`[${this.sys.settings.key}] Error starting conversation:`, error);
            this.playerController?.setEnabled(true);
            this.gameMode = 'exploration';
        }
    }

    protected onConversationEnded(): void {
        this.playerController?.setEnabled(true);
        this.gameMode = 'exploration';

        const conversationScene = this.scene.get('ConversationScene');
        if (conversationScene) {
            conversationScene.events.off('conversationEffects');
        }

        this.scene.stop('ConversationScene');
    }

    protected async handleConversationEffects(effects: any[], npc?: NPC): Promise<void> {
        for (const effect of effects) {
            switch (effect.type) {
                case 'giveItem':
                    console.log(`TODO: Give item ${effect.itemId} to player`);
                    break;
                case 'setFlag':
                    console.log(`TODO: Set flag ${effect.flagId} = ${effect.flagValue}`);
                    break;
                case 'startSeries':
                    if (effect.seriesId) {
                        await this.startPuzzleSeries(effect.seriesId, npc);
                    }
                    break;
                case 'unlockDoor':
                    if (effect.doorId) {
                        this.doorManager?.unlockDoor(effect.doorId);
                    }
                    break;
                case 'setExpression':
                    console.log(`TODO: Set expression ${effect.expressionId ?? ''}`);
                    break;
                default:
                    console.log(`[${this.sys.settings.key}] Unhandled conversation effect: ${effect.type}`);
                    break;
            }
        }
    }

    protected async startPuzzleSeries(seriesId: string, npc?: NPC): Promise<void> {
        let series = null;

        if (npc) {
            const state = this.npcSpriteController?.npcSeriesStates.get(npc.id);
            series = state?.getSeries();

            if (series && series.id !== seriesId) {
                console.warn(`NPC ${npc.id} series mismatch: expected ${seriesId}, got ${series.id}`);
                series = null;
            }
        }

        if (!series) {
            try {
                const seriesPath = `data/series/${seriesId}.json`;
                const response = await fetch(seriesPath);
                if (!response.ok) {
                    throw new Error(`Failed to load series: ${response.statusText}`);
                }

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
                console.error(`[${this.sys.settings.key}] Error loading series ${seriesId}:`, error);
                return;
            }
        }

        const firstUnsolvedId = this.getSeriesEntryIdToLaunch(series, true);
        if (!firstUnsolvedId) {
            console.warn(`[${this.sys.settings.key}] No unlocked puzzles found in series ${seriesId}`);
            return;
        }

        this.currentSeries = series;
        this.launchSeriesPuzzleEntry(firstUnsolvedId);
    }

    protected async handleSeriesPuzzleCompleted(data: { puzzleId: string; success: boolean }): Promise<void> {
        if (!this.currentSeries) {
            this.setJewelHUDVisible(true);
            return;
        }

        if (!data.success) {
            this.setJewelHUDVisible(true);
            return;
        }

        const allEntries = this.currentSeries.getAllPuzzleEntries();
        const matchingEntry = allEntries.find((entry: any) => {
            const puzzleData = this.currentSeriesPuzzleData.get(entry.id);
            return puzzleData && puzzleData.id === data.puzzleId;
        });

        if (!matchingEntry) {
            console.warn(`[${this.sys.settings.key}] Could not find series entry for puzzle ${data.puzzleId}`);
            this.setJewelHUDVisible(true);
            return;
        }

        const result = this.currentSeries.completePuzzle(matchingEntry.id);
        if (result.success && this.seriesManager) {
            await this.seriesManager.saveSeriesProgress(this.currentSeries);
        }

        if (this.currentSeries.isSeriesCompleted()) {
            const seriesDoor = this.doorManager?.doors.find((door) => door.id === this.currentSeries!.id);
            if (seriesDoor && seriesDoor.isLocked()) {
                await this.doorManager?.animateDoorChange(seriesDoor, true);
            } else if (!seriesDoor) {
                this.doorManager?.unlockDoor(this.currentSeries.id);
            }

            for (const [npcId, state] of (this.npcSpriteController?.npcSeriesStates.entries() ?? [])) {
                if (state.getSeries()?.id === this.currentSeries.id) {
                    const npc = this.npcs.find((candidate) => candidate.id === npcId);
                    if (npc) {
                        this.npcSpriteController?.updateNPCIcon(npc);
                    }
                }
            }
        } else {
            const nextPuzzleId = this.getSeriesEntryIdToLaunch(this.currentSeries, false);
            if (!nextPuzzleId) {
                this.setJewelHUDVisible(true);
                this.persistMeaningfulProgress();
                return;
            }

            this.time.delayedCall(0, () => {
                this.launchSeriesPuzzleEntry(nextPuzzleId);
            });
            this.persistMeaningfulProgress();
            return;
        }

        this.setJewelHUDVisible(true);
        this.persistMeaningfulProgress();
    }

    protected getSeriesEntryIdToLaunch(series: any, allowCompletedFallback: boolean): string | null {
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

    protected launchSeriesPuzzleEntry(entryId: string): void {
        const puzzleData = this.currentSeriesPuzzleData.get(entryId);
        if (!puzzleData) {
            console.error(`[${this.sys.settings.key}] No puzzle data for ${entryId}`);
            this.setJewelHUDVisible(true);
            return;
        }

        this.setJewelHUDVisible(false);
        this.events.once('seriesPuzzleCompleted', (data: { puzzleId: string; success: boolean }) => {
            void this.handleSeriesPuzzleCompleted(data);
        });

        this.scene.launch('BridgePuzzleScene', {
            puzzleData,
            seriesMode: true,
            callerSceneKey: this.getSeriesPuzzleCallerSceneKey(),
        });
    }

    protected setupExplorationInteractionInput(): void {
        this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.playerController || !this.canPlayerMoveAroundAndInteract()) {
                return;
            }

            if (this.shouldIgnoreExplorationPointerDown(pointer)) {
                return;
            }

            const player = this.getExplorationPlayerSprite();
            if (!player || !this.interactionCursor) {
                return;
            }

            this.isPointerHeld = true;

            const worldX = pointer.worldX;
            const worldY = pointer.worldY;
            const { x: clickTileX, y: clickTileY } = this.gridMapper.worldToGrid(worldX, worldY);
            const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(player.x, player.y);

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
            if (!this.canPlayerMoveAroundAndInteract()) {
                return;
            }

            const player = this.getExplorationPlayerSprite();
            if (!player || !this.playerController || !this.interactionCursor) {
                return;
            }

            const { x: hoverTileX, y: hoverTileY } = this.gridMapper.worldToGrid(pointer.worldX, pointer.worldY);
            const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(player.x, player.y);
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

            if (!this.isPointerHeld || !pointer.isDown) {
                return;
            }

            this.playerController.setTargetPosition(pointer.worldX, pointer.worldY);
        };

        this.pointerUpHandler = () => {
            this.isPointerHeld = false;
        };

        this.input.on('pointerdown', this.pointerDownHandler);
        this.input.on('pointermove', this.pointerMoveHandler);
        this.input.on('pointerup', this.pointerUpHandler);
        this.input.keyboard?.on('keydown-E', this.onExplorationInteractKey, this);
    }

    protected restoreExplorationPointerHandlers(): void {
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
    }

    protected registerStepHotspot(tileX: number, tileY: number, callback: () => void): void {
        this.stepHotspots.set(`${tileX},${tileY}`, callback);
    }

    protected checkStepHotspots(): void {
        const player = this.getExplorationPlayerSprite();
        if (!player || !this.tiledMapData) {
            return;
        }

        const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(player.x, player.y);
        const tileKey = `${tileX},${tileY}`;
        if (tileKey !== this.lastCheckedTile) {
            this.lastCheckedTile = tileKey;
            const callback = this.stepHotspots.get(tileKey);
            if (callback) {
                callback();
            }
        }
    }

    protected onExplorationInteractKey(): void {
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

    protected interactWithTarget(target: Interactable): void {
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
            case 'lever':
                this.onLeverInteraction(target);
                break;
            case 'collectible':
                if (target.data?.collectibleId) {
                    this.collectibleManager?.collectJewel(target.data.collectibleId);
                    this.persistMeaningfulProgress();
                }
                break;
            default:
                break;
        }
    }

    protected checkForPuzzleEntry(): void {
        const playerPosition = this.getExplorationPlayerWorldPosition();
        if (!playerPosition || !this.tiledMapData) {
            return;
        }

        const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(playerPosition.x, playerPosition.y);
        if (!isPuzzleEntryTile(this.map, tileX, tileY)) {
            return;
        }

        const puzzleId = this.getPuzzleIdAtWorldPosition(playerPosition.x, playerPosition.y);
        if (puzzleId) {
            void this.enterOverworldPuzzle(puzzleId);
        }
    }

    public async enterOverworldPuzzle(puzzleId: string): Promise<void> {
        const puzzleController = this.getEmbeddedPuzzleController();
        if (!puzzleController) {
            console.error(`[${this.sys.settings.key}] Puzzle controller not initialized`);
            return;
        }

        try {
            this.gameMode = 'puzzle';
            this.interactionCursor?.hide();
            this.setJewelHUDVisible(false);

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

            await puzzleController.enterPuzzle(
                puzzleId,
                (mode: 'puzzle') => {
                    this.gameMode = mode;
                    this.onEmbeddedPuzzleEnteredMode();
                },
                this.getEmbeddedPuzzleFlowTileChangedCallback(puzzleId),
            );

            hidePuzzleConstraintNPCsAfterEntry(puzzleId, this.constraintNPCManager);
            emitTestEvent('puzzle_entered', { puzzleId });
        } catch (error) {
            console.error(`[${this.sys.settings.key}] Failed to enter embedded puzzle ${puzzleId}:`, error);
            await this.exitOverworldPuzzle(false);
        }
    }

    public async exitOverworldPuzzle(success: boolean): Promise<void> {
        const puzzleController = this.getEmbeddedPuzzleController();
        if (!puzzleController || this.isExitingPuzzle) {
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

            const activePuzzleId = showPuzzleConstraintNPCsBeforeExit(
                puzzleController,
                this.constraintNPCManager,
            );
            const exitResult = await puzzleController.exitPuzzle(
                success,
                (mode: 'exploration') => {
                    this.gameMode = mode;
                    this.onEmbeddedPuzzleExitedMode();
                },
                this.getEmbeddedPuzzleBeforeExitTransitionCallback(activePuzzleId),
            );

            this.constraintNPCManager?.showConstraintNPCsForPuzzle(exitResult.puzzleId);

            await this.doorManager?.animatePuzzleLinkedDoors(
                exitResult.puzzleId,
                exitResult.wasSolved,
                exitResult.wasUnsolved,
            );

            if (exitResult.wasSolved || exitResult.wasUnsolved) {
                this.persistMeaningfulProgress();
            }

            await this.handleCurrentSeriesAfterEmbeddedPuzzleExit(success);
            await this.onEmbeddedPuzzleExited(exitResult, success);

            this.setJewelHUDVisible(true);
            this.isPointerHeld = false;
            this.playerController?.setEnabled(this.gameMode === 'exploration');
            this.restoreExplorationPointerHandlers();
        } catch (error) {
            console.error(`[${this.sys.settings.key}] Error exiting embedded puzzle:`, error);
        } finally {
            this.isExitingPuzzle = false;
        }
    }

    public isInPuzzleMode(): boolean {
        return this.getEmbeddedPuzzleController()?.isInPuzzleMode() ?? false;
    }

    protected handleHUDExit(): void {
        this.currentSeries = null;
        void this.exitOverworldPuzzle(false);
    }

    protected handleHUDUndo(): void {
        this.getEmbeddedPuzzleController()?.handleUndo();
    }

    protected handleHUDRedo(): void {
        this.getEmbeddedPuzzleController()?.handleRedo();
    }

    protected handleTypeSelected(typeId: string): void {
        this.getEmbeddedPuzzleController()?.handleTypeSelected(typeId);
    }

    protected handleEscapeKey(): void {
        if (this.isInPuzzleMode()) {
            this.currentSeries = null;
            void this.exitOverworldPuzzle(false);
        }
    }

    protected async handleNavigateNext(): Promise<void> {
        if (!this.currentSeries) {
            return;
        }

        const result = this.currentSeries.navigateToNext();
        if (result.success && result.puzzleId) {
            await this.exitOverworldPuzzle(false);
            await this.enterOverworldPuzzle(result.puzzleId);
        }
    }

    protected async handleNavigatePrevious(): Promise<void> {
        if (!this.currentSeries) {
            return;
        }

        const result = this.currentSeries.navigateToPrevious();
        if (result.success && result.puzzleId) {
            await this.exitOverworldPuzzle(false);
            await this.enterOverworldPuzzle(result.puzzleId);
        }
    }

    protected handleBridgeClicked(bridgeId: string): void {
        this.getEmbeddedPuzzleController()?.handleBridgeClicked(bridgeId);
    }

    protected createMovementKeys(): MovementKeys {
        const keyboard = this.input.keyboard;
        if (!keyboard) {
            throw new Error(`[${this.sys.settings.key}] Keyboard input is unavailable`);
        }

        return {
            cursors: keyboard.createCursorKeys(),
            wasdKeys: keyboard.addKeys({
                up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
            }) as MovementKeys['wasdKeys'],
        };
    }

    protected initialiseSharedExplorationManagers(): void {
        if (!this.map || !this.tiledMapData) {
            return;
        }

        if (!this.npcSpriteController) {
            this.npcSpriteController = new WorldNPCSpriteController(
                this,
                this.map,
                this.gridMapper,
                this.seriesManager,
                this.tiledMapData,
                (npc) => this.npcs.push(npc),
                (interactable) => this.interactables.push(interactable),
                (id, data) => this.currentSeriesPuzzleData.set(id, data),
            );
            this.npcSpriteController.registerAnimations();
        }

        if (!this.collectibleManager) {
            this.collectibleManager = new WorldCollectibleManager(
                this,
                this.tiledMapData,
                this.map,
                this.gameState,
                () => this.getCollectibleHUDScene(),
                (interactable) => this.interactables.push(interactable),
                (predicate) => {
                    this.interactables = this.interactables.filter((interactable) => !predicate(interactable));
                },
            );
            this.collectibleManager.initialise();
        }

        if (!this.doorManager) {
            this.doorManager = new WorldDoorManager(
                this,
                this.tiledMapData,
                this.map,
                this.getExplorationCollisionManager(),
                this.gameState,
                this.getExplorationCameraManager(),
                () => this.getExplorationPlayerSprite(),
                () => this.playerController,
            );
        }

        if (!this.constraintNPCManager && this.npcSpriteController) {
            this.constraintNPCManager = new WorldConstraintNPCManager(
                this,
                this.getExplorationPuzzleManager(),
                this.gridMapper,
                this.gameState,
                this.npcSpriteController.npcAppearanceRegistry,
                this.tiledMapData,
                (npc) => this.npcs.push(npc),
                (npcId) => this.npcs.some((npc) => npc.id === npcId),
                (interactable) => this.interactables.push(interactable),
            );
        }
    }

    protected loadNPCsFromTiledLayers(): void {
        if (!this.npcSpriteController || !this.map || !this.tiledMapData) {
            return;
        }

        const npcLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'npcs');
        this.loadNPCLayers(npcLayers);
    }

    protected loadNPCLayers(npcLayers: ReturnType<typeof TiledLayerUtils.findObjectLayersByName>): void {
        if (!this.npcSpriteController || !this.map) {
            return;
        }

        for (const layerInfo of npcLayers) {
            let layer = this.map.getObjectLayer(layerInfo.fullPath);
            if (!layer) {
                layer = this.map.getObjectLayer(layerInfo.name);
            }
            if (!layer) {
                continue;
            }

            this.npcSpriteController.loadNPCsFromLayerWithOffset(
                layer,
                layerInfo.fullPath,
                layerInfo.offsetX,
                layerInfo.offsetY,
            );
        }
    }

    private async handleCurrentSeriesAfterEmbeddedPuzzleExit(success: boolean): Promise<void> {
        if (!success || !this.currentSeries || !this.currentSeries.isSeriesCompleted()) {
            return;
        }

        const seriesDoor = this.doorManager?.doors.find((door) => door.id === this.currentSeries!.id);
        if (seriesDoor && seriesDoor.isLocked()) {
            await this.doorManager?.animateDoorChange(seriesDoor, true);
        } else if (!seriesDoor) {
            this.doorManager?.unlockDoor(this.currentSeries.id);
        }

        for (const [npcId, state] of (this.npcSpriteController?.npcSeriesStates.entries() ?? [])) {
            if (state.getSeries()?.id === this.currentSeries.id) {
                const npc = this.npcs.find((candidate) => candidate.id === npcId);
                if (npc) {
                    this.npcSpriteController?.updateNPCIcon(npc);
                }
            }
        }
    }

    private updateExplorationInteractionCursor(): void {
        const player = this.getExplorationPlayerSprite();
        if (!this.interactionCursor || !this.tiledMapData || !player || !this.playerController) {
            return;
        }

        const position = this.playerController.getPosition();
        const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(position.x, position.y);
        this.interactionCursor.setFacing(this.playerController.getFacingDirection());
        this.interactionCursor.update(tileX, tileY, this.interactables);
    }

    protected setupCollisionBootstrap(tilesets: Phaser.Tilemaps.Tileset[]): CollisionBootstrapResult {
        const collisionLayers = createHiddenLayersBySuffix(
            this.map.layers,
            (layerName, collisionTilesets) => this.map.createLayer(layerName, collisionTilesets),
            tilesets,
            'collision',
        );
        this.collisionLayers = collisionLayers.createdLayers;

        if (this.collisionLayers.length === 0) {
            return {
                createdLayerNames: collisionLayers.createdLayerNames,
                failedLayerNames: collisionLayers.failedLayerNames,
                collisionInitData: null,
            };
        }

        const collisionInitData = CollisionInitialiser.buildCollisionData(
            this.tiledMapData ?? {},
            this.map.width,
            this.map.height,
            (x, y) => this.collisionLayers.map((layer) => {
                const tile = layer.getTileAt(x, y);
                if (!tile || tile.index === -1) {
                    return null;
                }

                return { properties: tile.properties ?? undefined };
            }),
        );

        return {
            createdLayerNames: collisionLayers.createdLayerNames,
            failedLayerNames: collisionLayers.failedLayerNames,
            collisionInitData,
        };
    }

    protected createBridgesLayerForMap(
        tilesets: Phaser.Tilemaps.Tileset[],
        options: { requireDeclaredLayer?: boolean } = {},
    ): Phaser.Tilemaps.TilemapLayer | null {
        if (options.requireDeclaredLayer && !this.map.getLayer(OverworldBridgeManager.getBridgesLayerName())) {
            return null;
        }

        return createBridgesLayer(this.map, tilesets);
    }

    private loadAllTilesets(): Phaser.Tilemaps.Tileset[] {
        const mapData = this.cache.tilemap.get(this.getMapCacheKey());
        if (!mapData?.data?.tilesets) {
            this.onNoTilesetDataInCache();
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
                this.onTilesetLoaded(tilesetLoad.name, tilesetLoad.textureKey);
            } else {
                this.onTilesetLoadFailed(tilesetLoad.name, tilesetLoad.textureKey);
            }
        }

        return tilesets;
    }

    private setupVisualLayers(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const visualLayers = createVisualLayers(
            this.map.layers,
            (layerName, visualTilesets) => this.map.createLayer(layerName, visualTilesets),
            tilesets,
            {
                overheadLayerDepth: this.getOverheadLayerDepth(),
                skippedLayerNames: this.getSkippedVisualLayerNames(),
            },
        );

        for (const layerName of visualLayers.createdLayerNames) {
            this.onVisualLayerCreated(layerName);
        }

        for (const layerName of visualLayers.failedLayerNames) {
            this.onVisualLayerCreateFailed(layerName);
        }
    }

    private setupRoofsLayer(tilesets: Phaser.Tilemaps.Tileset[]): void {
        const roofLayers = createOverheadLayersBySuffix(
            this.map.layers,
            (layerName, roofTilesets) => this.map.createLayer(layerName, roofTilesets),
            tilesets,
            'roofs',
            this.getOverheadLayerDepth(),
        );
        this.roofsLayers = roofLayers.createdLayers;

        for (let i = 0; i < roofLayers.createdLayerNames.length; i += 1) {
            this.onRoofLayerCreated(roofLayers.createdLayerNames[i], roofLayers.createdLayers[i]);
        }

        for (const layerName of roofLayers.failedLayerNames) {
            this.onRoofLayerCreateFailed(layerName);
        }
    }
}
