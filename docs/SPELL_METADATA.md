# Spell Metadata (Overworld/Bridge Puzzles)

Spell metadata is stored in each puzzle object's `glyphSpells` custom property in Tiled as a JSON array of `PuzzleSpellSpec`.

## 1) Spell definition (pattern to detect)

Each spell defines:

- `id`: unique per puzzle
- `glyph`: `"island" | "bridge" | "open"`
- `glyphLanguage` (optional): `"grass" | "fire"` (defaults to `"fire"` for spell animation glyphs)
- `trace.components[]`: one or more required bridge/island graph components

`trace.components[].bridges[]` supports:

- `start` / `end` as local puzzle grid points (`{x,y}`) or island IDs
- optional `count` for multi-bridge requirements

## 2) Spell visual glyph metadata

- `glyphPlacement` (optional): primary glyph tile location (`grid` by default, or `world`)
- `nearbyGlyphs` (optional): extra glyph tiles shown with the cast animation, each with:
  - `word`
  - optional `language`
  - optional explicit `frame`
  - `x`, `y`, `coordinateSpace`, `scale`

All spell glyphs should use Fire language entries unless there is a specific reason not to.

## 3) Puzzle effect metadata

### Raise Island

```json
{ "type": "island", "island": { "id": "raised_1", "x": 4, "y": 2 } }
```

### Add Bridge

```json
{
  "type": "bridge",
  "bridgeId": "spell_bridge_1",
  "bridgeType": { "id": "wood", "style": "wooden", "width": 1 },
  "start": { "x": 3, "y": 2 },
  "end": { "x": 6, "y": 2 }
}
```

### Open Wall / Open Tiles

```json
{
  "type": "open",
  "openedTiles": [{ "x": 8, "y": 3 }, { "x": 8, "y": 4 }],
  "leftWall": { "objectName": "open_left_wall_zone" },
  "rightWall": { "objectName": "open_right_wall_zone" }
}
```

- `openedTiles` are puzzle-local grid tiles that become walkable in overworld collision.
- `leftWall` / `rightWall` accept:
  - inline world rect `{x,y,width,height}`
  - object reference `{objectName:"..."}`
  - direct object-name string
- The wall animation now moves each wall by **32 px**.

## 4) Fire language glyph baseline

Current initial Fire-language spell glyph mappings:

- `island` → frame `30`
- `bridge` → frame `31`
- `open` → frame `32`

These are the first three Fire spell glyph entries and can be expanded later.
