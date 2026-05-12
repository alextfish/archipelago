# Test Directory Structure

This directory contains all tests for the Archipelago project, organized by test type and layer.

## Directory Layout

```
test/
├── model/          # Unit tests for model layer (pure TypeScript logic)
├── view/           # Unit tests for view layer (Phaser rendering)
├── controller/     # Unit tests for controller layer (orchestration)
├── constraint/     # Unit tests for puzzle constraints
├── helpers/        # Test helper utilities
├── playwright/     # Playwright browser automation helpers
├── e2e/            # End-to-end browser tests
├── setup.ts        # Vitest test setup
└── *.test.ts       # Top-level test files
```

## Test Types

### Unit Tests (`*.test.ts`)
- **Framework**: Vitest
- **Location**: Mirrors `src/` structure (`test/model/`, `test/view/`, etc.)
- **Purpose**: Test individual classes and functions in isolation
- **Run**: `npm test`

### Browser E2E Tests (`e2e/*.mjs`)
- **Framework**: Playwright
- **Location**: `test/e2e/`
- **Purpose**: Full browser automation testing conversation flows, player movement, etc.
- **Run**: `node test/e2e/test-beach.mjs` (requires dev server running)

### Playwright Helpers (`playwright/helpers.mjs`)
- **Purpose**: Reusable utilities for browser automation tests
- **Includes**: `initTest()`, `navigateAndWaitForLoad()`, `completeConversation()`, etc.

## Running Tests

### All Unit Tests
```bash
npm test
```

### Watch Mode
```bash
npm test -- --watch
```

### Specific Test File
```bash
npm test -- PlayerStartManager
```

### E2E Tests (browser automation)
```bash
# Start dev server first
npm run dev

# In another terminal
node test/e2e/test-beach.mjs
node test/e2e/test-forest.mjs
```

## Test Conventions

- Use path aliases: `@model`, `@view`, `@controller`, `@helpers`
- Tests should mirror source structure: `src/model/Foo.ts` → `test/model/Foo.test.ts`
- Use British spellings: "colour", "behaviour", etc.
- Keep model tests pure (no mocks, real objects)
- View/controller tests can use Phaser mocks if needed

## Why `test/` at Root?

Tests are kept in a root `test/` directory rather than `src/test/` because:
1. **Separation of concerns**: Tests are not production code
2. **Build simplicity**: Production builds don't need to exclude test files from `src/`
3. **Standard convention**: Most Node.js/TypeScript projects use `test/` or `__tests__/` at root
4. **Tool expectations**: Test runners like Vitest expect tests outside `src/`
