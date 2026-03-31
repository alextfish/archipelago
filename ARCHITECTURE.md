# Archipelago Architecture Guide

This document describes the architectural structure, design principles, and organization of the Archipelago codebase. This guide is intended for developers and maintainers working on the project.

> For AI agent-specific guidelines and instructions, see [AGENTS.md](AGENTS.md).
> For specific documentation about the puzzle series system, see [PUZZLE_SERIES_ARCHITECTURE.md](PUZZLE_SERIES_ARCHITECTURE.md).
> For the Translation Mode (player glyph-notebook) feature, see [TRANSLATION_MODE_ARCHITECTURE.md](TRANSLATION_MODE_ARCHITECTURE.md).

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architectural Layers](#architectural-layers)
3. [Directory Structure](#directory-structure)
4. [Core Design Principles](#core-design-principles)
5. [Module Organization](#module-organization)
6. [Testing Architecture](#testing-architecture)
7. [Data Flow Patterns](#data-flow-patterns)
8. [Coding Standards](#coding-standards)

## Project Overview

Archipelago is a bridge-building puzzle game built with TypeScript and Phaser. The architecture prioritises:

- **Clean separation of concerns** between game logic, rendering, and user interaction
- **Full unit testability** without requiring mocks or graphical frameworks
- **Modularity and extensibility** to support easy addition of new features
- **Code maintainability** through clear patterns and minimal coupling

## Architectural Layers

The codebase is organized into three primary layers following the Model-View-Controller (MVC) pattern:

### Model Layer (`src/model/`)

**Purpose**: Pure game logic and data structures with no external dependencies.

**Responsibilities**:
- Puzzle state management (`BridgePuzzle`, `Island`, `Bridge`)
- Game constraints and validation (`PuzzleValidator`, constraint implementations)
- Series and progression logic (`PuzzleSeries`, `SeriesFactory`)
- Command pattern for undo/redo (`UndoRedoManager`, command implementations)
- Overworld state and navigation (`OverworldState`)

**Key Characteristics**:
- No UI, rendering, or input handling code
- No dependencies on Phaser, React, or any graphical library
- Fully unit-testable with simple data objects
- Pure TypeScript with minimal external dependencies

**Example Classes**:
```typescript
// Pure game logic - no framework dependencies
class BridgePuzzle {
  private islands: Island[];
  private bridges: Bridge[];
  
  canPlaceBridge(startIsland: Island, endIsland: Island): boolean {
    // Pure logic validation
  }
}
```

### View Layer (`src/view/`)

**Purpose**: Rendering and visual presentation using Phaser.

**Responsibilities**:
- Phaser scenes (`PuzzleScene`, `OverworldScene`)
- Sprites and visual elements
- UI components and menus
- Animations and visual effects
- Camera control and viewport management

**Key Characteristics**:
- Depends on model layer through well-defined read-only interfaces
- Knows how to draw game state, not how to modify it
- Receives display instructions, doesn't make game logic decisions
- Stateless where possible - state lives in model

**Example Classes**:
```typescript
// View reads from model, doesn't update it directly
class PuzzleScene extends Phaser.Scene {
  private puzzle: BridgePuzzle;  // Read-only reference
  
  render(): void {
    // Draw bridges based on puzzle state
    for (const bridge of this.puzzle.getBridges()) {
      this.drawBridge(bridge);
    }
  }
}
```

### Controller Layer (`src/controller/`)

**Purpose**: Orchestration and coordination between model and view.

**Responsibilities**:
- Input handling and user interaction
- Updating model based on user actions
- Triggering view updates in response to model changes
- Managing state transitions
- Coordinating between multiple subsystems

**Key Characteristics**:
- Responds to user input events from view
- Updates model state through well-defined APIs
- Instructs view to refresh based on model changes
- Never contains puzzle logic itself
- Acts as a thin glue layer

**Example Classes**:
```typescript
// Controller orchestrates without containing game logic
class PuzzleController {
  constructor(
    private puzzle: BridgePuzzle,
    private view: PuzzleScene
  ) {}
  
  onIslandClicked(islandID: string): void {
    // Controller updates model
    const result = this.puzzle.selectIsland(islandID);
    
    // Controller instructs view to refresh
    if (result.bridgePlaced) {
      this.view.drawBridge(result.bridge);
    }
  }
}
```

## Directory Structure

```
archipelago/
├── src/
│   ├── model/              # Pure game logic (no UI dependencies)
│   │   ├── puzzle/         # Core puzzle mechanics
│   │   │   ├── BridgePuzzle.ts
│   │   │   ├── Island.ts
│   │   │   ├── Bridge.ts
│   │   │   ├── PuzzleValidator.ts
│   │   │   └── constraints/    # Constraint implementations
│   │   ├── series/         # Puzzle series and progression
│   │   │   ├── PuzzleSeries.ts
│   │   │   ├── SeriesFactory.ts
│   │   │   └── SeriesLoaders.ts
│   │   ├── commands/       # Command pattern for undo/redo
│   │   ├── overworld/      # Overworld navigation logic
│   │   ├── translation/    # Translation Mode model (PlayerTranslationDictionary, ActiveGlyphTracker)
│   │   └── ...
│   ├── view/               # Rendering and display (Phaser-dependent)
│   │   ├── scenes/         # Phaser scene implementations
│   │   │   ├── PuzzleScene.ts
│   │   │   ├── OverworldScene.ts
│   │   │   └── ...
│   │   ├── ui/             # UI components
│   │   └── ...
│   ├── controller/         # Orchestration layer
│   │   ├── PuzzleController.ts
│   │   ├── OverworldController.ts
│   │   └── ...
│   ├── helpers/            # Shared utilities
│   ├── data/               # Game data (puzzles, series)
│   │   ├── puzzles/
│   │   └── series/
│   ├── test/               # Unit tests
│   │   ├── model/          # Model tests (no Phaser)
│   │   ├── view/           # View tests (with Phaser)
│   │   ├── controller/     # Controller tests (with mocks)
│   │   └── helpers/        # Test utilities
│   └── examples/           # Usage examples
├── assets/                 # Images, audio, tilesets
├── public/                 # Static web assets
├── ARCHITECTURE.md         # This file
├── AGENTS.md               # AI agent guidelines
├── PUZZLE_SERIES_ARCHITECTURE.md  # Puzzle series system docs
└── package.json
```

### Path Aliases

TypeScript is configured with path aliases for clean imports:

```typescript
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';
import { PuzzleScene } from '@view/scenes/PuzzleScene';
import { PuzzleController } from '@controller/PuzzleController';
import { formatNumber } from '@helpers/formatters';
```

These aliases are defined in `tsconfig.json`:
- `@model/*` → `src/model/*`
- `@view/*` → `src/view/*`
- `@controller/*` → `src/controller/*`
- `@helpers/*` → `src/helpers/*`

## Core Design Principles

### 1. Layer Separation

**Principle**: Each layer has clearly defined responsibilities and dependencies flow in one direction.

**Dependency Flow**: View → Controller → Model (never backwards)

**Benefits**:
- Model can be tested without any UI framework
- View can be swapped or redesigned without changing game logic
- Controller keeps orchestration code separate from business logic

**Anti-patterns to Avoid**:
- ❌ Model classes importing from view or controller
- ❌ Framework-specific code (Phaser, React) in model layer
- ❌ Game logic in view or controller layers
- ❌ Direct model mutation from view

### 2. Testability First

**Principle**: All code should be designed with testing in mind from the start.

**Requirements**:
- Every model class has corresponding unit tests in `test/model/`
- Tests use real objects, not mocks (for model layer)
- Controllers use mocks/stubs to isolate from model and view
- Tests are deterministic, fast, and readable

**Testing Structure**:
```typescript
// Good: Pure model test with no framework dependencies
describe('BridgePuzzle', () => {
  it('should allow valid bridge placement', () => {
    const puzzle = new BridgePuzzle(islands, bridges);
    const result = puzzle.placeBridge(islandA, islandB);
    expect(result.success).toBe(true);
  });
});
```

**Test Philosophy**:
- Tests document expected behaviour
- Tests should be updated when product behaviour changes
- No such thing as "legacy tests" - keep tests current with code
- Prefer unit tests over integration tests where possible

### 3. Modularity and Composition

**Principle**: Use small, focused classes and functions that compose together.

**Benefits**:
- Easier to understand individual components
- Simpler to test in isolation
- More reusable across different contexts
- Lower risk when making changes

**Guidelines**:
- Classes should have a single, clear responsibility
- Functions should do one thing well
- Prefer composition over inheritance
- Keep classes small (ideally < 200 lines)

**Example**:
```typescript
// Good: Small, focused classes
class PuzzleValidator {
  validate(puzzle: BridgePuzzle): ValidationResult {
    return this.constraints.every(c => c.check(puzzle));
  }
}

class BridgeCountConstraint implements Constraint {
  check(puzzle: BridgePuzzle): boolean {
    return puzzle.getBridges().length <= this.maxBridges;
  }
}

// Bad: Monolithic class with multiple responsibilities
class PuzzleManager {
  validate() { /* ... */ }
  render() { /* ... */ }
  handleInput() { /* ... */ }
  saveProgress() { /* ... */ }
  // Too many responsibilities!
}
```

### 4. Avoiding Code Duplication (DRY)

**Principle**: Each piece of knowledge should have a single, authoritative representation.

**Strategies**:
- Extract common logic into shared helper functions
- Use base classes or composition for shared behaviour
- Create utility modules for cross-cutting concerns
- Avoid copy-paste programming

**When to Duplicate**:
- When abstractions would be more complex than duplication
- When code is similar but serves different purposes
- When shared code would create unwanted coupling

**Example**:
```typescript
// Good: Shared utility function
function calculateDistance(pointA: Point, pointB: Point): number {
  return Math.sqrt(
    Math.pow(pointB.x - pointA.x, 2) + 
    Math.pow(pointB.y - pointA.y, 2)
  );
}

// Used in multiple places
class BridgeValidator {
  isValidLength(bridge: Bridge): boolean {
    return calculateDistance(bridge.start, bridge.end) < MAX_LENGTH;
  }
}

class IslandPositioner {
  isTooClose(islandA: Island, islandB: Island): boolean {
    return calculateDistance(islandA.position, islandB.position) < MIN_DISTANCE;
  }
}
```

### 5. Extensibility

**Principle**: New features should be easy to add without modifying existing code.

**Patterns**:
- Use interfaces and abstract classes for extension points
- Plugin/strategy pattern for variable behaviour
- Factory pattern for object creation
- Observer pattern for event handling

**Example**:
```typescript
// Extensible constraint system
interface Constraint {
  check(puzzle: BridgePuzzle): boolean;
  getMessage(): string;
}

// New constraints can be added without modifying existing code
class BridgeCountConstraint implements Constraint { /* ... */ }
class IslandConnectionConstraint implements Constraint { /* ... */ }
class NoIntersectionConstraint implements Constraint { /* ... */ }
// Easy to add new constraint types!
```

### 6. Explicit Over Implicit

**Principle**: Code should be clear and explicit, avoiding hidden behaviour.

**Guidelines**:
- Prefer explicit function parameters over global state
- Use dependency injection over hidden dependencies
- Make data flow visible and traceable
- Avoid "magic" behaviour that's hard to understand

**Example**:
```typescript
// Good: Explicit dependencies
class PuzzleController {
  constructor(
    private puzzle: BridgePuzzle,
    private validator: PuzzleValidator,
    private renderer: PuzzleRenderer
  ) {}
}

// Bad: Hidden dependencies
class PuzzleController {
  placeBridge(start: string, end: string): void {
    GlobalPuzzle.placeBridge(start, end);  // Hidden dependency!
    EventBus.emit('bridgePlaced');          // Hidden event bus!
  }
}
```

## Module Organization

### Model Module Structure

Each major game concept has its own module with related classes:

```
model/
├── puzzle/
│   ├── BridgePuzzle.ts       # Main puzzle class
│   ├── Island.ts              # Island data and logic
│   ├── Bridge.ts              # Bridge data and logic
│   ├── PuzzleValidator.ts     # Validation orchestrator
│   └── constraints/           # Individual constraint types
│       ├── Constraint.ts      # Base interface
│       ├── BridgeCountConstraint.ts
│       └── ...
├── series/
│   ├── PuzzleSeries.ts        # Series logic
│   ├── SeriesFactory.ts       # Series creation
│   └── SeriesLoaders.ts       # Persistence
└── commands/
    ├── Command.ts             # Command interface
    ├── PlaceBridgeCommand.ts
    └── ...
```

### Inter-Module Dependencies

**Allowed Dependencies**:
- Model can depend on other model modules ✅
- Controller can depend on model ✅
- View can read from model (read-only) ✅
- Helpers can be used by any layer ✅

**Forbidden Dependencies**:
- Model cannot depend on view or controller ❌
- Model cannot depend on Phaser or rendering frameworks ❌
- View cannot directly modify model (must go through controller) ❌

### Module Exports

Each module should export a clear public API:

```typescript
// model/puzzle/index.ts
export { BridgePuzzle } from './BridgePuzzle';
export { Island } from './Island';
export { Bridge } from './Bridge';
export { PuzzleValidator } from './PuzzleValidator';
export type { ValidationResult } from './types';
```

## Testing Architecture

### Test Organization

Tests mirror the source structure:

```
src/model/puzzle/BridgePuzzle.ts
  → test/model/puzzle/BridgePuzzle.test.ts

src/view/scenes/PuzzleScene.ts
  → test/view/scenes/PuzzleScene.test.ts
```

### Test Categories

#### Unit Tests (Model Layer)

**Location**: `test/model/`

**Characteristics**:
- No Phaser or graphical dependencies
- Test individual classes in isolation
- Use real objects, not mocks
- Fast and deterministic

```typescript
describe('BridgePuzzle', () => {
  let puzzle: BridgePuzzle;
  
  beforeEach(() => {
    const islands = [
      new Island('A', { x: 0, y: 0 }),
      new Island('B', { x: 10, y: 0 })
    ];
    puzzle = new BridgePuzzle(islands);
  });
  
  it('should place valid bridge', () => {
    const result = puzzle.placeBridge('A', 'B');
    expect(result.success).toBe(true);
    expect(puzzle.getBridges().length).toBe(1);
  });
});
```

#### Integration Tests (Controller Layer)

**Location**: `test/controller/`

**Characteristics**:
- Test coordination between model and view
- Use mocks for view and model when needed
- Focus on interaction and orchestration

```typescript
describe('PuzzleController', () => {
  it('should update view when bridge placed', () => {
    const mockView = createMockPuzzleView();
    const puzzle = createTestPuzzle();
    const controller = new PuzzleController(puzzle, mockView);
    
    controller.onIslandClicked('A');
    controller.onIslandClicked('B');
    
    expect(mockView.drawBridge).toHaveBeenCalled();
  });
});
```

#### View Tests

**Location**: `test/view/`

**Characteristics**:
- May use Phaser test utilities
- Test rendering logic, not game logic
- Verify visual state, not business rules

### Test Utilities

Shared test helpers in `test/helpers/`:

```typescript
// test/helpers/PuzzleBuilder.ts
export class PuzzleBuilder {
  private islands: Island[] = [];
  
  withIsland(id: string, x: number, y: number): this {
    this.islands.push(new Island(id, { x, y }));
    return this;
  }
  
  build(): BridgePuzzle {
    return new BridgePuzzle(this.islands);
  }
}

// Usage in tests
const puzzle = new PuzzleBuilder()
  .withIsland('A', 0, 0)
  .withIsland('B', 10, 0)
  .build();
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- BridgePuzzle.test.ts

# Run in watch mode (during development)
npm test -- --watch
```

## Data Flow Patterns

### User Input Flow

```
User Action (View)
    ↓
Input Event (View)
    ↓
Controller Handler
    ↓
Model Update (Model)
    ↓
State Change (Model)
    ↓
View Refresh (Controller → View)
    ↓
Visual Update (View)
```

**Example**:
```typescript
// 1. User clicks island in PuzzleScene (View)
scene.on('islandClicked', (islandID) => {
  // 2. Event sent to controller
  controller.onIslandClicked(islandID);
});

// 3. Controller updates model
onIslandClicked(islandID: string): void {
  const result = this.puzzle.selectIsland(islandID);
  
  // 4. Controller tells view to update
  if (result.bridgePlaced) {
    this.view.showBridge(result.bridge);
  }
}
```

### State Management

**Single Source of Truth**: Model holds all state

```typescript
// Model is the authoritative state
class BridgePuzzle {
  private bridges: Bridge[] = [];  // State lives here
  
  getBridges(): readonly Bridge[] {
    return this.bridges;  // Read-only access
  }
  
  placeBridge(startID: string, endID: string): Result {
    // State modification only through well-defined methods
    this.bridges.push(new Bridge(startID, endID));
  }
}

// View reads state, doesn't store it
class PuzzleScene {
  render(): void {
    const bridges = this.puzzle.getBridges();  // Read from model
    bridges.forEach(bridge => this.drawBridge(bridge));
  }
}
```

### Persistence Pattern

**Save/Load Flow**:
```
Model State
    ↓ serialize
JSON Data
    ↓ save
LocalStorage / File
    ↓ load
JSON Data
    ↓ deserialize
Model State
```

**Example**:
```typescript
// Serialization in model
class BridgePuzzle {
  toJSON(): PuzzleData {
    return {
      islands: this.islands.map(i => i.toJSON()),
      bridges: this.bridges.map(b => b.toJSON())
    };
  }
  
  static fromJSON(data: PuzzleData): BridgePuzzle {
    const islands = data.islands.map(Island.fromJSON);
    const bridges = data.bridges.map(Bridge.fromJSON);
    return new BridgePuzzle(islands, bridges);
  }
}

// Persistence handled by dedicated loader
class PuzzleLoader {
  async save(puzzle: BridgePuzzle, filename: string): Promise<void> {
    const data = puzzle.toJSON();
    await fs.writeFile(filename, JSON.stringify(data));
  }
  
  async load(filename: string): Promise<BridgePuzzle> {
    const json = await fs.readFile(filename);
    const data = JSON.parse(json);
    return BridgePuzzle.fromJSON(data);
  }
}
```

## Coding Standards

### Naming Conventions

**Files and Directories**:
- PascalCase for class files: `BridgePuzzle.ts`, `PuzzleController.ts`
- camelCase for utility files: `helpers.ts`, `constants.ts`
- Directories in lowercase or camelCase: `model/`, `constraints/`

**Variables and Functions**:
- camelCase for variables: `bridgeCount`, `islandPosition`
- PascalCase for classes and types: `BridgePuzzle`, `ValidationResult`
- Meaningful names, not abbreviations: `bridgeStart` not `bStart`

**Initialisms**:
- Consistent case for initialisms: `userID`, `idStart` (never `userId` or `idstart`)

**British Spellings**:
- Use British spellings: `colour`, `standardise`, `serialise`
- Exception: When interfacing with external APIs (Phaser, HTML) use their spelling

### Code Style

**Imports**:
```typescript
// Use path aliases
import { BridgePuzzle } from '@model/puzzle/BridgePuzzle';

// Not relative paths
import { BridgePuzzle } from '../../../model/puzzle/BridgePuzzle';
```

**Comments**:
- Add comments when they add value
- Explain "why", not "what"
- Match comment style of surrounding code
- Prefer self-documenting code over comments

```typescript
// Good: Explains why
// We use BFS instead of DFS to find shortest path for hint system
const path = breadthFirstSearch(start, end);

// Bad: Explains what (obvious from code)
// Loop through all islands
for (const island of islands) {
  // ...
}
```

**Prefer Clarity**:
- Explicit code over clever one-liners
- Readable variable names over short names
- Clear logic flow over terse expressions

```typescript
// Good: Clear and explicit
const hasEnoughBridges = puzzle.getBridges().length >= MIN_BRIDGES;
const allIslandsConnected = puzzle.checkConnectivity();
const isPuzzleSolved = hasEnoughBridges && allIslandsConnected;

// Bad: Clever but unclear
const solved = puzzle.getBridges().length >= MIN && puzzle.checkConnectivity();
```

### Error Handling

**Explicit Error Types**:
```typescript
// Define specific error types
class PuzzleValidationError extends Error {
  constructor(message: string, public constraint: string) {
    super(message);
  }
}

// Use them explicitly
if (!isValidPlacement) {
  throw new PuzzleValidationError(
    'Bridge placement violates constraint',
    'no-intersection'
  );
}
```

**Result Objects for Expected Failures**:
```typescript
// Use result objects for expected failures
interface PlacementResult {
  success: boolean;
  bridge?: Bridge;
  error?: string;
}

placeBridge(start: string, end: string): PlacementResult {
  if (!this.isValidPlacement(start, end)) {
    return { success: false, error: 'Invalid placement' };
  }
  
  const bridge = new Bridge(start, end);
  this.bridges.push(bridge);
  return { success: true, bridge };
}
```

## Best Practices Summary

### Do's ✅

- **Do** separate concerns between model, view, and controller
- **Do** write tests for all model classes
- **Do** use meaningful variable names
- **Do** keep functions and classes small and focused
- **Do** use dependency injection for better testability
- **Do** extract shared logic into utilities
- **Do** use TypeScript's type system fully
- **Do** document complex algorithms or non-obvious behaviour
- **Do** use path aliases for imports

### Don'ts ❌

- **Don't** put game logic in view or controller
- **Don't** import Phaser or rendering frameworks in model layer
- **Don't** create hidden dependencies or global state
- **Don't** skip writing tests for new code
- **Don't** duplicate code when abstraction is straightforward
- **Don't** use short or cryptic variable names
- **Don't** create large monolithic classes
- **Don't** tightly couple unrelated modules
- **Don't** commit code that breaks existing tests

## Conclusion

This architecture guide provides the foundation for maintaining and extending Archipelago. By following these principles and patterns, we ensure the codebase remains:

- **Testable**: Easy to verify correctness at every level
- **Maintainable**: Clear structure makes changes safe and predictable  
- **Extensible**: New features integrate naturally without major refactoring
- **Understandable**: New developers can quickly grasp the organization

When in doubt, prioritise clarity, testability, and architectural consistency.

## Related Documentation

- **[AGENTS.md](AGENTS.md)**: Guidelines for AI coding agents working on this project
- **[PUZZLE_SERIES_ARCHITECTURE.md](PUZZLE_SERIES_ARCHITECTURE.md)**: Detailed documentation of the puzzle series system
- **README.md**: Project setup and getting started guide
