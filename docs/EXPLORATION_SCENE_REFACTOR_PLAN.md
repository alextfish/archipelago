# Exploration Scene Refactor Plan

## Goals

- Reduce duplication between `OverworldScene` and `InteriorScene`.
- Remove accidental behaviour drift before larger extraction work.
- Keep `OverworldHUDScene` owned by the outer overworld scene.
- Treat tile animation as shared map-scene behaviour.

## Agreed Behaviour

- Constraint-NPC puzzle ID parsing should be shared.
- Tap-on-player-tile puzzle entry should behave the same in overworld and interiors.
- Conversation flow should disable and restore player control consistently.
- Series completion started in an interior should use the fuller completion behaviour:
  - save series progress
  - animate or unlock linked doors when present in the active scene
  - refresh NPC completion icons when present in the active scene
  - restore HUD visibility
  - save state after meaningful progress
- `OverworldHUDScene` is launched and configured only by the outer overworld scene.
- Tile animations belong in the shared exploration-map base.

## Implementation Phases

1. Stabilise accidental drift in the current scenes.
2. Extract low-risk pure and near-pure helpers.
3. Extract shared map loading and layer bootstrapping.
4. Introduce a shared `ExplorationMapScene` base class.
5. Leave `OverworldScene` and `InteriorScene` as thin policy layers.

## Step 1: Stabilise Current Behaviour

- Add a shared `ConstraintNPCUtils` helper and use it in both scenes.
- Align interior pointer behaviour with overworld tap-to-enter behaviour.
- Align overworld conversation control with the safer interior controller lifecycle.
- Align interior series completion with the richer overworld completion behaviour.

## Step 2: Add Focused Tests

- Add `ConstraintNPCUtils` unit tests.
- Add `TileAnimationManager` unit tests.
- Avoid large Phaser-scene tests unless a later extraction creates a clean seam.

## Next Extractions

- Extract shared tileset and layer-selection helpers.
- Extract shared map-loading/bootstrap logic.
- Move tile animation setup into the shared base scene.
- Move shared puzzle, conversation, and series flow into the shared base scene.

## Risks To Watch

- Interior-started series that affect doors or NPC icons outside the active scene may
  still need explicit cross-scene coordination after the larger refactor.
- Keep scene ownership clear: the outer scene owns HUD and translation overlays; nested
  scenes may use them but should not launch or configure them.
