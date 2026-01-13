import Phaser from 'phaser';
import { MapUtils } from '@model/overworld/MapConfig';

/**
 * Overworld scene for exploring the map and finding puzzles
 */
export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private map!: Phaser.Tilemaps.Tilemap;
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionArray: boolean[][] = [];

  constructor() {
    super({ key: 'OverworldScene' });
  }

  preload() {
    // Load tilesets
    this.load.image('beachTileset', 'resources/tilesets/beach.png');
    this.load.image('grassTileset', 'resources/tilesets/SproutLandsGrassIslands.png');

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
      console.log('Loading TMX file...');
      const tiledMapData = await MapUtils.loadTiledMap('resources/overworld.json');

      console.log('TMX data loaded:', tiledMapData);
      console.log('Layers:', tiledMapData.layers);
      console.log('Tilesets:', tiledMapData.tilesets);

      // Add the converted map data to Phaser's cache
      this.cache.tilemap.add('overworldMap', { format: 1, data: tiledMapData });
      console.log('TMX file loaded and converted successfully');
    } catch (error) {
      console.error('Failed to load TMX file, using fallback:', error);
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
    // Wait for TMX loading if needed
    if (!this.cache.tilemap.exists('overworldMap')) {
      console.log('Waiting for map to load...');
      this.time.delayedCall(100, () => this.create(), [], this);
      return;
    }

    // Debug: Check what's actually in the cache
    const cachedData = this.cache.tilemap.get('overworldMap');
    console.log('Cached tilemap data:', cachedData);

    // Create the tilemap
    this.map = this.make.tilemap({ key: 'overworldMap' });

    // Debug: Check the created map
    console.log('Created map:', this.map);
    console.log('Map layers:', this.map.layers);
    console.log('Map tilesets:', this.map.tilesets);    // Add tilesets
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
  }

  private findPlayerStartPosition(): { x: number; y: number } {
    try {
      // Look for player start in scene transitions layer
      const sceneTransitionsLayer = this.map.getObjectLayer('scene transitions');

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
    this.handlePlayerMovement();
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
}