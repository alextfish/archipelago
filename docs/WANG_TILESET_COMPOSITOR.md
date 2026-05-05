# Wang Tileset Compositor

This note describes a general workflow for building 32x32 composite tiles from 16x16 source tiles using Wang metadata from a TSX file. It is meant as a reusable guide for future tilesets, not just the road sheets.

## Goal

Given:

- a 16x16 source PNG tileset
- a TSX file whose `wangtile` entries classify the 16x16 tiles by edge connectivity

Generate:

- a 32x32 composite PNG tileset
- an optional matching 32x32 TSX

Each 32x32 output tile is a 2x2 arrangement of 16x16 source tiles whose outer edges match the requested Wang pattern.

## Wang Model

For edge Wang sets, the meaningful positions in `wangid` are interpreted as:

- `up`
- `right`
- `down`
- `left`

The interleaved positions between them are ignored for this workflow.

For example:

- `1,0,1,0,0,0,1,0` means `up + right + left`

Internally, it is usually easiest to represent an edge pattern as a 4-part `URDL` tuple or string.

Examples:

- binary case: `0110` = right + down
- multi-colour case: `2031` = up uses colour `2`, right uses none, down uses colour `3`, left uses colour `1`

Important detail:

- `0` means no connection on that edge
- positive integers are edge classes, not just booleans
- future tilesets may use more than one non-zero connection type, so treat edge values as labels, not merely on/off switches

## Core Constraint Problem

Each 32x32 tile is a 2x2 grid of four source tiles:

- top-left
- top-right
- bottom-left
- bottom-right

To build one valid 32x32 composite, solve these constraints:

- the outer `up`, `right`, `down`, `left` edges of the 2x2 composite must equal the requested macro Wang pattern
- internal seams must match across touching subtiles
- optional aesthetic rules may further restrict acceptable combinations

The internal seams are:

- vertical seam across the top row
- vertical seam across the bottom row
- horizontal seam across the left column
- horizontal seam across the right column

In the simplest binary case, internal seams are either `0` or `1`. In the general case, each seam may take any Wang colour label that exists in the source material.

## Recommended Workflow

1. Parse the TSX and collect all 16x16 tiles by their `URDL` edge signature.
2. Decide which 32x32 macro signatures you want to generate.
3. For each macro signature, search for 2x2 combinations whose outer edges and internal seams satisfy the constraints.
4. From the valid combinations, choose a seeded subset to create a fixed number of variants.
5. Write the resulting composite PNG.
6. If needed, emit a matching TSX whose `wangtile` entries describe the new 32x32 tiles.

## Two Ways To Build Macro Tiles

### Generic Solver

Use a small constraint solver when you want a reusable generator:

- enumerate candidate internal seam labels
- derive the four required quadrant edge signatures
- look up available 16x16 source tiles for each quadrant signature
- assemble any combination where all four quadrant signatures exist

This is the most reusable approach and is the right default when working with new art sets.

### Explicit Recipes

Use hand-authored 2x2 recipes when some macro signatures look technically valid but aesthetically poor.

Examples of when explicit recipes help:

- straight-through shapes that visually pinch in the middle
- corners with ugly joins in a particular art set
- multi-colour transitions where only a subset of seam labels looks good

The practical pattern is:

- use the generic solver for most macro signatures
- override a few troublesome signatures with explicit recipes

## Handling Empty Space

For a square with `0` edges on all four sides, use a fully transparent 16x16 filler tile. Do not search the source tileset for `0000` tiles or unannotated tiles.

## Handling Multiple Wang Colours

Do not assume only `0` and `1` exist.

For example, a future tileset may use:

- `1` for grass path
- `2` for stone path
- `3` for water edge

In that case:

- internal seams must match exact labels, not merely “connected”
- macro signatures should preserve the intended edge labels on the output boundary
- explicit recipes may need to pin specific seam labels for good-looking joins

The generator should therefore store edge values as integers or strings and compare them exactly.

## Variant Selection

Once valid 2x2 composites have been found for a macro signature:

- choose a configurable number of variants
- use a seed so output is repeatable
- avoid repeating the same 16x16 source tile twice inside one 32x32 composite when enough alternatives exist
- allow reuse when the candidate pool is too small

Useful tie-breakers or scoring rules:

- prefer more distinct 16x16 source tiles within one composite
- avoid overusing a single source tile across neighbouring variants
- optionally bias toward visually cleaner or more central source tiles

## Output TSX Generation

If a matching 32x32 TSX is needed, it should:

- point at the generated 32x32 PNG
- use `tilewidth=32` and `tileheight=32`
- set `columns` to the number of variants per macro signature, or whatever layout the PNG uses
- emit `wangtile` entries for each non-empty 32x32 tile using the output macro signature

The output TSX does not need to remember which four 16x16 tiles were used internally unless a later tool needs that provenance.

## Practical Guidance For Future Generators

When writing a generator for a new tileset, clarify these choices up front:

- which TSX file is the source of Wang truth
- whether empty space should be transparent or come from a tile family
- whether output macro signatures are binary or multi-colour
- whether all valid composites are acceptable or some signatures need explicit recipes
- how many variants are needed per macro signature
- what output layout is easiest to use in Tiled

## What Worked Well Here

These design choices were useful and are worth reusing:

- use the TSX as the authoritative source for which 16x16 tiles belong to each Wang signature
- keep variant selection seeded and deterministic
- allow a mostly generic generator with a small number of explicit overrides for ugly cases
- generate PNG and TSX together so the derived tileset is immediately usable in Tiled

## Suggested Prompt Pattern

If asked to build another compositor later, the request should ideally include:

- the source PNG path
- the TSX path
- whether empty quadrants should be transparent or tile-based
- whether Wang values are binary or multi-colour
- any known macro signatures that should use explicit 2x2 recipes
- the desired number of variants and random seed

That is enough to implement a new 16x16-to-32x32 Wang compositor without assuming road-specific rules.