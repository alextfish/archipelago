## Project Intent

This project implements a bridge-building puzzle game with a clean, layered architecture and full unit testability.
All game logic must remain decoupled from rendering and input frameworks (e.g. Phaser or React).
The codebase should be easy to test, extend, and maintain.

## Architectural Principles

1. Layer Separation

* model/ — pure logic and data. Contains BridgePuzzle, Constraints, PuzzleValidator, etc.
** No UI, rendering, or input handling code.
** Should be fully unit-testable with no mocks beyond simple data objects.
* view/ — rendering and display code. For example, Phaser scenes and sprites.
** Knows how to draw puzzles, not how to solve them.
** May depend on the model only through well-defined read-only interfaces.
* controller/ — orchestration and glue. For example, PuzzleController, OverworldController, and PuzzleHost.
** Responds to user input, updates models, and triggers view changes.
** Never contains puzzle logic itself.

2. Testing

Every class in model/ should have unit tests in tests/model/.

No test outside of test/view should depend on Phaser or any graphical library.

Use mocks or stubs to isolate layers when testing controllers.

Keep tests small, deterministic, and readable.

There's no such thing as "legacy tests": update the tests to match the product code. If some planned product changes break tests, fix the tests rather than making inelegant edits to the product.

3. Data Flow

Puzzle state changes live in the model.

controller updates the model and tells the view what changed.

The view sends input events back to the controller, never directly to the model.

4. Extensibility

Adding new constraint types or puzzle mechanics should not require changes in the rendering code.

Adding new renderers (e.g. alternate visual styles) should not require changing puzzle logic.

Use small, composable classes over large monoliths.

5. Maintainability

Prefer explicit, readable code over clever one-liners.

Avoid circular dependencies and tight coupling between modules.

Keep interfaces stable and clearly documented.

Follow consistent naming and file structure. 
Use meaningful variable names like "bridgeStart" rather than short names like "s".


## Copilot / AI Coding Guidelines:

* Respect the separation between model, view, and controller.
** When suggesting code:
** Don’t introduce framework-specific logic into model/.
** Don’t add hidden global state or event buses.
** Prefer dependency injection and callbacks over implicit coupling.
* Include or update tests for any new logic in model/.
* When in doubt, prioritise clarity, testability, and architectural consistency.

### Coding Style

* Imports should use the paths defined in tsconfig.json: `@model`, `@view`, `@controller`, `@helpers` rather than `../model`.
* We use British spellings everywhere possible. "colour", "standardise" etc. Only use American "color" etc when interfacing with other languages like HTML or packages like Phaser with APIs out of our control.
* Initialisms like "ID" always have all letters the same case. Variables can be named "startID" or "idStart" but never "startId".

### Details on Specific Code Areas

**Puzzle Series System**: A progression system for organizing related puzzles with unlock requirements, progress tracking, and structured navigation. This enables the game to present puzzles in thematic series where completing certain puzzles unlocks others. The system includes:

- `PuzzleSeries` class for managing puzzle collections with progression logic
- `SeriesFactory` for loading series from JSON configuration files  
- Progress persistence with `LocalStorageProgressStore` and `MemoryProgressStore`
- `SeriesManager` for high-level coordination and caching
- Comprehensive unit tests ensuring reliability
- Integration examples showing how to connect with existing game flow

Key benefits: Player engagement through clear progression, content organization, progress persistence, extensibility, and full testability. See `PUZZLE_SERIES_ARCHITECTURE.md` for detailed documentation.