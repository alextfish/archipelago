# Coordinate Systems in Archipelago

This document describes every coordinate system used in the game and explains which system to use when placing or querying objects in each game context.

> For general architecture guidance, see [ARCHITECTURE.md](ARCHITECTURE.md).  
> For AI agent guidelines, see [AGENTS.md](AGENTS.md).

## Contents

1. [The Three Coordinate Systems](#the-three-coordinate-systems)
2. [Quick-Reference Table](#quick-reference-table)
3. [Overworld Navigation](#1-overworld-navigation)
4. [Overworld Conversation](#2-overworld-conversation)
5. [Embedded Overworld Puzzles](#3-embedded-overworld-puzzles)
6. [Standalone Series Puzzles](#4-standalone-series-puzzles)
7. [Translation Mode](#5-translation-mode)
8. [Conversion Formulas](#conversion-formulas)

---

## The Three Coordinate Systems

The codebase uses three distinct coordinate spaces.  Understanding which space is active in a given context is the most important thing to get right.

### Screen / Viewport Coordinates

- Origin at the **top-left corner of the game canvas** `(0, 0)`.
- X increases to the right; Y increases downward.
- Unit is **pixels as rendered on the player's display**.
- **Independent of camera position and zoom** – screen `(0, 0)` is always the top-left of the visible area regardless of where the camera is looking.
- Used by: ConversationScene layout, TranslationModeScene glyph positions, any element positioned with `this.scale.width / this.scale.height`.

### World Coordinates

- Origin at the **top-left corner of the Tiled map** `(0, 0)`.
- Unit is **one pixel in the world** (before any camera zoom is applied).
- Axis directions match screen coordinates (right = +X, down = +Y).
- For the overworld, 1 tile = 32 × 32 world pixels.
- Used by: all Phaser sprites in the overworld and embedded puzzles, player position, NPC positions.

### Grid / Tile Coordinates

- Integer coordinates identifying a **cell in a puzzle or map grid**.
- One grid unit = `cellSize` world pixels (always 32 for both puzzle and overworld grids).
- Used by: `BridgePuzzle` islands and bridges (`island.x / island.y`), tile collision lookups, overworld movement target tiles.

---

## Quick-Reference Table

| Context | Scene | Camera Zoom | Coordinate Space for Sprites | Tile / Cell Size | Origin for Sprites |
|---|---|---|---|---|---|
| **Overworld navigation** | `OverworldScene` | **2×** (fixed) | World | 32 px | bottom-left `(0, 1)` for NPCs |
| **Overworld conversation** | `ConversationScene` | N/A (no camera) | Screen | 32 px base / 64 px scaled | varies by element |
| **Embedded overworld puzzle** | `OverworldScene` (same) | **Dynamic** (zooms from overworld's 2× to fit puzzle) | World + puzzle offset | 32 px | top-left `(0, 0)` |
| **Standalone series puzzle** | `IslandMapScene` | **Dynamic** (fit-to-islands) | World (no offset) | 32 px | top-left `(0, 0)` |
| **Translation mode** | `TranslationModeScene` | N/A (no camera) | Screen | 64 px (32 × 2× scale) | top-left `(0, 0)` |

---

## 1. Overworld Navigation

**Scene:** `src/view/scenes/OverworldScene.ts`

### Camera

```typescript
this.cameras.main.startFollow(this.player); // camera follows the player
this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
this.cameras.main.setZoom(2);          // fixed 2× zoom
this.cameras.main.roundPixels = true;  // avoid sub-pixel gaps between tiles
```

The camera maintains a fixed **2× zoom** at all times during normal overworld exploration.  This means every 1 world pixel occupies 2 screen pixels.

### Positioning Objects

All movable game objects (player, NPCs, doors, puzzle overlays) live in **world coordinates**.

```
worldX = tileX * tileWidth          // tileWidth = 32
worldY = (tileY + 1) * tileHeight   // +1 because Tiled stores NPC top-left,
                                    // but sprites use bottom-left origin
```

NPC sprites use `setOrigin(0, 1)` (bottom-left anchor) so that the sprite's bottom edge sits on the ground tile.

```typescript
sprite.setOrigin(0, 1); // feet at (worldX, worldY)
sprite.setDepth(worldY); // Y-sorting: higher Y = drawn on top
```

The constraint-number label above a constraint NPC is centred over the tile:

```typescript
numberSprite.setPosition(
    worldX + tileWidth / 2,
    worldY - tileHeight / 2,
);
numberSprite.setOrigin(0.5, 0.5);
```

### Converting Screen → World

When handling pointer events, Phaser automatically fills `pointer.worldX` and `pointer.worldY` taking camera zoom and scroll into account.  Use these directly:

```typescript
const worldX = pointer.worldX;
const worldY = pointer.worldY;
```

When you have raw screen coordinates and no pointer event, use:

```typescript
const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);
// worldPoint.x = (screenX / zoom) + scrollX
// worldPoint.y = (screenY / zoom) + scrollY
```

### Converting World → Tile

`OverworldScene` owns a `GridToWorldMapper` (no offset; origin at `(0, 0)`) initialised in `create()`:

```typescript
this.gridMapper = new GridToWorldMapper(this.tiledMapData?.tilewidth ?? 32);
```

Use the mapper's conversions in preference to explicit arithmetic:

```typescript
const { x: tileX, y: tileY } = this.gridMapper.worldToGrid(worldX, worldY);
const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(tileX, tileY);
```

---

## 2. Overworld Conversation

**Scene:** `src/view/scenes/ConversationScene.ts`

ConversationScene is a separate Phaser scene that runs **on top of** OverworldScene.  It has no camera and no scrolling – it renders entirely in **screen / viewport coordinates**.

### Placing the Speech Bubble

The speech bubble is **horizontally centred** in the viewport:

```typescript
const bubbleWidth = (glyphFrames.length + 2) * 32 * SPEECH_BUBBLE_SCALE;
const bubbleX = (this.scale.width - bubbleWidth) / 2;
this.speechBubble.setPosition(bubbleX, SPEECH_BUBBLE_Y);
```

Each glyph tile is **32 px** in its native tileset; the bubble is rendered at `SPEECH_BUBBLE_SCALE = 2×`, making each tile **64 px** on screen.

### Placing Choice Buttons

Buttons are laid out **horizontally, centred** in the viewport:

```typescript
const centerX = this.scale.width / 2;
const totalWidth = choices.length * CHOICE_WIDTH + (choices.length - 1) * CHOICE_SPACING;
let currentX = centerX - totalWidth / 2;
```

### Placing Portraits

NPC portrait: top-left corner + padding.  
Player portrait: top-right corner + padding.

```typescript
// NPC: (PORTRAIT_PADDING, PORTRAIT_PADDING)
// Player: (scale.width - PORTRAIT_PADDING - (32 * PORTRAIT_SCALE), PORTRAIT_PADDING)
```

---

## 3. Embedded Overworld Puzzles

**Renderer:** `src/view/EmbeddedPuzzleRenderer.ts`  
**Camera manager:** `src/view/CameraManager.ts`

An embedded puzzle is a `BridgePuzzle` displayed **inside the overworld scene**.  Elements are drawn as world-space sprites on top of the overworld tilemap.

### Coordinate Mapping

The puzzle grid uses a `GridToWorldMapper` configured with the **puzzle's world-space bounding box** as the origin offset:

```typescript
this.gridMapper = new GridToWorldMapper(32, {
    offsetX: puzzleBounds.x,  // left edge of puzzle region in world coords
    offsetY: puzzleBounds.y,  // top  edge of puzzle region in world coords
});
```

Use the GridToWorldMapper's conversions in preference to explicit conversions:
```
gridToWorld(gx, gy) rather than { wx = gx * 32 + offsetX, wy: gy * 32 + offsetY }
worldToGrid(wx, wy) rather than { gx = floor((wx - offsetX) / 32), gy = floor((wy - offsetY) / 32) }
```

### Sprite Placement

All puzzle sprites use `setOrigin(0, 0)` (top-left anchor) with depth above the overworld (depth 100):

```typescript
const worldPos = this.gridMapper.gridToWorld(island.x, island.y);
const sprite = this.scene.add.sprite(worldPos.x, worldPos.y, textureKey, FRAME_ISLAND);
sprite.setOrigin(0, 0);
this.puzzleContainer.setDepth(100); // drawn above the overworld map
```

### Camera During Puzzle

When a puzzle is entered, `CameraManager` transitions the **overworld camera** (still 2× base zoom) to zoom in on the puzzle bounds with a margin of 2 tiles:

```typescript
const padding = 2 * tileSize; // 2 × 32 = 64 px world units
const targetZoom = Math.min(camera.width / paddedWidth, camera.height / paddedHeight);
camera.pan(centerX, centerY, duration);
camera.zoomTo(targetZoom, duration);
```

After the transition, the zoom is no longer 2×; it is whatever the camera calculated to fit the puzzle.  **Always use `camera.getWorldPoint()` when converting screen clicks to world coordinates** – never hard-code the zoom value:

```typescript
screenToGrid(screenX: number, screenY: number): Point {
    const worldPoint = this.scene.cameras.main.getWorldPoint(screenX, screenY);
    return this.gridMapper.worldToGrid(worldPoint.x, worldPoint.y);
}
```

On exit, `CameraManager.transitionToOverworld()` restores the zoom to 2×.

---

## 4. Standalone Series Puzzles

**Scenes:** `src/view/scenes/BridgePuzzleScene.ts` (UI overlay) and `src/view/scenes/IslandMapScene.ts` (map rendering)

Standalone puzzles use a **dedicated `IslandMapScene`** that has its own camera.  There is no overworld; the world origin `(0, 0)` is the top-left of the puzzle space.

### Coordinate Mapping

```typescript
this.gridMapper = new GridToWorldMapper(32); // no offset; origin at (0, 0)
```

Use the GridToWorldMapper's conversions in preference to explicit conversions:
```
gridToWorld(gx, gy) rather than { wx = gx * 32 + offsetX, wy = gy * 32 + offsetY }
worldToGrid(wx, wy) rather than { gx = floor((wx - offsetX) / 32), gy = floor((wy - offsetY) / 32) }
```

### Camera Zoom (Dynamic)

The camera zoom is **calculated at startup** to fit all islands into the viewport with padding:

```typescript
const cell = 32;
const worldWidth  = (maxGX - minGX + 1) * cell;
const worldHeight = (maxGY - minGY + 1) * cell;
const padFactor   = 0.66;
const zoom = Math.min(availWidth / worldWidth, availHeight / worldHeight) * padFactor;
this.cameras.main.setZoom(zoom);
this.cameras.main.centerOn(worldCentre.x, worldCentre.y);
```

The zoom is typically in the range **0.5× – 3×** and changes with every different puzzle.  **Never assume a fixed zoom**.

The resulting camera info is exposed for test automation:

```typescript
(window as any).__PUZZLE_CAMERA_INFO__ = { zoom, scrollX, scrollY };
```

### Converting Screen → Grid

Coordinate conversion is mediated through Phaser scene events:

```typescript
// BridgePuzzleScene hands pointer events to IslandMapScene via events:
mapScene.events.emit('screenToWorld', pointer.x, pointer.y, (worldPos) => {
    mapScene.events.emit('worldToGrid', worldPos.x, worldPos.y, (gridPos) => {
        this.controller?.onPointerDown(worldPos.x, worldPos.y, gridPos.x, gridPos.y);
    });
});

// IslandMapScene handles these:
this.events.on('screenToWorld', (sx, sy, cb) => {
    cb(this.cameras.main.getWorldPoint(sx, sy));
});
this.events.on('worldToGrid', (wx, wy, cb) => {
    cb(this.gridMapper.worldToGrid(wx, wy));
});
```

### Sprite Placement

All puzzle sprites use `setOrigin(0, 0)` (top-left anchor):

```typescript
const worldPos = this.gridMapper.gridToWorld(island.x, island.y);
const sprite = this.scene.add.sprite(worldPos.x, worldPos.y, textureKey, FRAME_ISLAND);
sprite.setOrigin(0, 0);
sprite.setScale(this.gridMapper.getCellSize() / 32); // = 1.0 for 32 px cells
```

The bridge-count label is centred on the island tile:

```typescript
const labelSprite = this.scene.add.sprite(
    worldPos.x + 32 / 2,
    worldPos.y + 32 / 2,
    'bridge counts',
    count - 1,
);
labelSprite.setOrigin(0.5, 0.5);
```

---

## 5. Translation Mode

**Scene:** `src/view/scenes/TranslationModeScene.ts`  
**Model:** `src/model/translation/ActiveGlyphTracker.ts`

TranslationModeScene is an overlay scene with **no camera**.  It renders entirely in **screen / viewport coordinates** and reads glyph positions that are pre-calculated in screen space.

### How Glyph Screen Positions Are Obtained

Speech bubbles in ConversationScene record their own screen coordinates using Phaser's world transform matrix:

```typescript
// SpeechBubble.getGlyphScreenBounds()
const scale     = this.container.scaleX;       // 2 for SPEECH_BUBBLE_SCALE = 2
const scaledTile = this.currentTileSize * scale; // 32 * 2 = 64 px
const matrix    = this.container.getWorldTransformMatrix();
const screenX   = matrix.tx + sprite.x * matrix.a + sprite.y * matrix.c;
const screenY   = matrix.ty + sprite.x * matrix.b + sprite.y * matrix.d;
```

These positions are registered with `ActiveGlyphTracker` and read by TranslationModeScene via `tracker.getAllGlyphBounds()`.

### GlyphScreenBounds Interface

```typescript
interface GlyphScreenBounds {
    frameIndex:   number; // tileset frame index
    indexInBubble: number; // position left→right in the bubble
    screenX:      number; // px – top-left of glyph, viewport coordinates
    screenY:      number; // px – top-left of glyph, viewport coordinates
    tileSize:     number; // rendered side length in px (64 for 2× scale)
}
```

`screenX` and `screenY` are already in screen space: no further conversion is needed.

### Placing Highlights and Labels

```typescript
const HIGHLIGHT_PADDING = 4; // px
const x = screenX - HIGHLIGHT_PADDING;
const y = screenY - HIGHLIGHT_PADDING;
const w = tileSize + HIGHLIGHT_PADDING * 2; // 64 + 8 = 72 px
const h = tileSize + HIGHLIGHT_PADDING * 2;

const rect = this.add.rectangle(x, y, w, h);
rect.setOrigin(0, 0);

const label = this.add.text(
    screenX + tileSize / 2, // horizontally centred under glyph
    screenY + tileSize + 4,
    translationText,
);
label.setOrigin(0.5, 0);
```

The overlay rectangle covers the full viewport using `this.scale.width` / `this.scale.height`:

```typescript
this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55);
this.overlay.setOrigin(0, 0);
```

---

## Conversion Formulas

### Screen ↔ World (General)

At zoom level `z`, with camera scroll `(scrollX, scrollY)`:

```
const worldPoint = camera.getWorldPoint(screenX, screenY);

screenX = (worldX - scrollX) * z
screenY = (worldY - scrollY) * z
```

Always prefer Phaser's built-in helper `camera.getWorldPoint` over computing the screen divided by the zoom manually.

### World ↔ Grid (Overworld – via GridToWorldMapper)

```typescript
// No offset; origin at (0, 0):
gridToWorld(gx, gy)  →  { x: gx * 32,        y: gy * 32 }   // top-left of tile
worldToGrid(wx, wy)  →  { x: floor(wx / 32),  y: floor(wy / 32) }

// NPC sprite uses bottom-left origin (+1 tile on Y):
const { x: worldX, y: worldY } = this.gridMapper.gridToWorld(tileX, tileY + 1);
```

### World ↔ Grid (Puzzle – via GridToWorldMapper)

```typescript
// Standalone puzzle (no offset):
gridToWorld(gx, gy)  →  { x: gx * 32,           y: gy * 32 }
worldToGrid(wx, wy)  →  { x: floor(wx / 32),     y: floor(wy / 32) }

// Embedded puzzle (with offset = puzzle bounds top-left):
gridToWorld(gx, gy)  →  { x: gx * 32 + offsetX,                y: gy * 32 + offsetY }
worldToGrid(wx, wy)  →  { x: floor((wx - offsetX) / 32),        y: floor((wy - offsetY) / 32) }
```

### Glyph Size in Screen Pixels

| Speech bubble scale | Base tile size | Rendered tile size |
|---|---|---|
| `SPEECH_BUBBLE_SCALE = 2` | 32 px | **64 px** |

---

*See also: [`GridToWorldMapper`](src/view/GridToWorldMapper.ts), [`EmbeddedPuzzleRenderer`](src/view/EmbeddedPuzzleRenderer.ts), [`CameraManager`](src/view/CameraManager.ts), [`SpeechBubble`](src/view/conversation/SpeechBubble.ts), [`ActiveGlyphTracker`](src/model/translation/ActiveGlyphTracker.ts).*
