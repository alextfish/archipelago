import Phaser from 'phaser';
import { NPC } from '@model/conversation/NPC';
import { NPCSeriesState } from '@model/conversation/NPCSeriesState';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import { LoopPath, getClosestCardinalDirection, type CardinalDirection, type PathPoint } from '@model/overworld/LoopPath';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import type { SeriesManager } from '@model/series/SeriesFactory';
import type { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { Interactable } from '@view/InteractionCursor';
import { NPCIconConfig } from '@view/NPCIconConfig';
import {
    getNPCDirectionalIdleFrame,
    getNPCDirectionalWalkAnimationKey,
    getNPCIdleAnimationKey,
    registerNPCAnimations,
} from '@view/NPCSpriteHelper';
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';

interface MovingNPC {
    npcId: string;
    appearanceId: string;
    sprite: Phaser.GameObjects.Sprite;
    interactable: Interactable;
    path: LoopPath;
    distance: number;
    speedPixelsPerSecond: number;
    direction: CardinalDirection;
}

/**
 * Manages regular (non-constraint) NPC sprites and their associated series
 * state in the overworld.
 *
 * Responsibilities:
 * - Loading NPC objects from Tiled `npcs` object layers
 * - Creating Phaser sprites and idle animations for each NPC
 * - Loading puzzle series for NPCs that have them
 * - Creating / updating NPC icon images (incomplete / complete badges)
 *
 * View layer — depends on a Phaser Scene for sprite creation.
 */
export class NPCSpriteController {
    private readonly scene: Phaser.Scene;
    private readonly gridMapper: GridToWorldMapper;
    private readonly seriesManager: SeriesManager | undefined;
    private readonly tiledMapData: any;
    private readonly addNPC: (npc: NPC) => void;
    private readonly addInteractable: (interactable: Interactable) => void;
    private readonly addSeriesPuzzleData: (id: string, data: any) => void;

    /** Phaser sprite for each NPC, keyed by NPC ID. */
    readonly npcSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
    /** Icon image (incomplete / complete badge) for each NPC, keyed by NPC ID. */
    private readonly npcIcons: Map<string, Phaser.GameObjects.Image> = new Map();
    /** Named path loops loaded from Tiled `paths` object layers. */
    private readonly paths: Map<string, LoopPath> = new Map();
    /** Active overworld NPCs currently moving along a Tiled path. */
    private readonly movingNPCs: MovingNPC[] = [];
    /** Series state for every NPC (null series for NPCs without a series). */
    readonly npcSeriesStates: Map<string, NPCSeriesState> = new Map();
    /** NPC appearance registry, populated from the registry JSON on creation. */
    readonly npcAppearanceRegistry: NPCAppearanceRegistry = new NPCAppearanceRegistry();

    constructor(
        scene: Phaser.Scene,
        _map: Phaser.Tilemaps.Tilemap,
        gridMapper: GridToWorldMapper,
        seriesManager: SeriesManager | undefined,
        tiledMapData: any,
        addNPC: (npc: NPC) => void,
        addInteractable: (interactable: Interactable) => void,
        addSeriesPuzzleData: (id: string, data: any) => void,
    ) {
        this.scene = scene;
        this.gridMapper = gridMapper;
        this.seriesManager = seriesManager;
        this.tiledMapData = tiledMapData;
        this.addNPC = addNPC;
        this.addInteractable = addInteractable;
        this.addSeriesPuzzleData = addSeriesPuzzleData;
        this.loadPaths();
    }

    /**
     * Register Phaser animations for all NPC appearances that declare an
     * `idleAnimation`.  Should be called once from `create()` after textures
     * have loaded.
     */
    registerAnimations(): void {
        registerNPCAnimations(this.scene, this.npcAppearanceRegistry);
    }

    /**
     * Load NPC objects from a single Phaser ObjectLayer and create sprites.
     */
    loadNPCsFromLayer(npcsLayer: Phaser.Tilemaps.ObjectLayer, layerName: string): void {
        if (!npcsLayer.objects) {
            console.warn(`No objects in layer: ${layerName}`);
            return;
        }

        for (const obj of npcsLayer.objects) {
            if (!obj.name || typeof obj.x !== 'number' || typeof obj.y !== 'number') {
                console.warn(`Invalid NPC object in ${layerName}:`, obj);
                continue;
            }

            const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(obj.x, obj.y);

            const properties = obj.properties as any[] | undefined;
            const conversationFile = properties?.find((p: any) => p.name === 'conversation')?.value;
            const conversationFileSolved = properties?.find((p: any) => p.name === 'conversationSolved')?.value;
            const seriesFile = properties?.find((p: any) => p.name === 'series')?.value;
            const language = properties?.find((p: any) => p.name === 'language')?.value || 'grass';
            const appearanceId = properties?.find((p: any) => p.name === 'appearance')?.value || 'sailorNS';
            const animate = properties?.find((p: any) => p.name === 'animate')?.value === true;
            const pathName = properties?.find((p: any) => p.name === 'path')?.value;
            const speed = Number(properties?.find((p: any) => p.name === 'speed')?.value ?? 0);

            const npc = new NPC(
                String(obj.id),
                obj.name,
                tileX,
                tileY,
                language,
                appearanceId,
                conversationFile,
                conversationFileSolved,
                seriesFile,
                undefined,
                animate
            );

            this.addNPC(npc);

            const interactable: Interactable = {
                type: 'npc',
                tileX,
                tileY,
                data: { npc }
            };
            this.addInteractable(interactable);

            const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(tileX, tileY + 1);
            const spriteKey = this.npcAppearanceRegistry.getAppearance(appearanceId).spriteKey;
            const sprite = this.scene.add.sprite(worldX, worldY, spriteKey);
            sprite.setOrigin(0, 1);
            sprite.setDepth(worldY);
            this.npcSprites.set(npc.id, sprite);

            if (isTestMode()) {
                attachTestMarker(this.scene, sprite, {
                    id: `npc-${npc.id}`,
                    testId: `npc-${npc.id}`,
                    width: this.tiledMapData.tilewidth,
                    height: this.tiledMapData.tileheight,
                    showBorder: true
                });
                console.log(`[TEST] Added test marker for NPC: ${npc.id} at tile (${tileX}, ${tileY}), world (${worldX}, ${worldY})`);
            }

            const movingNPC = typeof pathName === 'string' && pathName.length > 0
                ? this.createMovingNPC(npc.id, appearanceId, sprite, interactable, pathName, speed, { x: obj.x, y: obj.y })
                : null;

            if (movingNPC) {
                this.applyMovingNPCState(movingNPC);
                this.movingNPCs.push(movingNPC);
            } else if (npc.animate) {
                const animKey = getNPCIdleAnimationKey(appearanceId, this.npcAppearanceRegistry);
                if (animKey) sprite.play(animKey);
            }

            console.log(`Loaded NPC: ${npc.name} at (${tileX}, ${tileY}), language: ${language}, conversation: ${conversationFile || 'none'}, series: ${seriesFile || 'none'}`);
        }
    }

    /**
     * Load puzzle series for NPCs that have them and create initial icons.
     */
    async loadNPCSeries(npcs: NPC[]): Promise<void> {
        for (const npc of npcs) {
            if (!npc.hasSeries()) {
                const state = new NPCSeriesState(npc, null);
                this.npcSeriesStates.set(npc.id, state);
                continue;
            }

            try {
                const seriesPath = npc.getSeriesPath();
                const response = await fetch(seriesPath);
                if (!response.ok) {
                    console.warn(`Failed to load series for NPC ${npc.id}: ${response.statusText}`);
                    this.npcSeriesStates.set(npc.id, new NPCSeriesState(npc, null));
                    continue;
                }

                const seriesJson = await response.json();
                const series = await this.seriesManager!.loadSeries(seriesJson);

                if (seriesJson.puzzles) {
                    for (const puzzle of seriesJson.puzzles) {
                        if (puzzle.id && puzzle.puzzleData) {
                            this.addSeriesPuzzleData(puzzle.id, puzzle.puzzleData);
                        }
                    }
                }

                const state = new NPCSeriesState(npc, series);
                this.npcSeriesStates.set(npc.id, state);
                this.updateNPCIcon(npc);

                console.log(`Loaded series '${series.title}' for NPC ${npc.id}, icon state: ${state.getIconState()}`);
            } catch (error) {
                console.error(`Error loading series for NPC ${npc.id}:`, error);
                this.npcSeriesStates.set(npc.id, new NPCSeriesState(npc, null));
            }
        }
    }

    /**
     * Update or create the icon badge for an NPC based on their series state.
     */
    updateNPCIcon(npc: NPC): void {
        const state = this.npcSeriesStates.get(npc.id);
        if (!state) return;

        const iconState = state.getIconState();
        const npcSprite = this.npcSprites.get(npc.id);
        if (!npcSprite) return;

        const existingIcon = this.npcIcons.get(npc.id);
        if (existingIcon) {
            existingIcon.destroy();
            this.npcIcons.delete(npc.id);
        }

        if (iconState !== 'none') {
            const iconKey = iconState === 'complete' ? NPCIconConfig.COMPLETE : NPCIconConfig.INCOMPLETE;
            const icon = this.scene.add.image(
                npcSprite.x,
                npcSprite.y + NPCIconConfig.ICON_OFFSET_Y,
                iconKey
            );
            icon.setScale(NPCIconConfig.ICON_SCALE);
            icon.setOrigin(0.5, 0.5);
            icon.setDepth(npcSprite.depth + NPCIconConfig.ICON_DEPTH_OFFSET);
            this.npcIcons.set(npc.id, icon);
        }
    }

    update(delta: number): void {
        for (const movingNPC of this.movingNPCs) {
            if (movingNPC.speedPixelsPerSecond > 0) {
                movingNPC.distance = movingNPC.path.wrapDistance(
                    movingNPC.distance + (movingNPC.speedPixelsPerSecond * delta) / 1000
                );
            }

            const segmentDelta = movingNPC.path.getSegmentDeltaAt(movingNPC.distance);
            if (segmentDelta.x !== 0 || segmentDelta.y !== 0) {
                movingNPC.direction = getClosestCardinalDirection(segmentDelta.x, segmentDelta.y);
            }

            this.applyMovingNPCState(movingNPC);
        }
    }

    private loadPaths(): void {
        const pathLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData?.layers ?? [], 'paths');

        for (const layerInfo of pathLayers) {
            for (const obj of layerInfo.data?.objects ?? []) {
                if (!obj?.name) continue;
                const points = this.getAbsolutePathPoints(obj);
                if (!points) continue;

                try {
                    this.paths.set(obj.name, new LoopPath(points));
                } catch (error) {
                    console.warn(`Failed to load NPC path "${obj.name}" from ${layerInfo.fullPath}:`, error);
                }
            }
        }
    }

    private getAbsolutePathPoints(obj: any): PathPoint[] | null {
        const points = Array.isArray(obj.polygon) ? obj.polygon : Array.isArray(obj.polyline) ? obj.polyline : null;
        if (!points || points.length < 2 || typeof obj.x !== 'number' || typeof obj.y !== 'number') {
            return null;
        }

        return points.map((point: any) => ({
            x: obj.x + point.x,
            y: obj.y + point.y,
        }));
    }

    private createMovingNPC(
        npcId: string,
        appearanceId: string,
        sprite: Phaser.GameObjects.Sprite,
        interactable: Interactable,
        pathName: string,
        speed: number,
        initialPosition: PathPoint,
    ): MovingNPC | null {
        const path = this.paths.get(pathName);
        if (!path) {
            console.warn(`NPC ${npcId} references unknown path "${pathName}"`);
            return null;
        }

        const distance = path.getClosestDistance(initialPosition);
        const initialDelta = path.getSegmentDeltaAt(distance);

        return {
            npcId,
            appearanceId,
            sprite,
            interactable,
            path,
            distance,
            speedPixelsPerSecond: Math.max(0, speed) * this.gridMapper.getCellSize(),
            direction: getClosestCardinalDirection(initialDelta.x, initialDelta.y),
        };
    }

    private applyMovingNPCState(movingNPC: MovingNPC): void {
        const topLeft = movingNPC.path.getPointAt(movingNPC.distance);
        movingNPC.sprite.setPosition(topLeft.x, topLeft.y + this.gridMapper.getCellSize());
        movingNPC.sprite.setDepth(movingNPC.sprite.y);

        const walkAnimationKey = getNPCDirectionalWalkAnimationKey(
            movingNPC.appearanceId,
            movingNPC.direction,
            this.npcAppearanceRegistry,
        );
        if (this.scene.anims.exists(walkAnimationKey)) {
            movingNPC.sprite.play(walkAnimationKey, true);
        } else {
            movingNPC.sprite.setFrame(getNPCDirectionalIdleFrame(movingNPC.direction));
        }

        const tilePosition = this.gridMapper.worldToGrid(topLeft.x, topLeft.y);
        movingNPC.interactable.tileX = tilePosition.x;
        movingNPC.interactable.tileY = tilePosition.y;

        const icon = this.npcIcons.get(movingNPC.npcId);
        if (icon) {
            icon.setPosition(
                movingNPC.sprite.x,
                movingNPC.sprite.y + NPCIconConfig.ICON_OFFSET_Y,
            );
            icon.setDepth(movingNPC.sprite.depth + NPCIconConfig.ICON_DEPTH_OFFSET);
        }
    }
}
