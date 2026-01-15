# AI Agent Guidelines for Archipelago

This document contains specific instructions and guidelines for AI coding agents (such as GitHub Copilot) working on the Archipelago project.

> **For comprehensive architecture documentation**, see [ARCHITECTURE.md](ARCHITECTURE.md).  
> This file focuses on agent-specific workflows and considerations.

## Quick Reference

**Project Type**: Bridge-building puzzle game with clean MVC architecture

**Key Architectural Rule**: Keep model/ pure and framework-independent. All game logic in model/, rendering in view/, orchestration in controller/.

**Documentation**:
- [ARCHITECTURE.md](ARCHITECTURE.md) - Comprehensive architecture guide
- [PUZZLE_SERIES_ARCHITECTURE.md](PUZZLE_SERIES_ARCHITECTURE.md) - Puzzle series system details

## Essential Architectural Constraints

When writing code, you **must** adhere to these layer separation rules:

### Model Layer (`src/model/`)
* ✅ Pure TypeScript logic and data structures
* ✅ Fully unit-testable without mocks
* ❌ NO Phaser, React, or any UI framework imports
* ❌ NO rendering or input handling code
* ❌ NO dependencies on view/ or controller/

### View Layer (`src/view/`)
* ✅ Phaser scenes, sprites, and visual components
* ✅ Read from model through well-defined interfaces
* ❌ NO game logic or puzzle solving code
* ❌ NO direct model state mutation (must go through controller)

### Controller Layer (`src/controller/`)
* ✅ Orchestration between model and view
* ✅ Input handling and state coordination
* ❌ NO puzzle logic (belongs in model)
* ❌ NO rendering code (belongs in view)

## Code Generation Guidelines

When generating or modifying code:

### Respect Layer Separation
* Place game logic in model/, never in view/ or controller/
* Keep model/ free of any UI framework dependencies
* Don't introduce framework-specific logic into model/
* Don't add hidden global state or event buses
* Prefer dependency injection and callbacks over implicit coupling

### Testing Requirements
* Write unit tests for all new model/ classes in test/model/
* Tests should use real objects, not mocks (for model layer)
* Update existing tests when behaviour changes - no "legacy tests"
* Ensure tests are deterministic and readable
* All new code should be immediately followed by tests

### Code Quality Standards
* Prioritise clarity over cleverness
* Use meaningful names: `bridgeStart` not `s`
* Keep classes small and focused (< 200 lines ideally)
* Extract shared logic to avoid duplication
* Prefer explicit code over implicit magic

### When In Doubt
Prioritise: **Clarity → Testability → Architectural Consistency**

## Coding Style

* **Imports**: Use path aliases defined in tsconfig.json: `@model`, `@view`, `@controller`, `@helpers` rather than `../model`
* **Spelling**: Use British spellings everywhere possible: "colour", "standardise", etc. Only use American spellings when interfacing with external APIs (HTML, Phaser) that require them
* **Initialisms**: Keep all letters the same case. Use `startID` or `idStart`, never `startId`

## Project-Specific Context

### Player Puzzle State Transitions

The player's state can be:
- Exploring the overworld
- Solving an overworld puzzle on a puzzle version of the overworld view
- Talking to an NPC
- Solving a BridgePuzzle on a separate screen

When the player solves an overworld puzzle, the bridges are added to the OverworldScene's collisionArray to make them walkable. The map read from Tiled contains a "collision" layer which we **NEVER CHANGE**.

### Source Control

We use git. **AI agents NEVER COMMIT TO GIT directly.** The human developer makes git commits and pushes. You can use git to revert or stash changes if needed, but never commit.
