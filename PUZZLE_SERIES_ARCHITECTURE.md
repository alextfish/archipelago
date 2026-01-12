# Puzzle Series Architecture

This document describes the new puzzle series system that enables progression through related BridgePuzzles with unlock requirements, progress tracking, and structured navigation.

## Overview

The puzzle series system allows the game to present puzzles in an organized, progressive manner where:
- Puzzles can be grouped into thematic series
- Puzzles have dependencies (must complete A before B unlocks)
- Progress is automatically saved and restored
- Players can navigate through series with clear progression feedback

## Core Components

### 1. PuzzleSeries (`src/model/series/PuzzleSeries.ts`)

The main class representing a collection of related puzzles with progression logic.

**Key Features:**
- Tracks which puzzles are unlocked/completed
- Manages current puzzle position in the series
- Handles puzzle completion and automatic unlocking
- Provides navigation between puzzles
- Calculates completion percentage

**Example Usage:**
```typescript
const series = new PuzzleSeries(
  'tutorial-series',
  'Bridge Building Tutorial', 
  'Learn the basics',
  puzzleEntries,
  initialProgress
);

// Complete a puzzle and unlock next ones
const result = series.completePuzzle('puzzle1');
console.log(result.newlyUnlockedPuzzles); // ['puzzle2', 'puzzle3']

// Navigate through series
series.navigateToNext();
console.log(series.getCurrentPuzzle()?.title); // 'Second Puzzle'
```

### 2. SeriesFactory (`src/model/series/SeriesFactory.ts`)

Factory class for creating PuzzleSeries instances from JSON configuration files.

**Supported JSON Formats:**

**Embedded Format** (puzzles included in series file):
```json
{
  "id": "tutorial-series",
  "title": "Bridge Building Tutorial",
  "puzzles": [
    {
      "id": "tutorial-1",
      "title": "First Bridge",
      "puzzleData": { /* full puzzle spec */ },
      "requiredPuzzles": []
    }
  ]
}
```

**Referenced Format** (puzzles in separate files):
```json
{
  "id": "island-chain-series", 
  "title": "Island Chain Challenge",
  "puzzleRefs": [
    {
      "puzzleFile": "data/puzzles/simple4IslandPuzzle.json",
      "title": "Four Island Foundation",
      "requiredPuzzles": []
    }
  ]
}
```

### 3. Progress Storage (`src/model/series/SeriesLoaders.ts`)

**LocalStorageProgressStore**: Persists progress to browser localStorage
**MemoryProgressStore**: In-memory storage (useful for testing)
**FilePuzzleLoader**: Loads puzzle data from files or embedded JSON

### 4. SeriesManager (`src/model/series/SeriesFactory.ts`)

High-level manager that:
- Caches loaded series for performance
- Coordinates between SeriesFactory and progress storage
- Handles saving/loading series progress

## Data Flow Architecture

```
JSON Series File → SeriesFactory → PuzzleSeries ← SeriesManager
                        ↓              ↑
                 PuzzleLoader    ProgressStore
                        ↓              ↑
                 BridgePuzzle    localStorage
```

1. **Loading**: SeriesFactory reads JSON, creates PuzzleSeries with loaded/restored progress
2. **Playing**: Game interacts with PuzzleSeries for navigation and completion
3. **Persistence**: SeriesManager saves progress changes to ProgressStore
4. **Restoration**: On reload, progress is restored and series state synchronized

## Integration with Existing Game

The puzzle series system is designed to integrate cleanly with the existing architecture:

### Controller Layer Integration
```typescript
// In PuzzleController or similar
export class GameProgressController {
  private seriesController: PuzzleSeriesController;
  private puzzleController: PuzzleController;

  async startSeries(seriesPath: string) {
    await this.seriesController.loadSeries(seriesPath);
    const currentPuzzleId = this.seriesController.getCurrentPuzzle();
    if (currentPuzzleId) {
      // Load the current puzzle into existing PuzzleController
      await this.loadPuzzleFromSeries(currentPuzzleId);
    }
  }

  onPuzzleCompleted(puzzleId: string) {
    const result = await this.seriesController.completePuzzle(puzzleId);
    if (result.nextPuzzle) {
      // Automatically advance to next puzzle
      await this.loadPuzzleFromSeries(result.nextPuzzle);
    }
  }
}
```

### View Layer Integration
```typescript
// Series overview UI component
const seriesOverview = seriesController.getSeriesOverview();
if (seriesOverview) {
  // Render progress bar
  progressBar.setProgress(seriesOverview.progress);
  
  // Render puzzle list with unlock status
  seriesOverview.puzzles.forEach(puzzle => {
    const button = createPuzzleButton(puzzle.title);
    button.enabled = puzzle.unlocked;
    button.completed = puzzle.completed;
    button.current = puzzle.isCurrent;
  });
}
```

## File Structure

```
src/
├── model/series/
│   ├── PuzzleSeries.ts          # Core series logic
│   ├── SeriesFactory.ts         # JSON loading and factory
│   └── SeriesLoaders.ts         # Storage implementations
├── data/series/
│   ├── tutorial-series.json     # Example embedded format
│   └── island-chain-series.json # Example referenced format
├── examples/
│   └── PuzzleSeriesExample.ts   # Integration example
└── test/model/series/
    ├── PuzzleSeries.test.ts     # Core logic tests
    ├── SeriesFactory.test.ts    # Factory tests
    └── SeriesLoaders.test.ts    # Storage tests
```

## Key Design Decisions

### 1. **Immutable Progress Updates**
Progress changes create new objects rather than mutating existing ones, ensuring predictable state management and easier debugging.

### 2. **Flexible JSON Formats** 
Two formats (embedded vs. referenced) support different use cases:
- Embedded: Good for small, self-contained series
- Referenced: Better for large series reusing existing puzzles

### 3. **Dependency-Based Unlocking**
Puzzles specify their requirements as arrays of puzzle IDs, enabling flexible dependency graphs (not just linear progression).

### 4. **Separation of Concerns**
- PuzzleSeries: Core logic and state
- SeriesFactory: Data loading and creation
- ProgressStore: Persistence abstraction
- SeriesManager: High-level coordination

### 5. **Full Unit Test Coverage**
Every component has comprehensive tests ensuring reliability and making future changes safer.

## Usage Examples

### Creating a New Series

1. **Design the progression**: Determine puzzle order and dependencies
2. **Create JSON file**: Use embedded or referenced format
3. **Load in game**: Use SeriesFactory and SeriesManager
4. **Integrate UI**: Connect to existing game controllers and scenes

### Adding Series to Overworld

```typescript
// In OverworldScene or similar
class OverworldController {
  async onSeriesNodeClicked(seriesPath: string) {
    const series = await this.gameController.loadSeries(seriesPath);
    
    // Show series selection UI
    this.showSeriesOverview(series);
  }

  async onPuzzleSelected(puzzleId: string) {
    // Navigate to specific puzzle and start gameplay
    this.gameController.navigateToPuzzle(puzzleId);
    this.scene.start('PuzzleScene');
  }
}
```

## Benefits

1. **Player Engagement**: Clear progression and unlocking creates motivation
2. **Content Organization**: Logical grouping makes large puzzle collections manageable  
3. **Progress Persistence**: Players can continue where they left off
4. **Extensibility**: Easy to add new series or modify existing ones
5. **Testability**: Comprehensive test coverage ensures reliability
6. **Performance**: Caching and lazy loading optimize resource usage

## Future Enhancements

1. **Achievement System**: Track completion stats and award achievements
2. **Difficulty Ratings**: Add puzzle difficulty metadata for better UX
3. **Branching Paths**: Support conditional unlocking based on performance
4. **Series Recommendations**: Suggest next series based on completion
5. **Cloud Sync**: Extend progress storage to support cloud synchronization
6. **Series Editor**: Tools for creating and editing series JSON files

The puzzle series system provides a solid foundation for structured puzzle progression while maintaining the clean, testable architecture principles established in the project.