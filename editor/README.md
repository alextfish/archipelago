# Archipelago Puzzle Editor

A minimal web-based editor for creating Archipelago bridge puzzles.

## Features

- **Grid-based puzzle design**: Define puzzle dimensions and place islands with simple click interactions
- **Island management**: Add islands as circles on a grid, with automatic ID assignment (A, B, C...)
- **Bridge types**: Define bridge types with customizable colour, length (including variable length -1), and count
- **Constraint system**: Add various puzzle constraints from a comprehensive list:
  - Global constraints (AllBridgesPlaced, NoCrossing)
  - Grid cell constraints (MustTouchHorizontalBridge, MustTouchVerticalBridge)
  - Island-specific constraints (IslandMustBeCovered, IslandColorSeparation, etc.)
  - Per-island constraints (e.g., `num_bridges=3`)
- **Local storage**: Save and load draft puzzles to browser localStorage
- **JSON export**: Export puzzles in the standard format compatible with `src/data/puzzles`
- **Static site**: No server required - can be hosted on GitHub Pages

## Usage

### Running Locally

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open your browser to `http://localhost:5173/editor/`

### Building for Production

```bash
npm run build
```

The editor will be built to the `dist/editor/` directory along with the main application.

## How to Use

### Creating a Puzzle

1. **Set puzzle metadata**: Enter a puzzle ID and set the grid dimensions (width and height)
2. **Add islands**: Click "Add Island" and then click on grid cells to place islands (shown as green circles)
3. **Configure islands**: Each island gets an automatic ID (A, B, C...). You can add constraints like `num_bridges=3` in the Islands panel
4. **Define bridge types**: Click "+ Add Bridge Type" and configure:
   - Colour (e.g., "black", "red", "blue")
   - Length (positive number for fixed length, -1 for variable)
   - Count (how many of this type are available)
5. **Add constraints**: Select "Add Constraint" mode, pick a constraint from the list:
   - For global constraints: Click the constraint name and click "Add Constraint"
   - For cell constraints: Click the constraint name, then click a grid cell to apply it there

### Saving and Loading

- **Save**: Saves the current puzzle to browser localStorage
- **Load**: Loads the saved puzzle from localStorage
- **Export JSON**: Downloads the puzzle as a JSON file ready to be placed in `src/data/puzzles/`
- **New Puzzle**: Clears the editor and starts fresh

### Removing Items

- Use the × buttons to remove islands, bridge types, or constraints
- Click "Remove Island" tool and then click an island to remove it

## Puzzle JSON Format

The editor exports puzzles in this format:

```json
{
  "id": "my_puzzle",
  "type": "standard",
  "size": { "width": 4, "height": 4 },
  "islands": [
    { "id": "A", "x": 1, "y": 1 },
    { "id": "B", "x": 1, "y": 4, "constraints": ["num_bridges=3"] }
  ],
  "bridgeTypes": [
    { "id": "black_2", "colour": "black", "length": 2, "count": 1 }
  ],
  "constraints": [
    { "type": "AllBridgesPlacedConstraint" },
    { "type": "NoCrossingConstraint" },
    { "type": "MustTouchAHorizontalBridge", "params": { "x": 2, "y": 2 } }
  ],
  "maxNumBridges": 10
}
```

## Limitations (MVP)

- Solution testing is a placeholder (requires full constraint implementation)
- Bridge placement for testing is not yet implemented
- BridgeMustCoverIslandConstraint configuration per bridge type is not implemented
- No undo/redo functionality
- Limited validation of puzzle correctness

## Future Enhancements

- Full solution testing with constraint validation
- Visual bridge placement for testing solutions
- Undo/redo support
- Puzzle validation before export
- Import existing puzzle files for editing
- Visual indicators for constraint locations on the grid
- Preview of puzzle in game style
