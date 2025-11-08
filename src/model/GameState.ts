export interface PlayerState {
    x: number;
    y: number;
    inventory: string[];
}

export interface PuzzleState {
    solved: boolean;
    bridgesBuilt: string[];
    [key: string]: any;
}

export interface WorldFlags {
    [flag: string]: boolean;
}

export class GameState {
    player: PlayerState;
    puzzles: { [puzzleId: string]: PuzzleState };
    worldFlags: WorldFlags;

    constructor(
        player: PlayerState,
        puzzles: { [puzzleId: string]: PuzzleState },
        worldFlags: WorldFlags
    ) {
        this.player = player;
        this.puzzles = puzzles;
        this.worldFlags = worldFlags;
    }
}