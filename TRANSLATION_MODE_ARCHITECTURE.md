# Translation Mode Architecture

Translation Mode is an in-game overlay that lets the player record their own guesses about what each alien glyph means.  It can be toggled at any time (overworld, conversation, puzzle screen) and persists guesses across scenes.

> **For the general architecture guide**, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Layer Summary](#layer-summary)
3. [Model Layer](#model-layer)
   - [PlayerTranslationDictionary](#playertranslationdictionary)
   - [ActiveGlyphTracker](#activeglyphtracker)
   - [Ownership in OverworldGameState](#ownership-in-overworldgamestate)
4. [View Layer](#view-layer)
   - [SpeechBubble (modified)](#speechbubble-modified)
   - [TranslationModeScene](#translationmodescene)
5. [Wiring – How It All Connects](#wiring--how-it-all-connects)
6. [Key Design Decisions](#key-design-decisions)
7. [Extending the Feature](#extending-the-feature)

---

## Feature Overview

When the player presses **Tab** or clicks the **📖 book icon** (top-left of the screen):

1. All other Phaser scenes are **paused** so movement and gameplay halt.
2. A semi-transparent dark overlay is drawn over the full viewport.
3. Every glyph currently visible in a speech bubble is **highlighted** with a yellow rectangle, and the player's current guess (if any) is shown below it.
4. Clicking a highlight opens an **inline edit panel** with a text input (rendered via Phaser's DOM API) so the player can type or update their translation.
5. Pressing **OK** or **Enter** saves the translation; **Cancel** or **Esc** discards the edit.
6. Pressing Tab again (or clicking the book icon again) **deactivates** the overlay and resumes all paused scenes.

---

## Layer Summary

```
Model (no Phaser)                   View (Phaser)
──────────────────────────────────  ──────────────────────────────────────────
PlayerTranslationDictionary         SpeechBubble
  Map<frameIndex, text>               – registers its glyphs with ActiveGlyphTracker
                                      – exposes getGlyphScreenBounds() callback
ActiveGlyphTracker                  ConversationScene
  Map<id, GlyphRegistration>          – accepts setGlyphTracker() injection
  GlyphRegistration.getBounds()       – passes tracker to SpeechBubble at create()
  (view-layer callback stored         
   in model, never called by model) TranslationModeScene
                                      – activated by Tab / 📖 icon
OverworldGameState                    – reads AllGlyphBounds from tracker
  .translationDictionary              – draws highlights + labels
  .glyphTracker                       – edit panel uses this.add.dom('input', …)
                                      – writes to PlayerTranslationDictionary
```

---

## Model Layer

### PlayerTranslationDictionary

**File:** `src/model/translation/PlayerTranslationDictionary.ts`

Pure model (no Phaser) that maps **glyph tileset frame indices** to the player's typed translation strings.

```typescript
const dict = new PlayerTranslationDictionary();

dict.setTranslation(30, 'you');   // stores trimmed text
dict.setTranslation(31, '  ');   // empty/whitespace → deletes entry
dict.getTranslation(30);          // → 'you'
dict.hasTranslation(30);          // → true
dict.getAllTranslations();         // → ReadonlyMap<number, string>
dict.deleteTranslation(30);       // removes one entry
dict.clearAll();                  // resets everything
```

**Key rule:** The key is always the **tileset frame index** (integer), not the language name or display position. This makes translations language-agnostic and stable across scene changes.

Passing an empty or whitespace-only string to `setTranslation` removes the entry rather than storing a blank.

---

### ActiveGlyphTracker

**File:** `src/model/translation/ActiveGlyphTracker.ts`

Pure model that maintains a live registry of all glyph sets currently on screen.  View components call `registerGlyphSet()` when they display glyphs and `unregisterGlyphSet()` when they hide or destroy them.

**Key types:**

```typescript
interface TrackedGlyph {
    frameIndex: number;      // tileset frame index
    indexInBubble: number;   // left-to-right position within the bubble
}

// Provided by the view layer; returns current screen bounds or null if hidden
type GlyphBoundsProvider = () => GlyphScreenBounds[] | null;

interface GlyphScreenBounds {
    frameIndex: number;
    indexInBubble: number;
    screenX: number;   // top-left corner, viewport pixels
    screenY: number;
    tileSize: number;  // scaled tile size in pixels
}

interface GlyphRegistration {
    id: string;              // unique key, e.g. "speech-bubble-0"
    language: string;        // e.g. "grass", "fire"
    glyphs: TrackedGlyph[];
    getBounds: GlyphBoundsProvider;   // view-layer callback
}
```

**Why store a callback in the model?**  The `getBounds` callback is a view-layer function, but it is _stored_ in the model rather than called by it.  `TranslationModeScene` (a view class) is the only caller.  This avoids the need for the model to import Phaser while still keeping the lookup logic centralised.  The alternative—storing screen coordinates directly—would require re-registering on every frame, which is wasteful.

**API summary:**

```typescript
tracker.registerGlyphSet(registration);    // add or replace by id
tracker.unregisterGlyphSet(id);            // remove
tracker.hasRegistration(id);
tracker.getRegistrations();                // ReadonlyMap<string, GlyphRegistration>
tracker.getAllGlyphBounds();               // calls getBounds() on each entry; skips nulls
tracker.clearAll();
```

---

### Ownership in OverworldGameState

**File:** `src/model/overworld/OverworldGameState.ts`

Both model objects are owned as public readonly fields of `OverworldGameState` so that every scene that needs them can reach them through a single shared reference:

```typescript
class OverworldGameState {
    readonly translationDictionary: PlayerTranslationDictionary = new PlayerTranslationDictionary();
    readonly glyphTracker:          ActiveGlyphTracker          = new ActiveGlyphTracker();
    // ...
}
```

The translation dictionary is included in `exportState()` / `importState()` so that translations survive save/load cycles:

```typescript
// exportState() fragment
translationDictionary: Object.fromEntries(
    Array.from(this.translationDictionary.getAllTranslations())
        .map(([frame, text]) => [String(frame), text])
),

// importState() fragment
if (state.translationDictionary) {
    this.translationDictionary.clearAll();
    for (const [frameStr, text] of Object.entries(state.translationDictionary)) {
        this.translationDictionary.setTranslation(Number(frameStr), text);
    }
}
```

---

## View Layer

### SpeechBubble (modified)

**File:** `src/view/conversation/SpeechBubble.ts`

`SpeechBubble` was extended to participate in the tracker system:

| New member | Purpose |
|---|---|
| `static nextID` | Counter that generates a unique `registrationID` per instance |
| `registrationID` | Stable key used for all tracker calls from this instance |
| `glyphFrameIndices: number[]` | Parallel array to `glyphSprites`, stores the frame index of each sprite |
| `currentTileSize: number` | Tile size recorded at `create()` time, used in `getGlyphScreenBounds()` |
| `setGlyphTracker(tracker)` | Inject the tracker; can be called before or after `create()` |
| `getGlyphScreenBounds()` | Computes live screen coordinates via the container's world-transform matrix |

**Lifecycle hooks:**

- `create()` → calls `tracker.registerGlyphSet()` with a `getBounds` closure pointing at `getGlyphScreenBounds()`.
- `clear()` → calls `tracker.unregisterGlyphSet()` _before_ destroying sprites.
- `destroy()` → calls `clear()` first.

**Screen-bounds calculation:**

```typescript
getGlyphScreenBounds(): GlyphScreenBounds[] | null {
    if (this.glyphSprites.length === 0) return null;
    const scale = this.container.scaleX;
    const scaledTile = this.currentTileSize * scale;
    const matrix = this.container.getWorldTransformMatrix();
    return this.glyphSprites.map((sprite, i) => ({
        frameIndex:    this.glyphFrameIndices[i],
        indexInBubble: i,
        screenX: matrix.tx + sprite.x * matrix.a + sprite.y * matrix.c,
        screenY: matrix.ty + sprite.x * matrix.b + sprite.y * matrix.d,
        tileSize: scaledTile,
    }));
}
```

---

### TranslationModeScene

**File:** `src/view/scenes/TranslationModeScene.ts`

A permanent overlay Phaser scene (always in the scene list, always running) that renders the translation UI.

**Scene key:** `'TranslationModeScene'`

**Initialization:**

`setServices(tracker, dictionary)` must be called before the first activation.  `OverworldScene` does this immediately after launching the scene.

**Render-depth stack (while active):**

| Layer | Depth | Description |
|---|---|---|
| Dark overlay | 100 | Semi-transparent black rectangle |
| Glyph highlights | 110 | Yellow outline rectangles around each glyph |
| Translation labels | 120 | Player's current guess, shown below each glyph |
| Edit panel (Phaser) | 130 | Dark background panel with prompt text, OK, Cancel |
| DOM input | 131 | `<input type="text">` via `this.add.dom()` |
| Book icon | 140 | Always-visible 📖 toggle button |

**Edit panel input:**

The text input is created using Phaser's DOM API rather than raw `document.createElement`:

```typescript
this.editInput = this.add.dom(
    px + 8,
    py + 34,
    'input',
    {
        type: 'text',
        maxlength: '40',
        value: currentValue,
        style: 'font: 14px monospace; padding: 2px 4px; width: 180px;',
    }
);
(this.editInput.node as HTMLInputElement).focus();
```

This requires `dom: { createContainer: true }` in the Phaser game config (`src/main.ts`) — which is already set.

**Keyboard shortcuts (while edit panel is open):**

- `Enter` → commit translation
- `Esc` → cancel edit

The keys are stored as class fields in `create()` (via `this.input.keyboard.addKey()`) and checked in `update()` with `Phaser.Input.Keyboard.JustDown()` to avoid re-creating key objects every frame.

---

## Wiring – How It All Connects

```
main.ts
  └─ Phaser config: dom.createContainer = true
  └─ scene list: [..., TranslationModeScene]

OverworldScene.create()  (after map load)
  └─ launchTranslationMode()
       ├─ scene.launch('TranslationModeScene')
       └─ translationScene.setServices(
              gameState.glyphTracker,
              gameState.translationDictionary
          )

OverworldScene.startConversationWithNPC()
  └─ conversationScene.setGlyphTracker(gameState.glyphTracker)

ConversationScene.setGlyphTracker(tracker)
  └─ stores tracker
  └─ if speechBubble already exists: speechBubble.setGlyphTracker(tracker)

ConversationScene.create()
  └─ speechBubble = new SpeechBubble(...)
  └─ if glyphTracker already set: speechBubble.setGlyphTracker(glyphTracker)

SpeechBubble.create(glyphFrames, language, ...)
  └─ glyphTracker.registerGlyphSet({
         id, language, glyphs,
         getBounds: () => this.getGlyphScreenBounds()
     })

SpeechBubble.clear()
  └─ glyphTracker.unregisterGlyphSet(id)

Player presses Tab  (or clicks 📖)
  └─ TranslationModeScene.toggle()
       ├─ activate():
       │    ├─ pause all other scenes
       │    ├─ show overlay
       │    └─ buildHighlights()
       │         ├─ glyphTracker.getAllGlyphBounds()
       │         └─ for each bound: add rect + label
       └─ deactivate():
            ├─ close edit panel
            ├─ clear highlights
            ├─ hide overlay
            └─ resume paused scenes

Player clicks highlight rect
  └─ openEditPanel(frameIndex, ...)
       └─ this.add.dom('input', ...)

Player clicks OK / presses Enter
  └─ commitEdit()
       ├─ translationDict.setTranslation(frameIndex, inputEl.value)
       └─ refreshLabel(frameIndex)
```

---

## Key Design Decisions

### 1. Frame index as the translation key

All translations are keyed on the **tileset frame index** (integer), not language name, glyph text, or display position.  Frame indices are stable across scene reloads, map changes, and scale changes.

### 2. GlyphBoundsProvider callback pattern

`ActiveGlyphTracker` stores a view-layer callback but never calls it—that is the responsibility of `TranslationModeScene`.  This keeps the model completely free of Phaser imports while avoiding the overhead of re-registering coordinates on every frame.

### 3. setGlyphTracker is idempotent and order-independent

`ConversationScene.setGlyphTracker()` and `SpeechBubble.setGlyphTracker()` handle being called before or after `create()`, so it doesn't matter whether `OverworldScene` injects the tracker before or after Phaser has finished creating the scene.

### 4. TranslationModeScene is always running

The scene is launched once in `OverworldScene.create()` and stays in the scene manager for the rest of the session.  It does nothing while `overlay.visible === false` (zero cost when inactive).  Keeping it permanent avoids re-creating the book icon and re-binding the keyboard every time the player opens the notebook.

### 5. Phaser DOM API for text input

Using `this.add.dom('input', …)` rather than `document.createElement` keeps the input element inside Phaser's managed DOM container, ensuring correct positioning and lifecycle management.  This requires `dom: { createContainer: true }` in the Phaser config.

---

## Extending the Feature

### Adding translations to puzzle-screen glyphs

The current implementation only registers glyphs from `SpeechBubble`.  To support glyphs in other view components (e.g. constraint labels):

1. Inject `ActiveGlyphTracker` into the relevant scene (same pattern as `ConversationScene.setGlyphTracker()`).
2. Call `tracker.registerGlyphSet(...)` when the glyphs are created and `tracker.unregisterGlyphSet(id)` when removed.
3. Provide a `getBounds` callback that computes screen coordinates from the Phaser game object's world transform.

### Persisting translations server-side

`OverworldGameState.exportState()` already serialises the dictionary as a plain `Record<string, string>` (keys are stringified frame indices).  Wire this into any save/load mechanism.

### Showing "correct" translations after puzzle completion

Compare `PlayerTranslationDictionary.getAllTranslations()` against a ground-truth map (loaded from a data file) and highlight correct entries green and incorrect ones red in the overlay.
