import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { CollisionManager } from '@model/overworld/CollisionManager';
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
import { attachTestMarker, isTestMode } from '@helpers/TestMarkers';
import { NPCSeriesState } from '@model/conversation/NPCSeriesState';
import { SeriesFactory, SeriesManager } from '@model/series/SeriesFactory';
import { FilePuzzleLoader, LocalStorageProgressStore } from '@model/series/SeriesLoaders';
import { NPCIconConfig } from '@view/NPCIconConfig';
import { Door } from '@model/overworld/Door';

/**
 * Overworld scene for exploring the map and finding puzzles
 */
export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private playerController?: PlayerController;
  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private bridgesLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionArray: boolean[][] = [];
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
  private seriesManager?: SeriesManager;

  // Roof hiding system
  private roofManager?: RoofManager;
  private roofsLayer?: Phaser.Tilemaps.TilemapLayer;

  // Door system
  private doors: Door[] = [];

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
    // Load tilesets
    this.load.image('beachTileset', 'resources/tilesets/beach.png');
    this.load.image('grassTileset', 'resources/tilesets/SproutLandsGrassIslands.png');

    // Load spritesheet for puzzle elements (same as BridgePuzzleScene)
    this.load.spritesheet('sprout-tiles', 'resources/tilesets/SproutLandsGrassIslands.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load player sprite
    this.load.spritesheet('builder', 'resources/builder.png', {
      frameWidth: 32,
      frameHeight: 32
    });

    // Load NPC sprites
    this.load.image('sailorNS', 'resources/sprites/sailorNS.png');
    this.load.image('sailorEW', 'resources/sprites/sailorEW.png');

    // Load NPC icon sprites (user will provide these files)
    this.load.image(NPCIconConfig.INCOMPLETE, 'resources/sprites/icon-incomplete.png');
    this.load.image(NPCIconConfig.COMPLETE, 'resources/sprites/icon-complete.png');

    // Load TMX file asynchronously
    this.loadTmxFile();
  }

  private async loadTmxFile() {
    try {
      console.log('Loading map file...');
      const tiledMapData = await MapUtils.loadTiledMap('resources/overworld.json');

      // Add the converted map data to Phaser's cache
      this.cache.tilemap.add('overworldMap', { format: 1, data: tiledMapData });
      console.log('Map file loaded and converted successfully');
    } catch (error) {
      console.error('Failed to load map file, using fallback:', error);
      this.createFallbackMap();
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

    // Add tilesets
    const beachTileset = this.map.addTilesetImage('beach', 'beachTileset');
    const grassTileset = this.map.addTilesetImage('SproutLandsGrassIslands', 'grassTileset');

    if (!beachTileset) {
      console.error('Failed to load beach tileset');
      return;
    }

    // Auto-create all visual layers (layers with autoRender property or in the default list)
    this.setupVisualLayers(beachTileset, grassTileset);

    // Create collision layer if it exists
    this.setupCollisionLayer(beachTileset, grassTileset);

    // Create roofs layer if it exists (should be above player)
    this.setupRoofsLayer(beachTileset, grassTileset);

    // Set world bounds to match map size
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // Find player starting position
    const playerStart = this.findPlayerStartPosition();

    // Create player sprite
    this.player = this.physics.add.sprite(playerStart.x, playerStart.y, 'builder', 0);
    this.player.setCollideWorldBounds(true);

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

    // Set up input and player controller (pass collision layer for corner forgiveness)
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.playerController = new PlayerController(this, this.player, this.cursors, this.collisionLayer);

    // Enable collision between player and collision layer
    if (this.collisionLayer) {
      this.physics.add.collider(this.player, this.collisionLayer);
    }

    console.log('Overworld scene created successfully');
    console.log(`Map size: ${mapWidth}x${mapHeight}`);
    console.log(`Player start: (${playerStart.x}, ${playerStart.y})`);

    // Initialize shared puzzle HUD
    PuzzleHUDManager.getInstance().initializeHUD(this);

    // Initialize overworld puzzle system
    this.initializeOverworldPuzzles();
  }

  private async initializeOverworldPuzzles(): Promise<void> {
    try {
      console.log('Initializing overworld puzzle system...');

      // Load the tilemap data for puzzle extraction
      this.tiledMapData = await MapUtils.loadTiledMap('resources/overworld.json');

      // Now that tiledMapData is loaded, create the bridge manager if we have a bridges layer
      if (this.bridgesLayer && this.collisionLayer && !this.bridgeManager) {
        console.log('Creating bridge manager now that tiledMapData is loaded');
        this.bridgeManager = new OverworldBridgeManager(
          this.map,
          this.bridgesLayer,
          this.collisionLayer,
          this.collisionArray,
          this.tiledMapData
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

      // Initialize roof manager if we have a roofs layer
      if (this.roofsLayer && this.roofManager) {
        this.roofManager.initialize(this.map, this.roofsLayer, this.tiledMapData);
      }

    } catch (error) {
      console.error('Failed to initialize overworld puzzles:', error);
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

      const tileX = Math.floor(bounds.x / this.tiledMapData.tilewidth);
      const tileY = Math.floor(bounds.y / this.tiledMapData.tileheight);
      const width = Math.ceil(bounds.width / this.tiledMapData.tilewidth);
      const height = Math.ceil(bounds.height / this.tiledMapData.tileheight);

      // Add all tiles in the puzzle area as potential entry points
      // (We'll validate actual entry tiles when attempting to enter)
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const entryTileX = tileX + dx;
          const entryTileY = tileY + dy;

          // Check if this is actually a valid entry tile
          if (this.isPlayerOnEntryTile(entryTileX, entryTileY)) {
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
   * Load NPCs from the Tiled map "npcs" object layer
   */
  private loadNPCs(): void {
    if (!this.map) return;

    const npcsLayer = this.map.getObjectLayer('npcs');
    if (!npcsLayer) {
      console.log('No NPCs layer found in map');
      return;
    }

    for (const obj of npcsLayer.objects) {
      if (!obj.name || typeof obj.x !== 'number' || typeof obj.y !== 'number') {
        console.warn('Invalid NPC object:', obj);
        continue;
      }

      // Convert pixel coordinates to tile coordinates
      const tileX = Math.floor(obj.x / this.tiledMapData.tilewidth);
      const tileY = Math.floor(obj.y / this.tiledMapData.tileheight);

      // Get properties from Tiled object
      const properties = obj.properties as any[] | undefined;
      const conversationFile = properties?.find((p: any) => p.name === 'conversation')?.value;
      const conversationFileSolved = properties?.find((p: any) => p.name === 'conversationSolved')?.value;
      const seriesFile = properties?.find((p: any) => p.name === 'series')?.value;
      const language = properties?.find((p: any) => p.name === 'language')?.value || 'grass';
      const appearanceId = properties?.find((p: any) => p.name === 'appearance')?.value || 'sailorNS';

      // Create NPC instance
      const npc = new NPC(
        obj.name,
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
      const worldX = tileX * this.tiledMapData.tilewidth;
      const worldY = (tileY + 1) * this.tiledMapData.tileheight; // Add 1 tile to match Tiled's top-left origin
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

    // Load series for NPCs and create icons
    this.loadNPCSeries();

    // Load doors from object layer
    this.loadDoors();
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
   * Load doors from the Tiled map "doors" object layer
   */
  private loadDoors(): void {
    if (!this.map) return;

    const doorsLayer = this.map.getObjectLayer('doors');
    if (!doorsLayer) {
      console.log('No doors layer found in map');
      return;
    }

    const tileWidth = this.tiledMapData?.tilewidth || 32;
    const tileHeight = this.tiledMapData?.tileheight || 32;

    for (const obj of doorsLayer.objects) {
      try {
        const door = Door.fromTiledObject(obj, tileWidth, tileHeight);
        this.doors.push(door);
        console.log(`Loaded door: ${door.id} at positions:`, door.getPositions(), 
                    door.seriesId ? `linked to series: ${door.seriesId}` : 'no series link');
      } catch (error) {
        console.error('Error loading door from object:', obj, error);
      }
    }

    // Register doors with collision manager
    if (this.doors.length > 0) {
      this.collisionManager.registerDoors(this.doors);
      console.log(`Registered ${this.doors.length} doors with collision manager`);
    }
  }

  /**
   * Setup visual tile layers that should be automatically rendered
   * Looks for layers with the custom property "autoRender: true" or layers in the default list
   */
  private setupVisualLayers(beachTileset: Phaser.Tilemaps.Tileset | null, grassTileset: Phaser.Tilemaps.Tileset | null) {
    // Default layers to render (fallback if Tiled properties aren't set)
    const defaultVisualLayers = ['beach', 'water', 'grass', 'ground'];
    const tilesets = [beachTileset, grassTileset].filter(Boolean) as Phaser.Tilemaps.Tileset[];

    console.log('Setting up visual layers...');

    // Check all layers in the map
    for (const layerData of this.map.layers) {
      const layerName = layerData.name;

      // Skip special layers that are handled elsewhere
      if (layerName === 'collision' ||
        layerName === 'roofs' ||
        layerName === OverworldBridgeManager.getBridgesLayerName()) {
        continue;
      }

      // Check if this layer should be auto-rendered
      let shouldRender = defaultVisualLayers.includes(layerName);

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

  private setupCollisionLayer(beachTileset: Phaser.Tilemaps.Tileset | null, grassTileset: Phaser.Tilemaps.Tileset | null) {
    const collisionLayerData = this.map.getLayer('collision');
    if (collisionLayerData) {
      const tilesets = [beachTileset, grassTileset].filter(Boolean) as Phaser.Tilemaps.Tileset[];
      const collisionLayer = this.map.createLayer('collision', tilesets);

      if (collisionLayer) {
        this.collisionLayer = collisionLayer;
        this.setupCollisionDetection();
        // Make collision layer invisible but functional
        collisionLayer.setAlpha(0);
        console.log('Collision layer created and configured');
      }
    } else {
      console.warn('No collision layer found in map');
    }

    // Setup bridges layer for completed puzzles
    const bridgesLayerData = this.map.getLayer(OverworldBridgeManager.getBridgesLayerName());
    console.log(`Looking for bridges layer '${OverworldBridgeManager.getBridgesLayerName()}': ${bridgesLayerData ? 'FOUND' : 'NOT FOUND'}`);

    if (bridgesLayerData) {
      const tilesets = [grassTileset].filter(Boolean) as Phaser.Tilemaps.Tileset[];
      console.log(`Creating bridges layer with ${tilesets.length} tilesets`);
      const bridgesLayer = this.map.createLayer(OverworldBridgeManager.getBridgesLayerName(), tilesets);

      if (bridgesLayer) {
        this.bridgesLayer = bridgesLayer;
        console.log(`Bridges layer created successfully: depth=${bridgesLayer.depth}, visible=${bridgesLayer.visible}, alpha=${bridgesLayer.alpha}`);
        console.log('Bridge manager will be created after tiledMapData loads in initializeOverworldPuzzles()');
      } else {
        console.error('Failed to create bridges layer!');
      }
    } else {
      console.warn('No bridges layer found in map');
    }
  }

  private setupRoofsLayer(beachTileset: Phaser.Tilemaps.Tileset | null, grassTileset: Phaser.Tilemaps.Tileset | null) {
    // Check if roofs layer exists in the tilemap data
    const roofsLayerData = this.map.getLayer('roofs');
    console.log('Looking for roofs layer:', roofsLayerData ? 'FOUND' : 'NOT FOUND');

    if (roofsLayerData) {
      // Use both tilesets - roofs might use either
      const tilesets = [beachTileset, grassTileset].filter(Boolean) as Phaser.Tilemaps.Tileset[];
      console.log(`Creating roofs layer with ${tilesets.length} tilesets`);

      const roofsLayer = this.map.createLayer('roofs', tilesets);

      if (roofsLayer) {
        this.roofsLayer = roofsLayer;
        // Set roof layer depth to appear above player (player is at default depth 0)
        roofsLayer.setDepth(10);
        console.log(`Roofs layer created successfully: depth=${roofsLayer.depth}, visible=${roofsLayer.visible}, alpha=${roofsLayer.alpha}`);
      } else {
        console.error('Failed to create roofs layer - createLayer returned null');
      }
    } else {
      console.log('No roofs layer found in map (optional)');
    }
  }
  private findPlayerStartPosition(): { x: number; y: number } {
    try {
      // Look for player start in scene transitions layer
      const sceneTransitionsLayer = this.map.getObjectLayer('sceneTransitions');

      if (sceneTransitionsLayer) {
        const playerStartObj = sceneTransitionsLayer.objects.find(obj =>
          obj.name === 'player start'
        );

        if (playerStartObj) {
          console.log('Found player start object:', playerStartObj);
          return {
            x: playerStartObj.x || 0,
            y: playerStartObj.y || 0
          };
        }
      }
    } catch (error) {
      console.warn('Error finding player start position:', error);
    }

    // Fallback to center of map
    const centerX = this.map.widthInPixels / 2;
    const centerY = this.map.heightInPixels / 2;
    console.warn('Player start not found, using map center:', centerX, centerY);
    return { x: centerX, y: centerY };
  }

  private setupCollisionDetection() {
    if (!this.collisionLayer) return;

    // Initialize collision array
    const mapWidth = this.map.width;
    const mapHeight = this.map.height;

    this.collisionArray = [];
    for (let y = 0; y < mapHeight; y++) {
      this.collisionArray[y] = [];
      for (let x = 0; x < mapWidth; x++) {
        const tile = this.collisionLayer.getTileAt(x, y);
        // Check if tile exists and has 'collides' property set to true
        this.collisionArray[y][x] = tile && tile.properties && tile.properties.collides === true;
      }
    }

    // Set collision by property on the layer
    this.collisionLayer.setCollisionByProperty({ collides: true });

    console.log(`Collision array initialized: ${mapWidth}x${mapHeight}`);

    // Debug: count collision tiles
    let collisionCount = 0;
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (this.collisionArray[y][x]) collisionCount++;
      }
    }
    console.log(`Found ${collisionCount} collision tiles`);
  }

  update() {
    // Only handle player movement in exploration mode
    if (this.gameMode === 'exploration' && this.playerController) {
      this.playerController.update();

      // Update interaction cursor based on player position
      if (this.interactionCursor && this.tiledMapData && this.player) {
        const playerTileX = Math.floor(this.player.x / this.tiledMapData.tilewidth);
        const playerTileY = Math.floor(this.player.y / this.tiledMapData.tileheight);

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
   * Check if a tile position has collision
   */
  public hasCollisionAt(tileX: number, tileY: number): boolean {
    if (tileY < 0 || tileY >= this.collisionArray.length) return false;
    if (tileX < 0 || tileX >= this.collisionArray[0].length) return false;
    return this.collisionArray[tileY][tileX];
  }

  /**
   * Update collision at a specific tile position (for bridge building)
   */
  public setCollisionAt(tileX: number, tileY: number, hasCollision: boolean) {
    if (tileY < 0 || tileY >= this.collisionArray.length) return;
    if (tileX < 0 || tileX >= this.collisionArray[0].length) return;
    this.collisionArray[tileY][tileX] = hasCollision;

    // Update the actual tilemap layer collision if needed
    if (this.collisionLayer) {
      const tile = this.collisionLayer.getTileAt(tileX, tileY);
      if (tile) {
        tile.setCollision(hasCollision);
      }
    }
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
      const clickTileX = Math.floor(worldX / this.tiledMapData.tilewidth);
      const clickTileY = Math.floor(worldY / this.tiledMapData.tileheight);
      const playerTileX = Math.floor(playerX / this.tiledMapData.tilewidth);
      const playerTileY = Math.floor(playerY / this.tiledMapData.tileheight);

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
      // Determine which conversation to use based on series state
      const state = this.npcSeriesStates.get(npc.id);
      const seriesSolved = state?.isSeriesCompleted() ?? false;
      
      // Load conversation JSON
      const conversationPath = npc.getConversationPath(seriesSolved);
      const response = await fetch(conversationPath);
      if (!response.ok) {
        throw new Error(`Failed to load conversation: ${response.statusText}`);
      }

      const conversationSpec: ConversationSpec = await response.json();

      // Switch to conversation mode
      this.gameMode = 'conversation';
      console.log(`Switching to conversation mode with NPC: ${npc.name} (series solved: ${seriesSolved})`);

      // Get conversation scene
      const conversationScene = this.scene.get('ConversationScene') as any;
      if (!conversationScene) {
        console.error('ConversationScene not found');
        return;
      }

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
        const seriesPath = `src/data/series/${seriesId}.json`;
        const response = await fetch(seriesPath);
        if (!response.ok) {
          throw new Error(`Failed to load series: ${response.statusText}`);
        }
        const seriesJson = await response.json();
        series = await this.seriesManager!.loadSeries(seriesJson);
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
    
    // TODO: Actually launch the puzzle
    // For now, just log
    console.log(`TODO: Launch puzzle ${firstUnsolvedId} from series ${seriesId}`);
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

    console.log(`Door ${doorId} unlocked successfully`);
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
    const tileX = Math.floor(playerX / this.tiledMapData.tilewidth);
    const tileY = Math.floor(playerY / this.tiledMapData.tileheight);

    console.log(`Checking for puzzle at player position (${playerX}, ${playerY}) - tile (${tileX}, ${tileY})`);

    // Check if player is standing on a valid entry tile
    const isOnEntryTile = this.isPlayerOnEntryTile(tileX, tileY);
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

  /**
   * Check if player is standing on a valid puzzle entry tile
   */
  private isPlayerOnEntryTile(tileX: number, tileY: number): boolean {
    if (!this.map) {
      return false;
    }

    // Get all layers and check for entry tiles
    const entryTileIDs = defaultTileConfig.entryPointTileIDs;

    for (const layer of this.map.layers) {
      if (layer.tilemapLayer) {
        const tile = layer.tilemapLayer.getTileAt(tileX, tileY);
        if (tile && entryTileIDs.includes(tile.index)) {
          console.log(`Player on entry tile ${tile.index} at (${tileX}, ${tileY})`);
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
      }

      // Setup bridge click listener for removal
      this.events.on('bridge-clicked', this.handleBridgeClicked, this);

      // Setup Escape key to exit puzzle
      this.input.keyboard?.on('keydown-ESC', this.handleEscapeKey, this);

      // Delegate to controller for puzzle lifecycle
      await this.puzzleController.enterPuzzle(puzzleId, (mode: 'puzzle') => {
        this.gameMode = mode;
      });

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
      }

      // Clean up bridge click listener
      this.events.off('bridge-clicked', this.handleBridgeClicked, this);

      // Clean up Escape key listener
      this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey, this);

      // Delegate to controller for puzzle exit
      console.log('[DIAGNOSTIC] About to call puzzleController.exitPuzzle, success:', success);
      await this.puzzleController.exitPuzzle(success, (mode: 'exploration') => {
        console.log('[DIAGNOSTIC] onModeChange callback called, setting mode to:', mode);
        this.gameMode = mode;
      });
      console.log('[DIAGNOSTIC] puzzleController.exitPuzzle completed');

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
      this.exitOverworldPuzzle(false);
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
}