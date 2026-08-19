# Spell Puzzle Architecture Proposal

## Overview

This document proposes an architecture for one-off spell casts that are triggered when the player arranges bridges into one of three Fire glyph shapes:

- `island`
- `bridge`
- `open`

The design covers both:

- standalone series puzzles shown in `BridgePuzzleScene`
- embedded overworld puzzles managed by `OverworldPuzzleController`

The proposal keeps spell detection in the model layer, orchestration in controllers, and animation in the view layer.

## Goals

- Detect translated, non-rotated spell shapes from placed bridges
- Require each matched spell component to be isolated from unrelated bridges
- Support first-time casts and repeat casts
- Persist cast state so spells are one-off across save/load
- Reapply permanent spell results on load without replaying the one-off effect
- Reuse one architecture for standalone and overworld puzzle screens
- Allow overworld Island/Open spells to make new map tiles walkable

## Key design decisions

### 1. Built-in spell patterns, puzzle-specific spell manifests

The three spell shapes should be defined once in code as built-in pattern definitions. Individual puzzles should only declare:

- which spells they allow
- what each spell does in that puzzle
- any optional nearby landscape glyph anchor

This avoids repeating pattern geometry in puzzle JSON and Tiled metadata.

### 2. Permanent spell effects are reapplied from saved cast state

Saved state should store that a spell has been cast, not a second copy of the visual animation. On load:

1. load puzzle base data
2. reapply saved spell effects to the puzzle model and overworld collision
3. restore saved bridge placements

That order is essential for `bridge` spells so the granted bridge exists before saved bridge placements are restored.

### 3. Repeat casts still animate

If the player recreates a spell already cast in that puzzle:

- play the same trace sequence
- use grey instead of white
- skip the permanent mutation

## Proposed model layer

### Built-in pattern registry

Add a pure model registry for canonical spell geometry:

- `SpellPatternRegistry`
- `SpellPatternDefinition`
- `SpellPatternVariant`

Each variant stores:

- spell kind
- one or more connected components
- canonical orthogonal segments in local grid coordinates
- optional derived bounds used by tests/debugging

### Canonical built-in patterns

#### `island`

Variants:

- standard
- doubled

Canonical segments:

- spine from `(2,0)` to `(2,4)`
- U-shape from `(0,2)` to `(0,6)` to `(4,6)` to `(4,2)`

The doubled variant multiplies all coordinates by `2`.

#### `bridge`

Variants use different `X` values:

- `4`
- `5`
- `6`
- `7`
- `8`

Canonical segments:

- `(0,0)` to `(0,2)` to `(0,4)`
- `(0,2)` to `(X,2)`
- `(0,4)` to `(X,4)`
- `(X,4)` to `(X,2)` to `(X,0)`

#### `open`

Variants move the two mirrored components further apart.

Left component:

- `(0,0)` to `(2,0)` to `(2,2)` to `(0,2)`
- `(2,2)` to `(2,4)` to `(0,4)`

Right component base variant:

- `(6,0)` to `(4,0)` to `(4,2)` to `(6,2)`
- `(4,2)` to `(4,4)` to `(6,4)`

Alternate right-side X pairs:

- `(7,5)`
- `(8,6)`

### Spell detection

Add a pure model service:

- `SpellPatternMatcher`

Responsibilities:

- read the puzzle's currently placed bridges
- convert them into canonical orthogonal segments
- split those segments into connected components
- compare components against configured spell kinds and built-in variants
- return exact matches only

Detection rules:

- translation allowed
- rotation not allowed
- mirrored forms only where explicitly defined by the built-in pattern
- every required segment must be present exactly once
- no extra segment may be connected to a matched component
- for `open`, both matched components must be isolated from unrelated bridges

Recommended return types:

- `SpellMatch`
- `SpellMatchComponent`
- `SpellCastMode` with `firstCast` or `repeatCast`

### Puzzle spell manifest

Add puzzle-level spell metadata types:

- `PuzzleSpellManifest`
- `PuzzleSpellDefinition`
- `PuzzleSpellEffect`
- `LandscapeGlyphAnchor`

Each `PuzzleSpellDefinition` should contain:

- stable `id`
- `kind`: `island`, `bridge`, or `open`
- optional `landscapeGlyphAnchor`
- effect payload specific to the kind

### Runtime spell mutations on `BridgePuzzle`

The current `BridgePuzzle` only restores placed bridges. Spell effects need runtime topology changes, so the puzzle model should gain explicit mutation APIs such as:

- add a runtime island exactly once
- add a runtime bridge inventory item exactly once
- mark specific local tiles as opened exactly once

These should be narrow, named APIs rather than general mutable access to arrays.

That keeps spell changes:

- serialisable
- testable
- replayable on load

### Spell progress state

Define a reusable saved state shape:

- `PuzzleSpellProgress`

Minimum contents:

- `castSpellIDs: string[]`

This is enough because all permanent changes are deterministic from puzzle metadata.

## Proposed controller layer

### Shared spell orchestrator

Add a controller/service used by both puzzle modes:

- `PuzzleSpellController`

Responsibilities:

- run `SpellPatternMatcher` after successful bridge placement, removal, undo, and redo
- ignore spell kinds not declared in the current puzzle manifest
- queue spells if more than one becomes valid at once
- lock puzzle input while a spell sequence is active
- select white or grey trace palette based on saved cast state
- invoke the correct animator
- persist first-time casts immediately after the permanent mutation is applied

### Puzzle input locking

`PuzzleController` should gain a second interaction gate separate from the existing solved-state gate, for example:

- `inputLockedBySpell`

While locked, all pointer and keyboard actions should be ignored.

### Host integration

Both puzzle modes should expose the same spell-host surface to the shared controller:

- standalone host from `BridgePuzzleScene`
- embedded host from `OverworldPuzzleController`

Required host capabilities:

- save progress
- request puzzle rerender
- access the active spell animator view context
- apply overworld-only collision updates when relevant

## Proposed view layer

### Shared trace overlay

Add a reusable view helper:

- `SpellTraceOverlay`

Responsibilities:

- draw thick overlay lines along the matched bridge geometry
- use white for first casts and grey for repeats
- fade in over one second
- fade out at the end

If the puzzle declares a nearby language glyph anchor, the overlay should also draw the matching Fire glyph sprite there and fade it in on the same timing.

### Spell animator base class

Add:

- `SpellAnimator`

This should be an abstract Phaser-facing class with a promise-returning `play()` flow. It should not decide whether an effect is first-time or repeat; it should receive that as context.

### Subclasses

#### `IslandSpellAnimator`

First cast:

- animate a new island rising at the configured location
- commit the new island to the puzzle model
- in overworld mode, update walkability for the new island tiles

Repeat cast:

- replay a grey version of the rise effect only

#### `BridgeSpellAnimator`

First cast:

- animate a bridge appearing at the configured start/end
- grant exactly one new runtime bridge to the puzzle
- never add a second copy on future casts or reloads

Repeat cast:

- replay a grey bridge manifestation only

#### `OpenSpellAnimator`

First cast:

- animate the configured left wall tiles moving left
- animate the configured right wall tiles moving right
- mark the opened local tiles walkable in the puzzle
- in overworld mode, update collision for the newly opened world tiles

Repeat cast:

- replay the wall movement visually in grey without changing collision

### Rendering contexts

The same animators should be usable in both renderers:

- `PhaserPuzzleRenderer` for standalone puzzles
- `EmbeddedPuzzleRenderer` for overworld puzzles

The context object should supply world-space conversion from local puzzle coordinates so animators do not care which puzzle mode they are in.

## Overworld parsing

### Existing integration points

The current overworld architecture already has the right seams:

- `MapPuzzleExtractor` builds puzzle definitions from Tiled
- `OverworldPuzzleManager` owns extracted puzzle definitions
- `OverworldGameState` persists puzzle progress
- `CollisionManager` applies runtime walkability

Spell parsing should extend that path without changing the basic ownership model.

### Recommended Tiled storage

Use two sources:

1. the existing puzzle object in the `puzzles` layer
2. a new sibling object layer named `spell_effects`

The puzzle object should gain a JSON-string custom property:

- `spellMetadata`

The `spell_effects` layer should hold referenced point and rectangle objects used by those spell definitions.

### Why use a separate `spell_effects` object layer

It keeps large spatial data out of string properties and lets level design place:

- island spawn points
- bridge endpoint markers
- nearby landscape glyph anchors
- left and right wall rectangles

### Recommended `spell_effects` object roles

Every object in `spell_effects` should have:

- `id`
- `puzzleId`
- `role`

Supported roles:

- `islandSpawn`
- `bridgeStart`
- `bridgeEnd`
- `glyphAnchor`
- `openLeftWall`
- `openRightWall`

For open spells, wall movement distance should live in spell metadata, while the actual affected tiles come from the paired rectangle objects.

### Overworld parser additions

Add:

- `MapPuzzleSpellExtractor`

Responsibilities:

- read `spellMetadata` from the puzzle object
- collect `spell_effects` objects with matching `puzzleId`
- convert world-space Tiled objects to puzzle-local coordinates
- attach a `PuzzleSpellManifest` to the extracted puzzle definition

`MapPuzzleExtractor` should remain focused on islands, blocked tiles, bridge inventory, and constraints.

## Series puzzle parsing

Standalone series puzzles should store spell metadata directly in puzzle JSON as a structured `spells` array rather than a JSON-encoded string property.

That array should parse into the same `PuzzleSpellManifest` type used by overworld puzzles.

## Persistence

### Overworld

Extend `OverworldGameState` with:

- `spellProgressByPuzzleId: Map<string, PuzzleSpellProgress>`

Export/import should serialise that map alongside existing bridge progress.

On load:

1. create fresh puzzle instances
2. apply saved spell progress to mutate the puzzles
3. restore saved bridge placements
4. if a saved spell changed overworld walkability, reapply that walkability immediately

### Series progress

Extend series save data with per-puzzle runtime spell progress.

The cleanest fit is to enrich stored series progress with a new map keyed by puzzle ID so spell state travels with the series that owns the puzzle.

### Repeat-cast handling after load

Because saved state only records `castSpellIDs`, the runtime controller can immediately classify future matches as repeat casts and select the grey palette.

## Fire language glyphs

The first three defined Fire-language glyph words should be:

1. `island`
2. `bridge`
3. `open`

The spell system should derive the displayed language frame from the spell kind through `LanguageGlyphRegistry`, so puzzle metadata only needs an anchor location, not a separate frame number.

## Metadata schema

### Built-in spell definitions

These should be code-owned, not map-owned.

Each built-in definition needs:

- spell kind
- variant ID
- connected component count
- canonical segment list

### Puzzle-specific metadata

Each puzzle spell definition should store:

- `id`
- `kind`
- optional `landscapeGlyphAnchorId`
- effect payload

#### `island` effect payload

- `spawnObjectId`
- optional `riseDistancePx`
- optional `durationMs`

#### `bridge` effect payload

- `startObjectId`
- `endObjectId`
- `bridgeType`: `normal` or `strut`

#### `open` effect payload

- `leftWallObjectId`
- `rightWallObjectId`
- `leftShiftTiles`
- `rightShiftTiles`
- `openedTiles` derived from the rectangles before animation begins

## Testing plan

### Model tests

Add unit tests for:

- `SpellPatternRegistry`
- `SpellPatternMatcher`
- puzzle-local spell manifest parsing
- overworld Tiled spell metadata parsing
- runtime spell mutation APIs on `BridgePuzzle`
- persistence round-trips for spell progress

Important cases:

- translated matches succeed
- rotated matches fail
- connected extra bridges invalidate a match
- `open` requires both isolated components
- repeat casts are classified correctly
- bridge spell never duplicates its granted bridge
- load-time reapplication restores island/open/bridge effects before bridge placements

### Controller tests

Add tests for:

- input locking during spell sequences
- spell queueing when two new spells appear together
- save callbacks on first cast only
- grey repeat animation path

### View tests

Add focused tests for:

- trace overlay segment placement
- white and grey palettes
- fade-in and fade-out timing hooks
- correct object references for island rise, bridge appearance, and wall opening

## Recommended implementation order

1. add built-in spell pattern registry and matcher tests
2. add puzzle spell manifest types and parsers
3. add runtime mutation APIs to `BridgePuzzle`
4. add saved spell progress to overworld and series persistence
5. add shared `PuzzleSpellController`
6. add `SpellTraceOverlay` and `SpellAnimator` subclasses
7. wire overworld collision updates for Island/Open first casts
8. wire repeat-cast grey animations

