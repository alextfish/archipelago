import Phaser from 'phaser';
import { CollisionInitialiser, type CollisionInitData } from '@model/overworld/CollisionInitialiser';
import type { ConversationSpec } from '@model/conversation/ConversationData';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import { ConversationVariableSubstitutor } from '@model/conversation/ConversationVariableSubstitutor';
import { NPC } from '@model/conversation/NPC';
import type { OverworldGameState } from '@model/overworld/OverworldGameState';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import type { SeriesManager } from '@model/series/SeriesFactory';
import type { ConstraintNPCManager } from '@view/ConstraintNPCManager';
import type { DoorManager } from '@view/DoorManager';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { InteractionCursor } from '@view/InteractionCursor';
import type { NPCSpriteController } from '@view/NPCSpriteController';
import type { PlayerController } from '@view/PlayerController';
import { TileAnimationManager } from '@view/TileAnimationManager';
import { getConstraintPuzzleID } from '@view/ConstraintNPCUtils';
import { createHiddenLayersBySuffix, createOverheadLayersBySuffix, createVisualLayers, loadMapTilesets } from '@view/MapSceneLayerUtils';
import { areMapSceneTilesetsReady } from '@view/MapSceneLoadUtils';
import { createBridgesLayer } from '@view/MapPuzzleSceneHelpers';
import type { ConversationScene } from '@view/scenes/ConversationScene';

interface CollisionBootstrapResult {
    createdLayerNames: string[];
    failedLayerNames: string[];
    collisionInitData: CollisionInitData | null;
}

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
    protected constraintNPCManager?: ConstraintNPCManager;
    protected doorManager?: DoorManager;
    protected npcs: NPC[] = [];
    protected currentSeries: any = null;
    protected currentSeriesPuzzleData: Map<string, any> = new Map();
    protected gameMode: 'exploration' | 'conversation' | 'puzzle' = 'exploration';

    public abstract create(): void;

    protected abstract getMapCacheKey(): string;
    protected abstract persistMeaningfulProgress(): void;
    protected abstract setSeriesHUDVisible(visible: boolean): void;
    protected abstract getSeriesPuzzleCallerSceneKey(): string;

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
            this.setSeriesHUDVisible(true);
            return;
        }

        if (!data.success) {
            this.setSeriesHUDVisible(true);
            return;
        }

        const allEntries = this.currentSeries.getAllPuzzleEntries();
        const matchingEntry = allEntries.find((entry: any) => {
            const puzzleData = this.currentSeriesPuzzleData.get(entry.id);
            return puzzleData && puzzleData.id === data.puzzleId;
        });

        if (!matchingEntry) {
            console.warn(`[${this.sys.settings.key}] Could not find series entry for puzzle ${data.puzzleId}`);
            this.setSeriesHUDVisible(true);
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
                this.setSeriesHUDVisible(true);
                this.persistMeaningfulProgress();
                return;
            }

            this.time.delayedCall(0, () => {
                this.launchSeriesPuzzleEntry(nextPuzzleId);
            });
            this.persistMeaningfulProgress();
            return;
        }

        this.setSeriesHUDVisible(true);
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
            this.setSeriesHUDVisible(true);
            return;
        }

        this.setSeriesHUDVisible(false);
        this.events.once('seriesPuzzleCompleted', (data: { puzzleId: string; success: boolean }) => {
            void this.handleSeriesPuzzleCompleted(data);
        });

        this.scene.launch('BridgePuzzleScene', {
            puzzleData,
            seriesMode: true,
            callerSceneKey: this.getSeriesPuzzleCallerSceneKey(),
        });
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
