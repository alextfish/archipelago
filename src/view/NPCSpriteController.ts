import Phaser from 'phaser';
import { NPC } from '@model/conversation/NPC';
import { NPCSeriesState } from '@model/conversation/NPCSeriesState';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import type { SeriesManager } from '@model/series/SeriesFactory';
import type { GridToWorldMapper } from '@view/GridToWorldMapper';
import type { Interactable } from '@view/InteractionCursor';
import { NPCIconConfig } from '@view/NPCIconConfig';
import { getNPCIdleAnimationKey, registerNPCAnimations } from '@view/NPCSpriteHelper';
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';

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

            this.addInteractable({
                type: 'npc',
                tileX,
                tileY,
                data: { npc }
            });

            const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(tileX, tileY + 1);
            const sprite = this.scene.add.sprite(worldX, worldY, appearanceId);
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

            if (npc.animate) {
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
}
