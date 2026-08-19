# Spell Tiled Embedding Reference

This document describes how to embed spell metadata into the Tiled map editor
for overworld puzzles that support Fire-language spell casting (island, bridge,
open). It is the authoritative reference for level designers embedding spells
into the game map.

---

## Overview

A spell puzzle requires two things in the Tiled map:

1. A `spellMetadata` JSON property on the **puzzle object** (in the `puzzles`
   layer) that declares which spells the puzzle supports and what each spell
   does when cast.

2. A set of **spatial objects** in the `spell_effects` object layer that give
   world-space positions for spawn points, wall rectangles, bridge endpoints,
   and landscape glyph anchors.

The `spell_effects` layer holds all positional data; the `spellMetadata`
property binds them to specific puzzles by referencing their Tiled object IDs.

---

## Quick-start: adding a spell to a puzzle

1. Add a new object layer named exactly `spell_effects` to the map (if not
   already present).

2. Place the relevant point / rectangle objects in `spell_effects` (see
   [Supported object roles](#supported-object-roles) below).

3. Note the Tiled-assigned numeric **id** of each object you placed.

4. Select the puzzle object in the `puzzles` layer and add or update the
   custom string property `spellMetadata` with a JSON value following the
   schema below.

---

## `spellMetadata` property schema

The `spellMetadata` property is a JSON-encoded string. Its shape:

```json
{
  "spells": [
    { ... one entry per spell ... }
  ]
}
```

At most one spell of each `kind` is allowed per puzzle.

### Common fields (all spell kinds)

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | string | ✓ | One of `"island"`, `"bridge"`, `"open"` |
| `landscapeGlyphAnchorId` | number | — | Object ID of a Point in `spell_effects` where the Fire-language glyph sprite will be displayed when the spell is cast. Omit if there is no nearby landscape glyph. |

### Island spell fields

| Field | Type | Required | Description |
|---|---|---|---|
| `spawnObjectId` | number | ✓ | Object ID of a Point in `spell_effects`. The new island rises here (world-space tile position). |
| `riseDistancePx` | number | — | How many pixels the island rises during the animation. Default: `64`. |
| `durationMs` | number | — | Animation duration in milliseconds. Default: `800`. |
| `particleColour` | string | — | Colour of the particles that fall from the rising island. Use `"blue"` for a water context (default), `"grey"` or `"cream"` for a rocky/dry context. |

### Bridge spell fields

| Field | Type | Required | Description |
|---|---|---|---|
| `startObjectId` | number | ✓ | Object ID of a Point in `spell_effects`. The new bridge's **start** island. |
| `endObjectId` | number | ✓ | Object ID of a Point in `spell_effects`. The new bridge's **end** island. |
| `bridgeType` | string | ✓ | `"normal"` or `"strut"`. |
| `particleColour` | string | — | Particle colour for the bridge-appearance animation. Default: `"blue"`. |

The new bridge is added **placed** in the puzzle at the given start/end
position. The player may pick it up and reposition it; all puzzle constraints
treat it like any other bridge.

### Open spell fields

| Field | Type | Required | Description |
|---|---|---|---|
| `leftWallObjectId` | number | ✓ | Object ID of a Rectangle in `spell_effects` that covers the **left** wall tiles. |
| `rightWallObjectId` | number | ✓ | Object ID of a Rectangle in `spell_effects` that covers the **right** wall tiles. |
| `leftShiftTiles` | number | ✓ | Number of tiles the left wall shifts **leftward** when the spell fires. |
| `rightShiftTiles` | number | ✓ | Number of tiles the right wall shifts **rightward** when the spell fires. |
| `particleColour` | string | — | Particle colour for the wall-opening animation. Default: `"blue"`. |

---

## Full example

```json
{
  "spells": [
    {
      "kind": "island",
      "landscapeGlyphAnchorId": 42,
      "spawnObjectId": 20,
      "riseDistancePx": 64,
      "durationMs": 800,
      "particleColour": "blue"
    },
    {
      "kind": "bridge",
      "startObjectId": 30,
      "endObjectId": 31,
      "bridgeType": "normal"
    },
    {
      "kind": "open",
      "landscapeGlyphAnchorId": 43,
      "leftWallObjectId": 10,
      "rightWallObjectId": 11,
      "leftShiftTiles": 2,
      "rightShiftTiles": 2,
      "particleColour": "grey"
    }
  ]
}
```

---

## Supported object roles

Every object in the `spell_effects` layer is a vanilla Tiled object (point or
rectangle). Its purpose is determined by two mandatory **custom properties**:

| Custom property | Type | Value |
|---|---|---|
| `puzzleId` | string | The `id` property of the owning puzzle object in the `puzzles` layer. |
| `role` | string | One of the role names below. |

The Tiled-assigned numeric `id` of the object is what you put into
`spellMetadata` (e.g. `"spawnObjectId": 20`).

### Point object roles

| `role` value | What it marks |
|---|---|
| `islandSpawn` | World-space tile where the new island's centre rises during the island spell. |
| `bridgeStart` | World-space tile of the start island for the bridge spell. The bridge will be placed already spanning from this island to `bridgeEnd` when the spell fires. |
| `bridgeEnd` | World-space tile of the end island for the bridge spell. |
| `glyphAnchor` | World-space position at which the Fire-language glyph sprite is displayed during the cast animation. |

Place Points at the **centre of a tile** (i.e. at multiples of the tile size in
pixel coordinates). The extractor snaps to the nearest tile automatically, but
centring avoids ambiguity.

### Rectangle object roles

| `role` value | What it marks |
|---|---|
| `openLeftWall` | All tiles whose pixel bounds overlap this rectangle are the **left wall** of the open spell. These tiles are shifted `leftShiftTiles` tiles to the left when the spell fires and become walkable. |
| `openRightWall` | All tiles whose pixel bounds overlap this rectangle are the **right wall**. Shifted `rightShiftTiles` tiles to the right and become walkable. |

Align rectangle edges to tile boundaries to avoid including unintended tiles.
The extractor derives the tile set from the rectangle using the map's tile size.

---

## How wall movement works (Open spell)

When the Open spell fires for the first time:

1. All tiles covered by the `openLeftWall` rectangle shift left by
   `leftShiftTiles` tiles in the overworld collision map: they are removed
   from the blocked tile set and placed at their new (shifted) positions.
2. All tiles covered by the `openRightWall` rectangle shift right by
   `rightShiftTiles` tiles similarly.
3. The now-vacated tile positions become walkable in the puzzle-local grid and
   in the overworld collision layer.

On subsequent loads (if the spell has already been cast), the same walkability
is applied immediately without replaying the animation.

On **repeat casts** (the player re-forms the spell shape after it has already
fired), the wall-movement animation plays in grey but no collision change
occurs.

---

## How the new island is positioned (Island spell)

The `islandSpawn` point gives the **world-space pixel position** of the new
island's centre tile. `MapPuzzleSpellExtractor` converts this to puzzle-local
grid coordinates using the same world-to-grid mapping applied to every other
island.

On first cast the island animates rising from below; the island is committed to
the puzzle model once the rise animation completes. On reload the island is
added directly at this position with no animation.

---

## How the new bridge is positioned (Bridge spell)

Unlike the island spell, the bridge spell's `startObjectId` and `endObjectId`
specify the **destination islands** rather than a spawn point. The bridge is
placed **already connecting those two islands** when the spell fires.

The animation shows the bridge materialising into that position. After it
appears, the player is free to pick it up and move it; the bridge participates
in all puzzle constraints as a normal bridge. The start/end positions are only
used for the first-cast materialisation animation and for reapplying the bridge
on load (placed at those same coordinates if the player has not moved it).

---

## Persistence and load order

Spell progress is stored in `OverworldGameState.spellProgressByPuzzleID` as the
set of spell kinds that have been cast in each puzzle. On load:

1. Fresh puzzle instances are created from the Tiled definitions.
2. For any puzzle with saved spell progress, each previously-cast kind's
   permanent effect is reapplied to the puzzle model (new island inserted, new
   bridge placed, tiles opened).
3. The player's saved bridge placements are then restored.

This order guarantees that a bridge granted by a bridge spell exists in the
puzzle before any saved position for that bridge is read back.

---

## Notes for series (standalone) puzzles

Standalone series puzzles store spell metadata directly in their JSON file as a
structured `spells` array at the top level, rather than as a JSON-encoded
string property. The schema is identical to the entries in `spellMetadata`
above (minus the Tiled-specific `puzzleId` cross-references). Object IDs are
replaced by explicit grid-coordinate pairs for spawn points and tile lists for
wall rectangles, since there is no Tiled map to reference.
