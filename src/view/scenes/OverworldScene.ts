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

/**
 * Overworld scene for exploring the map and finding puzzles
 */
export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
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

    // Create player animations
    this.createPlayerAnimations();

    // Set up input
    this.cursors = this.input.keyboard!.createCursorKeys();

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

    } catch (error) {
      console.error('Failed to initialize overworld puzzles:', error);
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
    if (this.gameMode === 'exploration') {
      this.handlePlayerMovement();
    }
  }

  private createPlayerAnimations() {
    // Walking down animations (frames 1-3, but Phaser is 0-indexed so 0-2)
    this.anims.create({
      key: 'walk-down',
      frames: this.anims.generateFrameNumbers('builder', { start: 0, end: 2 }),
      frameRate: 8,
      repeat: -1
    });

    // Walking right animations (frames 4-6, so 3-5 in 0-indexed)
    this.anims.create({
      key: 'walk-right',
      frames: this.anims.generateFrameNumbers('builder', { start: 3, end: 5 }),
      frameRate: 8,
      repeat: -1
    });

    // Walking up animations (frames 7-9, so 6-8 in 0-indexed)  
    this.anims.create({
      key: 'walk-up',
      frames: this.anims.generateFrameNumbers('builder', { start: 6, end: 8 }),
      frameRate: 8,
      repeat: -1
    });

    // Idle frames (first frame of each direction)
    this.anims.create({
      key: 'idle-down',
      frames: [{ key: 'builder', frame: 0 }],
      frameRate: 1
    });

    this.anims.create({
      key: 'idle-right',
      frames: [{ key: 'builder', frame: 3 }],
      frameRate: 1
    });

    this.anims.create({
      key: 'idle-up',
      frames: [{ key: 'builder', frame: 6 }],
      frameRate: 1
    });
  }

  private handlePlayerMovement() {
    const speed = 100;

    // Reset velocity
    this.player.setVelocity(0);

    // Horizontal movement
    if (this.cursors.left!.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
      this.player.anims.play('walk-right', true);
    } else if (this.cursors.right!.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
      this.player.anims.play('walk-right', true);
    }

    // Vertical movement
    if (this.cursors.up!.isDown) {
      this.player.setVelocityY(-speed);
      if (this.player.body!.velocity.x === 0) {
        this.player.anims.play('walk-up', true);
      }
    } else if (this.cursors.down!.isDown) {
      this.player.setVelocityY(speed);
      if (this.player.body!.velocity.x === 0) {
        this.player.anims.play('walk-down', true);
      }
    }

    // Play idle animation if not moving
    if (this.player.body!.velocity.x === 0 && this.player.body!.velocity.y === 0) {
      // Determine which idle animation based on last direction
      if (this.player.anims.currentAnim) {
        const currentAnim = this.player.anims.currentAnim.key;
        if (currentAnim.includes('up')) {
          this.player.anims.play('idle-up', true);
        } else if (currentAnim.includes('right')) {
          this.player.anims.play('idle-right', true);
        } else {
          this.player.anims.play('idle-down', true);
        }
      } else {
        this.player.anims.play('idle-down', true);
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

    console.log('Puzzle interaction set up - press E near puzzles to enter');
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

      // Disable player movement
      this.setPlayerMovementEnabled(false);

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

    console.log(`Exiting overworld puzzle: ${activeData.id} (success: ${success})`);

    this.isExitingPuzzle = true;

    try {
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
      const boundsRect = puzzleBounds ? new Phaser.Geom.Rectangle(
        puzzleBounds.x,
        puzzleBounds.y,
        puzzleBounds.width,
        puzzleBounds.height
      ) : null;

      if (success) {
        // If solved: bake bridges to bridges layer and mark as completed
        console.log('Puzzle solved - baking bridges to overworld');
        console.log(`  Bridge manager exists: ${!!this.bridgeManager}`);
        console.log(`  Bounds rect exists: ${!!boundsRect}`);
        console.log(`  Number of bridges: ${activeData.puzzle.bridges.length}`);

        if (this.bridgeManager && boundsRect) {
          const bridges = activeData.puzzle.bridges;
          console.log('  Calling bakePuzzleBridges...');
          this.bridgeManager.bakePuzzleBridges(activeData.id, boundsRect, bridges);
          console.log('  bakePuzzleBridges completed');
        } else {
          console.error('  CANNOT BAKE: missing bridge manager or bounds');
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

      // Return camera to overworld
      await this.cameraManager.transitionToOverworld();

      // Exit puzzle mode and re-enable player movement
      this.gameMode = 'exploration';
      this.setPlayerMovementEnabled(true);

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
   * Enable or disable player movement
   */
  private setPlayerMovementEnabled(enabled: boolean): void {
    if (enabled) {
      // Re-enable cursor keys
      if (!this.cursors) {
        this.cursors = this.input.keyboard!.createCursorKeys();
      }
      this.player.setVisible(true);
      console.log('Player movement enabled');
    } else {
      // Disable player movement by clearing velocity
      this.player.setVelocity(0);
      // Don't hide player - keep visible during puzzle solving
      console.log('Player movement disabled');
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