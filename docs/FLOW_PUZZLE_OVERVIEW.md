# FlowPuzzle: River / Flow Puzzle type (overview)

Purpose
- Introduce FlowPuzzle, a new puzzle class that extends BridgePuzzle to model puzzles where bridges act as dams controlling the flow of water.
- Provide a pure-model implementation (no rendering code) that:
  - Represents water-capable tiles (flowSquares) with directional outgoing channels.
  - Tracks which tiles currently contain water, recalculated whenever bridges change.
  - Distinguishes rocky tiles (can be bridged, hold water, but do not forward it) and obstacle tiles (cannot be bridged and block water).
  - Supports fixed floating pontoons (tiles that become passable high if water is present, passable low when drained).
  - Exposes edge inputs and edge outputs (edgeOutputs recomputed whenever water connectivity changes) so solved overworld puzzles can influence other puzzles via their edge outputs.
  - Provides a baked connectivity view for overworld baking via ConnectivityManager.

Key concepts
- FlowSquare: per-tile metadata for flow (outgoing directions, flags: rocky, obstacle, pontoon, isSource).
- GridKey: branded/opaque string key type for grid coordinates to avoid misuse of raw strings.
- FlowPuzzle:
  - Extends existing BridgePuzzle.
  - Maintains flowSquares, hasWater (Set<GridKey>), edgeInputs (Set<GridKey>), and edgeOutputCache (Set<GridKey>).
  - Recomputes water using a BFS from source tiles and edge inputs; traversal respects outgoing directions, blocks for obstacle squares and tiles covered by bridges, and stops propagation at rocky tiles (they hold but do not forward water).
  - Overrides placeBridge/removeBridge to call recomputeWater() automatically.
  - Prevents bridge placement if the bridge path would cross any obstacle tile.
  - Exposes getHasWaterGrid(), tileHasWater(x,y), getEdgeOutput(), and getBakedConnectivity() which delegates to ConnectivityManager.
- MustHaveWaterConstraint:
  - Constraint class that checks that a tile at (x,y) currently has water (validated continuously during solving).
  - Registered in createConstraintsFromSpec as "MustHaveWaterConstraint".
- ConnectivityManager:
  - Pure-model utility that computes baked connectivity tiles for the overworld based on FlowPuzzle outputs.
  - Uses precomputed sets for tiles covered by bridges to avoid repeated N^2 scans.
  - Baking rules (current):
    - Obstacle → Blocked.
    - Bridge-covered tile → PassableHigh.
    - Pontoon → PassableHigh if water present, else PassableLow.
    - Water without pontoon → Blocked.
    - Rocky without water → Blocked.
    - Else → PassableLow.

Design notes
- GridKey is a branded type (runtime string of "x,y") to make coordinate keys explicit in the type system.
- recomputeWater precomputes a blockedCells set (including obstacles and tiles covered by placed bridges) to improve performance.
- Edge outputs are coordinates on the puzzle perimeter that currently have water. The overworld/series integration will read these outputs from solved FlowPuzzles to drive edge inputs of other puzzles.
- Tests are included for propagation, rocky tiles, bridge-dam behaviour, obstacle placement prevention, MustHaveWaterConstraint and ConnectivityManager bake behaviour.

Next steps (future work)
- Integrate FlowPuzzle.getBakedConnectivity() into an overworld model so the OverworldScene can read baked connectivity from the model layer rather than the view layer.
- Add serialization/persisted state for solved FlowPuzzles' edgeOutputs and a series-level transformer to map multiple solved puzzles' edge outputs into inputs for newly entered puzzles.
- Optimize recomputeWater further if very large puzzles become slow (region invalidation / incremental updates).
