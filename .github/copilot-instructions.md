# GitHub Copilot Integration Guide for Archipelago

This document provides specific instructions for GitHub Copilot when working on the Archipelago project.

> **For comprehensive architecture documentation**, see [ARCHITECTURE.md](../ARCHITECTURE.md).  
> **For general AI agent guidelines**, see [AGENTS.md](../AGENTS.md).  
> This file focuses on GitHub Copilot-specific workflows and integration patterns.

## Quick Reference

**Project Type**: Bridge-building puzzle game with clean MVC architecture

**Key Architectural Rule**: Keep model/ pure and framework-independent. All game logic in model/, rendering in view/, orchestration in controller/.

**Documentation**:
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Comprehensive architecture guide
- [AGENTS.md](../AGENTS.md) - General AI agent guidelines
- [PUZZLE_SERIES_ARCHITECTURE.md](../PUZZLE_SERIES_ARCHITECTURE.md) - Puzzle series system details

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

## GitHub Copilot Specific Guidelines

### Code Completion

When providing code completions:

1. **Respect the current layer**: If editing a file in `src/model/`, only suggest pure TypeScript code without any view/controller dependencies
2. **Follow existing patterns**: Match the style and structure of surrounding code
3. **Use path aliases**: Always suggest imports using `@model`, `@view`, `@controller`, `@helpers` aliases
4. **British spelling**: Suggest British spellings in variable names, comments, and strings (except when interfacing with external APIs)

### Inline Suggestions

When suggesting inline code:

* **Type annotations**: Include explicit TypeScript types, especially for function parameters and return values
* **Error handling**: Suggest proper error handling using Result objects for expected failures, exceptions for unexpected errors
* **Naming conventions**: Follow camelCase for variables/functions, PascalCase for classes/types, consistent casing for initialisms

### Test Generation

When generating tests:

* **Location**: Place model tests in `test/model/`, matching the source structure
* **No mocks for model**: Use real objects when testing model layer code
* **Test names**: Use descriptive test names that explain the behaviour being tested
* **Setup**: Use `beforeEach` for common setup, keep tests independent
* **Assertions**: Use clear, specific assertions that document expected behaviour

Example test structure:
```typescript
describe('BridgePuzzle', () => {
  let puzzle: BridgePuzzle;
  let islandA: Island;
  let islandB: Island;
  
  beforeEach(() => {
    islandA = new Island('A', { x: 0, y: 0 });
    islandB = new Island('B', { x: 10, y: 0 });
    puzzle = new BridgePuzzle([islandA, islandB]);
  });
  
  it('should allow valid bridge placement between adjacent islands', () => {
    const result = puzzle.placeBridge('A', 'B');
    
    expect(result.success).toBe(true);
    expect(puzzle.getBridges().length).toBe(1);
  });
});
```

### Refactoring Suggestions

When suggesting refactorings:

* **Extract method**: Suggest extracting complex logic into well-named helper methods
* **Extract class**: Suggest creating new classes when a class has too many responsibilities
* **Remove duplication**: Identify and suggest extracting common patterns into shared utilities
* **Simplify conditionals**: Suggest extracting complex boolean expressions into well-named variables

### Common Patterns

#### Model Classes
```typescript
// Model classes are pure TypeScript with no framework dependencies
export class BridgePuzzle {
  private islands: Island[];
  private bridges: Bridge[];
  
  constructor(islands: Island[], bridges: Bridge[] = []) {
    this.islands = islands;
    this.bridges = bridges;
  }
  
  // Methods modify internal state and return results
  placeBridge(startID: string, endID: string): PlacementResult {
    // Pure logic here
  }
  
  // Provide read-only access to state
  getBridges(): readonly Bridge[] {
    return this.bridges;
  }
}
```

#### View Classes
```typescript
// View classes handle Phaser rendering
export class PuzzleScene extends Phaser.Scene {
  private puzzle: BridgePuzzle; // Read-only reference to model
  
  create(): void {
    // Set up Phaser scene
  }
  
  render(): void {
    // Draw based on model state, don't modify it
    const bridges = this.puzzle.getBridges();
    bridges.forEach(bridge => this.drawBridge(bridge));
  }
}
```

#### Controller Classes
```typescript
// Controller classes orchestrate between model and view
export class PuzzleController {
  constructor(
    private puzzle: BridgePuzzle,
    private view: PuzzleScene
  ) {}
  
  onIslandClicked(islandID: string): void {
    // Update model
    const result = this.puzzle.selectIsland(islandID);
    
    // Update view based on model changes
    if (result.bridgePlaced) {
      this.view.showBridge(result.bridge);
    }
  }
}
```

### Anti-Patterns to Avoid

When providing suggestions, **do not** suggest code that:

* ❌ Imports Phaser or UI frameworks in model/ files
* ❌ Contains game logic in view/ or controller/ files
* ❌ Uses global state or singletons for shared data
* ❌ Directly mutates model state from view layer
* ❌ Has cryptic variable names like `s`, `tmp`, `data`
* ❌ Creates large classes with multiple responsibilities
* ❌ Duplicates logic that could be extracted to a helper
* ❌ Uses American spellings in British English codebase (except for external APIs)

### Documentation and Comments

When suggesting comments or documentation:

* **When to comment**: Add comments for complex algorithms, non-obvious business rules, or "why" decisions
* **When not to comment**: Don't comment obvious code - prefer self-documenting code instead
* **JSDoc**: Add JSDoc comments for public APIs, especially in model layer
* **TODO comments**: Use `// TODO: description` for future work, `// FIXME: description` for known issues

Example JSDoc:
```typescript
/**
 * Validates whether a bridge can be placed between two islands.
 * 
 * @param startID - The ID of the starting island
 * @param endID - The ID of the ending island
 * @returns A result object indicating success/failure and error details
 */
placeBridge(startID: string, endID: string): PlacementResult {
  // Implementation
}
```

## Working with Existing Code

When modifying existing code:

1. **Understand the context**: Read the surrounding code to understand the existing patterns and style
2. **Match the style**: Follow the existing code style, even if it differs from your preferences
3. **Minimal changes**: Make the smallest change possible to achieve the goal
4. **Update tests**: If changing behaviour, update the corresponding tests
5. **Preserve structure**: Don't reorganise or refactor unless specifically asked

## Integration with Development Workflow

### Running Tests

The project uses Vitest for testing. Tests can be run with:
```bash
npm test                    # Run all tests once
npm test -- --watch        # Run tests in watch mode
npm test -- BridgePuzzle   # Run specific test file
```

### Building and Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### TypeScript Configuration

The project uses strict TypeScript settings:
* `strict: true` - All strict checks enabled
* `noUnusedLocals: true` - Error on unused local variables
* `noUnusedParameters: true` - Error on unused function parameters
* `noFallthroughCasesInSwitch: true` - Error on switch fallthrough

Always ensure suggestions compile without TypeScript errors.

## Summary

When working on Archipelago:
1. **Respect the MVC architecture** - Model is pure, View renders, Controller orchestrates
2. **Write testable code** - Especially in model layer, with unit tests
3. **Follow British spellings** - Except when interfacing with external APIs
4. **Use path aliases** - `@model`, `@view`, `@controller`, `@helpers`
5. **Keep it clean** - Clear names, small classes, explicit dependencies
6. **Test your changes** - Write tests for new model code, update tests when behaviour changes

For more detailed information, refer to [ARCHITECTURE.md](../ARCHITECTURE.md) and [AGENTS.md](../AGENTS.md).
