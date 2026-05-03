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
import { getDoorSpriteFrame, getDoorSpriteMapping } from '@view/DoorSpriteRegistry';
import { TiledLayerUtils } from '@model/overworld/TiledLayerUtils';
import { CollisionTileClassifier } from '@model/overworld/CollisionTileClassifier';
import { FlowPuzzle } from '@model/puzzle/FlowPuzzle';
import { RiverChannelExtractor } from '@model/overworld/RiverChannelExtractor';
import { WaterPropagationEngine } from '@model/overworld/WaterPropagationEngine';
import type { TranslationModeScene } from '@view/scenes/TranslationModeScene';
import type { ConversationScene } from '@view/scenes/ConversationScene';
import { GridToWorldMapper } from '@view/GridToWorldMapper';
import { TileAnimationManager } from '@view/TileAnimationManager';
import { getNPCSpriteKey, loadNPCSprites, registerNPCAnimations, getNPCIdleAnimationKey } from '@view/NPCSpriteHelper';
import { NPCAppearanceRegistry } from '@model/conversation/NPCAppearanceRegistry';
import { Collectible } from '@model/overworld/Collectible';
import { ConversationConditionEvaluator } from '@model/conversation/ConversationConditionEvaluator';
import type { PlayerStartPosition } from '@model/overworld/PlayerStartManager';
import { OverworldHUDScene } from '@view/scenes/OverworldHUDScene';

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
  /** Tiles that are permanently BLOCKED due to explicit Tiled collision-layer properties
   * (collides=true / walkable=false). Water propagation must never change these. */
  private permanentBlockedTiles: Set<string> = new Set();
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
  private constraintCompassSprites: Map<string, Phaser.GameObjects.Sprite> = new Map(); // Compass direction sprites for directional constraint NPCs
  /** Disguise sprite keys for constraint NPCs that have a custom appearance.
   *  Keyed by NPC ID; stores the unsatisfied and satisfied texture keys so that
   *  the sprite can be flipped when the associated puzzle is solved. */
  private constraintDisguiseKeys: Map<string, { normalKey: string; solvedKey: string }> = new Map();
  private seriesManager?: SeriesManager;
  private npcAppearanceRegistry: NPCAppearanceRegistry = new NPCAppearanceRegistry();

  // Tile animations
  private tileAnimationManager?: TileAnimationManager;

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

  // Collectible system
  private collectibles: Collectible[] = [];
  private collectibleSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  // Player start position management
  private playerStartManager?: PlayerStartManager;

  // Overworld HUD scene (book icon, warp button, jewel counts)
  private overworldHUD?: OverworldHUDScene;

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

    // Load compass overlay spritesheet for directional constraint NPCs
    this.load.spritesheet('compass overlay', 'resources/sprites/compass_overlay.png', {
      frameWidth: 32,
      frameHeight: 32
    });

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

    // Load door opening animation spritesheets (horizontal and vertical variants).
    // Each sheet is a horizontal strip of frames showing the door swinging open.
    // Frame dimensions match those specified in DoorSpriteRegistry.
    this.load.spritesheet('forestDoorHOpening', 'resources/sprites/forestDoorHOpening.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.spritesheet('forestDoorVOpening', 'resources/sprites/forestDoorVOpening.png', {
      frameWidth: 32,
      frameHeight: 64
    });

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

    // Initialise tile animations (scans all created layers once to cache tile instances)
    this.tileAnimationManager = new TileAnimationManager(this.map, tilesets);

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

    // Register looping animations for collectible jewels
    this.registerJewelAnimations();

    // Register looping idle animations for animated NPCs
    registerNPCAnimations(this, this.npcAppearanceRegistry);

    // Initialize overworld puzzle system
    this.initializeOverworldPuzzles();
  }

  /**
   * Register looping animations for each jewel colour.
   * Each 'jewel-<colour>' spritesheet was loaded with startFrame/endFrame so
   * that frame 0 of the texture is always the first frame of that colour.
   * All animations therefore use frames 0–2 at 5 fps (200 ms per frame).
   */
  private registerJewelAnimations(): void {
    const jewel_colours = ['red', 'green', 'blue', 'yellow'];
    for (const colour of jewel_colours) {
      const textureKey = `jewel-${colour}`;
      if (!this.textures.exists(textureKey)) continue;
      this.anims.create({
        key: `${textureKey}-anim`,
        frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: 3 }),
        frameRate: 5, // 200 ms per frame
        repeat: -1,
      });
    }
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

      // Launch the overworld HUD scene and wire it up with the services it needs
      this.launchOverworldHUD();

      // TODO: remove — temporary starting jewel to verify HUD visibility
      this.gameState.collectJewel('green');
      this.overworldHUD?.refreshJewelHUD();

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
          if (!isBorder) continue;
          const fs = puzzle.getFlowSquare(lx, ly);
          // Only include border tiles that have at least one outgoing flow direction.
          // Decorative water tiles (no directions) must not act as channel endpoints —
          // they would cause the flood-fill to terminate at a tile that cannot propagate
          // water into the puzzle, masking the real entry point further along.
          if (fs && (fs.outgoing ?? []).length > 0) {
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

        // Always enforce the correct collision type — applyFlowWaterCollision may have
        // set this tile to BLOCKED even if the pontoon is already in the right visual state.
        // Never override tiles that are permanently BLOCKED by Tiled collision-layer properties.
        const correctCollisionType = shouldBeHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
        if (!this.isPermanentlyBlocked(tileX, tileY)) {
          this.setCollisionAt(tileX, tileY, correctCollisionType);
        }

        if (pontoon.isHigh === shouldBeHigh) continue; // already correct variant, no visual swap needed

        // Swap to alternate variant
        const newGID = pontoon.currentGID + pontoon.toggleOffset;

        // Update the pontoons Phaser layer
        const layerData = this.map.layers.find(l => l.name === pontoon.layerName);
        if (layerData?.tilemapLayer) {
          layerData.tilemapLayer.putTileAt(newGID, tileX, tileY);
        }

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
    const originTileX = Math.floor(puzzleBounds.x / tileW);
    const originTileY = Math.floor(puzzleBounds.y / tileH);

    for (let ly = 0; ly < puzzle.height; ly++) {
      for (let lx = 0; lx < puzzle.width; lx++) {
        if (!puzzle.getFlowSquare(lx, ly)) continue; // only flow squares have water tiles
        this.updateSingleFlowTileVisual(originTileX + lx, originTileY + ly, puzzle.tileHasWater(lx, ly));
      }
    }
  }

  /**
   * Update the visual and collision state for a single flow tile on the overworld map.
   * Handles both the Tiled water layer (removing/restoring the tile GID) and any
   * pontoon at the same position.
   *
   * This is the per-tile building block used by both `updateFlowWaterVisuals` (bulk
   * update after puzzle exit) and the `FlowPuzzleRenderer` tile-visual callback
   * (per-tile wave animation during puzzle solving).
   */
  public updateSingleFlowTileVisual(tileX: number, tileY: number, hasWater: boolean): void {
    const key = `${tileX},${tileY}`;
    const waterLayerData = this.findLayersBySuffix('water');

    if (hasWater) {
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
      // Remove the water tile so the dried-up riverbed shows beneath it
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

    // Pontoon at this position (if any): always enforce correct collision and swap
    // visual variant when the high/low state has changed.
    // Skip pontoons on ALWAYS_HIGH or STAIRS tiles — they are immune to flow water overrides.
    const pontoon = this.pontoonTiles.get(key);
    const pontoonCollision = pontoon ? this.getCollisionAt(pontoon.tileX, pontoon.tileY) : undefined;
    if (pontoon &&
      pontoonCollision !== CollisionType.ALWAYS_HIGH &&
      pontoonCollision !== CollisionType.STAIRS) {
      const correctCollision = hasWater ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
      this.setCollisionAt(tileX, tileY, correctCollision);
      if (pontoon.isHigh !== hasWater) {
        const newGID = pontoon.currentGID + pontoon.toggleOffset;
        const layerData = this.map.layers.find(l => l.name === pontoon.layerName);
        if (layerData?.tilemapLayer) {
          layerData.tilemapLayer.putTileAt(newGID, tileX, tileY);
        }
        pontoon.currentGID = newGID;
        pontoon.isHigh = hasWater;
        pontoon.toggleOffset = -pontoon.toggleOffset;
      }
    }
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

    // Load collectibles from "collectibles" object layers
    this.loadCollectibles();
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
      const animate = properties?.find((p: any) => p.name === 'animate')?.value === true;

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
        seriesFile,
        undefined,
        animate
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

      if (npc.animate) {
        const animKey = getNPCIdleAnimationKey(appearanceId, this.npcAppearanceRegistry);
        if (animKey) sprite.play(animKey);
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
          // Resolve the overworld tile position for this constraint item.
          // Items with an explicit position (e.g. MustHaveWaterConstraint,
          // EnclosedAreaSizeConstraint) provide puzzle-relative coordinates directly.
          // Island-based items (e.g. IslandBridgeCountConstraint) are looked up by ID.
          let overworldTileX: number;
          let overworldTileY: number;
          let elementLabel: string;

          // Get puzzle definition to convert puzzle coordinates to overworld coordinates
          const puzzleDefinition = this.puzzleManager.getPuzzleDefinitionById(puzzleId);
          if (!puzzleDefinition) {
            console.warn(`Could not find puzzle definition for ${puzzleId}`);
            continue;
          }

          // Puzzle bounds are in pixels, so convert to tiles first
          const { x: puzzleTileX, y: puzzleTileY } = this.gridMapper.worldToGrid(puzzleDefinition.bounds.x, puzzleDefinition.bounds.y);

          if (item.position) {
            // Cell-based constraint — position is already puzzle-relative
            overworldTileX = puzzleTileX + item.position.x;
            overworldTileY = puzzleTileY + item.position.y;
            elementLabel = item.elementID;
          } else {
            // Island-based constraint — look up island by ID
            const island = puzzle.islands.find(i => i.id === item.elementID);
            if (!island) {
              console.warn(`Could not find island ${item.elementID} in puzzle ${puzzleId}`);
              continue;
            }
            overworldTileX = puzzleTileX + island.x;
            overworldTileY = puzzleTileY + island.y;
            elementLabel = island.id;
          }

          // Generate a unique NPC ID from the constraint and element
          const npcId = `constraint-${puzzleId}-${constraint.constructor.name}-${elementLabel}`;

          // Check if this NPC already exists (avoid duplicates)
          if (this.npcs.find(n => n.id === npcId)) {
            continue;
          }

          // Get conversation files: per-island overrides take precedence over constraint defaults
          const conversationFile = item.conversationFile ?? constraint.conversationFile;
          const conversationFileSolved = item.conversationFileSolved ?? constraint.conversationFileSolved;

          // Choose appearance: disguise sprite overrides the default for the constraint type
          const appearanceId = item.disguiseSpriteKey ?? getNPCSpriteKey(item.constraintType);
          const language = 'grass'; // Default language for constraint NPCs

          // Build template variables for conversation substitution from the constraint's display item.
          const conversationVariables = item.conversationVariables;

          // Create NPC instance
          const npc = new NPC(
            npcId,
            elementLabel, // Use element label as NPC name for easier debugging
            overworldTileX,
            overworldTileY,
            language,
            appearanceId,
            conversationFile,
            conversationFileSolved,
            undefined, // No series for constraint NPCs
            conversationVariables,
            item.animate ?? false
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

          // If this NPC has a disguise, record the solved sprite key so the texture
          // can be flipped to the "revealed" appearance when the puzzle is solved.
          if (item.disguiseSpriteKey && item.disguiseSpriteSolvedKey) {
            this.constraintDisguiseKeys.set(npc.id, {
              normalKey: item.disguiseSpriteKey,
              solvedKey: item.disguiseSpriteSolvedKey,
            });
          }

          // Add count overlay sprite for constraints that specify a requiredCount
          if (item.requiredCount !== undefined && item.requiredCount >= 1 && item.requiredCount <= 8) {
            const count = item.requiredCount;
            if (count >= 1 && count <= 8) {
              const numberSprite = this.add.sprite(
                worldX + this.tiledMapData.tilewidth / 2,
                worldY - this.tiledMapData.tileheight / 2,
                'counts overlay',
                count - 1 // Frame index is count-1 for numbers 1-8
              );
              numberSprite.setOrigin(0.5, 0.5);
              numberSprite.setDepth(worldY + 1);
              this.constraintNumberSprites.set(npc.id, numberSprite);
            }
          }

          // Add compass overlay sprite for directional constraints
          if (item.compassFrame !== undefined) {
            const compassSprite = this.add.sprite(
              worldX + this.tiledMapData.tilewidth / 2,
              worldY - this.tiledMapData.tileheight / 2,
              'compass overlay',
              item.compassFrame
            );
            compassSprite.setOrigin(0.5, 0.5);
            compassSprite.setDepth(worldY + 2);
            this.constraintCompassSprites.set(npc.id, compassSprite);
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

          if (npc.animate) {
            const animKey = getNPCIdleAnimationKey(appearanceId, this.npcAppearanceRegistry);
            if (animKey) sprite.play(animKey);
          }

          constraintNPCCount++;
          console.log(`Loaded constraint NPC: ${npcId} at (${overworldTileX}, ${overworldTileY}), appearance: ${appearanceId}, conversation: ${conversationFile || 'none'}`);
        }
      }
    }

    console.log(`✓ Created ${constraintNPCCount} constraint NPCs from overworld puzzles`);
  }

  /**
   * Hide constraint NPCs (and their number/compass sprites) for a specific puzzle.
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

    for (const [npcId, compassSprite] of this.constraintCompassSprites) {
      if (npcId.startsWith(prefix)) {
        compassSprite.setVisible(false);
      }
    }

    console.log(`Hidden constraint NPCs for puzzle: ${puzzleId}`);
  }

  /**
   * Show constraint NPCs (and their number/compass sprites) for a specific puzzle.
   * Called when exiting puzzle mode to restore overworld NPCs.
   */
  private showConstraintNPCsForPuzzle(puzzleId: string): void {
    const prefix = `constraint-${puzzleId}-`;
    const isSolved = this.gameState.isPuzzleCompleted(puzzleId);

    for (const [npcId, sprite] of this.npcSprites) {
      if (npcId.startsWith(prefix)) {
        sprite.setVisible(true);
        // Update disguised NPCs to their "revealed" sprite once the puzzle is solved
        const disguise = this.constraintDisguiseKeys.get(npcId);
        if (disguise) {
          sprite.setTexture(isSolved ? disguise.solvedKey : disguise.normalKey);
        }
      }
    }

    for (const [npcId, numberSprite] of this.constraintNumberSprites) {
      if (npcId.startsWith(prefix)) {
        numberSprite.setVisible(true);
      }
    }

    for (const [npcId, compassSprite] of this.constraintCompassSprites) {
      if (npcId.startsWith(prefix)) {
        compassSprite.setVisible(true);
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
   * Load collectibles from all "<anything>/collectibles" object layers in the Tiled map.
   * Creates a Collectible model instance and an animated sprite for each object found.
   */
  private loadCollectibles(): void {
    if (!this.map || !this.tiledMapData) return;

    const collectiblesLayers = TiledLayerUtils.findObjectLayersByName(this.tiledMapData.layers, 'collectibles');

    if (collectiblesLayers.length === 0) {
      console.log('No collectibles layers found in map');
      return;
    }

    console.log(`Found ${collectiblesLayers.length} collectibles layer(s)`);

    const tileWidth = this.tiledMapData.tilewidth || 32;
    const tileHeight = this.tiledMapData.tileheight || 32;

    for (const layerInfo of collectiblesLayers) {
      let layer = this.map.getObjectLayer(layerInfo.fullPath);
      if (!layer) {
        layer = this.map.getObjectLayer(layerInfo.name);
      }
      if (!layer) {
        console.warn(`Failed to get collectibles layer: ${layerInfo.fullPath}`);
        continue;
      }

      for (const obj of layer.objects) {
        const collectible = Collectible.fromTiledObject(obj, tileWidth, tileHeight);
        if (!collectible) {
          console.warn(`Skipping invalid collectible object in ${layerInfo.fullPath}:`, obj);
          continue;
        }

        this.collectibles.push(collectible);

        // World pixel position: centre of tile
        const worldX = collectible.tileX * tileWidth + tileWidth / 2;
        const worldY = collectible.tileY * tileHeight + tileHeight / 2;

        // Attempt to create a sprite using a key derived from the jewel colour.
        // The animation is expected to be pre-defined (e.g. via Tiled tileset data).
        // If the texture is not loaded we fall back to a plain rectangle for now.
        const spriteKey = `jewel-${collectible.colour}`;
        let sprite: Phaser.GameObjects.Sprite;

        if (this.textures.exists(spriteKey)) {
          sprite = this.add.sprite(worldX, worldY, spriteKey);
          // Play the animation if one exists for this key
          const animKey = `jewel-${collectible.colour}-anim`;
          if (this.anims.exists(animKey)) {
            sprite.play(animKey);
          }
        } else {
          // Fallback: coloured rectangle rendered as a sprite (placeholder)
          const colourMap: Record<string, number> = {
            red: 0xff4444,
            blue: 0x4444ff,
            green: 0x44ff44,
            yellow: 0xffff44,
          };
          const colour = colourMap[collectible.colour] ?? 0xffffff;
          const gfx = this.make.graphics({ x: 0, y: 0 }, false);
          gfx.fillStyle(colour, 1);
          gfx.fillRect(0, 0, 16, 16);
          const rt = this.add.renderTexture(worldX - 8, worldY - 8, 16, 16);
          rt.draw(gfx);
          rt.setDepth(worldY);
          gfx.destroy();
          // Use a sprite-like object handle; store the renderTexture under the same map
          // by creating a transparent stand-in sprite at the correct position.
          sprite = this.add.sprite(worldX, worldY, '__DEFAULT');
          sprite.setVisible(false);
          this.collectibleSprites.set(collectible.id, sprite);
          console.log(`Collectible ${collectible.id} (${collectible.colour} jewel) loaded at (${collectible.tileX}, ${collectible.tileY}) — using placeholder`);
          continue;
        }

        sprite.setDepth(worldY);
        this.collectibleSprites.set(collectible.id, sprite);

        // Register as interactable
        this.interactables.push({
          type: 'collectible',
          tileX: collectible.tileX,
          tileY: collectible.tileY,
          data: { collectibleId: collectible.id },
        });

        console.log(`Loaded collectible: ${collectible.colour} jewel (id=${collectible.id}) at (${collectible.tileX}, ${collectible.tileY})`);
      }
    }

    // Register interactables that use the real texture as collectible interactables
    console.log(`Total collectibles loaded: ${this.collectibles.length}`);
  }

  /**
   * Collect a jewel: update model state, remove its sprite from the world and
   * interactables list, then refresh the overworld HUD.
   */
  private collectJewel(collectibleId: string): void {
    const collectible = this.collectibles.find(c => c.id === collectibleId);
    if (!collectible || collectible.collected) return;

    collectible.collect();
    this.gameState.collectJewel(collectible.colour);

    // Remove sprite
    const sprite = this.collectibleSprites.get(collectibleId);
    if (sprite) {
      sprite.destroy();
      this.collectibleSprites.delete(collectibleId);
    }

    // Remove from interactables list
    this.interactables = this.interactables.filter(
      i => !(i.type === 'collectible' && i.data?.collectibleId === collectibleId)
    );

    // Update HUD
    this.overworldHUD?.refreshJewelHUD();

    emitTestEvent('jewel_collected', { colour: collectible.colour, id: collectibleId });
    console.log(`Collected ${collectible.colour} jewel (id=${collectibleId}). Total: ${this.gameState.getJewelCount(collectible.colour)}`);
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
    console.log('Setting up visual layers...');

    // Check all layers in the map
    for (const layerData of this.map.layers) {
      const layerName = layerData.name;

      // Skip special layers that are handled elsewhere
      const layerSuffix = TiledLayerUtils.getLayerSuffix(layerName);
      if (layerSuffix === 'collision' ||
        layerSuffix === 'roofs' ||
        layerName === OverworldBridgeManager.getBridgesLayerName()) {
        continue;
      }

      // Render only layers that have the autoRender property set to true in Tiled
      const autoRenderProp = layerData.properties && Array.isArray(layerData.properties)
        ? layerData.properties.find((prop: any) => prop.name === 'autoRender')
        : undefined;
      const shouldRender = autoRenderProp != null && (autoRenderProp as any).value === true;

      if (shouldRender) {
        // Try to create this layer
        const layer = this.map.createLayer(layerName, tilesets);
        if (layer) {
          // Layers with the custom property renderAbovePlayer=true render above
          // the player and NPCs (e.g. tree canopies, overhangs).
          const abovePlayerProp = layerData.properties && Array.isArray(layerData.properties)
            ? layerData.properties.find((prop: any) => prop.name === 'renderAbovePlayer')
            : undefined;
          if (abovePlayerProp != null && (abovePlayerProp as any).value === true) {
            layer.setDepth(10);
          }
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
    let alwaysHighCount = 0;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const type = this.collisionArray[y][x];
        if (type === CollisionType.BLOCKED) blockedCount++;
        else if (type === CollisionType.WALKABLE) walkableCount++;
        else if (type === CollisionType.WALKABLE_LOW) walkableLowCount++;
        else if (type === CollisionType.STAIRS) stairsCount++;
        else if (type === CollisionType.ALWAYS_HIGH) alwaysHighCount++;
      }
    }

    console.log(`Collision tiles: BLOCKED=${blockedCount}, WALKABLE=${walkableCount}, WALKABLE_LOW=${walkableLowCount}, STAIRS=${stairsCount}, ALWAYS_HIGH=${alwaysHighCount}`);

    // Record tiles that are permanently BLOCKED by Tiled collision-layer properties.
    // Water propagation must never override these, even if water flows beneath them.
    this.permanentBlockedTiles.clear();
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (this.collisionArray[y][x] === CollisionType.BLOCKED) {
          this.permanentBlockedTiles.add(`${x},${y}`);
        }
      }
    }

    // Post-pass: apply pontoon collision, overriding whatever the main loop computed.
    // Pontoons are not on collision layers so their positions default to WALKABLE;
    // this pass enforces the correct type based on each tile's initial isHigh state.
    for (const { tileX, tileY, isHigh } of this.pontoonTiles.values()) {
      if (tileY >= 0 && tileY < mapHeight && tileX >= 0 && tileX < mapWidth) {
        this.collisionArray[tileY][tileX] = isHigh ? CollisionType.WALKABLE : CollisionType.WALKABLE_LOW;
      }
    }
  }

  update(_time: number, delta: number) {
    this.tileAnimationManager?.update(delta);

    // Only handle player movement in exploration mode
    if (this.gameMode === 'exploration' && this.playerController) {
      this.playerController.update();

      // Update interaction cursor based on player position
      if (this.interactionCursor && this.tiledMapData && this.player) {
        const playerPos = this.playerController.getPosition();
        const { x: playerTileX, y: playerTileY } = this.gridMapper.worldToGrid(playerPos.x, playerPos.y);

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

      // Ignore clicks when the warp dialog is open (let its own handlers deal with them)
      if (this.overworldHUD?.isWarpDialogOpen()) {
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
      case 'collectible':
        if (target.data?.collectibleId) {
          this.collectJewel(target.data.collectibleId);
        }
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

      // Evaluate conditional start branches (e.g. jewel count checks) to pick
      // the correct starting node for this conversation.
      const startNodeId = ConversationConditionEvaluator.resolveStartNode(
        conversationSpec,
        { getJewelCount: (colour) => this.gameState.getJewelCount(colour) }
      );

      // Apply conversation variable substitution (e.g. {{count}} → '2')
      if (npc.conversationVariables) {
        const variables = npc.conversationVariables;
        for (const node of Object.values(conversationSpec.nodes)) {
          if (node.npc?.glyphs) {
            node.npc.glyphs = node.npc.glyphs.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
          }
        }
      }

      // Switch to conversation mode
      this.gameMode = 'conversation';
      this.interactionCursor?.hide();
      this.playerController?.stopAndIdle();
      console.log(`Switching to conversation mode with NPC: ${npc.name} (solved: ${useSolvedConversation}, startNode: ${startNodeId})`);

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
          conversationScene.startConversation(conversationSpec, npc, startNodeId);
        });
        this.scene.launch('ConversationScene');
      } else {
        // Scene already running, start conversation immediately
        conversationScene.startConversation(conversationSpec, npc, startNodeId);
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
    this.overworldHUD?.setJewelHUDVisible(false);
    this.scene.launch('BridgePuzzleScene', { puzzleData, seriesMode: true });
  }

  /**
   * Synchronously apply a door state change: update the model, collision, sprite, and game state.
   * Used by animateDoorChange() after the camera has panned and animation has played.
   */
  private applyDoorChange(door: Door, unlock: boolean): void {
    if (unlock) {
      door.unlock();
      this.gameState.unlockDoor(door.id);
    } else {
      door.lock();
      this.gameState.lockDoor(door.id);
    }
    this.collisionManager.updateDoorCollision(door);
    this.updateDoorSprite(door);
    console.log(`Door ${door.id} ${unlock ? 'unlocked' : 'locked'} successfully`);
  }

  /**
   * Animate a door opening or closing:
   *   1. Disable player movement and stop camera follow
   *   2. Pan camera to the door
   *   3. Play the opening animation sprite (if the spritesheet is loaded)
   *   4. Apply the door state change (update model, collision, and tile sprite)
   *   5. Pan camera back to the player
   *   6. Resume camera follow and re-enable player movement
   */
  private async animateDoorChange(door: Door, unlock: boolean): Promise<void> {
    const PAN_DURATION = 800;
    const tileW = this.tiledMapData?.tilewidth ?? 32;
    const tileH = this.tiledMapData?.tileheight ?? 32;

    // Compute world-space centre of the door from its tile positions
    const positions = door.getPositions();
    const sumX = positions.reduce((acc, p) => acc + p.tileX, 0);
    const sumY = positions.reduce((acc, p) => acc + p.tileY, 0);
    const doorWorldX = (sumX / positions.length + 0.5) * tileW;
    const doorWorldY = (sumY / positions.length + 0.5) * tileH;

    // Disable player movement and stop follow so we can freely pan
    this.playerController?.setEnabled(false);
    this.cameras.main.stopFollow();

    try {
      // Pan to the door
      await new Promise<void>((resolve) => {
        this.cameras.main.pan(doorWorldX, doorWorldY, PAN_DURATION, 'Power2', false, (_cam, progress) => {
          if (progress === 1) resolve();
        });
      });

      // Play the opening animation if the spritesheet is available
      const mapping = getDoorSpriteMapping(door.spriteId);
      if (mapping && this.textures.exists(mapping.animationKey)) {
        const animKey = `${mapping.animationKey}-play`;

        // Register animation lazily (idempotent: Phaser ignores duplicates)
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(mapping.animationKey, {
              start: 0,
              end: mapping.frameCount - 1
            }),
            frameRate: 8,
            repeat: 0
          });
        }

        await new Promise<void>((resolve) => {
          const animSprite = this.add.sprite(doorWorldX, doorWorldY, mapping.animationKey, 0);
          animSprite.setOrigin(0.5, 0.5);
          animSprite.once('animationcomplete', () => {
            animSprite.destroy();
            resolve();
          });
          animSprite.play(animKey);
        });
      } else if (mapping) {
        console.warn(`Door animation texture '${mapping.animationKey}' not loaded — skipping animation for door ${door.id}`);
      }

      // Apply the state change (model, collision, tile sprite)
      this.applyDoorChange(door, unlock);

    } finally {
      // Pan back to the player and resume follow regardless of errors
      if (this.player) {
        const playerX = this.player.x;
        const playerY = this.player.y;
        await new Promise<void>((resolve) => {
          this.cameras.main.pan(playerX, playerY, PAN_DURATION, 'Power2', false, (_cam, progress) => {
            if (progress === 1) resolve();
          });
        });
        this.cameras.main.startFollow(this.player);
      }
      this.playerController?.setEnabled(true);
    }
  }

  /**
   * Unlock a door by ID immediately, without animation.
   * Used for conversation-triggered unlocks and as an internal helper.
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

    this.applyDoorChange(door, true);
  }

  /**
   * Handle completion of a puzzle within a series
   * Called when BridgePuzzleScene completes a series puzzle
   */
  private async handleSeriesPuzzleCompleted(data: { puzzleId: string; success: boolean }): Promise<void> {
    console.log(`[OverworldScene] Series puzzle completed: ${data.puzzleId}, success: ${data.success}`);

    // BridgePuzzleScene has closed — restore the jewel HUD regardless of outcome
    this.overworldHUD?.setJewelHUDVisible(true);

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
      console.log(`Series ${this.currentSeries.id} completed! Animating door unlock...`);
      // Find and animate the door associated with this series
      const seriesDoor = this.doors.find(d => d.id === this.currentSeries.id);
      if (seriesDoor && seriesDoor.isLocked()) {
        await this.animateDoorChange(seriesDoor, true);
      } else if (!seriesDoor) {
        // No animated door found — fall back to instant unlock by ID
        this.unlockDoor(this.currentSeries.id);
      }

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

    // Convert player position to tile coordinates (player.y is the feet/ground position)
    const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(this.player.x, this.player.y);

    console.log(`Checking for puzzle at player position (${this.player.x.toFixed(0)}, ${this.player.y.toFixed(0)}) - tile (${tileX}, ${tileY})`);

    // Check if player is standing on a valid entry tile
    const isOnEntryTile = this.isPuzzleEntryTile(tileX, tileY);
    if (!isOnEntryTile) {
      console.log('Player not on a valid puzzle entry tile');
      return;
    }

    // Check if there's a puzzle at the player's position
    const puzzle = this.puzzleManager.getPuzzleAtPosition(this.player.x, this.player.y, this.tiledMapData);

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

      // Hide jewel HUD while solving a puzzle
      this.overworldHUD?.setJewelHUDVisible(false);

      // Disable player movement
      if (this.playerController) {
        this.playerController.stopAndIdle();
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
      const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
      const tileW = this.tiledMapData?.tilewidth ?? 32;
      const tileH = this.tiledMapData?.tileheight ?? 32;

      await this.puzzleController.enterPuzzle(puzzleId, (mode: 'puzzle') => {
        this.gameMode = mode;
        // Stop camera follow so it doesn't snap back to player after zoom
        this.cameras.main.stopFollow();
      }, puzzleBounds
        ? (lx, ly, hasWater) => {
          this.updateSingleFlowTileVisual(
            Math.floor(puzzleBounds.x / tileW) + lx,
            Math.floor(puzzleBounds.y / tileH) + ly,
            hasWater
          );
        }
        : undefined
      );

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

      const exitResult = await this.puzzleController.exitPuzzle(success, (mode: 'exploration') => {
        console.log('[DIAGNOSTIC] onModeChange callback called, setting mode to:', mode);
        this.gameMode = mode;
        // Resume camera follow after returning to exploration
        this.cameras.main.startFollow(this.player);
      }, () => {
        // Called after collision is updated but before the camera pan begins —
        // update water tile visuals and pontoon states so they are correct during
        // the transition rather than snapping into place afterwards.
        if (activePuzzleId) {
          const exitedPuzzle = this.puzzleManager.getPuzzleById(activePuzzleId);
          const exitedBounds = this.puzzleManager.getPuzzleBounds(activePuzzleId);
          if (exitedPuzzle instanceof FlowPuzzle && exitedBounds) {
            this.updateFlowWaterVisuals(exitedPuzzle, exitedBounds);
          }
        }
      });
      console.log('[DIAGNOSTIC] puzzleController.exitPuzzle completed');

      // (water visuals already updated in the onBeforeTransition callback above)

      // Before re-enabling player movement, animate any doors linked to this puzzle.
      // Camera is following the player again (set by onModeChange above) and player
      // movement is still disabled (set during enterOverworldPuzzle), so animateDoorChange
      // can immediately pan away without needing extra setup.

      // Animate overworld-puzzle-linked doors
      if (exitResult.wasSolved || exitResult.wasUnsolved) {
        const linkedDoors = this.doors.filter(d => d.overworldPuzzleId === exitResult.puzzleId);
        for (const door of linkedDoors) {
          if (exitResult.wasSolved && door.isLocked()) {
            console.log(`Animating unlock of door ${door.id} linked to overworld puzzle ${exitResult.puzzleId}`);
            await this.animateDoorChange(door, true);
          } else if (exitResult.wasUnsolved && !door.isLocked()) {
            console.log(`Animating lock of door ${door.id} linked to overworld puzzle ${exitResult.puzzleId}`);
            await this.animateDoorChange(door, false);
          }
        }
      }

      // Animate series-puzzle-linked door if series is now complete
      if (success && this.currentSeries && this.currentSeries.isSeriesCompleted()) {
        console.log(`Series ${this.currentSeries.id} completed! Animating door unlock...`);
        const seriesDoor = this.doors.find(d => d.id === this.currentSeries.id);
        if (seriesDoor && seriesDoor.isLocked()) {
          await this.animateDoorChange(seriesDoor, true);
        } else if (!seriesDoor) {
          // No animated door found — fall back to instant unlock by ID
          this.unlockDoor(this.currentSeries.id);
        }
      }

      // Re-enable player movement (animateDoorChange also re-enables it, but we ensure
      // it is enabled here even when no door animations ran)
      if (this.playerController) {
        this.playerController.setEnabled(true);
        console.log('[DIAGNOSTIC] Player controller re-enabled');
      }

      // Restore jewel HUD now that we're back in exploration mode
      this.overworldHUD?.setJewelHUDVisible(true);

      // Restore all pointer handlers (they were removed by PuzzleInputHandler.destroy())
      console.log('[DIAGNOSTIC] Restoring input handlers after puzzle exit - gameMode:', this.gameMode);

      if (this.puzzleEntryPointerHandler) {
        this.input.off('pointerdown', this.puzzleEntryPointerHandler); // Remove first to avoid duplicates
        this.input.on('pointerdown', this.puzzleEntryPointerHandler);
      }
      if (this.pointerMoveHandler) {
        this.input.off('pointermove', this.pointerMoveHandler); // Remove first to avoid duplicates
        this.input.on('pointermove', this.pointerMoveHandler);
      }
      if (this.pointerUpHandler) {
        this.input.off('pointerup', this.pointerUpHandler); // Remove first to avoid duplicates
        this.input.on('pointerup', this.pointerUpHandler);
      }

      console.log('Successfully exited overworld puzzle');

      // Update NPC icons if series is associated
      if (success && this.currentSeries) {
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

  /**
   * Teleport the player to a player-start position.
   * Called via callback from OverworldHUDScene when the player picks a warp destination.
   */
  private warpToStart(start: PlayerStartPosition): void {
    if (!this.player) return;
    this.player.setPosition(start.x, start.y);
    this.playerController?.clearTargetPosition();
    console.log(`[Warp] Teleported player to "${start.id}" at (${start.x}, ${start.y})`);
  }
}