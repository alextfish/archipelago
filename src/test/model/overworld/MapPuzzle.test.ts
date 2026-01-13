import { describe, expect, it } from "vitest";
import { MapPuzzleExtractor } from '@model/overworld/MapPuzzleExtractor';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { TiledMapData } from '@model/overworld/MapPuzzleExtractor';

describe("MapPuzzle", () => {
    it("should create MapPuzzleExtractor", () => {
        const extractor = new MapPuzzleExtractor(defaultTileConfig);
        expect(extractor).toBeDefined();
    });

    it("should handle empty map data", () => {
        const extractor = new MapPuzzleExtractor(defaultTileConfig);
        const emptyMap: TiledMapData = {
            width: 5,
            height: 5,
            tilewidth: 32,
            tileheight: 32,
            layers: []
        };

        const puzzles = extractor.extractPuzzleDefinitions(emptyMap);
        expect(puzzles).toHaveLength(0);
    });
});
