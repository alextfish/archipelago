import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';
import { OverworldPuzzleManager } from '@model/overworld/OverworldPuzzleManager';
import { OverworldGameState } from '@model/overworld/OverworldGameState';
import { CollisionManager } from '@model/overworld/CollisionManager';
import { OverworldBridgeManager } from '@model/overworld/OverworldBridgeManager';
import { CameraManager } from '@view/CameraManager';
import { EmbeddedPuzzleRenderer } from '@view/EmbeddedPuzzleRenderer';
import { PuzzleController } from '@controller/PuzzleController';
import { PuzzleInputHandler } from '@controller/PuzzleInputHandler';
import type { PuzzleHost } from '@controller/PuzzleHost';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import { PuzzleHUDManager } from '@view/ui/PuzzleHUDManager';
import { PlayerController } from '@view/PlayerController';
import { InteractionCursor, type Interactable } from '@view/InteractionCursor';

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
  private gameMode: 'exploration' | 'puzzle' = 'exploration';
  private isExitingPuzzle: boolean = false; // Guard to prevent re-entrant exit calls

  // Overworld puzzle system
  private puzzleManager: OverworldPuzzleManager;
  private gameState: OverworldGameState;
  private collisionManager: CollisionManager;
  private bridgeManager?: OverworldBridgeManager;
  private cameraManager: CameraManager;
  private activePuzzleController?: PuzzleController;
  private puzzleRenderer?: EmbeddedPuzzleRenderer;
  private puzzleInputHandler?: PuzzleInputHandler;
  private tiledMapData?: any;
  private puzzleEntryPointerHandler?: (pointer: Phaser.Input.Pointer) => void;

  // Interaction cursor system
  private interactionCursor?: InteractionCursor;
  private interactables: Interactable[] = [];

  constructor() {
    super({ key: 'OverworldScene' });

    // Initialize overworld puzzle systems
    this.puzzleManager = new OverworldPuzzleManager(defaultTileConfig);
    this.gameState = new OverworldGameState();
    this.collisionManager = new CollisionManager(this);
    this.cameraManager = new CameraManager(this);
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

    // Create the beach layer
    const beachLayer = this.map.createLayer('beach', beachTileset);
    console.log('Beach layer created:', beachLayer ? 'success' : 'failed');

    // Create collision layer if it exists
    this.setupCollisionLayer(beachTileset, grassTileset);

    // Set world bounds to match map size
    const mapWidth = this.map.widthInPixels;
    const mapHeight = this.map.heightInPixels;
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    // Find player starting position
    const playerStart = this.findPlayerStartPosition();

    // Create player sprite
    this.player = this.physics.add.sprite(playerStart.x, playerStart.y, 'builder', 0);
    this.player.setCollideWorldBounds(true);

    // Set up camera to follow player
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setZoom(2);

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

      // Set up puzzle interaction checking
      this.setupPuzzleInteraction();

      // Initialize interaction cursor
      this.initializeInteractionCursor();

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

    console.log(`Built interactables list with ${this.interactables.length} entries`);
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
  } private findPlayerStartPosition(): { x: number; y: number } {
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
    // Add E key for entering puzzles
    this.input.keyboard?.on('keydown-E', () => {
      this.checkForPuzzleEntry();
    });

    // Add pointer/touch input for mobile devices
    // Store the handler so we can remove it later if needed
    this.puzzleEntryPointerHandler = (pointer: Phaser.Input.Pointer) => {
      // Only handle clicks in exploration mode
      if (this.gameMode !== 'exploration') {
        return;
      }

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
          return;
        }

        // Clicking near player but not on interactable - try to enter puzzle at player position
        console.log(`Tap detected near player at tile (${clickTileX}, ${clickTileY})`);
        this.checkForPuzzleEntry();
      } else {
        // Tapping away from player: move towards that location
        console.log(`Tap-to-move: player at (${playerX.toFixed(0)}, ${playerY.toFixed(0)}), target (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);
        this.playerController.setTargetPosition(worldX, worldY);
      }
    };

    this.input.on('pointerdown', this.puzzleEntryPointerHandler);

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
        // Future: handle NPC interaction
        console.log('NPC interaction not yet implemented');
        break;
      case 'lever':
        // Future: handle lever interaction
        console.log('Lever interaction not yet implemented');
        break;
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
    console.log(`Entering overworld puzzle: ${puzzleId}`);

    if (!this.tiledMapData) {
      console.error('No tilemap data available for puzzle entry');
      return;
    }

    // Get the puzzle
    const puzzle = this.puzzleManager.getPuzzleById(puzzleId);
    if (!puzzle) {
      console.error(`Puzzle not found: ${puzzleId}`);
      return;
    }

    // Get puzzle bounds
    const puzzleBounds = this.puzzleManager.getPuzzleBounds(puzzleId);
    if (!puzzleBounds) {
      console.error(`No bounds found for puzzle: ${puzzleId}`);
      return;
    }

    try {
      // Set active puzzle in game state
      this.gameState.setActivePuzzle(puzzleId, puzzle);

      // Create puzzle bounds rectangle
      const boundsRect = new Phaser.Geom.Rectangle(
        puzzleBounds.x,
        puzzleBounds.y,
        puzzleBounds.width,
        puzzleBounds.height
      );

      // Blank this puzzle's region from bridges layer (whether completed or not)
      // This allows editing and restores proper collision
      if (this.bridgeManager) {
        this.bridgeManager.blankPuzzleRegion(puzzleId, boundsRect);
      }

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

      // Store camera state BEFORE stopping follow, so we capture where the camera is while following
      // Then stop following and transition
      this.cameraManager.storeCameraState();
      this.cameras.main.stopFollow();

      // Transition camera to puzzle (uses 2-cell margin defined in CameraManager)
      await this.cameraManager.transitionToPuzzle(boundsRect);

      // Create embedded puzzle renderer
      this.puzzleRenderer = new EmbeddedPuzzleRenderer(
        this,
        boundsRect,
        'sprout-tiles'
      );

      // Create puzzle controller
      this.activePuzzleController = new PuzzleController(
        puzzle,
        this.puzzleRenderer,
        this.createOverworldPuzzleHost(puzzleId)
      );

      // Set up input handling for puzzle
      this.puzzleInputHandler = new PuzzleInputHandler(
        this,
        this.activePuzzleController,
        this.puzzleRenderer
      );

      // Initialize puzzle systems
      this.puzzleRenderer.init(puzzle);
      this.puzzleInputHandler.setupInputHandlers();
      this.activePuzzleController.enterPuzzle();

      // Update collision for bridges
      this.collisionManager.updateCollisionFromBridges(puzzle, boundsRect);

      // Show HUD using PuzzleHUDManager
      PuzzleHUDManager.getInstance().enterPuzzle(
        this,
        this.activePuzzleController,
        'overworld'
      );

      // Setup HUD event listeners
      const hudScene = this.scene.get('PuzzleHUDScene');
      if (hudScene) {
        // Listen for HUD button clicks
        hudScene.events.on('exit', this.handleHUDExit, this);
        hudScene.events.on('undo', this.handleHUDUndo, this);
        hudScene.events.on('redo', this.handleHUDRedo, this);
      }

      // Setup bridge click listener for removal
      this.events.on('bridge-clicked', this.handleBridgeClicked, this);

      // Setup Escape key to exit puzzle
      this.input.keyboard?.on('keydown-ESC', this.handleEscapeKey, this);

      // Emit puzzle setup events for HUD
      const bridgeTypes = puzzle.getAvailableBridgeTypes();
      console.log('OverworldScene: Emitting setTypes with', bridgeTypes);
      this.events.emit('setTypes', bridgeTypes);

      const counts = puzzle.availableCounts();
      console.log('OverworldScene: Emitting updateCounts with', counts);
      this.events.emit('updateCounts', counts);

      console.log(`Successfully entered overworld puzzle: ${puzzleId}`);

    } catch (error) {
      console.error(`Failed to enter overworld puzzle: ${puzzleId}`, error);
      this.exitOverworldPuzzle(false);
    }
  }

  /**
   * Exit overworld puzzle mode
   */
  public async exitOverworldPuzzle(success: boolean): Promise<void> {
    // Guard against re-entrant calls (prevents infinite loop when puzzle is solved)
    if (this.isExitingPuzzle) {
      console.log('Already exiting puzzle, ignoring duplicate call');
      return;
    }

    const activeData = this.gameState.getActivePuzzle();
    if (!activeData) {
      console.warn('No active puzzle to exit');
      return;
    }

    console.log(`Exiting overworld puzzle: ${activeData.id} (success parameter: ${success})`);

    // Check if the puzzle is currently in a solved state, even if exiting via cancel/escape
    // This allows players to re-enter solved puzzles and exit without losing completion status
    if (!success && this.activePuzzleController) {
      const isSolved = this.activePuzzleController.isSolved();
      if (isSolved) {
        console.log('Puzzle is currently solved despite exit request - treating as success');
        success = true;
      }
    }

    console.log(`Final exit mode: ${success ? 'SOLVED' : 'CANCELLED'}`);

    this.isExitingPuzzle = true;

    try {
      // Clean up HUD event listeners
      const hudScene = this.scene.get('PuzzleHUDScene');
      if (hudScene) {
        hudScene.events.off('exit', this.handleHUDExit, this);
        hudScene.events.off('undo', this.handleHUDUndo, this);
        hudScene.events.off('redo', this.handleHUDRedo, this);
      }

      // Clean up bridge click listener
      this.events.off('bridge-clicked', this.handleBridgeClicked, this);

      // Clean up Escape key listener
      this.input.keyboard?.off('keydown-ESC', this.handleEscapeKey, this);

      // Hide HUD using PuzzleHUDManager
      PuzzleHUDManager.getInstance().exitPuzzle();

      // Save puzzle state before exiting
      if (this.activePuzzleController) {
        this.gameState.saveOverworldPuzzleProgress(activeData.id, activeData.puzzle);
        // Don't call controller.exitPuzzle() as it would trigger onPuzzleExited callback
        // which would call this method again, creating an infinite loop
      }

      // Clean up puzzle input handler
      if (this.puzzleInputHandler) {
        this.puzzleInputHandler.destroy();
        this.puzzleInputHandler = undefined;
      }

      // Clean up puzzle renderer
      if (this.puzzleRenderer) {
        this.puzzleRenderer.destroy();
        this.puzzleRenderer = undefined;
      }

      // Handle collision and bridge rendering based on whether puzzle was solved
      const puzzleBounds = this.puzzleManager.getPuzzleBounds(activeData.id);
      console.log(`DEBUG getPuzzleBounds for "${activeData.id}":`, puzzleBounds);
      const boundsRect = puzzleBounds ? new Phaser.Geom.Rectangle(
        puzzleBounds.x,
        puzzleBounds.y,
        puzzleBounds.width,
        puzzleBounds.height
      ) : null;

      if (success) {
        // If solved: bake bridges to bridges layer and mark as completed
        console.log('Puzzle solved - baking bridges to overworld');
        console.log(`  Active puzzle ID: "${activeData.id}"`);
        console.log(`  Bridge manager exists: ${!!this.bridgeManager}`);
        console.log(`  Puzzle bounds: ${puzzleBounds ? JSON.stringify(puzzleBounds) : 'NULL'}`);
        console.log(`  Bounds rect exists: ${!!boundsRect}`);
        console.log(`  Number of bridges: ${activeData.puzzle.bridges.length}`);

        if (this.bridgeManager && boundsRect) {
          const bridges = activeData.puzzle.bridges;
          console.log('  Calling bakePuzzleBridges...');
          this.bridgeManager.bakePuzzleBridges(activeData.id, boundsRect, bridges);
          console.log('  bakePuzzleBridges completed');
        } else {
          console.error('  CANNOT BAKE: missing bridge manager or bounds');
          console.error(`    bridgeManager: ${this.bridgeManager ? 'EXISTS' : 'NULL'}`);
          console.error(`    boundsRect: ${boundsRect ? 'EXISTS' : 'NULL'}`);
        }
        this.gameState.markPuzzleCompleted(activeData.id);
      } else {
        // If cancelled: check if it was previously completed
        const wasCompleted = this.gameState.isPuzzleCompleted(activeData.id);

        if (wasCompleted) {
          // Was completed, now being re-entered and cancelled
          // Clear completion status and blank the region again (already blanked on entry, but be explicit)
          console.log('Previously completed puzzle cancelled - clearing completion status');
          this.gameState.clearPuzzleCompletion(activeData.id);
          if (this.bridgeManager && boundsRect) {
            this.bridgeManager.blankPuzzleRegion(activeData.id, boundsRect);
          }
        } else {
          // Was never completed, just restore collision
          console.log('Incomplete puzzle cancelled - restoring collision');
          this.collisionManager.restoreOriginalCollision();
        }
      }

      // Resume camera following player BEFORE transition so it pans to player while zooming
      this.cameras.main.startFollow(this.player);

      // Return camera to overworld (just zooms, camera follow handles panning to player)
      await this.cameraManager.transitionToOverworld();

      // Exit puzzle mode and re-enable player movement
      this.gameMode = 'exploration';
      if (this.playerController) {
        this.playerController.setEnabled(true);
      }

      // Restore pointer handler for puzzle entry (it was removed by PuzzleInputHandler)
      if (this.puzzleEntryPointerHandler) {
        this.input.off('pointerdown', this.puzzleEntryPointerHandler); // Remove first to avoid duplicates
        this.input.on('pointerdown', this.puzzleEntryPointerHandler);
      }

      // Clear active puzzle
      this.gameState.clearActivePuzzle();
      this.activePuzzleController = undefined;

      console.log('Successfully exited overworld puzzle');

    } catch (error) {
      console.error('Error exiting overworld puzzle:', error);
    } finally {
      // Always reset the guard flag
      this.isExitingPuzzle = false;
    }
  }

  /**
   * Create puzzle host for overworld puzzles
   */
  private createOverworldPuzzleHost(puzzleId: string): PuzzleHost {
    return {
      loadPuzzle: (_puzzleID: string) => {
        // Already loaded
      },
      onPuzzleSolved: () => {
        console.log(`Overworld puzzle ${puzzleId} solved!`);
        this.exitOverworldPuzzle(true);
      },
      onPuzzleExited: (success: boolean) => {
        this.exitOverworldPuzzle(success);
      },
      onBridgeCountsChanged: (counts: Record<string, number>) => {
        console.log('OverworldScene: Bridge counts changed, emitting updateCounts with', counts);
        this.events.emit('updateCounts', counts);
      }
    };
  }

  /**
   * Check if currently in overworld puzzle mode
   */
  public isInPuzzleMode(): boolean {
    return this.gameState.getActivePuzzle() !== null;
  }

  /**
   * Handle HUD exit button click
   */
  private handleHUDExit(): void {
    console.log('OverworldScene: HUD Exit button clicked');
    if (this.activePuzzleController) {
      this.exitOverworldPuzzle(false);
    }
  }

  /**
   * Handle HUD undo button click
   */
  private handleHUDUndo(): void {
    console.log('OverworldScene: HUD Undo button clicked');
    if (this.activePuzzleController) {
      this.activePuzzleController.undo();
    }
  }

  /**
   * Handle HUD redo button click
   */
  private handleHUDRedo(): void {
    console.log('OverworldScene: HUD Redo button clicked');
    if (this.activePuzzleController) {
      this.activePuzzleController.redo();
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
    if (this.activePuzzleController) {
      this.activePuzzleController.removeBridge(bridgeId);
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