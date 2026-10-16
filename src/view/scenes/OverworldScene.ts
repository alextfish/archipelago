import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { CollisionManager, CollisionType } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import { CameraManager } from '@view/CameraManager';
import { OverworldPuzzleController } from '@controller/OverworldPuzzleController';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import { PlayerController } from '@view/PlayerController';
import { InteractionCursor } from '@view/InteractionCursor';
import { RoofManager } from '@view/RoofManager';
import { attachTestMarker, isTestMode, getTestConfig } from '@helpers/TestMarkers';
import { SeriesFactory, SeriesManager } from '@model/series/SeriesFactory';
import { FilePuzzleLoader, LocalStorageProgressStore } from '@model/series/SeriesLoaders';
import { clearArchipelagoPersistentState } from '@model/persistence/PersistenceUtils';
import { NPCIconConfig } from '@view/NPCIconConfig';
import { PlayerStartManager } from '@model/overworld/PlayerStartManager';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { RiverChannelInitialiser } from '@model/overworld/RiverChannelInitialiser';
import { WaterPropagationEngine } from '@model/overworld/WaterPropagationEngine';
import type { TranslationModeScene } from '@view/scenes/TranslationModeScene';
import type { ConversationScene } from '@view/scenes/ConversationScene';
import { loadNPCSprites } from '@view/NPCSpriteHelper';
import type { PlayerStartPosition } from '@model/overworld/PlayerStartManager';
import { SceneTransitionCoordinator } from '@view/SceneTransitionCoordinator';
import { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';
import { FlowWaterVisualManager } from '@view/FlowWaterVisualManager';
import { DoorManager } from '@view/DoorManager';
import { queueDoorSpriteAssets } from '@view/DoorAssetLoader';
import { CollectibleManager } from '@view/CollectibleManager';
import { ConstraintNPCManager } from '@view/ConstraintNPCManager';
import { NPCSpriteController } from '@view/NPCSpriteController';
import { PortalManager } from '@view/PortalManager';
import {
  getTilesetTextureKey,
  getTilesetImageLoadRequests,
} from '@view/MapSceneAssetUtils';
import {
  prepareMapSceneData,
  queueMapSceneImageRequests,
} from '@view/MapSceneLoadUtils';
import { ExplorationMapScene } from '@view/scenes/ExplorationMapScene';
import {
  buildPuzzleEntryInteractables,
} from '@view/MapPuzzleSceneHelpers';
import { OverworldCameraZones } from '@model/overworld/OverworldCameraZones';

/**
 * Overworld scene for exploring the map and finding puzzles
 */
export class OverworldScene extends ExplorationMapScene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private bridgesLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionArray: number[][] = [];
  /** Tiles that are permanently BLOCKED due to explicit Tiled collision-layer properties
   * (collides=true / walkable=false). Water propagation must never change these. */
  private permanentBlockedTiles: Set<string> = new Set();

  // Overworld puzzle system
  private puzzleManager: OverworldPuzzleManager;
  private collisionManager: CollisionManager;
  private bridgeManager?: OverworldBridgeManager;
  private cameraManager: CameraManager;
  private overworldCameraZones: OverworldCameraZones = OverworldCameraZones.fromTiledLayers([]);
  private puzzleController?: OverworldPuzzleController; // New: replaces direct puzzle management

  // Roof hiding system
  private roofManager?: RoofManager;

  /** Merged tile data from all Tiled `water` layers — built once at load time and used by
   * RiverChannelInitialiser to trace inter-puzzle river channels. */
  private mergedWaterLayerData?: number[];

  // ── Extracted manager classes ─────────────────────────────────────────────
  /** Manages flow-water tile visuals and pontoon tile toggling. */
  private flowWaterManager?: FlowWaterVisualManager;

  // Portal (scene-transition hotspot) system
  private portalManager?: PortalManager;

  // Player start position management
  private playerStartManager?: PlayerStartManager;

  // Overworld HUD scene (book icon, warp button, jewel counts)
  private overworldHUD?: OverworldHUDScene;

  private shouldShowNewGameIntro: boolean = false;

  constructor() {
    super({ key: 'OverworldScene' });

    // Initialize overworld puzzle systems
    this.puzzleManager = new OverworldPuzzleManager(defaultTileConfig);
    this.gameState = new OverworldGameState();
    this.collisionManager = new CollisionManager(this);
    this.cameraManager = new CameraManager(this);
    this.roofManager = new RoofManager(this);

    // Initialize series manager
    const puzzleLoader = new FilePuzzleLoader();
    const progressStore = new LocalStorageProgressStore();
    const seriesFactory = new SeriesFactory(puzzleLoader, progressStore);
    this.seriesManager = new SeriesManager(seriesFactory, progressStore);
  }

  /** Canonical gate for overworld exploration-time movement/input; disabled player control also blocks interaction. */
  protected canPlayerMoveAroundAndInteract(): boolean {
    return this.gameMode === 'exploration' && (this.playerController?.isEnabled() ?? false);
  }

  preload() {
    // Load external tilesets (these reference images outside the map file)
    this.load.image('beachTileset', 'resources/tilesets/beach.png');
    this.load.image('grassTileset', 'resources/tilesets/SproutLandsGrassIslands.png');

    // Load spritesheet for puzzle elements (same as BridgePuzzleScene)
    this.load.spritesheet('sprout-tiles', 'resources/tilesets/SproutLandsGrassIslands.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load player sprite
    this.load.spritesheet('player', 'resources/sprites/Vasily.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet('player_face', 'resources/sprites/faces/Vasily neutral.png', {
      frameWidth: 96,
      frameHeight: 96
    });

    // Load NPC sprites
    loadNPCSprites(this.load);

    // Load language tileset for speech bubbles in constraint feedback
    this.load.spritesheet('language', 'resources/tilesets/language.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load counts overlay spritesheet for constraint NPCs
    this.load.spritesheet('counts overlay', 'resources/sprites/counts overlay.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Compass overlay art is not finalised yet, so do not queue the texture here.
    // Load NPC icon sprites
    this.load.image(NPCIconConfig.INCOMPLETE, 'resources/sprites/icon-incomplete.png');
    this.load.image(NPCIconConfig.COMPLETE, 'resources/sprites/icon-complete.png');

    // Load interaction cursor sprites so InteractionCursor can use them synchronously
    this.load.image('cursor-out', 'resources/square_cursor_out.png');
    this.load.image('cursor-in', 'resources/square_cursor_in.png');

    // Load jewel collectible spritesheets.  Each colour gets its own 3-frame
    // slice of jewels.png so that frame 0 of 'jewel-red' is the first red
    // frame, frame 0 of 'jewel-green' is the first green frame, etc.  This
    // lets loadCollectibles() and updateOverworldJewelHUD() use the per-colour
    // key without needing to know the raw frame offset.
    const JEWEL_FRAME_CONFIG = { frameWidth: 32, frameHeight: 32 };
    this.load.spritesheet('jewel-red', 'resources/sprites/jewels.png', { ...JEWEL_FRAME_CONFIG, startFrame: 0, endFrame: 3 });
    this.load.spritesheet('jewel-green', 'resources/sprites/jewels.png', { ...JEWEL_FRAME_CONFIG, startFrame: 4, endFrame: 7 });
    this.load.spritesheet('jewel-blue', 'resources/sprites/jewels.png', { ...JEWEL_FRAME_CONFIG, startFrame: 8, endFrame: 11 });
    this.load.spritesheet('jewel-yellow', 'resources/sprites/jewels.png', { ...JEWEL_FRAME_CONFIG, startFrame: 12, endFrame: 15 });

    queueDoorSpriteAssets(this);

    // Load TMX file asynchronously, then load embedded tilesets
    this.loadTmxFile();
  }

  private async loadTmxFile() {
    try {
      console.log('Loading map file...');
      const preparedMap = await prepareMapSceneData(
        'resources/overworld.json',
        MapUtils.loadTiledMap,
        (textureKey) => this.textures.exists(textureKey),
        { skipResourcePrefixedImages: true },
      );
      this.tiledMapData = preparedMap.mapData;

      // Initialize player start manager as soon as map data is available
      this.playerStartManager = new PlayerStartManager(this.tiledMapData);
      console.log('Player start manager initialized with', this.playerStartManager.getAllStarts().length, 'start positions');

      // Load embedded tilesets from the map data
      this.loadEmbeddedTilesets(this.tiledMapData, preparedMap.tilesetImageRequests);

      // Load any disguise sprites declared on constraint objects in the map
      this.loadDisguiseSprites(this.tiledMapData);

      // Add the converted map data to Phaser's cache
      this.cache.tilemap.add('overworldMap', { format: 1, data: this.tiledMapData });
      console.log('Map file loaded and converted successfully');
    } catch (error) {
      console.error('Failed to load map file, using fallback:', error);
      this.createFallbackMap();
    }
  }

  /**
   * Load embedded tilesets from the map data
   * Embedded tilesets have their image data included in the map file
   */
  private loadEmbeddedTilesets(
    tiledMapData: any,
    requests: ReturnType<typeof getTilesetImageLoadRequests>,
  ): void {
    if (!tiledMapData || !tiledMapData.tilesets) {
      return;
    }

    console.log(`Checking ${tiledMapData.tilesets.length} tilesets for embedded images...`);

    for (const tileset of tiledMapData.tilesets) {
      if (tileset.image && !tileset.image.startsWith('resources/')) {
        console.log(`Loading embedded tileset: ${tileset.name} (key: ${getTilesetTextureKey(tileset.name)})`);
      } else if (tileset.image) {
        console.log(`Tileset ${tileset.name} uses external image: ${tileset.image}`);
      } else {
        console.log(`Tileset ${tileset.name} has no image property (may be a collection)`);
      }
    }

    for (const request of requests) {
      if (!request.imagePath.startsWith('data:')) {
        console.log(`  Loading from path: ${request.imagePath}`);
      }
    }

    queueMapSceneImageRequests(
      requests,
      (textureKey, imagePath) => this.load.image(textureKey, imagePath),
      () => this.load.isLoading(),
      () => this.load.start(),
    );
  }

  /**
   * Scan all constraint objects in the Tiled map for `disguise_sprite` and
   * `disguise_sprite_solved` properties, and queue those images for loading.
   * Must be called after the map JSON is available but before sprites are created
   * (i.e. from within {@link loadTmxFile}).
   */
  private loadDisguiseSprites(tiledMapData: any): void {
    if (!tiledMapData?.layers) return;

    const keysToLoad = new Set<string>();

    const scanLayer = (layer: any): void => {
      if (layer.type === 'group' && layer.layers) {
        for (const child of layer.layers) {
          scanLayer(child);
        }
      } else if (layer.type === 'objectgroup' && layer.objects) {
        for (const obj of layer.objects) {
          if (!Array.isArray(obj.properties)) continue;
          const props: Record<string, string> = {};
          for (const p of obj.properties) {
            props[p.name] = String(p.value);
          }
          if (props.constraint !== 'true') continue;
          if (props.disguise_sprite) keysToLoad.add(props.disguise_sprite);
          if (props.disguise_sprite_solved) keysToLoad.add(props.disguise_sprite_solved);
        }
      }
    };

    for (const layer of tiledMapData.layers) {
      scanLayer(layer);
    }

    for (const key of keysToLoad) {
      if (!this.textures.exists(key)) {
        const path = `resources/sprites/${key}.png`;
        this.load.image(key, path);
        console.log(`Queued disguise sprite for loading: ${key} (${path})`);
      }
    }

    if (keysToLoad.size > 0 && !this.load.isLoading() && this.load.totalToLoad > 0) {
      this.load.start();
    }
  } private createFallbackMap() {
    // Simple fallback map if TMX loading fails
    const mapData = {
      width: 20,
      height: 15,
      tilewidth: 32,
      tileheight: 32,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.0.0',
      type: 'map',
      version: '1.0',
      infinite: false,
      nextlayerid: 2,
      nextobjectid: 1,
      layers: [
        {
          id: 1,
          name: 'beach',
          type: 'tilelayer',
          width: 20,
          height: 15,
          data: new Array(20 * 15).fill(1),
          visible: true,
          opacity: 1,
          x: 0,
          y: 0
        }
      ],
      tilesets: [
        {
          firstgid: 1,
          name: 'beach',
          tilewidth: 32,
          tileheight: 32,
          tilecount: 20,
          columns: 4,
          image: 'resources/tilesets/beach.png',
          imagewidth: 128,
          imageheight: 160
        }
      ]
    };

    this.cache.tilemap.add('overworldMap', { format: 1, data: mapData });
  }

  create() {
    // Load persisted game state from localStorage (best-effort; no-op if absent)
    this.loadGameState();

    // Listen for the wake event so we can handle returns from InteriorScene
    this.events.on('wake', (_sys: unknown, data?: { returnPlayerX?: number; returnPlayerY?: number }) => {
      this.onWake(data);
    });

    if (!this.waitForMapSceneAssets()) {
      return;
    }

    console.log('Setting up visual layers...');
    const tilesets = this.bootstrapExplorationMap({ requireTilesets: true });
    if (!tilesets) {
      return;
    }
    console.log(`Loaded ${tilesets.length} tilesets successfully`);

    // Create collision layers
    this.setupCollisionLayer(tilesets);

    // Set world bounds to match map size
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;

    // Find player starting position (PlayerStartManager should be initialized from preload)
    const playerStart = this.findPlayerStartPosition();

    // Create player sprite (no physics body — movement is handled by PlayerController.tryMove)
    this.player = this.add.sprite(playerStart.x, playerStart.y, 'player', 0);
    // Anchor at 3/4 down the sprite (origin.y = 0.75) so player.y is the feet/ground position,
    // matching the collision tile lookups directly without any additional offset.
    this.player.setOrigin(0.5, 0.75);

    // Add test marker for player
    if (isTestMode()) {
      attachTestMarker(this, this.player, {
        id: 'player',
        testId: 'player',
        width: 32,
        height: 32,
        showBorder: true
      });
      console.log(`[TEST] Added test marker for player at (${playerStart.x}, ${playerStart.y})`);
    }

    // Set up camera to follow player
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setZoom(this.cameraManager.getDefaultFollowZoom());
    this.cameras.main.roundPixels = true; // avoid subpixel gaps

    this.loadOverworldCameraZones();
    this.refreshOverworldCamera({ immediate: true, force: true });

    // Set up input and player controller
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

    console.log('Overworld scene created successfully');
    console.log(`Map size: ${mapWidth}x${mapHeight}`);
    console.log(`Player start: (${playerStart.x}, ${playerStart.y})`);

    // Initialize shared puzzle HUD
    PuzzleHUDManager.getInstance().initializeHUD(this);

    // Create NPCSpriteController (needs map, gridMapper, seriesManager)
    this.npcSpriteController = new NPCSpriteController(
      this,
      this.map,
      this.gridMapper,
      this.seriesManager,
      this.tiledMapData,
      (npc) => this.npcs.push(npc),
      (interactable) => this.interactables.push(interactable),
      (id, data) => this.currentSeriesPuzzleData.set(id, data),
    );

    // Register looping idle animations for animated NPCs
    this.npcSpriteController.registerAnimations();

    // Create CollectibleManager early so jewel animations can be registered
    // (requires map/tiledMapData to be ready, but not pontoonTiles)
    if (this.tiledMapData && this.map) {
      this.collectibleManager = new CollectibleManager(
        this,
        this.tiledMapData,
        this.map,
        this.gameState,
        () => this.overworldHUD,
        (i) => this.interactables.push(i),
        (pred) => { this.interactables = this.interactables.filter(i => !pred(i)); },
      );
      // Register looping animations for collectible jewels
      this.collectibleManager.initialise();
    }

    // Initialize overworld puzzle system
    this.initializeOverworldPuzzles();
  }

  private async initializeOverworldPuzzles(): Promise<void> {
    try {
      console.log('Initializing overworld puzzle system...');

      // tiledMapData should already be loaded from preload phase
      if (!this.tiledMapData) {
        console.warn('tiledMapData not loaded yet, loading now...');
        this.tiledMapData = await MapUtils.loadTiledMap('resources/overworld.json');

        // Initialize player start manager if not already done
        if (!this.playerStartManager) {
          this.playerStartManager = new PlayerStartManager(this.tiledMapData);
          console.log('Player start manager initialized (late) with', this.playerStartManager.getAllStarts().length, 'start positions');
        }
      }

      // Now that tiledMapData is loaded, create the bridge manager if we have a bridges layer
      if (this.bridgesLayer && !this.bridgeManager) {
        console.log('Creating bridge manager now that tiledMapData is loaded');
        this.bridgeManager = new OverworldBridgeManager(
          this.bridgesLayer,
          this.tiledMapData,
          this // Pass scene for setCollisionAt calls
        );
        console.log('Bridge manager created');
      }

      // Load all puzzles from the map
      const puzzles = this.puzzleManager.loadPuzzlesFromMap(this.tiledMapData);
      console.log(`Loaded ${puzzles.size} overworld puzzles`);

      this.gameState.restorePuzzleProgress(puzzles);
      for (const [puzzleId, puzzle] of puzzles) {
        if (puzzle instanceof FlowPuzzle) {
          const savedInputs = this.gameState.getFlowPuzzleInputs(puzzleId);
          if (savedInputs.length > 0) {
            puzzle.setEdgeInputs(savedInputs);
          }
        }
      }

      if (this.bridgeManager) {
        this.bridgeManager.restoreCompletedPuzzles(
          this.gameState,
          (puzzleId: string) => {
            const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
            return bounds ? new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height) : null;
          }
        );
      }

      // Merge all `water` Tiled layers into a single master grid, then wire up
      // RiverChannelExtractor / WaterPropagationEngine so that downstream puzzles
      // (e.g. flowPuzzle2) receive edge inputs from upstream sources (e.g. flowPuzzle1).
      // This MUST run before applyInitialFlowPuzzleCollision so that edge inputs are
      // computed and set on all puzzles before collision blocking and visuals are applied.
      this.mergedWaterLayerData = this.buildMergedWaterLayer();
      this.wireRiverChannels(puzzles);

      // Apply initial water blocking for FlowPuzzles.
      // Each FlowPuzzle computes its water state on construction; those tiles must
      // be blocked (both high and low ground) so the player cannot walk through
      // flowing water before solving the puzzle.
      // This runs AFTER wireRiverChannels so that edge inputs from upstream puzzles
      // have been propagated to downstream puzzles.
      this.applyInitialFlowPuzzleCollision(puzzles);

      // Create puzzle controller now that we have all dependencies
      this.puzzleController = new OverworldPuzzleController(
        this,
        this.gameState,
        this.puzzleManager,
        this.cameraManager,
        this.collisionManager,
        this.bridgeManager,
        this.tiledMapData
      );
      console.log('OverworldPuzzleController created');

      // Set up puzzle interaction checking
      this.setupPuzzleInteraction();

      // Initialize interaction cursor
      this.initializeInteractionCursor();

      // Initialize roof manager if we have roofs layers
      if (this.roofsLayers.length > 0 && this.roofManager) {
        this.roofManager.initialize(this.map, this.roofsLayers, this.tiledMapData);
      }

      // Launch Translation Mode overlay and connect to shared game-state services
      this.launchTranslationMode();

      // Launch the overworld HUD scene and wire it up with the services it needs
      this.launchOverworldHUD();
      this.overworldHUD?.refreshJewelHUD();

      // Load portals from the Tiled map and register them as step hotspots
      this.portalManager = new PortalManager(
        this,
        this.tiledMapData,
        this.map,
        this.gameState,
        this.seriesManager,
        () => this.player ?? null,
        () => this.playerController,
        () => this.overworldHUD,
        (tx, ty, cb) => this.registerStepHotspot(tx, ty, cb),
        () => this.saveGameState(),
      );
      this.portalManager.loadPortals();

      if (this.shouldShowNewGameIntro) {
        this.showNewGameIntroDialogue();
      }

    } catch (error) {
      console.error('Failed to initialize overworld puzzles:', error);
    }

    // Cold-start interior resume — runs after puzzle init completes (or even if
    // parts of it failed) so the player can still re-enter their building.
    try {
      const resumeInteriorID = this.gameState.getCurrentInteriorID();
      if (resumeInteriorID) {
        console.log(`[OverworldScene] Resuming inside interior "${resumeInteriorID}"`);
        this.gameMode = 'exploration';
        this.gameState.clearActivePuzzle();
        PuzzleHUDManager.getInstance().exitPuzzle();
        this.scene.setVisible(false, 'PuzzleHUDScene');
        this.playerController?.setEnabled(false);
        this.overworldHUD?.setWarpButtonVisible(false);
        this.scene.launch('InteriorScene', {
          mapKey: resumeInteriorID,
          spawnID: undefined,
          gameState: this.gameState,
          seriesManager: this.seriesManager,
          saveStateCallback: () => this.saveGameState(),
        });
        this.scene.sleep('OverworldScene');
      }
    } catch (error) {
      console.error('[OverworldScene] Failed to resume inside interior on cold start:', error);
    }
  }

  /**
   * Block overworld tiles occupied by flowing water for every unsolved FlowPuzzle.
   * Called once at map load, after all puzzles are created (and their initial
   * water state has been computed in each FlowPuzzle constructor).
   */
  private applyInitialFlowPuzzleCollision(puzzles: Map<string, import('@model/puzzle/BridgePuzzle').BridgePuzzle>): void {
    if (!this.tiledMapData || !this.flowWaterManager) return;

    const tileW: number = this.tiledMapData.tilewidth ?? 32;
    const tileH: number = this.tiledMapData.tileheight ?? 32;

    for (const [puzzleId, puzzle] of puzzles) {
      if (!(puzzle instanceof FlowPuzzle)) continue;

      const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
      if (!puzzleBounds) continue;

      const originTileX = Math.floor(puzzleBounds.x / tileW);
      const originTileY = Math.floor(puzzleBounds.y / tileH);
      const wetWorldTiles: { tileX: number; tileY: number }[] = [];

      for (let ly = 0; ly < puzzle.height; ly++) {
        for (let lx = 0; lx < puzzle.width; lx++) {
          if (puzzle.tileHasWater(lx, ly)) {
            wetWorldTiles.push({ tileX: originTileX + lx, tileY: originTileY + ly });
          }
        }
      }

      if (wetWorldTiles.length > 0) {
        this.collisionManager.applyFlowWaterCollision(wetWorldTiles);
        console.log(`Applied initial water blocking for FlowPuzzle "${puzzleId}": ${wetWorldTiles.length} tiles blocked`);
      }

      this.flowWaterManager.updatePontoonVisuals(puzzle, puzzleBounds);
      this.flowWaterManager.updateFlowWaterVisuals(puzzle, puzzleBounds);
    }
  }

  /**
   * Build a single flat tile-data array by OR-merging all Tiled `water` layers.
   * Any position that is non-zero in any water layer is non-zero in the result.
   * Stored on the scene so the merged grid is only computed once at load time.
   */
  private buildMergedWaterLayer(): number[] | undefined {
    return RiverChannelInitialiser.buildMergedWaterLayer(this.tiledMapData);
  }

  /**
   * Wire up RiverChannelInitialiser → WaterPropagationEngine → OverworldGameState for
   * inter-puzzle water propagation.  Called once after all puzzles are loaded.
   *
   * Builds a `puzzleRegions` map from every FlowPuzzle's tile bounds and edge outputs,
   * runs channel extraction on the merged water grid, initialises the propagation engine,
   * then performs an initial BFS propagation so downstream puzzles (e.g. flowPuzzle2)
   * receive their edge inputs from upstream sources (e.g. flowPuzzle1) right at game start.
   */
  private wireRiverChannels(
    puzzles: Map<string, import('@model/puzzle/BridgePuzzle').BridgePuzzle>
  ): void {
    if (!this.tiledMapData || !this.mergedWaterLayerData) {
      console.warn('[RiverChannels] tiledMapData or merged water layer unavailable — skipping');
      return;
    }

    const tileW: number = this.tiledMapData.tilewidth ?? 32;
    const tileH: number = this.tiledMapData.tileheight ?? 32;

    // ── 1. Build puzzleRegions ───────────────────────────────────────────────
    const puzzleRegions = new Map<string, {
      bounds: { tileX: number; tileY: number; width: number; height: number };
      edgeTiles: { x: number; y: number; edge: 'N' | 'S' | 'E' | 'W' }[];
    }>();

    for (const [puzzleId, puzzle] of puzzles) {
      if (!(puzzle instanceof FlowPuzzle)) continue;

      const pixelBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
      if (!pixelBounds) continue;

      const regionData = RiverChannelInitialiser.buildPuzzleRegionData(puzzle, pixelBounds, tileW, tileH);
      puzzleRegions.set(puzzleId, regionData);
      const { bounds, edgeTiles } = regionData;
      console.log(
        `[RiverChannels] Puzzle "${puzzleId}": tile origin (${bounds.tileX},${bounds.tileY}) ` +
        `${bounds.width}×${bounds.height}, ${edgeTiles.length} edge output(s)`
      );
    }

    if (puzzleRegions.size === 0) {
      console.log('[RiverChannels] No FlowPuzzles found — skipping channel extraction');
      return;
    }

    // ── 2. Extract channels via flood-fill on merged water grid ──────────────
    // Pass a synthetic tiledMapData with the merged layer accessible by a known name at the
    // top level so RiverChannelExtractor.extractChannels can find it with a flat .find().
    const MERGED_LAYER_NAME = '__mergedWater__';
    const syntheticMapData = {
      ...this.tiledMapData,
      layers: [
        { name: MERGED_LAYER_NAME, type: 'tilelayer', data: this.mergedWaterLayerData },
        ...(this.tiledMapData.layers ?? []),
      ],
    };

    const channels = RiverChannelInitialiser.extractChannels(syntheticMapData, MERGED_LAYER_NAME, puzzleRegions);

    console.log(`[RiverChannels] Extracted ${channels.length} river channel(s):`);
    for (const ch of channels) {
      console.log(`  ${ch.id}: ${ch.sourcePuzzleID} → ${ch.targetPuzzleID}, ${ch.tiles.length} tile(s)`);
    }

    // ── 3. Initialise propagation engine ────────────────────────────────────
    const waterEngine = new WaterPropagationEngine();
    waterEngine.setRiverChannels(channels);
    this.gameState.initializeWaterPropagation(waterEngine, this.puzzleManager);

    // ── 4. BFS initial propagation ──────────────────────────────────────────
    // Process each FlowPuzzle once; any downstream puzzle whose edge inputs change is
    // queued for re-processing (handles chains: A → B → C).
    const toProcess = new Set<string>(puzzleRegions.keys());
    const processed = new Set<string>();
    let rounds = 0;

    while (toProcess.size > 0 && rounds < 10) {
      rounds++;
      for (const puzzleId of Array.from(toProcess)) {
        const puzzle = puzzles.get(puzzleId);
        if (!(puzzle instanceof FlowPuzzle)) {
          toProcess.delete(puzzleId);
          continue;
        }

        const result = this.gameState.updateFlowPuzzleWaterState(puzzleId, puzzle);
        processed.add(puzzleId);
        toProcess.delete(puzzleId);

        // Apply edge inputs + re-derive water state for each affected downstream puzzle
        for (const [targetId, inputs] of result.affectedPuzzles) {
          const targetPuzzle = puzzles.get(targetId);
          if (!(targetPuzzle instanceof FlowPuzzle)) continue;

          console.log(
            `[RiverChannels] Applying ${inputs.length} edge input(s) to "${targetId}" ` +
            `from "${puzzleId}"`
          );

          // Recompute water in the downstream puzzle
          targetPuzzle.setEdgeInputs(inputs);

          // Apply collision blocking for newly-wet tiles
          const targetBounds = this.puzzleManager.getPuzzleBounds(targetId);
          if (targetBounds) {
            const wetTiles: { tileX: number; tileY: number }[] = [];
            const originTileX = Math.floor(targetBounds.x / tileW);
            const originTileY = Math.floor(targetBounds.y / tileH);
            for (let ly = 0; ly < targetPuzzle.height; ly++) {
              for (let lx = 0; lx < targetPuzzle.width; lx++) {
                if (targetPuzzle.tileHasWater(lx, ly)) {
                  wetTiles.push({ tileX: originTileX + lx, tileY: originTileY + ly });
                }
              }
            }
            if (wetTiles.length > 0) {
              this.collisionManager.applyFlowWaterCollision(wetTiles);
            }
            this.flowWaterManager?.updatePontoonVisuals(targetPuzzle, targetBounds);
            this.flowWaterManager?.updateFlowWaterVisuals(targetPuzzle, targetBounds);
          }

          // Queue for propagation if not already done
          if (!processed.has(targetId)) {
            toProcess.add(targetId);
          }
        }
      }
    }

    // ── 5. Diagnostics ──────────────────────────────────────────────────────
    for (const [puzzleId] of puzzleRegions) {
      const puzzle = puzzles.get(puzzleId);
      if (!(puzzle instanceof FlowPuzzle)) continue;

      const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
      if (!bounds) continue;

      let waterCount = 0;
      let pontoonHighCount = 0;
      let pontoonLowCount = 0;
      const originTileX = Math.floor(bounds.x / tileW);
      const originTileY = Math.floor(bounds.y / tileH);

      for (let ly = 0; ly < puzzle.height; ly++) {
        for (let lx = 0; lx < puzzle.width; lx++) {
          if (puzzle.tileHasWater(lx, ly)) waterCount++;
          const key = `${originTileX + lx},${originTileY + ly}`;
          const pontoon = this.flowWaterManager?.pontoonTiles.get(key);
          if (pontoon) {
            if (pontoon.isHigh) pontoonHighCount++;
            else pontoonLowCount++;
          }
        }
      }
      console.log(
        `[RiverChannels] "${puzzleId}" final state: ${waterCount} wet tile(s), ` +
        `${pontoonHighCount} high pontoon(s), ${pontoonLowCount} low pontoon(s)`
      );
    }
  }

  /**
   * Update pontoon tile visuals for a FlowPuzzle.
   * Delegated to {@link FlowWaterVisualManager}.
   */
  /**
   * Update overworld water-tile visuals for a FlowPuzzle after it is exited.
   * Delegated to {@link FlowWaterVisualManager}.
   */
  public updateFlowWaterVisuals(puzzle: FlowPuzzle, puzzleBounds: { x: number; y: number }): void {
    this.flowWaterManager?.updateFlowWaterVisuals(puzzle, puzzleBounds);
  }

  /**
   * Update visual and collision state for a single flow tile.
   * Called by FlowPuzzleRenderer for per-tile wave animation during puzzle solving.
   * Delegated to {@link FlowWaterVisualManager}.
   */
  public updateSingleFlowTileVisual(tileX: number, tileY: number, hasWater: boolean): void {
    this.flowWaterManager?.updateSingleFlowTileVisual(tileX, tileY, hasWater);
  }

  /**
   * Launch the Translation Mode overlay scene and inject the shared
   * game-state services (glyph tracker + translation dictionary).
   */
  private launchTranslationMode(): void {
    if (!this.scene.isActive('TranslationModeScene')) {
      this.scene.launch('TranslationModeScene');
    }
    const translationScene = this.scene.get('TranslationModeScene') as TranslationModeScene | null;
    if (translationScene) {
      translationScene.setServices(
        this.gameState.glyphTracker,
        this.gameState.translationDictionary
      );
    }
  }

  /**
   * Launch the OverworldHUD scene and wire it up with the services it needs.
   * The HUD scene runs at zoom=1 so its screen-space coordinates are always
   * pixel-accurate, regardless of the world camera zoom.
   */
  private launchOverworldHUD(): void {
    if (!this.playerStartManager) return;

    if (!this.scene.isActive('OverworldHUDScene')) {
      this.scene.launch('OverworldHUDScene');
    }
    const hud = this.scene.get('OverworldHUDScene') as OverworldHUDScene | null;
    if (hud) {
      this.overworldHUD = hud;
      hud.setServices(
        this.playerStartManager,
        (start) => this.warpToStart(start),
        () => this.gameState.getOverworldDisplayItems(),
        () => this.resetSavedStateAndReload(),
      );
    }
  }

  private resetSavedStateAndReload(): void {
    try {
      clearArchipelagoPersistentState();
      console.log('[OverworldScene] Cleared saved game state');
    } catch (error) {
      console.warn('[OverworldScene] Failed to clear saved game state:', error);
    }

    window.location.reload();
  }

  /**
   * Initialize the interaction cursor and build list of interactables
   */
  private initializeInteractionCursor(): void {
    if (!this.tiledMapData) {
      return;
    }

    // Create the cursor
    this.interactionCursor = new InteractionCursor(
      this,
      this.tiledMapData.tilewidth,
      this.tiledMapData.tileheight
    );

    // Build list of all puzzle entry tiles as interactables
    this.buildInteractablesList();

    console.log(`Interaction cursor initialized with ${this.interactables.length} interactables`);
  }

  /**
   * Build list of all interactable objects (puzzle entries, NPCs, etc.)
   */
  private buildInteractablesList(): void {
    this.interactables = [];

    if (!this.tiledMapData || !this.map) {
      return;
    }

    this.interactables.push(
      ...buildPuzzleEntryInteractables(
        this.puzzleManager,
        this.tiledMapData,
        this.gridMapper,
        this.map,
      )
    );

    // Load NPCs from the "npcs" object layer
    this.loadNPCs();

    console.log(`Built interactables list with ${this.interactables.length} entries (${this.npcs.length} NPCs)`);
  }

  /**
   * Load NPCs from all `<anything>/npcs` object layers in the Tiled map, load
   * puzzle series, load constraint NPCs, doors, and collectibles.
   */
  private loadNPCs(): void {
    if (!this.map || !this.tiledMapData || !this.npcSpriteController) return;

    // Create ConstraintNPCManager and DoorManager on first call (lazy, needs all deps)
    if (!this.constraintNPCManager) {
      this.constraintNPCManager = new ConstraintNPCManager(
        this,
        this.puzzleManager,
        this.gridMapper,
        this.gameState,
        this.npcSpriteController.npcAppearanceRegistry,
        this.tiledMapData,
        (npc) => this.npcs.push(npc),
        (npcId) => !!this.npcs.find(n => n.id === npcId),
        (i) => this.interactables.push(i),
      );
    }

    if (!this.doorManager) {
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
    }

    if (!this.collectibleManager) {
      this.collectibleManager = new CollectibleManager(
        this,
        this.tiledMapData,
        this.map,
        this.gameState,
        () => this.overworldHUD,
        (i) => this.interactables.push(i),
        (pred) => { this.interactables = this.interactables.filter(i => !pred(i)); },
      );
      this.collectibleManager.initialise();
    }

    // Find all npcs object layers (including nested) in tiledMapData
    const npcsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'npcs');

    if (npcsLayers.length === 0) {
      console.log('No NPCs layers found in map');
    } else {
      console.log(`Found ${npcsLayers.length} NPC layers`);

      this.loadNPCLayers(npcsLayers);

      // Load series for NPCs and create icons (once after all NPCs loaded)
      this.npcSpriteController.loadNPCSeries(this.npcs);
    }

    // Load constraint NPCs from overworld puzzles
    this.constraintNPCManager.loadConstraintNPCs();

    // Load doors from object layers
    this.doorManager.loadDoors();

    // Load collectibles from "collectibles" object layers
    this.collectibleManager.loadCollectibles();
  }

  private loadNPCLayers(npcsLayers: ReturnType<typeof TiledLayerUtils.findObjectLayersByName>): void {
    if (!this.npcSpriteController) return;

    for (const layerInfo of npcsLayers) {
      let npcsLayer = this.map.getObjectLayer(layerInfo.fullPath);
      if (!npcsLayer) {
        npcsLayer = this.map.getObjectLayer(layerInfo.name);
      }
      if (!npcsLayer) {
        console.warn(`Failed to get object layer: ${layerInfo.fullPath} or ${layerInfo.name}`);
        continue;
      }
      console.log(`Loading NPCs from layer: ${layerInfo.fullPath}`);
      this.npcSpriteController.loadNPCsFromLayerWithOffset(
        npcsLayer,
        layerInfo.fullPath,
        layerInfo.offsetX,
        layerInfo.offsetY,
      );
    }
  }


  protected persistMeaningfulProgress(): void {
    this.saveGameState();
  }

  protected setJewelHUDVisible(visible: boolean): void {
    this.overworldHUD?.setJewelHUDVisible(visible);
  }

  protected getSeriesPuzzleCallerSceneKey(): string {
    return 'OverworldScene';
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

  protected setExplorationPlayerLayerDisplay(playerLayer: ReturnType<PlayerController['getPlayerLayer']>): void {
    this.overworldHUD?.setPlayerLayerDisplay(playerLayer);
  }

  protected onExplorationFrameWhileActive(): void {
    if (this.roofManager && this.player) {
      this.roofManager.update(this.player.x, this.player.y);
    }

    this.refreshOverworldCamera();
  }

  protected shouldIgnoreExplorationPointerDown(_pointer: Phaser.Input.Pointer): boolean {
    return this.overworldHUD?.isWarpDialogOpen() ?? false;
  }

  protected onLeverInteraction(): void {
    console.log('Lever interaction not yet implemented');
  }

  protected getEmbeddedPuzzleFlowTileChangedCallback(puzzleId: string):
    ((lx: number, ly: number, hasWater: boolean) => void) | undefined {
    const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
    if (!puzzleBounds) {
      return undefined;
    }

    const tileW = this.tiledMapData?.tilewidth ?? 32;
    const tileH = this.tiledMapData?.tileheight ?? 32;
    const originTileX = Math.floor(puzzleBounds.x / tileW);
    const originTileY = Math.floor(puzzleBounds.y / tileH);

    return (lx: number, ly: number, hasWater: boolean) => {
      this.updateSingleFlowTileVisual(originTileX + lx, originTileY + ly, hasWater);
    };
  }

  protected getEmbeddedPuzzleBeforeExitTransitionCallback(activePuzzleId: string | undefined):
    (() => void) | undefined {
    if (!activePuzzleId) {
      return undefined;
    }

    return () => {
      const exitedPuzzle = this.puzzleManager.getPuzzleById(activePuzzleId);
      const exitedBounds = this.puzzleManager.getPuzzleBounds(activePuzzleId);
      if (exitedPuzzle instanceof FlowPuzzle && exitedBounds) {
        this.updateFlowWaterVisuals(exitedPuzzle, exitedBounds);
      }
    };
  }

  protected async onEmbeddedPuzzleExited(_exitResult: import('@controller/OverworldPuzzleController').PuzzleExitResult, _success: boolean): Promise<void> {
    this.refreshOverworldCamera({ immediate: true, force: true });
  }

  protected getMapCacheKey(): string {
    return 'overworldMap';
  }

  protected getSkippedVisualLayerNames(): string[] {
    return [OverworldBridgeManager.getBridgesLayerName()];
  }

  protected onMapCachePending(): void {
    console.log('Waiting for map to load...');
  }

  protected onTilesetTexturesPending(): void {
    console.log('Waiting for tileset textures to load...');
  }

  protected onNoTilesetDataInCache(): void {
    console.warn('No tileset data found in map');
  }

  protected onTilesetLoaded(tilesetName: string, textureKey: string): void {
    console.log(`Adding tileset: ${tilesetName} with key: ${textureKey}`);
    console.log(`  ✓ Tileset ${tilesetName} loaded successfully`);
  }

  protected onTilesetLoadFailed(tilesetName: string, textureKey: string): void {
    console.log(`Adding tileset: ${tilesetName} with key: ${textureKey}`);
    console.warn(`  ✗ Failed to load tileset ${tilesetName} (key: ${textureKey})`);
  }

  protected onNoTilesetsLoaded(): void {
    console.error('Failed to load any tilesets');
  }

  protected onVisualLayerCreated(layerName: string): void {
    console.log(`Visual layer "${layerName}" created successfully`);
  }

  protected onVisualLayerCreateFailed(layerName: string): void {
    console.warn(`Failed to create visual layer "${layerName}"`);
  }

  protected onRoofLayerCreated(layerName: string, layer: Phaser.Tilemaps.TilemapLayer): void {
    console.log(`Roofs layer "${layerName}" created successfully: depth=${layer.depth}, visible=${layer.visible}, alpha=${layer.alpha}`);
  }

  protected onRoofLayerCreateFailed(layerName: string): void {
    console.error(`Failed to create roofs layer "${layerName}" - createLayer returned null`);
  }

  private setupCollisionLayer(tilesets: Phaser.Tilemaps.Tileset[]) {
    const collisionBootstrap = this.setupCollisionBootstrap(tilesets);

    if (this.collisionLayers.length > 0) {
      console.log(`Found ${this.collisionLayers.length} collision layers`);

      for (const layerName of collisionBootstrap.createdLayerNames) {
        console.log(`Collision layer "${layerName}" created and configured`);
      }
      for (const layerName of collisionBootstrap.failedLayerNames) {
        console.warn(`Failed to create collision layer "${layerName}"`);
      }

      const collisionInitData = collisionBootstrap.collisionInitData;
      if (!collisionInitData) {
        return;
      }

      this.collisionArray = collisionInitData.collisionArray;
      this.permanentBlockedTiles = collisionInitData.permanentBlockedTiles;

      this.flowWaterManager = new FlowWaterVisualManager(
        this.map,
        this.tiledMapData,
        collisionInitData.pontoonTiles,
        (x, y) => this.getCollisionAt(x, y),
        (x, y, t) => this.setCollisionAt(x, y, t),
        (x, y) => this.isPermanentlyBlocked(x, y),
      );
    } else {
      console.warn('No collision layers found in map');
    }

    // Setup bridges layer for completed puzzles
    const bridgesLayerData = this.map.getLayer(OverworldBridgeManager.getBridgesLayerName());
    console.log(`Looking for bridges layer '${OverworldBridgeManager.getBridgesLayerName()}': ${bridgesLayerData ? 'FOUND' : 'NOT FOUND'}`);

    if (bridgesLayerData) {
      console.log(`Creating bridges layer with tilesets`);
      const bridgesLayer = this.createBridgesLayerForMap(tilesets, { requireDeclaredLayer: true });

      if (bridgesLayer) {
        this.bridgesLayer = bridgesLayer;
        const layerTilesets = bridgesLayer.layer.tilemapLayer?.tileset || [];
        console.log(`Bridges layer created successfully: depth=${bridgesLayer.depth}, visible=${bridgesLayer.visible}, alpha=${bridgesLayer.alpha}`);
        console.log(`Bridges layer tilesets: ${layerTilesets.map((ts: any) => ts.name).join(', ')}`);
        console.log('Bridge manager will be created after tiledMapData loads in initializeOverworldPuzzles()');
      } else {
        console.error('Failed to create bridges layer!');
      }
    } else {
      console.warn('No bridges layer found in map');
    }
  }

  private findPlayerStartPosition(): { x: number; y: number } {
    try {
      // Check for test mode override
      if (isTestMode()) {
        const testConfig = getTestConfig();
        if (testConfig.playerStartID && this.playerStartManager) {
          const startPos = this.playerStartManager.getStartByID(testConfig.playerStartID);
          if (startPos) {
            console.log(`[TEST] Using player start "${testConfig.playerStartID}" at (${startPos.x}, ${startPos.y})`);
            return { x: startPos.x, y: startPos.y };
          } else {
            console.warn(`[TEST] Player start "${testConfig.playerStartID}" not found, using default`);
          }
        }
      }

      // Use PlayerStartManager if available
      if (this.playerStartManager) {
        const defaultStart = this.playerStartManager.getDefaultStart();
        if (defaultStart) {
          console.log('Using default player start:', defaultStart);
          return { x: defaultStart.x, y: defaultStart.y };
        }
      }

      // Fallback: look for any player start in scene transitions layer
      const sceneTransitionsLayer = this.map.getObjectLayer('sceneTransitions');
      if (sceneTransitionsLayer) {
        const playerStartObj = sceneTransitionsLayer.objects.find(obj =>
          obj.name === 'player start'
        );

        if (playerStartObj) {
          console.log('Found player start object (fallback):', playerStartObj);
          return {
            x: playerStartObj.x || 0,
            y: playerStartObj.y || 0
          };
        }
      }
    } catch (error) {
      console.warn('Error finding player start position:', error);
    }

    // Final fallback to center of map
    const centerX = this.map.widthInPixels / 2;
    const centerY = this.map.heightInPixels / 2;
    console.warn('Player start not found, using map center:', centerX, centerY);
    return { x: centerX, y: centerY };
  }

  update(_time: number, delta: number) {
    this.updateExplorationScene(_time, delta);
  }

  private loadOverworldCameraZones(): void {
    const layers = this.tiledMapData?.layers ?? [];
    this.overworldCameraZones = OverworldCameraZones.fromTiledLayers(layers);
    console.log(
      `Loaded ${this.overworldCameraZones.getScopeZones().length} camera scope zone(s) and ` +
      `${this.overworldCameraZones.getZoomZones().length} camera zoom zone(s)`
    );
  }

  private refreshOverworldCamera(options: { immediate?: boolean; force?: boolean } = {}): void {
    if (!this.player) {
      return;
    }

    const target = this.overworldCameraZones.resolveAt(
      this.player.x,
      this.player.y,
      this.cameraManager.getDefaultFollowZoom()
    );
    this.cameraManager.applyOverworldTarget(this.player, target, options);
  }

  /**
   * Called when OverworldScene wakes (e.g. after returning from InteriorScene).
   * Repositions the player, re-enables movement, and restores the warp button.
   */
  private onWake(data?: { returnPlayerX?: number; returnPlayerY?: number; fadeInDurationMs?: number }): void {
    const logWakeComplete = (): void => {
      console.log('[OverworldScene] Woke from interior; player controls restored');
    };

    // Reposition the player at the tile they stood on before entering the building
    if (data?.returnPlayerX !== undefined && data?.returnPlayerY !== undefined) {
      this.player?.setPosition(data.returnPlayerX, data.returnPlayerY);
    }

    // Clear the "inside interior" flag now that we're back in the overworld
    this.gameState.clearCurrentInterior();

    // Show the warp button again
    this.overworldHUD?.setWarpButtonVisible(true);

    // Persist the cleared interior state
    this.saveGameState();

    // Reset step-hotspot tracking to the current tile so the player doesn't
    // immediately re-trigger the portal they just exited if it happens to be
    // on or near their return position.
    if (this.player && this.tiledMapData) {
      const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);
      this.lastCheckedTile = `${tileX},${tileY}`;
    } else {
      this.lastCheckedTile = '';
    }

    this.refreshOverworldCamera({ immediate: true, force: true });

    if (data?.fadeInDurationMs) {
      const hud = this.overworldHUD;
      if (hud) {
        void SceneTransitionCoordinator.fadeInAndEnable({
          scene: this,
          playerController: this.playerController,
          hud,
          onEnable: () => {
            this.isPointerHeld = false;
          },
        }, data.fadeInDurationMs).then(() => {
          logWakeComplete();
        });
        return;
      }
    }

    SceneTransitionCoordinator.enableInteraction({
      scene: this,
      playerController: this.playerController,
      onEnable: () => {
        this.isPointerHeld = false;
      },
    });
    logWakeComplete();
  }

  // ── Persistence helpers ───────────────────────────────────────────────────

  /** Persist the current game state to localStorage. */
  public saveGameState(): void {
    try {
      const data = this.gameState.exportState();
      localStorage.setItem('archipelago_game_state', JSON.stringify(data));
    } catch (e) {
      console.warn('[OverworldScene] Failed to save game state:', e);
    }
  }

  /** Load previously persisted game state from localStorage (best-effort). */
  private loadGameState(): void {
    try {
      const saved = localStorage.getItem('archipelago_game_state');
      this.shouldShowNewGameIntro = !saved;
      if (saved) {
        this.gameState.importState(JSON.parse(saved));
        console.log('[OverworldScene] Game state loaded from localStorage');
      } else {
        console.log('[OverworldScene] No saved game state found; intro dialogue will be shown');
      }
    } catch (e) {
      this.shouldShowNewGameIntro = true;
      console.warn('[OverworldScene] Failed to load game state:', e);
    }
  }

  /**
   * Show an onboarding dialogue on a fresh game before allowing exploration.
   * Uses ConversationScene with plain English text rather than glyph language.
   */
  private showNewGameIntroDialogue(): void {
    this.shouldShowNewGameIntro = false;

    this.gameMode = 'conversation';
    this.playerController?.stopAndIdle();
    this.playerController?.setEnabled(false);
    this.interactionCursor?.hide();

    const introText =
      'Thank you for playtesting! Pretend you\'ve just seen a beautifully animated cutscene of you, a builder character, getting shipwrecked on an island. Build bridges to find your way around. Click or tap anywhere to move. Or use arrow keys/WASD and Space/E/Enter.';

    const startIntroConversation = (): void => {
      const conversationScene = this.scene.get('ConversationScene') as ConversationScene | null;
      if (!conversationScene) {
        console.error('[OverworldScene] ConversationScene not found for new-game intro');
        this.gameMode = 'exploration';
        SceneTransitionCoordinator.enableInteraction({
          scene: this,
          playerController: this.playerController,
          onEnable: () => {
            this.isPointerHeld = false;
          },
        });
        return;
      }

      conversationScene.showEnglishMessage(
        introText,
        'Start exploring',
        () => {
          this.gameMode = 'exploration';
          this.scene.stop('ConversationScene');
          SceneTransitionCoordinator.enableInteraction({
            scene: this,
            playerController: this.playerController,
            onEnable: () => {
              this.isPointerHeld = false;
            },
          });
        }
      );
    };

    if (!this.scene.isActive('ConversationScene')) {
      this.scene.launch('ConversationScene');
      const conversationScene = this.scene.get('ConversationScene') as ConversationScene | null;
      conversationScene?.events.once('create', startIntroConversation);
      return;
    }

    startIntroConversation();
  }

  /**
   * Get collision type at a specific tile position
   */
  public getCollisionAt(tileX: number, tileY: number): CollisionType {
    if (tileY < 0 || tileY >= this.collisionArray.length) return CollisionType.BLOCKED;
    if (tileX < 0 || tileX >= this.collisionArray[0].length) return CollisionType.BLOCKED;
    return this.collisionArray[tileY][tileX] as CollisionType;
  }

  /**
   * Check if a tile position has collision (for backward compatibility)
   * Returns true if the tile is blocked, false otherwise
   */
  public hasCollisionAt(tileX: number, tileY: number): boolean {
    return this.getCollisionAt(tileX, tileY) === CollisionType.BLOCKED;
  }

  /**
   * Update collision at a specific tile position.
   * Updates the collisionArray so that PlayerController.tryMove sees the new value
   * on the next frame.
   */
  public setCollisionAt(tileX: number, tileY: number, collisionType: CollisionType) {
    if (tileY < 0 || tileY >= this.collisionArray.length) return;
    if (tileX < 0 || tileX >= this.collisionArray[0].length) return;
    this.collisionArray[tileY][tileX] = collisionType;
  }

  /**
   * Returns true if this tile was statically marked as BLOCKED by Tiled collision-layer
   * properties (collides=true / walkable=false) at map-load time.
   * Water propagation and pontoon logic must never change these tiles.
   */
  public isPermanentlyBlocked(tileX: number, tileY: number): boolean {
    return this.permanentBlockedTiles.has(`${tileX},${tileY}`);
  }

  // === OVERWORLD PUZZLE METHODS ===

  /**
   * Set up puzzle interaction checking
   */
  private setupPuzzleInteraction(): void {
    this.setupExplorationInteractionInput();
  }

  /**
   * Get debug info about overworld puzzle system
   */
  public getOverworldPuzzleDebugInfo(): any {
    return {
      gameState: this.gameState.getDebugInfo(),
      puzzleStats: this.puzzleManager.getStats(),
      cameraInPuzzleView: this.cameraManager.isInPuzzleView(),
      activePuzzle: this.gameState.getActivePuzzle()?.id
    };
  }

  /**
   * Get player position for testing
   */
  public getPlayerPosition(): { x: number; y: number; tileX: number; tileY: number } | null {
    if (!this.player || !this.tiledMapData) return null;
    const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);
    return {
      x: this.player.x,
      y: this.player.y,
      tileX,
      tileY
    };
  }

  /**
   * Teleport the player to a player-start position.
   * Called via callback from OverworldHUDScene when the player picks a warp destination.
   */
  private warpToStart(start: PlayerStartPosition): void {
    if (!this.player) return;
    this.player.setPosition(start.x, start.y);
    this.playerController?.clearTargetPosition();
    this.refreshOverworldCamera({ immediate: true, force: true });
    console.log(`[Warp] Teleported player to "${start.id}" at (${start.x}, ${start.y})`);
  }
}
