# Tiled Map Object Configuration

This document describes the required and optional metadata for objects in the Tiled map editor for the Archipelago game.

## Door Objects

Doors are defined in the **"doors"** object layer in Tiled.

### Required Properties

- **name**: Unique identifier for the door (string)
  - Example: `"gate1"`, `"castle-door"`, `"tutorial-exit"`
- **x, y**: Position in pixels (numbers)
  - These are set automatically by Tiled when placing the object
- **width, height**: Size in pixels (numbers)
  - Door can span multiple tiles (e.g., 32x64 for a 2-tile tall door)

### Optional Custom Properties

Add these as custom properties in Tiled:

- **seriesId**: ID of the puzzle series that unlocks this door (string)
  - Example: `"tutorial-series"`, `"island-chain-series"`
  - When the linked series is completed, the door will unlock
  - If not specified, door starts unlocked

- **spriteId**: Sprite identifier for rendering the door (string)
  - Example: `"wooden-door"`, `"iron-gate"`, `"castle-door"`
  - Used by the view layer to determine which sprite to render
  - If not specified, no sprite is rendered (collision-only door)

### Example Door Configuration

In Tiled:
1. Create an object in the "doors" layer
2. Set name to `"tutorial-gate"`
3. Position and size the object (e.g., 64x32 pixels)
4. Add custom properties:
   - `seriesId` (string): `"tutorial-series"`
   - `spriteId` (string): `"wooden-door"`

## NPC Objects

NPCs are defined in the **"npcs"** object layer in Tiled.

### Required Properties

- **name**: Unique identifier for the NPC (string)
  - Example: `"sailor1"`, `"guide"`, `"fisherman"`
- **x, y**: Position in pixels (numbers)
  - These are set automatically by Tiled when placing the object

### Required Custom Properties

- **appearance**: Sprite ID for the NPC (string)
  - Example: `"sailorNS"`, `"sailorEW"`
  - Determines which sprite is used to render the NPC

- **language**: Language identifier (string)
  - Example: `"grass"`, `"fire"`
  - Determines which language glyphs the NPC uses

### Optional Custom Properties

- **conversation**: Filename of the regular conversation JSON (string)
  - Example: `"sailor1_vertical.json"`
  - File should be in `resources/conversations/`
  - This conversation is used when the NPC's series is not yet solved

- **conversationSolved**: Filename of the post-series conversation JSON (string)
  - Example: `"sailor1_solved.json"`
  - File should be in `resources/conversations/`
  - This conversation is used after the NPC's linked series is completed
  - If not specified, uses `conversation` file for both states

- **series**: Filename of the puzzle series JSON (string)
  - Example: `"tutorial-series.json"`
  - File should be in `src/data/series/`
  - Links this NPC to a puzzle series, showing progress icons
  - If not specified, NPC has no series (no icon displayed)

### Example NPC Configuration

In Tiled:
1. Create an object in the "npcs" layer
2. Set name to `"guide"`
3. Position the object at the desired tile location
4. Add custom properties:
   - `appearance` (string): `"sailorNS"`
   - `language` (string): `"grass"`
   - `conversation` (string): `"guide_intro.json"`
   - `conversationSolved` (string): `"guide_thanks.json"`
   - `series` (string): `"tutorial-series.json"`

## NPC Icons

When an NPC has a linked series, an icon appears above their sprite:

- **Incomplete icon** (`icon-incomplete`): Red/orange icon indicating unsolved puzzles
  - Shown when series exists but not all puzzles are completed
  - Sprite file: `resources/sprites/icon-incomplete.png`

- **Complete icon** (`icon-complete`): Green icon indicating all puzzles solved
  - Shown when all puzzles in the series are completed
  - Sprite file: `resources/sprites/icon-complete.png`

Icon position and styling are controlled by `NPCIconConfig` in the code:
- Positioned 20 pixels above NPC sprite
- Scales with `ICON_SCALE` (default: 1.0)
- Renders above NPC using depth offset

## Conversation Effects

Conversations can trigger various effects through the `effects` array in conversation choices:

### startSeries Effect

Launches a puzzle series when the player selects a conversation choice.

```json
{
  "type": "startSeries",
  "seriesId": "tutorial-series"
}
```

- Loads the specified series
- Jumps directly to the first unsolved puzzle
- Series progress is automatically saved

### unlockDoor Effect

Unlocks a door when triggered.

```json
{
  "type": "unlockDoor",
  "doorId": "tutorial-gate"
}
```

- Unlocks the specified door by ID
- Updates collision to allow passage
- Door state is saved in game state

## Implementation Notes

### Loading Order

1. Map loads with collision layer
2. NPCs are loaded from "npcs" layer
3. NPC series are loaded asynchronously
4. NPC icons are created based on series completion state
5. Doors are loaded from "doors" layer
6. Doors are registered with CollisionManager

### Collision Behavior

- **Locked doors**: Block player movement (collision enabled)
- **Unlocked doors**: Allow passage (collision disabled)
- **Door unlocking**: Immediately updates collision state

### Series Progress

- Series progress is stored in browser localStorage
- Progress persists across game sessions
- Icons update when series completion state changes
- Conversation file switches to "solved" version when series completes
