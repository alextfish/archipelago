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
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';
import { RoofManager } from '@view/RoofManager';
import { NPC } from '@model/conversation/NPC';
import type { ConversationSpec } from '@model/conversation/ConversationData';
import { attachTestMarker, isTestMode, getTestConfig } from '@helpers/TestMarkers';
import { emitTestEvent } from '@helpers/TestEvents';
import { NPCSeriesState } from '@model/conversation/NPCSeriesState';
import { SeriesFactory, SeriesManager } from '@model/series/SeriesFactory';
import { FilePuzzleLoader, LocalStorageProgressStore } from '@model/series/SeriesLoaders';
import { NPCIconConfig } from '@view/NPCIconConfig';
import { Door } from '@model/overworld/Door';
import { PlayerStartManager } from '@model/overworld/PlayerStartManager';
import { getDoorSpriteFrame } from '@view/DoorSpriteRegistry';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { CollisionTileClassifier } from '@model/overworld/CollisionTileClassifier';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { RiverChannelExtractor } from '@model/overworld/RiverChannelExtractor';
import { WaterPropagationEngine } from '@model/overworld/WaterPropagationEngine';
import type { TranslationModeScene } from '@view/scenes/TranslationModeScene';
import type { ConversationScene } from '@view/scenes/ConversationScene';
import { GridToWorldMapper } from '@view/GridToWorldMapper';

/**
 * Overworld scene for exploring the map and finding puzzles
 */
export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private playerController?: PlayerController;
  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayers: Phaser.Tilemaps.TilemapLayer[] = []; // All source collision layers from Tiled
  private bridgesLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionArray: number[][] = [];
  private gameMode: 'exploration' | 'conversation' | 'puzzle' = 'exploration';
  private isExitingPuzzle: boolean = false; // Guard to prevent re-entrant exit calls
  private isPointerHeld: boolean = false; // Track if pointer is held down for continuous movement

  // Overworld puzzle system
  private puzzleManager: OverworldPuzzleManager;
  private gameState: OverworldGameState;
  private collisionManager: CollisionManager;
  private bridgeManager?: OverworldBridgeManager;
  private cameraManager: CameraManager;
  private puzzleController?: OverworldPuzzleController; // New: replaces direct puzzle management
  private tiledMapData?: any;
  private gridMapper!: GridToWorldMapper;

  // Store pointer handlers so we can restore them after puzzle mode
  private puzzleEntryPointerHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerUpHandler?: () => void;

  // Interaction cursor system
  private interactionCursor?: InteractionCursor;
  private interactables: Interactable[] = [];

  // NPC and conversation system
  private npcs: NPC[] = [];
  private npcSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private npcIcons: Map<string, Phaser.GameObjects.Image> = new Map();
  private npcSeriesStates: Map<string, NPCSeriesState> = new Map();
  private constraintNumberSprites: Map<string, Phaser.GameObjects.Sprite> = new Map(); // Bridge count numbers for constraint NPCs
  private seriesManager?: SeriesManager;

  // Roof hiding system
  private roofManager?: RoofManager;
  private roofsLayers: Phaser.Tilemaps.TilemapLayer[] = [];

  // FlowPuzzle water visuals: GIDs removed from the water Tiled layer so that dried-up river
  // tiles look dry in the overworld. Keyed by "tileX,tileY". Stored so the tile can be
  // restored if the player re-enters and re-floods those squares.
  private waterTileGidCache: Map<string, { gid: number; layerName: string }> = new Map();

  /** Merged tile data from all Tiled `water` layers — built once at load time and used by
   * RiverChannelExtractor to trace inter-puzzle river channels. */
  private mergedWaterLayerData?: number[];

  /** Registry of pontoon tiles found on "pontoons" layers at map-load time.
   * Keyed by "tileX,tileY". Each entry carries enough data to swap the tile and
   * update its collision when the water level at that position changes. */
  private pontoonTiles: Map<string, {
    tileX: number;
    tileY: number;
    /** Current GID on the pontoons Tiled layer. */
    currentGID: number;
    /** Layer name the tile lives on (e.g. "Forest/pontoons"). */
    layerName: string;
    /** Whether the current tile variant is the high-water (raised) version. */
    isHigh: boolean;
    /** Signed offset to add to currentGID to produce the alternate variant. */
    toggleOffset: number;
  }> = new Map();

  // Door system
  private doors: Door[] = [];
  private doorSprites: Map<string, Phaser.Tilemaps.Tile> = new Map();

  // Player start position management
  private playerStartManager?: PlayerStartManager;

  // Active series tracking (for navigation)
  private currentSeries: any = null;
  private currentSeriesPuzzleData: Map<string, any> = new Map();

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
    this.load.spritesheet('sailorNS', 'resources/sprites/sailorNS.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet('sailorEW', 'resources/sprites/sailorEW.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    // Load NPC expression sprites for constraint feedback
    this.load.image('sailorNS happy', 'resources/sprites/sailorNS happy.png');
    this.load.image('sailorNS frown', 'resources/sprites/sailorNS frown.png');
    this.load.image('sailorEW happy', 'resources/sprites/sailorEW happy.png');
    this.load.image('sailorEW sad', 'resources/sprites/sailorEW sad.png');
    this.load.image('Ruby happy', 'resources/sprites/Ruby happy.png');
    this.load.image('Ruby frown', 'resources/sprites/Ruby frown.png');
    this.load.image('Ruby neutral', 'resources/sprites/Ruby neutral.png');
    this.load.spritesheet('Ruby', 'resources/sprites/Ruby neutral.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet('Lyuba', 'resources/sprites/Lyuba neutral.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.image('Lyuba happy', 'resources/sprites/Lyuba happy.png');
    this.load.image('Lyuba frown', 'resources/sprites/Lyuba frown.png');
    this.load.image('Lyuba neutral', 'resources/sprites/Lyuba neutral.png');
    this.load.image('LyubaCleric', 'resources/sprites/LyubaCleric.png');
    this.load.image('Mage1', 'resources/sprites/Mage1.png');
    this.load.image('Mage2', 'resources/sprites/Mage2.png');
    this.load.image('Mage3', 'resources/sprites/Mage3.png');
    this.load.image('Mage4', 'resources/sprites/Mage4.png');
    this.load.image('Citizen1_Idle', 'resources/sprites/Citizen1_Idle.png');
    this.load.image('Citizen2_Idle', 'resources/sprites/Citizen2_Idle.png');
    this.load.image('Fighter2_Idle', 'resources/sprites/Fighter2_Idle.png');

    // Load high-resolution face sprites for conversations
    this.load.image('faces/Lyuba neutral', 'resources/sprites/faces/Lyuba neutral.png');
    this.load.image('faces/Lyuba happy', 'resources/sprites/faces/Lyuba happy.png');
    this.load.image('faces/Lyuba frown', 'resources/sprites/faces/Lyuba frown.png');
    this.load.image('faces/Lyuba cleric neutral', 'resources/sprites/faces/Lyuba cleric neutral.png');
    this.load.image('faces/Lyuba cleric happy', 'resources/sprites/faces/Lyuba cleric happy.png');
    this.load.image('faces/Lyuba cleric frown', 'resources/sprites/faces/Lyuba cleric frown.png');
    this.load.image('faces/Lyuba cleric vhappy', 'resources/sprites/faces/Lyuba cleric vhappy.png');
    this.load.image('faces/Lyuba cleric wink', 'resources/sprites/faces/Lyuba cleric wink.png');
    this.load.image('faces/Ruby neutral', 'resources/sprites/faces/Ruby neutral.png');
    this.load.image('faces/Ruby happy', 'resources/sprites/faces/Ruby happy.png');
    this.load.image('faces/Ruby frown', 'resources/sprites/faces/Ruby frown.png');
    this.load.image('faces/Ruby vhappy', 'resources/sprites/faces/Ruby vhappy.png');
    this.load.image('faces/Ruby wink', 'resources/sprites/faces/Ruby wink.png');

    // Load language tileset for speech bubbles in constraint feedback
    this.load.spritesheet('language', 'resources/tilesets/language.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load bridge counts spritesheet for constraint NPCs
    this.load.spritesheet('bridge counts', 'resources/sprites/bridge counts.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load NPC icon sprites (user will provide these files)
    this.load.image(NPCIconConfig.INCOMPLETE, 'resources/sprites/icon-incomplete.png');
    this.load.image(NPCIconConfig.COMPLETE, 'resources/sprites/icon-complete.png');

    // Load TMX file asynchronously, then load embedded tilesets
    this.loadTmxFile();
  }

  private async loadTmxFile() {
    try {
      console.log('Loading map file...');
      this.tiledMapData = await MapUtils.loadTiledMap('resources/overworld.json');

      // Initialize player start manager as soon as map data is available
      this.playerStartManager = new PlayerStartManager(this.tiledMapData);
      console.log('Player start manager initialized with', this.playerStartManager.getAllStarts().length, 'start positions');

      // Load embedded tilesets from the map data
      this.loadEmbeddedTilesets(this.tiledMapData);

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
  private loadEmbeddedTilesets(tiledMapData: any): void {
    if (!tiledMapData || !tiledMapData.tilesets) {
      return;
    }

    console.log(`Checking ${tiledMapData.tilesets.length} tilesets for embedded images...`);

    for (const tileset of tiledMapData.tilesets) {
      // Embedded tilesets have the 'image' property as a data URL or a relative path
      // They might also have 'tiles' array with individual tile images
      if (tileset.image && !tileset.image.startsWith('resources/')) {
        // This is likely an embedded tileset or uses a different path convention
        const tilesetKey = `tileset_${tileset.name}`;

        console.log(`Loading embedded tileset: ${tileset.name} (key: ${tilesetKey})`);

        // If the image is a data URL, load it directly
        if (tileset.image.startsWith('data:')) {
          this.load.image(tilesetKey, tileset.image);
        } else {
          // Otherwise, it's a relative path - construct the full path
          let imagePath: string;
          if (tileset.image.startsWith('../')) {
            // Remove ../ prefix
            imagePath = tileset.image.substring(3);
          } else if (tileset.image.startsWith('tilesets/')) {
            // Already has tilesets/ prefix, just add resources/
            imagePath = `resources/${tileset.image}`;
          } else {
            // No prefix, add full path
            imagePath = `resources/tilesets/${tileset.image}`;
          }
          console.log(`  Loading from path: ${imagePath}`);
          this.load.image(tilesetKey, imagePath);
        }
      } else if (tileset.image) {
        console.log(`Tileset ${tileset.name} uses external image: ${tileset.image}`);
      } else {
        console.log(`Tileset ${tileset.name} has no image property (may be a collection)`);
      }
    }

    // Start the loader if we added any new assets
    if (!this.load.isLoading() && this.load.totalToLoad > 0) {
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
    // Wait for map loading if needed
    if (!this.cache.tilemap.exists('overworldMap')) {
      console.log('Waiting for map to load...');
      this.time.delayedCall(100, () => this.create(), [], this);
      return;
    }

    // Create the tilemap
    this.map = this.make.tilemap({ key: 'overworldMap' });
    this.gridMapper = new GridToWorldMapper(this.tiledMapData?.tilewidth ?? 32);

    // Add all tilesets (both external and embedded)
    const tilesets = this.loadAllTilesets();

    if (tilesets.length === 0) {
      console.error('Failed to load any tilesets');
      return;
    }

    console.log(`Loaded ${tilesets.length} tilesets successfully`);

    // Auto-create all visual layers
    this.setupVisualLayers(tilesets);

    // Create collision layers
    this.setupCollisionLayer(tilesets);

    // Create roofs layers (should be above player)
    this.setupRoofsLayer(tilesets);

    // Set world bounds to match map size
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;

    // Find player starting position (PlayerStartManager should be initialized from preload)
    const playerStart = this.findPlayerStartPosition();

    // Create player sprite (no physics body — movement is handled by PlayerController.tryMove)
    this.player = this.add.sprite(playerStart.x, playerStart.y, 'player', 0);

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
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = true; // avoid subpixel gaps

    // Set up input and player controller
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.playerController = new PlayerController(this, this.player, this.cursors, (x, y) => this.getCollisionAt(x, y));

    console.log('Overworld scene created successfully');
    console.log(`Map size: ${mapWidth}x${mapHeight}`);
    console.log(`Player start: (${playerStart.x}, ${playerStart.y})`);

    // Initialize shared puzzle HUD
    PuzzleHUDManager.getInstance().initializeHUD(this);

    // Listen for series puzzle completion from BridgePuzzleScene
    this.events.on('seriesPuzzleCompleted', this.handleSeriesPuzzleCompleted, this);

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

        // Restore completed puzzle bridges
        this.bridgeManager.restoreCompletedPuzzles(
          this.gameState,
          (puzzleId: string) => {
            const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
            return bounds ? new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height) : null;
          }
        );
      }

      // Load all puzzles from the map
      const puzzles = this.puzzleManager.loadPuzzlesFromMap(this.tiledMapData);
      console.log(`Loaded ${puzzles.size} overworld puzzles`);

      // Apply initial water blocking for FlowPuzzles.
      // Each FlowPuzzle computes its water state on construction; those tiles must
      // be blocked (both high and low ground) so the player cannot walk through
      // flowing water before solving the puzzle.
      this.applyInitialFlowPuzzleCollision(puzzles);

      // Merge all `water` Tiled layers into a single master grid, then wire up
      // RiverChannelExtractor / WaterPropagationEngine so that downstream puzzles
      // (e.g. flowPuzzle2) receive edge inputs from upstream sources (e.g. flowPuzzle1).
      this.mergedWaterLayerData = this.buildMergedWaterLayer();
      this.wireRiverChannels(puzzles);

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

    } catch (error) {
      console.error('Failed to initialize overworld puzzles:', error);
    }
  }

  /**
   * Block overworld tiles occupied by flowing water for every unsolved FlowPuzzle.
   * Called once at map load, after all puzzles are created (and their initial
   * water state has been computed in each FlowPuzzle constructor).
   */
  private applyInitialFlowPuzzleCollision(puzzles: Map<string, import('@model/puzzle/BridgePuzzle').BridgePuzzle>): void {
    if (!this.tiledMapData) return;

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

      // Set initial pontoon states to match water level
      this.updatePontoonVisuals(puzzle, puzzleBounds);
    }
  }

  /**
   * Build a single flat tile-data array by OR-merging all Tiled `water` layers.
   * Any position that is non-zero in any water layer is non-zero in the result.
   * Stored on the scene so the merged grid is only computed once at load time.
   */
  private buildMergedWaterLayer(): number[] | undefined {
    if (!this.tiledMapData) return undefined;

    const mapWidth: number = this.tiledMapData.width ?? 0;
    const mapHeight: number = this.tiledMapData.height ?? 0;
    const merged = new Array<number>(mapWidth * mapHeight).fill(0);

    const waterLayers = TiledLayerUtils.findTileLayersByName(this.tiledMapData.layers, 'water');
    console.log(`[MergedWater] Merging ${waterLayers.length} water layer(s) into master grid`);

    for (const layer of waterLayers) {
      const data: number[] = layer.data.data ?? [];
      for (let i = 0; i < data.length; i++) {
        if (data[i] && data[i] > 0) {
          merged[i] = data[i]; // last-writer-wins; any non-zero value marks a water tile
        }
      }
    }

    const waterTileCount = merged.filter(v => v > 0).length;
    console.log(`[MergedWater] Master grid has ${waterTileCount} water tiles`);
    return merged;
  }

  /** Infer the edge direction of a flow-square that sits on the border of a puzzle region. */
  private static inferEdgeDirection(
    lx: number, ly: number, width: number, height: number
  ): 'N' | 'S' | 'E' | 'W' {
    if (ly === 0) return 'N';
    if (ly === height - 1) return 'S';
    if (lx === 0) return 'W';
    if (lx === width - 1) return 'E';
    // Fallback for interior edge outputs — treat as East (shouldn't occur for valid edge outputs)
    return 'E';
  }

  /**
   * Wire up RiverChannelExtractor → WaterPropagationEngine → OverworldGameState for
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

      const tileX = Math.floor(pixelBounds.x / tileW);
      const tileY = Math.floor(pixelBounds.y / tileH);
      const width = Math.round(pixelBounds.width / tileW);
      const height = Math.round(pixelBounds.height / tileH);

      const edgeTiles: { x: number; y: number; edge: 'N' | 'S' | 'E' | 'W' }[] = [];
      for (let ly = 0; ly < puzzle.height; ly++) {
        for (let lx = 0; lx < puzzle.width; lx++) {
          const isBorder = lx === 0 || lx === puzzle.width - 1 || ly === 0 || ly === puzzle.height - 1;
          if (isBorder && puzzle.getFlowSquare(lx, ly)) {
            edgeTiles.push({
              x: lx,
              y: ly,
              edge: OverworldScene.inferEdgeDirection(lx, ly, width, height),
            });
          }
        }
      }

      puzzleRegions.set(puzzleId, { bounds: { tileX, tileY, width, height }, edgeTiles });
      console.log(
        `[RiverChannels] Puzzle "${puzzleId}": tile origin (${tileX},${tileY}) ` +
        `${width}×${height}, ${edgeTiles.length} edge output(s)`
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

    const channels = RiverChannelExtractor.extractChannels(syntheticMapData, MERGED_LAYER_NAME, puzzleRegions);

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
            this.updatePontoonVisuals(targetPuzzle, targetBounds);
            this.updateFlowWaterVisuals(targetPuzzle, targetBounds);
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
          const pontoon = this.pontoonTiles.get(key);
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
   * Update pontoon tiles within a FlowPuzzle's bounds to match the current water state.
   *
   * When a pontoon tile's position has water: ensure it shows the high-water (isHigh) variant
   * and is WALKABLE. When dry: ensure it shows the low-water (!isHigh) variant and is
   * WALKABLE_LOW.
   *
   * The tile is swapped on the Tiled "pontoons" layer using the stored toggleOffset, and the
   * pontoonTiles registry entry is updated to reflect the new state.
   */
  private updatePontoonVisuals(puzzle: FlowPuzzle, puzzleBounds: { x: number; y: number }): void {
    if (!this.tiledMapData) return;

    const tileW: number = this.tiledMapData.tilewidth ?? 32;
    const tileH: number = this.tiledMapData.tileheight ?? 32;
    const originTileX = Math.floor(puzzleBounds.x / tileW);
    const originTileY = Math.floor(puzzleBounds.y / tileH);

    for (let ly = 0; ly < puzzle.height; ly++) {
      for (let lx = 0; lx < puzzle.width; lx++) {
        const tileX = originTileX + lx;
        const tileY = originTileY + ly;
        const key = `${tileX},${tileY}`;

        const pontoon = this.pontoonTiles.get(key);
        if (!pontoon) continue;

        const waterHere = puzzle.tileHasWater(lx, ly);
        const shouldBeHigh = waterHere;

        if (pontoon.isHigh === shouldBeHigh) continue; // already correct variant

        // Swap to alternate variant
        const newGID = pontoon.currentGID + pontoon.toggleOffset;

        // Update the pontoons Phaser layer
        const layerData = this.map.layers.find(l => l.name === pontoon.layerName);
        if (layerData?.tilemapLayer) {
          layerData.tilemapLayer.putTileAt(newGID, tileX, tileY);
        }

        // Update collision
        const newCollisionType = shouldBeHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
        this.setCollisionAt(tileX, tileY, newCollisionType);

        // Update registry to reflect new state. The next toggle is the inverse offset.
        pontoon.currentGID = newGID;
        pontoon.isHigh = shouldBeHigh;
        pontoon.toggleOffset = -pontoon.toggleOffset;
      }
    }
  }

  /**
   * Update the overworld water-tile visuals for a FlowPuzzle after it is exited.
   *
   * Tiles that no longer have water are visually dried up by removing their tile
   * from the Tiled water layer (the GID is cached for restoration). Tiles that
   * have water again get their original tile GID restored.
   */
  public updateFlowWaterVisuals(puzzle: FlowPuzzle, puzzleBounds: { x: number; y: number }): void {
    if (!this.tiledMapData) return;

    const tileW: number = this.tiledMapData.tilewidth ?? 32;
    const tileH: number = this.tiledMapData.tileheight ?? 32;

    // Collect all water Tiled layers (e.g. "Forest/water", "Beach/water")
    const waterLayerData = this.findLayersBySuffix('water');

    const originTileX = Math.floor(puzzleBounds.x / tileW);
    const originTileY = Math.floor(puzzleBounds.y / tileH);

    for (let ly = 0; ly < puzzle.height; ly++) {
      for (let lx = 0; lx < puzzle.width; lx++) {
        if (!puzzle.getFlowSquare(lx, ly)) continue; // only flow squares have water tiles

        const tileX = originTileX + lx;
        const tileY = originTileY + ly;
        const key = `${tileX},${tileY}`;

        if (puzzle.tileHasWater(lx, ly)) {
          // Restore the water tile if we previously removed it
          const cached = this.waterTileGidCache.get(key);
          if (cached) {
            const ld = waterLayerData.find(l => l.name === cached.layerName);
            if (ld?.tilemapLayer) {
              ld.tilemapLayer.putTileAt(cached.gid, tileX, tileY);
            }
            this.waterTileGidCache.delete(key);
          }
        } else {
          // Remove the water tile so dried-up riverbed shows beneath it
          if (!this.waterTileGidCache.has(key)) {
            for (const ld of waterLayerData) {
              const tile = ld.tilemapLayer?.getTileAt(tileX, tileY);
              if (tile) {
                this.waterTileGidCache.set(key, { gid: tile.index, layerName: ld.name });
                ld.tilemapLayer!.removeTileAt(tileX, tileY);
                break;
              }
            }
          }
        }
      }
    }

    // Update pontoons to match the current water state
    this.updatePontoonVisuals(puzzle, puzzleBounds);
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

    // Get all puzzle definitions
    const puzzles = this.puzzleManager.getAllPuzzles();

    // For each puzzle, add its entry tiles as interactables
    for (const [puzzleId] of puzzles) {
      const definition = this.puzzleManager.getPuzzleDefinitionById(puzzleId);
      if (!definition) continue;

      // Get the puzzle bounds in tile coordinates
      const bounds = this.puzzleManager.getPuzzleBounds(puzzleId);
      if (!bounds) continue;

      const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(bounds.x, bounds.y);
      const width = Math.ceil(bounds.width / this.tiledMapData.tilewidth);
      const height = Math.ceil(bounds.height / this.tiledMapData.tileheight);

      // Add all tiles in the puzzle area as potential entry points
      // (We'll validate actual entry tiles when attempting to enter)
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const entryTileX = tileX + dx;
          const entryTileY = tileY + dy;

          // Check if this is actually a valid entry tile
          if (this.isPuzzleEntryTile(entryTileX, entryTileY)) {
            this.interactables.push({
              type: 'puzzle',
              tileX: entryTileX,
              tileY: entryTileY,
              data: { puzzleId }
            });
          }
        }
      }
    }

    // Load NPCs from the "npcs" object layer
    this.loadNPCs();

    console.log(`Built interactables list with ${this.interactables.length} entries (${this.npcs.length} NPCs)`);
  }

  /**
   * Load NPCs from all "<anything>/npcs" object layers in the Tiled map
   */
  private loadNPCs(): void {
    if (!this.map || !this.tiledMapData) return;

    // Find all npcs object layers (including nested) in tiledMapData
    const npcsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'npcs');

    if (npcsLayers.length === 0) {
      console.log('No NPCs layers found in map');
      return;
    }

    console.log(`Found ${npcsLayers.length} NPC layers`);

    // Process all NPC layers
    for (const layerInfo of npcsLayers) {
      // Try both the full path and the simple name
      let npcsLayer = this.map.getObjectLayer(layerInfo.fullPath);
      if (!npcsLayer) {
        npcsLayer = this.map.getObjectLayer(layerInfo.name);
      }

      if (!npcsLayer) {
        console.warn(`Failed to get object layer: ${layerInfo.fullPath} or ${layerInfo.name}`);
        continue;
      }

      console.log(`Loading NPCs from layer: ${layerInfo.fullPath}`);
      this.loadNPCsFromLayer(npcsLayer, layerInfo.fullPath);
    }

    // Load series for NPCs and create icons (once after all NPCs loaded)
    this.loadNPCSeries();

    // Load constraint NPCs from overworld puzzles
    this.loadConstraintNPCs();

    // Load doors from object layers (once after all NPCs loaded)
    this.loadDoors();
  }


  /**
   * Load NPCs from a specific object layer
   */
  private loadNPCsFromLayer(npcsLayer: Phaser.Tilemaps.ObjectLayer, layerName: string): void {
    if (!npcsLayer.objects) {
      console.warn(`No objects in layer: ${layerName}`);
      return;
    }

    for (const obj of npcsLayer.objects) {
      if (!obj.name || typeof obj.x !== 'number' || typeof obj.y !== 'number') {
        console.warn(`Invalid NPC object in ${layerName}:`, obj);
        continue;
      }

      // Convert pixel coordinates to tile coordinates
      const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(obj.x, obj.y);

      // Get properties from Tiled object
      const properties = obj.properties as any[] | undefined;
      const conversationFile = properties?.find((p: any) => p.name === 'conversation')?.value;
      const conversationFileSolved = properties?.find((p: any) => p.name === 'conversationSolved')?.value;
      const seriesFile = properties?.find((p: any) => p.name === 'series')?.value;
      const language = properties?.find((p: any) => p.name === 'language')?.value || 'grass';
      const appearanceId = properties?.find((p: any) => p.name === 'appearance')?.value || 'sailorNS';

      // Create NPC instance
      // Use Tiled's unique object ID for npc.id to ensure uniqueness (multiple NPCs can share the same name)
      const npc = new NPC(
        String(obj.id),
        obj.name,
        tileX,
        tileY,
        language,
        appearanceId,
        conversationFile,
        conversationFileSolved,
        seriesFile
      );

      this.npcs.push(npc);

      // Add NPC to interactables list
      this.interactables.push({
        type: 'npc',
        tileX,
        tileY,
        data: { npc }
      });

      // Create NPC sprite at world coordinates
      // Tiled uses top-left for objects, so we need to add tileheight to get bottom position
      const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(tileX, tileY + 1); // Add 1 tile to match Tiled's top-left origin
      const sprite = this.add.sprite(worldX, worldY, appearanceId);
      sprite.setOrigin(0, 1); // Bottom-left origin to align with tile coordinates
      sprite.setDepth(worldY); // Use Y-sorting for depth
      this.npcSprites.set(npc.id, sprite);

      // Add test marker for automated testing
      if (isTestMode()) {
        attachTestMarker(this, sprite, {
          id: `npc-${npc.id}`,
          testId: `npc-${npc.id}`,
          width: this.tiledMapData.tilewidth,
          height: this.tiledMapData.tileheight,
          showBorder: true
        });
        console.log(`[TEST] Added test marker for NPC: ${npc.id} at tile (${tileX}, ${tileY}), world (${worldX}, ${worldY})`);
      }

      console.log(`Loaded NPC: ${npc.name} at (${tileX}, ${tileY}), language: ${language}, conversation: ${conversationFile || 'none'}, series: ${seriesFile || 'none'}`);
    }
  }

  /**
   * Load puzzle series for NPCs that have them and create icons
   */
  private async loadNPCSeries(): Promise<void> {
    for (const npc of this.npcs) {
      if (!npc.hasSeries()) {
        // NPC has no series, create state with null series
        const state = new NPCSeriesState(npc, null);
        this.npcSeriesStates.set(npc.id, state);
        continue;
      }

      try {
        // Load series JSON
        const seriesPath = npc.getSeriesPath();
        const response = await fetch(seriesPath);
        if (!response.ok) {
          console.warn(`Failed to load series for NPC ${npc.id}: ${response.statusText}`);
          const state = new NPCSeriesState(npc, null);
          this.npcSeriesStates.set(npc.id, state);
          continue;
        }

        const seriesJson = await response.json();
        const series = await this.seriesManager!.loadSeries(seriesJson);

        // Store puzzle data for launching
        if (seriesJson.puzzles) {
          for (const puzzle of seriesJson.puzzles) {
            if (puzzle.id && puzzle.puzzleData) {
              this.currentSeriesPuzzleData.set(puzzle.id, puzzle.puzzleData);
            }
          }
        }

        // Create state with loaded series
        const state = new NPCSeriesState(npc, series);
        this.npcSeriesStates.set(npc.id, state);

        // Create icon sprite if needed
        this.updateNPCIcon(npc);

        console.log(`Loaded series '${series.title}' for NPC ${npc.id}, icon state: ${state.getIconState()}`);
      } catch (error) {
        console.error(`Error loading series for NPC ${npc.id}:`, error);
        const state = new NPCSeriesState(npc, null);
        this.npcSeriesStates.set(npc.id, state);
      }
    }
  }

  /**
   * Update or create icon for an NPC based on their series state
   */
  private updateNPCIcon(npc: NPC): void {
    const state = this.npcSeriesStates.get(npc.id);
    if (!state) return;

    const iconState = state.getIconState();
    const npcSprite = this.npcSprites.get(npc.id);
    if (!npcSprite) return;

    // Remove existing icon if any
    const existingIcon = this.npcIcons.get(npc.id);
    if (existingIcon) {
      existingIcon.destroy();
      this.npcIcons.delete(npc.id);
    }

    // Create new icon if needed
    if (iconState !== 'none') {
      const iconKey = iconState === 'complete' ? NPCIconConfig.COMPLETE : NPCIconConfig.INCOMPLETE;
      const icon = this.add.image(
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

  /**
   * Load constraint NPCs from overworld puzzles
   * For each personified constraint, create an NPC that the player can interact with
   */
  private loadConstraintNPCs(): void {
    if (!this.puzzleManager || !this.tiledMapData) return;

    console.log('Loading constraint NPCs from overworld puzzles...');

    const puzzles = this.puzzleManager.getAllPuzzles();
    let constraintNPCCount = 0;

    for (const [puzzleId, puzzle] of puzzles) {
      // Skip puzzles with no constraints
      if (!puzzle.constraints || puzzle.constraints.length === 0) continue;

      for (const constraint of puzzle.constraints) {
        // Skip non-personified constraints
        if (!constraint.personified) continue;

        // Get display items to find which islands this constraint applies to
        const displayItems = constraint.getDisplayItems(puzzle);

        for (const item of displayItems) {
          // Find the island that this constraint applies to
          const island = puzzle.islands.find(i => i.id === item.elementID);
          if (!island) {
            console.warn(`Could not find island ${item.elementID} in puzzle ${puzzleId}`);
            continue;
          }

          // Get puzzle definition to convert puzzle coordinates to overworld coordinates
          const puzzleDefinition = this.puzzleManager.getPuzzleDefinitionById(puzzleId);
          if (!puzzleDefinition) {
            console.warn(`Could not find puzzle definition for ${puzzleId}`);
            continue;
          }

          // Convert puzzle coordinates to overworld tile coordinates
          // Puzzle bounds are in pixels, so convert to tiles first
          const { x: puzzleTileX, y: puzzleTileY } = this.gridMapper.worldToGrid(puzzleDefinition.bounds.x, puzzleDefinition.bounds.y);
          const overworldTileX = puzzleTileX + island.x;
          const overworldTileY = puzzleTileY + island.y;

          // Generate a unique NPC ID from the constraint and island
          const npcId = `constraint-${puzzleId}-${constraint.constructor.name}-${island.id}`;

          // Check if this NPC already exists (avoid duplicates)
          if (this.npcs.find(n => n.id === npcId)) {
            continue;
          }

          // Get conversation files from the constraint
          const conversationFile = constraint.conversationFile;
          const conversationFileSolved = constraint.conversationFileSolved;

          // Default appearance for constraint NPCs
          const appearanceId = item.constraintType === 'IslandBridgeCountConstraint' ? 'Ruby' : 'sailorNS';
          const language = 'grass'; // Default language for constraint NPCs

          // Create NPC instance
          const npc = new NPC(
            npcId,
            island.id, // Use island ID as NPC name for easier debugging
            overworldTileX,
            overworldTileY,
            language,
            appearanceId,
            conversationFile,
            conversationFileSolved,
            undefined // No series for constraint NPCs
          );

          this.npcs.push(npc);

          // Add NPC to interactables list
          this.interactables.push({
            type: 'npc',
            tileX: overworldTileX,
            tileY: overworldTileY,
            data: { npc }
          });

          // Create NPC sprite at world coordinates
          const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(overworldTileX, overworldTileY + 1);
          const sprite = this.add.sprite(worldX, worldY, appearanceId);
          sprite.setOrigin(0, 1);
          sprite.setDepth(worldY);
          this.npcSprites.set(npc.id, sprite);

          // Add bridge count number sprite for IslandBridgeCountConstraint
          if (item.constraintType === 'IslandBridgeCountConstraint' && item.requiredCount) {
            const count = item.requiredCount;
            if (count >= 1 && count <= 8) {
              const numberSprite = this.add.sprite(
                worldX + this.tiledMapData.tilewidth / 2,
                worldY - this.tiledMapData.tileheight / 2,
                'bridge counts',
                count - 1 // Frame index is count-1 for numbers 1-8
              );
              numberSprite.setOrigin(0.5, 0.5);
              numberSprite.setDepth(worldY + 1);
              this.constraintNumberSprites.set(npc.id, numberSprite);
            }
          }

          // Add test marker for automated testing
          if (isTestMode()) {
            attachTestMarker(this, sprite, {
              id: `npc-${npc.id}`,
              testId: `npc-${npc.id}`,
              width: this.tiledMapData.tilewidth,
              height: this.tiledMapData.tileheight,
              showBorder: true
            });
            console.log(`[TEST] Added test marker for constraint NPC: ${npc.id} at tile (${overworldTileX}, ${overworldTileY}), world (${worldX}, ${worldY})`);
          }

          constraintNPCCount++;
          console.log(`Loaded constraint NPC: ${npcId} at (${overworldTileX}, ${overworldTileY}), appearance: ${appearanceId}, conversation: ${conversationFile || 'none'}`);
        }
      }
    }

    console.log(`✓ Created ${constraintNPCCount} constraint NPCs from overworld puzzles`);
  }

  /**
   * Hide constraint NPCs (and their number sprites) for a specific puzzle.
   * Called when entering puzzle mode so EmbeddedPuzzleRenderer's NPCs are visible.
   */
  private hideConstraintNPCsForPuzzle(puzzleId: string): void {
    const prefix = `constraint-${puzzleId}-`;

    for (const [npcId, sprite] of this.npcSprites) {
      if (npcId.startsWith(prefix)) {
        sprite.setVisible(false);
      }
    }

    for (const [npcId, numberSprite] of this.constraintNumberSprites) {
      if (npcId.startsWith(prefix)) {
        numberSprite.setVisible(false);
      }
    }

    console.log(`Hidden constraint NPCs for puzzle: ${puzzleId}`);
  }

  /**
   * Show constraint NPCs (and their number sprites) for a specific puzzle.
   * Called when exiting puzzle mode to restore overworld NPCs.
   */
  private showConstraintNPCsForPuzzle(puzzleId: string): void {
    const prefix = `constraint-${puzzleId}-`;

    for (const [npcId, sprite] of this.npcSprites) {
      if (npcId.startsWith(prefix)) {
        sprite.setVisible(true);
      }
    }

    for (const [npcId, numberSprite] of this.constraintNumberSprites) {
      if (npcId.startsWith(prefix)) {
        numberSprite.setVisible(true);
      }
    }

    console.log(`Shown constraint NPCs for puzzle: ${puzzleId}`);
  }

  /**
   * Load doors from all "<anything>/doors" object layers in the Tiled map
   */
  private loadDoors(): void {
    if (!this.map || !this.tiledMapData) return;

    // Find all doors object layers (including nested) in tiledMapData
    const doorsLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'doors');

    if (doorsLayers.length === 0) {
      console.log('No doors layers found in map');
      return;
    }

    console.log(`Found ${doorsLayers.length} doors layers`);

    const tileWidth = this.tiledMapData.tilewidth || 32;
    const tileHeight = this.tiledMapData.tileheight || 32;

    // Process all doors layers
    for (const layerInfo of doorsLayers) {
      // Try both the full path and the simple name
      let doorsLayer = this.map.getObjectLayer(layerInfo.fullPath);
      if (!doorsLayer) {
        doorsLayer = this.map.getObjectLayer(layerInfo.name);
      }

      if (!doorsLayer) {
        console.warn(`Failed to get object layer: ${layerInfo.fullPath} or ${layerInfo.name}`);
        continue;
      }

      console.log(`Loading doors from layer: ${layerInfo.fullPath}`);

      for (const obj of doorsLayer.objects) {
        try {
          const door = Door.fromTiledObject(obj, tileWidth, tileHeight);
          this.doors.push(door);

          // Create door sprite(s) for visual representation
          this.createDoorSprites(door);

          console.log(`Loaded door: ${door.id} at positions:`, door.getPositions(),
            door.seriesId ? `linked to series: ${door.seriesId}` : 'no series link',
            door.spriteId ? `sprite: ${door.spriteId}` : 'no sprite',
            `locked: ${door.isLocked()}`);
        } catch (error) {
          console.error('Error loading door from object:', obj, error);
        }
      }
    }

    // Register doors with collision manager
    if (this.doors.length > 0) {
      this.collisionManager.registerDoors(this.doors);
      console.log(`Registered ${this.doors.length} doors with collision manager`);
    }
  }

  /**
   * Create door sprites for visual representation
   */
  private createDoorSprites(door: Door): void {
    if (!door.spriteId) {
      console.warn(`Door ${door.id} has no spriteId, cannot create sprite`);
      return;
    }

    // Get the appropriate sprite frame based on locked state (local frame within tileset)
    const localFrameIndex = getDoorSpriteFrame(door.spriteId, door.isLocked());
    if (localFrameIndex === null) {
      console.warn(`Could not get sprite frame for door ${door.id} with spriteId ${door.spriteId}`);
      return;
    }

    // Get the terrains tileset
    const terrainsTileset = this.map.getTileset('terrains');
    if (!terrainsTileset) {
      console.error('Could not find terrains tileset for door sprites');
      return;
    }

    // Convert local frame index to global tile index
    // putTileAt expects a global index, so add the tileset's firstgid
    const globalTileIndex = terrainsTileset.firstgid + localFrameIndex;
    console.log(`Door ${door.id}: spriteId=${door.spriteId}, locked=${door.isLocked()}, localFrame=${localFrameIndex}, terrains.firstgid=${terrainsTileset.firstgid}, globalIndex=${globalTileIndex}`);

    // Find an appropriate layer to place the door sprite
    // Doors should be on a layer that renders above ground but below player
    // Prefer the buildings layer, fallback to obstacles, then any suitable layer
    let targetLayer: Phaser.Tilemaps.TilemapLayer | null = null;

    // Try buildings layer first (best for doors)
    const buildingsLayer = this.map.getLayer('buildings');
    if (buildingsLayer && buildingsLayer.tilemapLayer) {
      targetLayer = buildingsLayer.tilemapLayer;
    }

    // Fallback: try obstacles layers
    if (!targetLayer) {
      const obstaclesLayers = this.findLayersBySuffix('obstacles');
      if (obstaclesLayers.length > 0) {
        const layerName = obstaclesLayers[0].name;
        targetLayer = this.map.getLayer(layerName)?.tilemapLayer || null;
      }
    }

    // Last resort: use any non-collision layer
    if (!targetLayer) {
      for (const layer of this.map.layers) {
        if (!layer.name.includes('collision') && !layer.name.includes('bridges')) {
          targetLayer = layer.tilemapLayer || null;
          if (targetLayer) break;
        }
      }
    }

    if (!targetLayer) {
      console.warn(`No suitable layer found for door sprites`);
      return;
    }

    // Place a tile for each position the door occupies
    for (const pos of door.getPositions()) {
      const tile = targetLayer.putTileAt(globalTileIndex, pos.tileX, pos.tileY);
      if (tile) {
        tile.setCollision(false); // Collision is handled by collision array, not tile collision
        // Store reference to update later
        const key = `${door.id}-${pos.tileX}-${pos.tileY}`;
        this.doorSprites.set(key, tile);
        console.log(`  Placed door tile at (${pos.tileX}, ${pos.tileY}), collision in array: ${this.hasCollisionAt(pos.tileX, pos.tileY)}`);
      }
    }
  }

  /**
   * Update door sprite to reflect its current locked state
   */
  private updateDoorSprite(door: Door): void {
    if (!door.spriteId) {
      return;
    }

    const localFrameIndex = getDoorSpriteFrame(door.spriteId, door.isLocked());
    if (localFrameIndex === null) {
      return;
    }

    // Get terrains tileset for firstgid
    const terrainsTileset = this.map.getTileset('terrains');
    if (!terrainsTileset) {
      console.error('Could not find terrains tileset for door sprite update');
      return;
    }

    // Convert to global tile index
    const globalTileIndex = terrainsTileset.firstgid + localFrameIndex;

    // Update all tiles for this door
    for (const pos of door.getPositions()) {
      const key = `${door.id}-${pos.tileX}-${pos.tileY}`;
      const tile = this.doorSprites.get(key);
      if (tile) {
        tile.index = globalTileIndex;
      }
    }

    console.log(`Updated door ${door.id} sprite to ${door.isLocked() ? 'closed' : 'open'} state (localFrame=${localFrameIndex}, globalIndex=${globalTileIndex})`);
  }

  /**
   * Helper: Find all layers matching a suffix pattern (e.g., "collision" matches "Beach/collision", "Forest/collision")
   */
  private findLayersBySuffix(suffix: string): Phaser.Tilemaps.LayerData[] {
    return this.map.layers.filter(layer => TiledLayerUtils.getLayerSuffix(layer.name) === suffix);
  }

  /**
   * Load all tilesets (both external and embedded) from the map
   */
  private loadAllTilesets(): Phaser.Tilemaps.Tileset[] {
    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    const mapData = this.cache.tilemap.get('overworldMap');

    if (!mapData || !mapData.data || !mapData.data.tilesets) {
      console.warn('No tileset data found in map');
      return tilesets;
    }

    // Mapping of known external tileset names to their Phaser keys
    const externalTilesetMapping: Record<string, string> = {
      'beach': 'beachTileset',
      'SproutLandsGrassIslands': 'grassTileset'
    };

    for (const tilesetData of mapData.data.tilesets) {
      const tilesetName = tilesetData.name;

      // Try external mapping first
      let phaserKey = externalTilesetMapping[tilesetName];

      // If not found, assume it's an embedded tileset
      if (!phaserKey) {
        phaserKey = `tileset_${tilesetName}`;
      }

      console.log(`Adding tileset: ${tilesetName} with key: ${phaserKey}`);

      const tileset = this.map.addTilesetImage(tilesetName, phaserKey);

      if (tileset) {
        tilesets.push(tileset);
        console.log(`  ✓ Tileset ${tilesetName} loaded successfully`);
      } else {
        console.warn(`  ✗ Failed to load tileset ${tilesetName} (key: ${phaserKey})`);
      }
    }

    return tilesets;
  }

  /**
   * Setup visual tile layers that should be automatically rendered
   * Looks for layers with the custom property "autoRender: true" or layers with common visual suffixes
   */
  private setupVisualLayers(tilesets: Phaser.Tilemaps.Tileset[]) {
    // Visual layer suffixes to auto-render (e.g., "Beach/water", "Forest/ground")
    const visualLayerSuffixes = ['beach', 'lowground', 'water', 'pontoons', 'grass', 'ground', 'obstacles'];

    console.log('Setting up visual layers...');

    // Check all layers in the map
    for (const layerData of this.map.layers) {
      const layerName = layerData.name;
      const layerSuffix = TiledLayerUtils.getLayerSuffix(layerName);

      // Skip special layers that are handled elsewhere
      if (layerSuffix === 'collision' ||
        layerSuffix === 'roofs' ||
        layerName === OverworldBridgeManager.getBridgesLayerName()) {
        continue;
      }

      // Check if this layer should be auto-rendered
      let shouldRender = visualLayerSuffixes.includes(layerSuffix);

      // Also check for autoRender property in Tiled (if layer has properties)
      if (layerData.properties && Array.isArray(layerData.properties)) {
        const autoRenderProp = layerData.properties.find((prop: any) => prop.name === 'autoRender');
        if (autoRenderProp && 'value' in autoRenderProp) {
          shouldRender = (autoRenderProp as any).value === true;
        }
      }

      if (shouldRender) {
        // Try to create this layer
        const layer = this.map.createLayer(layerName, tilesets);
        if (layer) {
          console.log(`Visual layer "${layerName}" created successfully`);
        } else {
          console.warn(`Failed to create visual layer "${layerName}"`);
        }
      }
    }
  }

  private setupCollisionLayer(tilesets: Phaser.Tilemaps.Tileset[]) {
    // Find all collision layers (e.g., "Beach/collision", "Forest/collision")
    const collisionLayerData = this.findLayersBySuffix('collision');

    if (collisionLayerData.length > 0) {
      console.log(`Found ${collisionLayerData.length} collision layers`);

      // Create all collision layers
      for (const layerData of collisionLayerData) {
        const collisionLayer = this.map.createLayer(layerData.name, tilesets);

        if (collisionLayer) {
          // Store all collision layers in array
          this.collisionLayers.push(collisionLayer);
          // Make collision layer invisible but functional
          collisionLayer.setAlpha(0);
          console.log(`Collision layer "${layerData.name}" created and configured`);
        }
      }

      // Setup collision detection using all collision layers
      this.setupCollisionDetection();
    } else {
      console.warn('No collision layers found in map');
    }

    // Setup bridges layer for completed puzzles
    const bridgesLayerData = this.map.getLayer(OverworldBridgeManager.getBridgesLayerName());
    console.log(`Looking for bridges layer '${OverworldBridgeManager.getBridgesLayerName()}': ${bridgesLayerData ? 'FOUND' : 'NOT FOUND'}`);

    if (bridgesLayerData) {
      console.log(`Creating bridges layer with tilesets`);
      const bridgesLayer = this.map.createLayer(OverworldBridgeManager.getBridgesLayerName(), tilesets);

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

  private setupRoofsLayer(tilesets: Phaser.Tilemaps.Tileset[]) {
    // Find all roofs layers (e.g., "Beach/roofs", "Forest/roofs")
    const roofsLayersData = this.findLayersBySuffix('roofs');
    console.log(`Looking for roofs layers: ${roofsLayersData.length} found`);

    if (roofsLayersData.length > 0) {
      console.log(`Creating ${roofsLayersData.length} roofs layers with ${tilesets.length} tilesets`);

      for (const layerData of roofsLayersData) {
        const roofsLayer = this.map.createLayer(layerData.name, tilesets);

        if (roofsLayer) {
          // Store all roofs layers
          this.roofsLayers.push(roofsLayer);
          // Set roof layer depth to appear above player (player is at default depth 0)
          roofsLayer.setDepth(10);
          console.log(`Roofs layer "${layerData.name}" created successfully: depth=${roofsLayer.depth}, visible=${roofsLayer.visible}, alpha=${roofsLayer.alpha}`);
        } else {
          console.error(`Failed to create roofs layer "${layerData.name}" - createLayer returned null`);
        }
      }
    } else {
      console.log('No roofs layers found in map (optional)');
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

  private setupCollisionDetection() {
    if (this.collisionLayers.length === 0) return;

    // Initialize collision array and create separate layers
    const mapWidth = this.map.width;
    const mapHeight = this.map.height;

    // Pre-build lookup maps from raw tiledMapData for ground/lowground visual layers.
    // These layers carry stairs=true and lowground=true tile properties that the
    // dedicated collision layer may not cover.
    const stairsTiles = new Set<number>(); // flat index = y * mapWidth + x
    const lowgroundTiles = new Set<number>();

    if (this.tiledMapData) {
      const tilesets = this.tiledMapData.tilesets ?? [];

      const groundLayers = TiledLayerUtils.findTileLayersByName(this.tiledMapData.layers, 'ground');
      for (const layer of groundLayers) {
        const data: number[] = layer.data.data ?? [];
        for (let i = 0; i < data.length; i++) {
          const props = TiledLayerUtils.getTileProperties(tilesets, data[i]);
          if (props['stairs'] === true) stairsTiles.add(i);
        }
      }

      const lowgroundLayers = TiledLayerUtils.findTileLayersByName(this.tiledMapData.layers, 'lowground');
      for (const layer of lowgroundLayers) {
        const data: number[] = layer.data.data ?? [];
        for (let i = 0; i < data.length; i++) {
          const props = TiledLayerUtils.getTileProperties(tilesets, data[i]);
          if (props['lowground'] === true) lowgroundTiles.add(i);
          // Stairs can also appear on the lowground layer
          if (props['stairs'] === true) stairsTiles.add(i);
        }
      }
      console.log(`Visual layer scan: ${stairsTiles.size} stairs tiles, ${lowgroundTiles.size} lowground tiles`);

      // Scan all "pontoons" layers and build the pontoonTiles registry.
      // Pontoon tiles start in the state defined by their tileset (isHigh / !isHigh) and their
      // collision is set here to match; it will be updated at runtime as water levels change.
      const pontoonLayers = TiledLayerUtils.findTileLayersByName(this.tiledMapData.layers, 'pontoons');
      for (const layer of pontoonLayers) {
        const data: number[] = layer.data.data ?? [];
        for (let i = 0; i < data.length; i++) {
          const gid = data[i];
          if (!gid) continue;
          const props = TiledLayerUtils.getTileProperties(tilesets, gid);
          if (props['isPontoon'] !== true) continue;

          const tileX = i % mapWidth;
          const tileY = Math.floor(i / mapWidth);
          const key = `${tileX},${tileY}`;
          const isHigh = props['isHigh'] === true;
          const toggleOffset = typeof props['toggleOffset'] === 'number' ? props['toggleOffset'] as number : 0;

          this.pontoonTiles.set(key, {
            tileX,
            tileY,
            currentGID: gid,
            layerName: layer.fullPath,
            isHigh,
            toggleOffset,
          });
        }
      }
      console.log(`Pontoon scan: ${this.pontoonTiles.size} pontoon tiles registered`);
    }

    this.collisionArray = [];

    for (let y = 0; y < mapHeight; y++) {
      this.collisionArray[y] = [];

      for (let x = 0; x < mapWidth; x++) {
        // Collect tile data from all collision layers at this position.
        // Return null for absent tiles (getTileAt returns null, or index === -1).
        // Return a data object whose properties may be undefined (tile exists but
        // carries no custom properties); CollisionTileClassifier handles that case.
        const layerTiles = this.collisionLayers.map(collisionLayer => {
          const tile = collisionLayer.getTileAt(x, y);
          if (!tile || tile.index === -1) return null;
          return { properties: tile.properties ?? undefined };
        });

        // Augment with visual-layer properties (stairs / lowground).
        // These are injected as synthetic tile entries so the classifier can
        // apply its existing priority rules without modification.
        const flatIdx = y * mapWidth + x;
        if (stairsTiles.has(flatIdx)) {
          layerTiles.push({ properties: { stairs: true } });
        } else if (lowgroundTiles.has(flatIdx)) {
          // Only set walkable_low if not already overridden to STAIRS
          layerTiles.push({ properties: { walkable_low: true } });
        }

        // Classify tile type using pure logic
        const classification = CollisionTileClassifier.classifyTile(layerTiles);
        this.collisionArray[y][x] = classification.collisionType;
      }
    }

    console.log(`Collision system initialised: ${mapWidth}x${mapHeight}`);

    // Debug: count collision tiles by type
    let blockedCount = 0;
    let walkableCount = 0;
    let walkableLowCount = 0;
    let stairsCount = 0;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const type = this.collisionArray[y][x];
        if (type === CollisionType.BLOCKED) blockedCount++;
        else if (type === CollisionType.WALKABLE) walkableCount++;
        else if (type === CollisionType.WALKABLE_LOW) walkableLowCount++;
        else if (type === CollisionType.STAIRS) stairsCount++;
      }
    }

    console.log(`Collision tiles: BLOCKED=${blockedCount}, WALKABLE=${walkableCount}, WALKABLE_LOW=${walkableLowCount}, STAIRS=${stairsCount}`);

    // Post-pass: apply pontoon collision, overriding whatever the main loop computed.
    // Pontoons are not on collision layers so their positions default to WALKABLE;
    // this pass enforces the correct type based on each tile's initial isHigh state.
    for (const { tileX, tileY, isHigh } of this.pontoonTiles.values()) {
      if (tileY >= 0 && tileY < mapHeight && tileX >= 0 && tileX < mapWidth) {
        this.collisionArray[tileY][tileX] = isHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
      }
    }
  }

  update() {
    // Only handle player movement in exploration mode
    if (this.gameMode === 'exploration' && this.playerController) {
      this.playerController.update();

      // Update interaction cursor based on player position
      if (this.interactionCursor && this.tiledMapData && this.player) {
        const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);

        // Update cursor's facing direction
        this.interactionCursor.setFacing(this.playerController.getFacingDirection());

        // Update cursor to show nearest interactable
        this.interactionCursor.update(playerTileX, playerTileY, this.interactables);
      }

      // Update roof manager to hide/show roofs based on player position
      if (this.roofManager && this.player) {
        this.roofManager.update(this.player.x, this.player.y);
      }
    }
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

  // === OVERWORLD PUZZLE METHODS ===

  /**
   * Set up puzzle interaction checking
   */
  private setupPuzzleInteraction(): void {
    console.log('[DIAGNOSTIC] setupPuzzleInteraction: Setting up input handlers');

    // Add E key for interacting with focused target or entering puzzles
    this.input.keyboard?.on('keydown-E', () => {
      console.log('[DIAGNOSTIC] E key pressed, gameMode:', this.gameMode);
      if (this.gameMode !== 'exploration') return;
      // If there's a focused target, interact with it
      const focusedTarget = this.interactionCursor?.getCurrentTarget();
      if (focusedTarget) {
        console.log('E key: interacting with focused target');
        this.interactWithTarget(focusedTarget);
      } else {
        // Otherwise, check for puzzle entry at player's position
        console.log('E key: checking for puzzle entry');
        this.checkForPuzzleEntry();
      }
    });

    // Add pointer/touch input for mobile devices
    // Store the handler so we can remove it later if needed
    this.puzzleEntryPointerHandler = (pointer: Phaser.Input.Pointer) => {
      console.log('[DIAGNOSTIC] pointerdown handler called, gameMode:', this.gameMode, 'worldPos:', pointer.worldX.toFixed(0), pointer.worldY.toFixed(0));

      // Only handle clicks in exploration mode
      if (this.gameMode !== 'exploration') {
        console.log('[DIAGNOSTIC] Ignoring click - not in exploration mode');
        return;
      }

      // Mark pointer as held
      this.isPointerHeld = true;

      // Get world coordinates of the click (accounting for camera position)
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      // Check if player exists and is within a reasonable distance from click
      if (!this.player || !this.tiledMapData || !this.playerController || !this.interactionCursor) {
        return;
      }

      const playerX = this.player.x;
      const playerY = this.player.y;

      // Convert both positions to tile coordinates
      const { x: clickTileX, y: clickTileY } = this.gridMapper.worldToGrid(worldX, worldY);
      const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(playerX, playerY);

      // Check if there's a focused target
      const focusedTarget = this.interactionCursor.getCurrentTarget();

      // If clicking on the focused target, interact with it
      if (focusedTarget && this.interactionCursor.isTargeting(clickTileX, clickTileY)) {
        console.log(`Interacting with focused target at (${clickTileX}, ${clickTileY})`);
        this.interactWithTarget(focusedTarget);
        this.isPointerHeld = false; // Don't continue moving after interaction
        return;
      }

      // Check if clicking within interaction range (1 tile)
      const tileDx = Math.abs(clickTileX - playerTileX);
      const tileDy = Math.abs(clickTileY - playerTileY);
      const withinRange = tileDx <= 1 && tileDy <= 1;

      if (withinRange) {
        // Check if clicking on an interactable
        const clickedInteractable = this.interactables.find(
          i => i.tileX === clickTileX && i.tileY === clickTileY
        );

        if (clickedInteractable) {
          // If it's not focused, focus it (player may need to turn)
          // If it becomes focused, it will be interactable next tap
          console.log(`Focusing interactable at (${clickTileX}, ${clickTileY})`);
          this.isPointerHeld = false; // Don't continue moving when focusing
          return;
        }

        // Clicking on player's own tile - try to enter puzzle at player position
        if (clickTileX === playerTileX && clickTileY === playerTileY) {
          console.log(`Tap detected on player tile (${clickTileX}, ${clickTileY})`);
          this.checkForPuzzleEntry();
          this.isPointerHeld = false; // Don't continue moving after puzzle check
          return;
        }
      }

      // Tapping anywhere else: move towards that location
      console.log(`Tap-to-move: player at (${playerX.toFixed(0)}, ${playerY.toFixed(0)}), target (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);
      this.playerController.setTargetPosition(worldX, worldY);
    };

    this.input.on('pointerdown', this.puzzleEntryPointerHandler);

    // Add pointer move handler for continuous movement while held
    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      // Only update destination if pointer is held and in exploration mode
      if (!this.isPointerHeld || this.gameMode !== 'exploration') {
        return;
      }

      if (!this.player || !this.playerController || !pointer.isDown) {
        return;
      }

      // Update destination to current pointer position
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      this.playerController.setTargetPosition(worldX, worldY);
    };
    this.input.on('pointermove', this.pointerMoveHandler);

    // Add pointer up handler to stop tracking
    this.pointerUpHandler = () => {
      this.isPointerHeld = false;
    };
    this.input.on('pointerup', this.pointerUpHandler);

    console.log('Puzzle interaction set up - press E or tap focused interactable to interact, tap elsewhere to move');
  }

  /**
   * Interact with a target (puzzle, NPC, lever, etc.)
   */
  private interactWithTarget(target: Interactable): void {
    switch (target.type) {
      case 'puzzle':
        if (target.data?.puzzleId) {
          this.enterOverworldPuzzle(target.data.puzzleId);
        }
        break;
      case 'npc':
        if (target.data?.npc) {
          this.startConversationWithNPC(target.data.npc);
        }
        break;
      case 'lever':
        // Future: handle lever interaction
        console.log('Lever interaction not yet implemented');
        break;
    }
  }

  /**
   * Start a conversation with an NPC
   */
  private async startConversationWithNPC(npc: NPC): Promise<void> {
    if (!npc.hasConversation()) {
      console.log(`NPC ${npc.name} has no conversation`);
      return;
    }

    try {
      // Determine which conversation to use
      let useSolvedConversation = false;

      // For constraint NPCs, check puzzle completion status
      if (npc.id.startsWith('constraint-')) {
        // Extract puzzle ID from npc.id format: constraint-{puzzleId}-{type}-{islandId}
        const match = npc.id.match(/^constraint-([^-]+)/);
        if (match) {
          const puzzleId = match[1];
          useSolvedConversation = this.gameState.isPuzzleCompleted(puzzleId);
          console.log(`Constraint NPC conversation: puzzle ${puzzleId} completed = ${useSolvedConversation}`);
        }
      } else {
        // For series NPCs, check series state
        const state = this.npcSeriesStates.get(npc.id);
        useSolvedConversation = state?.isSeriesCompleted() ?? false;
      }

      // Load conversation JSON
      const conversationPath = npc.getConversationPath(useSolvedConversation);
      const response = await fetch(conversationPath);
      if (!response.ok) {
        throw new Error(`Failed to load conversation: ${response.statusText}`);
      }

      const conversationSpec: ConversationSpec = await response.json();

      // Switch to conversation mode
      this.gameMode = 'conversation';
      console.log(`Switching to conversation mode with NPC: ${npc.name} (solved: ${useSolvedConversation})`);

      // Get conversation scene
      const conversationScene = this.scene.get('ConversationScene') as (ConversationScene & { startConversation: Function; events: Phaser.Events.EventEmitter }) | null;
      if (!conversationScene) {
        console.error('ConversationScene not found');
        return;
      }

      // Inject glyph tracker so speech bubbles register for Translation Mode
      conversationScene.setGlyphTracker(this.gameState.glyphTracker);

      // Listen for conversation end
      conversationScene.events.once('conversationEnded', () => {
        this.onConversationEnded();
      });

      // Listen for conversation effects
      conversationScene.events.on('conversationEffects', (effects: any[]) => {
        this.handleConversationEffects(effects, npc);
      });

      // Launch the conversation scene if not already running
      if (!this.scene.isActive('ConversationScene')) {
        // Wait for the scene to be created before starting conversation
        conversationScene.events.once('create', () => {
          conversationScene.startConversation(conversationSpec, npc);
        });
        this.scene.launch('ConversationScene');
      } else {
        // Scene already running, start conversation immediately
        conversationScene.startConversation(conversationSpec, npc);
      }

    } catch (error) {
      console.error('Error starting conversation:', error);
      this.gameMode = 'exploration';
    }
  }

  /**
   * Handle conversation ending
   */
  private onConversationEnded(): void {
    console.log('Conversation ended, returning to exploration');
    this.gameMode = 'exploration';

    // Clean up event listeners
    const conversationScene = this.scene.get('ConversationScene');
    if (conversationScene) {
      conversationScene.events.off('conversationEffects');
    }

    // Stop the conversation scene
    this.scene.stop('ConversationScene');
  }

  /**
   * Handle effects from conversation choices
   */
  private async handleConversationEffects(effects: any[], npc?: NPC): Promise<void> {
    console.log('Handling conversation effects:', effects);

    for (const effect of effects) {
      switch (effect.type) {
        case 'giveItem':
          console.log(`TODO: Give item ${effect.itemId} to player`);
          break;
        case 'setFlag':
          console.log(`TODO: Set flag ${effect.flagId} = ${effect.flagValue}`);
          break;
        case 'startPuzzle':
          console.log(`TODO: Start puzzle ${effect.puzzleId}`);
          break;
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
        case 'setExpression':
          // Expression changes are handled by the conversation system
          break;
      }
    }
  }

  /**
   * Start a puzzle series, launching the first unsolved puzzle
   */
  private async startPuzzleSeries(seriesId: string, npc?: NPC): Promise<void> {
    console.log(`Starting puzzle series: ${seriesId}`);

    // If series is associated with an NPC, use their state
    let series = null;
    if (npc) {
      const state = this.npcSeriesStates.get(npc.id);
      series = state?.getSeries();

      if (series && series.id !== seriesId) {
        console.warn(`NPC ${npc.id} series mismatch: expected ${seriesId}, got ${series.id}`);
        series = null;
      }
    }

    // If we don't have the series yet, load it
    if (!series) {
      try {
        const seriesPath = `data/series/${seriesId}.json`;
        const response = await fetch(seriesPath);
        if (!response.ok) {
          throw new Error(`Failed to load series: ${response.statusText}`);
        }
        const seriesJson = await response.json();
        series = await this.seriesManager!.loadSeries(seriesJson);

        // Store puzzle data for launching
        if (seriesJson.puzzles) {
          for (const puzzle of seriesJson.puzzles) {
            if (puzzle.id && puzzle.puzzleData) {
              this.currentSeriesPuzzleData.set(puzzle.id, puzzle.puzzleData);
            }
          }
        }
      } catch (error) {
        console.error(`Error loading series ${seriesId}:`, error);
        return;
      }
    }

    // Find the first unsolved puzzle
    let firstUnsolvedId: string | null = null;
    const entries = series.getAllPuzzleEntries();
    for (const entry of entries) {
      if (entry.unlocked && !entry.completed) {
        firstUnsolvedId = entry.id;
        break;
      }
    }

    // If no unlocked incomplete puzzle, try first unlocked puzzle
    if (!firstUnsolvedId) {
      const firstUnlocked = entries.find(e => e.unlocked);
      firstUnsolvedId = firstUnlocked?.id ?? null;
    }

    if (!firstUnsolvedId) {
      console.warn(`No unlocked puzzles found in series ${seriesId}`);
      return;
    }

    console.log(`Launching first unsolved puzzle: ${firstUnsolvedId}`);

    // Store the current series for navigation
    this.currentSeries = series;

    // Get the puzzle data
    const puzzleData = this.currentSeriesPuzzleData.get(firstUnsolvedId);
    if (!puzzleData) {
      console.error(`No puzzle data found for ${firstUnsolvedId}`);
      return;
    }

    // Launch BridgePuzzleScene with the puzzle data
    this.scene.launch('BridgePuzzleScene', { puzzleData, seriesMode: true });
  }

  /**
   * Unlock a door by ID
   */
  private unlockDoor(doorId: string): void {
    const door = this.doors.find(d => d.id === doorId);
    if (!door) {
      console.warn(`Door ${doorId} not found`);
      return;
    }

    if (!door.isLocked()) {
      console.log(`Door ${doorId} is already unlocked`);
      return;
    }

    console.log(`Unlocking door: ${doorId}`);
    door.unlock();

    // Update game state
    this.gameState.unlockDoor(doorId);

    // Update collision
    this.collisionManager.updateDoorCollision(door);

    // Update door sprite to show open state
    this.updateDoorSprite(door);

    console.log(`Door ${doorId} unlocked successfully`);
  }

  /**
   * Handle completion of a puzzle within a series
   * Called when BridgePuzzleScene completes a series puzzle
   */
  private handleSeriesPuzzleCompleted(data: { puzzleId: string; success: boolean }): void {
    console.log(`[OverworldScene] Series puzzle completed: ${data.puzzleId}, success: ${data.success}`);

    if (!this.currentSeries) {
      console.warn('No current series - ignoring puzzle completion');
      return;
    }

    if (!data.success) {
      console.log('Puzzle was not successfully solved - not marking as complete');
      return;
    }

    // Find the series entry that contains this puzzle data ID
    // The puzzle data has an ID (e.g., "forest-1") but the series entries have their own IDs
    const allEntries = this.currentSeries.getAllPuzzleEntries();
    const matchingEntry = allEntries.find((entry: any) => {
      // Check if this entry's puzzle data is in our series puzzle data map
      const puzzleData = this.currentSeriesPuzzleData.get(entry.id);
      return puzzleData && puzzleData.id === data.puzzleId;
    });

    if (!matchingEntry) {
      console.warn(`Could not find series entry for puzzle ${data.puzzleId}`);
      return;
    }

    // Mark the puzzle as completed in the series using the entry ID
    console.log(`Marking puzzle entry ${matchingEntry.id} (puzzle data: ${data.puzzleId}) as completed in series ${this.currentSeries.id}`);
    const result = this.currentSeries.completePuzzle(matchingEntry.id);

    if (result.success) {
      console.log(`Puzzle ${matchingEntry.id} marked as completed`);
      if (result.newlyUnlockedPuzzles.length > 0) {
        console.log(`Newly unlocked puzzles: ${result.newlyUnlockedPuzzles.join(', ')}`);
      }
    }

    // Check if the series is now complete
    if (this.currentSeries.isSeriesCompleted()) {
      console.log(`Series ${this.currentSeries.id} completed! Unlocking door...`);
      // Unlock the door associated with this series
      this.unlockDoor(this.currentSeries.id);

      // Update NPC icon to show completion
      for (const [npcId, state] of this.npcSeriesStates.entries()) {
        if (state.getSeries()?.id === this.currentSeries.id) {
          const npc = this.npcs.find(n => n.id === npcId);
          if (npc) {
            this.updateNPCIcon(npc);
          }
        }
      }
    } else {
      console.log(`Series ${this.currentSeries.id} not yet complete`);
    }
  }

  /**
   * Check if player is near a puzzle and can enter it
   */
  private checkForPuzzleEntry(): void {
    if (!this.tiledMapData || !this.player) {
      return;
    }

    const playerX = this.player.x;
    const playerY = this.player.y;

    // Convert player position to tile coordinates
    const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(playerX, playerY);

    console.log(`Checking for puzzle at player position (${playerX}, ${playerY}) - tile (${tileX}, ${tileY})`);

    // Check if player is standing on a valid entry tile
    const isOnEntryTile = this.isPuzzleEntryTile(tileX, tileY);
    if (!isOnEntryTile) {
      console.log('Player not on a valid puzzle entry tile');
      return;
    }

    // Check if there's a puzzle at the player's position
    const puzzle = this.puzzleManager.getPuzzleAtPosition(playerX, playerY, this.tiledMapData);

    if (puzzle) {
      console.log(`Found puzzle: ${puzzle.id}`);
      this.enterOverworldPuzzle(puzzle.id);
    } else {
      console.log('No puzzle found at player position');
    }
  }

  private isPuzzleEntryTile(tileX: number, tileY: number): boolean {
    if (!this.map) {
      return false;
    }

    // Get all layers and check for tiles with puzzleStart property
    for (const layer of this.map.layers) {
      if (layer.tilemapLayer) {
        const tile = layer.tilemapLayer.getTileAt(tileX, tileY);
        if (tile && tile.properties && tile.properties.puzzleStart === true) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Enter overworld puzzle mode
   */
  public async enterOverworldPuzzle(puzzleId: string): Promise<void> {
    if (!this.puzzleController) {
      console.error('Puzzle controller not initialized');
      return;
    }

    try {
      // Enter puzzle mode
      this.gameMode = 'puzzle';

      // Hide interaction cursor while in puzzle mode
      if (this.interactionCursor) {
        this.interactionCursor.hide();
      }

      // Disable player movement
      if (this.playerController) {
        this.playerController.setEnabled(false);
      }

      // Setup HUD event listeners
      const hudScene = this.scene.get('PuzzleHUDScene');
      if (hudScene) {
        hudScene.events.on('exit', this.handleHUDExit, this);
        hudScene.events.on('undo', this.handleHUDUndo, this);
        hudScene.events.on('redo', this.handleHUDRedo, this);
        hudScene.events.on('typeSelected', this.handleTypeSelected, this);
        hudScene.events.on('navigateNext', this.handleNavigateNext, this);
        hudScene.events.on('navigatePrevious', this.handleNavigatePrevious, this);
      }

      // Setup bridge click listener for removal
      this.events.on('bridge-clicked', this.handleBridgeClicked, this);

      // Setup Escape key to exit puzzle
      this.input.keyboard?.on('keydown-ESC', this.handleEscapeKey, this);

      // Delegate to controller for puzzle lifecycle
      await this.puzzleController.enterPuzzle(puzzleId, (mode: 'puzzle') => {
        this.gameMode = mode;
        // Stop camera follow so it doesn't snap back to player after zoom
        this.cameras.main.stopFollow();
      });

      // Hide overworld constraint NPCs after camera transition completes
      this.hideConstraintNPCsForPuzzle(puzzleId);

      // Emit test event for automation
      emitTestEvent('puzzle_entered', { puzzleId });

    } catch (error) {
      console.error(`Failed to enter overworld puzzle: ${puzzleId}`, error);
      this.exitOverworldPuzzle(false);
    }
  }

  /**
   * Exit overworld puzzle mode
   */
  public async exitOverworldPuzzle(success: boolean): Promise<void> {
    if (!this.puzzleController) {
      console.warn('No puzzle controller to exit');
      return;
    }

    // Guard against re-entrant calls (prevents infinite loop when puzzle is solved)
    if (this.isExitingPuzzle) {
      console.log('Already exiting puzzle, ignoring duplicate call');
      return;
    }

    this.isExitingPuzzle = true;

    try {
      // Clean up HUD event listeners
      const hudScene = this.scene.get('PuzzleHUDScene');
      if (hudScene) {
        hudScene.events.off('exit', this.handleHUDExit, this);
        hudScene.events.off('undo', this.handleHUDUndo, this);
        hudScene.events.off('redo', this.handleHUDRedo, this);
        hudScene.events.off('typeSelected', this.handleTypeSelected, this);
        hudScene.events.off('navigateNext', this.handleNavigateNext, this);
        hudScene.events.off('navigatePrevious', this.handleNavigatePrevious, this);
      }

      // Clean up bridge click listener
      this.events.off('bridge-clicked', this.handleBridgeClicked, this);

      // Clean up Escape key listener
      this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey, this);

      // Delegate to controller for puzzle exit
      console.log('[DIAGNOSTIC] About to call puzzleController.exitPuzzle, success:', success);
      const activePuzzleId = this.puzzleController.getCurrentPuzzleId();

      // Show overworld constraint NPCs before camera transition starts
      if (activePuzzleId) {
        this.showConstraintNPCsForPuzzle(activePuzzleId);
      }

      await this.puzzleController.exitPuzzle(success, (mode: 'exploration') => {
        console.log('[DIAGNOSTIC] onModeChange callback called, setting mode to:', mode);
        this.gameMode = mode;
        // Resume camera follow after returning to exploration
        this.cameras.main.startFollow(this.player);
      });
      console.log('[DIAGNOSTIC] puzzleController.exitPuzzle completed');

      // Update overworld water visuals if this was a FlowPuzzle
      if (activePuzzleId) {
        const exitedPuzzle = this.puzzleManager.getPuzzleById(activePuzzleId);
        const exitedBounds = this.puzzleManager.getPuzzleBounds(activePuzzleId);
        if (exitedPuzzle instanceof FlowPuzzle && exitedBounds) {
          this.updateFlowWaterVisuals(exitedPuzzle, exitedBounds);
        }
      }

      // Re-enable player movement
      if (this.playerController) {
        this.playerController.setEnabled(true);
        console.log('[DIAGNOSTIC] Player controller re-enabled');
      }

      // Restore all pointer handlers (they were removed by PuzzleInputHandler.destroy())
      console.log('[DIAGNOSTIC] Restoring input handlers after puzzle exit');
      console.log('[DIAGNOSTIC] - puzzleEntryPointerHandler exists:', !!this.puzzleEntryPointerHandler);
      console.log('[DIAGNOSTIC] - pointerMoveHandler exists:', !!this.pointerMoveHandler);
      console.log('[DIAGNOSTIC] - pointerUpHandler exists:', !!this.pointerUpHandler);
      console.log('[DIAGNOSTIC] - gameMode:', this.gameMode);

      if (this.puzzleEntryPointerHandler) {
        this.input.off('pointerdown', this.puzzleEntryPointerHandler); // Remove first to avoid duplicates
        this.input.on('pointerdown', this.puzzleEntryPointerHandler);
        console.log('[DIAGNOSTIC] pointerdown handler restored');
      }
      if (this.pointerMoveHandler) {
        this.input.off('pointermove', this.pointerMoveHandler); // Remove first to avoid duplicates
        this.input.on('pointermove', this.pointerMoveHandler);
        console.log('[DIAGNOSTIC] pointermove handler restored');
      }
      if (this.pointerUpHandler) {
        this.input.off('pointerup', this.pointerUpHandler); // Remove first to avoid duplicates
        this.input.on('pointerup', this.pointerUpHandler);
        console.log('[DIAGNOSTIC] pointerup handler restored');
      }

      console.log('Successfully exited overworld puzzle');

      // Update NPC icons and unlock door if series is complete
      if (success && this.currentSeries) {
        // Check if the series is now complete
        if (this.currentSeries.isSeriesCompleted()) {
          console.log(`Series ${this.currentSeries.id} completed! Unlocking door...`);
          // Unlock the door associated with this series
          this.unlockDoor(this.currentSeries.id);
        }

        // Find the NPC associated with this series and update their icon
        for (const [npcId, state] of this.npcSeriesStates.entries()) {
          if (state.getSeries()?.id === this.currentSeries.id) {
            const npc = this.npcs.find(n => n.id === npcId);
            if (npc) {
              this.updateNPCIcon(npc);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error exiting overworld puzzle:', error);
    } finally {
      // Always reset the guard flag
      this.isExitingPuzzle = false;
    }
  }

  /**
   * Check if currently in overworld puzzle mode
   */
  public isInPuzzleMode(): boolean {
    return this.puzzleController?.isInPuzzleMode() ?? false;
  }

  /**
   * Handle HUD exit button click
   */
  private handleHUDExit(): void {
    console.log('OverworldScene: HUD Exit button clicked');
    // Clear series when exiting manually
    this.currentSeries = null;
    if (this.puzzleController) {
      this.exitOverworldPuzzle(false);
    }
  }

  /**
   * Handle HUD undo button click
   */
  private handleHUDUndo(): void {
    console.log('OverworldScene: HUD Undo button clicked');
    if (this.puzzleController) {
      this.puzzleController.handleUndo();
    }
  }

  /**
   * Handle HUD redo button click
   */
  private handleHUDRedo(): void {
    console.log('OverworldScene: HUD Redo button clicked');
    if (this.puzzleController) {
      this.puzzleController.handleRedo();
    }
  }

  /**
   * Handle bridge type selection from HUD
   */
  private handleTypeSelected(typeId: string): void {
    console.log('OverworldScene: Bridge type selected:', typeId);
    if (this.puzzleController) {
      this.puzzleController.handleTypeSelected(typeId);
    }
  }

  /**
   * Handle Escape key press
   */
  private handleEscapeKey(): void {
    console.log('OverworldScene: Escape key pressed');
    // Only handle if in puzzle mode
    if (this.isInPuzzleMode()) {
      // Clear series when exiting manually
      this.currentSeries = null;
      this.exitOverworldPuzzle(false);
    }
  }

  /**
   * Handle series navigation to next puzzle
   */
  private async handleNavigateNext(): Promise<void> {
    console.log('OverworldScene: Navigate to next puzzle');
    if (!this.currentSeries) {
      console.warn('No active series for navigation');
      return;
    }

    const result = this.currentSeries.navigateToNext();
    if (result.success && result.puzzleId) {
      // Exit current puzzle first
      await this.exitOverworldPuzzle(false);
      // Then enter the next one
      await this.enterOverworldPuzzle(result.puzzleId);
    }
  }

  /**
   * Handle series navigation to previous puzzle
   */
  private async handleNavigatePrevious(): Promise<void> {
    console.log('OverworldScene: Navigate to previous puzzle');
    if (!this.currentSeries) {
      console.warn('No active series for navigation');
      return;
    }

    const result = this.currentSeries.navigateToPrevious();
    if (result.success && result.puzzleId) {
      // Exit current puzzle first
      await this.exitOverworldPuzzle(false);
      // Then enter the previous one
      await this.enterOverworldPuzzle(result.puzzleId);
    }
  }

  /**
   * Handle bridge click for removal
   */
  private handleBridgeClicked(bridgeId: string): void {
    console.log('OverworldScene: Bridge clicked', bridgeId);
    if (this.puzzleController) {
      this.puzzleController.handleBridgeClicked(bridgeId);
    }
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
}