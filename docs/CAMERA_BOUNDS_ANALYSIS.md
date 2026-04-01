# Camera Bounds & Coordinate Mapping Analysis

This document analyses how camera zoom, bounds, and world↔screen coordinate mapping work across the four main rendering contexts. Issues are marked **⚠︎**.

---

## (a) Overworld — `OverworldScene`

### Setup

`OverworldScene.create()` configures the camera once:

```ts
this.cameras.main.startFollow(this.player);
this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
this.cameras.main.setZoom(2);
this.cameras.main.roundPixels = true;
```

- Zoom is a fixed **2×** during exploration.
- Camera bounds are set to the full map and are **never removed**.
- `roundPixels` prevents sub-pixel gaps in the tilemap.

### Puzzle entry / exit

`OverworldPuzzleController.enterPuzzle()` calls:

1. `onModeChange('puzzle')` → `cameras.main.stopFollow()` (in OverworldScene)
2. `cameraManager.storeCameraState()` → captures `scrollX/Y` and `zoom`
3. `await cameraManager.transitionToPuzzle(boundsRect)` → `camera.pan()` + `camera.zoomTo()`

On exit:

1. `await cameraManager.transitionToOverworld()` → tweens `scrollX/Y` to stored position and `zoomTo(originalZoom)` simultaneously
2. `onModeChange('exploration')` → `cameras.main.startFollow(player)` which re-centres

### Issues

**Camera bounds during puzzle mode — accepted.**  
Phaser clamps `camera.pan()` to the map bounds, so a puzzle very close to a map edge may not be fully centred on screen. This is acceptable; no puzzles will be placed at the map edge.

**⚠︎ `storeCameraState()` is called after `stopFollow()`.**  
The `CameraManager` comment says "Should be called BEFORE stopping camera follow." In practice `scrollX/Y` is unchanged immediately after `stopFollow()`, so no bug manifests, but the call order contradicts the documented intent and could break subtly if Phaser ever adjusts scroll on follow-stop.

**✓ `transitionToOverworld()` — fixed.**  
Previously only zoomed back without panning, leaving the camera centred on the puzzle until `startFollow` snapped it to the player. The first fix added a `camera.pan()` call, but `pan()` bakes its scroll target at the current (puzzle) zoom, so it over-shoots when the puzzle zoom differs from the overworld zoom (< 2× for large puzzles → camera ends up too far up-left). The final fix tweens `scrollX`/`scrollY` directly to the stored `originalX`/`originalY`, which is zoom-independent, then simultaneously restores zoom with `zoomTo()`. The camera now animates smoothly back to the player's position regardless of puzzle zoom level.

**`originalBounds` — dead code.**  
`storeCameraState()` populates an `originalBounds` `Phaser.Geom.Rectangle` (scroll + viewport dimensions at current zoom). Its width/height data are never used: all restoration logic uses `originalX`, `originalY`, `originalCenterX`, `originalCenterY` stored separately. `originalBounds` is only tested for `!== null` as a sentinel flag, which a simple `private hasStoredState: boolean` would express more clearly. Not a correctness issue.

---

## (b) Overworld Conversation — `ConversationScene`

### Setup

`ConversationScene` is launched as a Phaser overlay scene via `this.scene.launch('ConversationScene')`. Overlay scenes start with a default camera: **zoom = 1, scrollX/Y = 0, no bounds**.

All UI objects are positioned in screen-pixel coordinates:

```ts
this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, ...);
// speechBubble placed at:
const bubbleX = (this.scale.width - bubbleWidth) / 2;
this.speechBubble.setPosition(bubbleX, this.SPEECH_BUBBLE_Y);  // SPEECH_BUBBLE_Y = 150
```

This is correct because in a fresh overlay scene, world coords equal screen coords.

### `SpeechBubble.getGlyphScreenBounds()` — world-to-screen projection

```ts
const screenX = (worldX - camera.scrollX) * camera.zoom + camera.x;
const screenY = (worldY - camera.scrollY) * camera.zoom + camera.y;
```

With the ConversationScene camera at zoom=1, scroll=0, the formula is an identity transform. This is correct for Translation Mode glyph hit-testing.

### Issues

**⚠︎ `SpeechBubble` is also used inside `ConstraintFeedbackDisplay` in OverworldScene.**  
`EmbeddedPuzzleRenderer` (and `FlowPuzzleRenderer`) create a `ConstraintFeedbackDisplay`, which internally creates a `SpeechBubble` whose `this.scene` is the `OverworldScene`. If `getGlyphScreenBounds()` is called from that context the same projection formula runs against the overworld camera (zoom=2 normally, variable in puzzle mode). The formula is mathematically correct for world-space positions, but the container world-transform matrix (`matrix.tx`, `matrix.ty`) will reflect the OverworldScene coordinate system. This should work, but it has never been stress-tested against a zoomed-in puzzle-mode camera.

**⚠︎ No camera bounds.**  
There are no bounds set, meaning the ConversationScene camera can theoretically be scrolled (by Phaser internals or external code). In practice nothing scrolls it, but an accidental `setScroll` would break all screen-space positioning silently.

---

## (c) Overworld Puzzles — `EmbeddedPuzzleRenderer`

### Coordinate pipeline

```
pointer.x / pointer.y   (canvas pixel coords, same across all scenes)
    ↓
PuzzleInputHandler.setupPointerInput()
    ↓
EmbeddedPuzzleRenderer.screenToGrid(screenX, screenY)
    camera.getWorldPoint(screenX, screenY)   → world coords (accounts for zoom + scroll)
    gridMapper.worldToGrid(wx, wy)           → grid coords (subtracts puzzleBounds offset)
```

`gridMapper` is constructed with `offsetX = puzzleBounds.x`, `offsetY = puzzleBounds.y`, so puzzle-relative grid positions are computed correctly even though the puzzle sits at an arbitrary world position.

For `pointermove` (smooth preview), `PuzzleInputHandler` uses `camera.getWorldPoint(pointer.x, pointer.y)` directly and passes raw world coords to `onPointerMove`. This is consistent with `screenToGrid`.

### Issues

**Bounds clamping during puzzle pan — accepted.**  
Same situation as (a): `camera.pan()` is constrained by `setBounds(0, 0, mapWidth, mapHeight)`. No overworld puzzles are placed near the map edge, so this has no practical effect. `screenToGrid` reads the actual (clamped) scroll and remains correct regardless.

**⚠︎ `CameraManager.calculatePuzzleView()` computes zoom against full viewport size.**  
```ts
const scaleX = camera.width / paddedBounds.width;
const scaleY = camera.height / paddedBounds.height;
const targetZoom = Math.min(scaleX, scaleY);
```
`camera.width` / `camera.height` are the full canvas dimensions (e.g. 800×600). The `PuzzleHUDScene` overlay occupies part of the screen (sidebar/bottom bar). The computed zoom does not account for HUD space, so the puzzle may appear partially behind the HUD when zoomed in.

**⚠︎ No camera bounds reset after puzzle exit.**  
`CameraManager.transitionToOverworld()` does not restore any map bounds after transitioning. If bounds were changed (or removed) for puzzle mode they would stay wrong. Currently bounds are never touched during transitions, so this is a latent issue.

---

## (d) Standalone Series Puzzles — `BridgePuzzleScene` + `IslandMapScene`

### Scene layout

`BridgePuzzleScene` is the controller scene — it has **no camera setup of its own** and relies on `IslandMapScene` for all rendering and coordinate conversion.

`IslandMapScene` is launched as a sibling: `this.scene.launch('IslandMapScene')`.

### Camera setup in `IslandMapScene.adjustCameraForIslands()`

```ts
const zoom = Math.min(zoomX, zoomY) * 0.66;
this.cameras.main.setZoom(zoom);
this.cameras.main.centerOn(worldCentre.x, worldCentre.y);
// … then a nudge:
const dxScreen = availCentreX - fullCentreX;  // always 0 (see below)
```

### Coordinate pipeline

```
pointer.x / pointer.y   (canvas coords from BridgePuzzleScene input)
    ↓
BridgePuzzleScene.setupInputHandlers()
    mapScene.events.emit('screenToWorld', pointer.x, pointer.y, callback)
    ↓
IslandMapScene listener:
    this.cameras.main.getWorldPoint(screenX, screenY)  → world coords (correct)
    ↓
mapScene.events.emit('worldToGrid', wx, wy, callback)
    ↓
IslandMapScene listener:
    this.gridMapper.worldToGrid(wx, wy)  → grid coords (offset=0)
```

This delegation is functionally correct because `pointer.x/y` are canvas-space coordinates regardless of which scene received the event.

### Issues

**⚠︎ Nudge calculation in `adjustCameraForIslands` is always zero.**  
```ts
const availWidth = this.scale.width;          // e.g. 800
const availCentreX = availWidth / 2;          // 400
const fullCentreX = (this.scale?.width ?? 800) / 2;  // also 400
const dxScreen = availCentreX - fullCentreX;  // 0 — always!
```
The variables are identical, so `worldDeltaX = worldDeltaY = 0`. The nudge is dead code. The camera is centred by `centerOn()` alone. The code appears to have been written to handle a HUD sidebar offset but was never wired up.

**⚠︎ No camera bounds set in `IslandMapScene`.**  
`adjustCameraForIslands()` never calls `camera.setBounds()`. If the computed zoom places the island world-centre close to (0,0), the camera can scroll to negative coordinates showing empty space. There is no guard against the puzzle rendering in the void.

**⚠︎ Zoom uses full `scale.width/height`, ignoring HUD overlay.**  
`PuzzleHUDScene` overlays the bottom/side of the screen. `adjustCameraForIslands()` uses full canvas dimensions, so the computed zoom factor and centering do not account for HUD-occupied area. Puzzles may be partially occluded.

**⚠︎ `BridgePuzzleScene.gridMapperProxy` duplicates IslandMapScene's mapping.**  
```ts
gridMapperProxy = {
    gridToWorld: (gridX, gridY) => ({ x: gridX * 32, y: gridY * 32 }),
    worldToGrid: (worldX, worldY) => ({ x: Math.floor(worldX / 32), y: Math.floor(worldY / 32) })
};
```
This hardcodes `cellSize=32` and `offset=(0,0)`, mirroring `IslandMapScene`'s `new GridToWorldMapper(32)`. If IslandMapScene ever changes its offset (e.g., to account for HUD or centering), the proxy would silently diverge, breaking coordinate round-trips.

**⚠︎ Input events can be lost if `IslandMapScene` is not yet ready.**  
`BridgePuzzleScene` fires `screenToWorld` / `worldToGrid` events before `islandMapReady` is guaranteed. Early pointer events find no listener and are silently dropped.

---

## Summary Table

| Context | Zoom setup | Bounds set | Bounds cleared for puzzle | Screen→World method | Known offset issues |
|---|---|---|---|---|---|
| Overworld (exploration) | `setZoom(2)` + `startFollow` | Yes (full map) | Never | N/A (no puzzle input) | — |
| Overworld (puzzle mode) | `zoomTo(fit)` via CameraManager | Yes (full map, not cleared) | No (accepted) | `getWorldPoint()` via `EmbeddedPuzzleRenderer` | Edge clamping: accepted. HUD area not excluded from zoom calc ⚠︎ |
| ConversationScene | Default (1×, no scroll) | None | N/A | N/A (screen-space UI) | `SpeechBubble.getGlyphScreenBounds()` assumes zoom=1 |
| BridgePuzzleScene | None (unused) | None | N/A | Delegated to IslandMapScene | — |
| IslandMapScene | `setZoom(fit * 0.66)` | **None ⚠︎** | N/A | `getWorldPoint()` | Nudge calc is no-op; HUD area not excluded |

---

## Recommended Fixes (Priority Order)

1. ~~**Clear camera bounds when entering puzzle mode.**~~ Accepted — no puzzles near map edges.
2. ✓ **`transitionToOverworld()` now pans back simultanously with zoom** so there is no visual snap when `startFollow` resumes.
3. **Account for HUD space in zoom calculations.** Both `CameraManager.calculatePuzzleView()` and `IslandMapScene.adjustCameraForIslands()` should subtract the HUD's on-screen rectangle from the available canvas area before computing zoom and centre.
4. **Set camera bounds in `IslandMapScene`** after computing the island extent, with some padding.
5. **Fix or remove the dead nudge code** in `IslandMapScene.adjustCameraForIslands()`.
6. **Replace `BridgePuzzleScene.gridMapperProxy`** with a proper reference to IslandMapScene's `GridToWorldMapper` instance (passed through an event or direct scene reference).
7. **Swap order in `enterPuzzle`**: call `storeCameraState()` before `onModeChange('puzzle')` (before `stopFollow()`) to honour the documented contract.
8. **`originalBounds` dead code**: replace the `Phaser.Geom.Rectangle` sentinel with a `private hasStoredState: boolean` field to clarify intent.
