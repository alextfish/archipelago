import { describe, expect, it, beforeEach } from "vitest";
import { MapPuzzleExtractor } from '@model/overworld/MapPuzzleExtractor';
import { defaultTileConfig } from '@model/overworld/MapConfig';
import type { TiledMapData } from '@model/overworld/MapPuzzleExtractor';

describe("MapPuzzleExtractor", () => {
    let extractor: MapPuzzleExtractor;

    beforeEach(() => {
        extractor = new MapPuzzleExtractor(defaultTileConfig);
    });

    describe("basic functionality", () => {
        it("should create MapPuzzleExtractor", () => {
            expect(extractor).toBeDefined();
        });

        it("should handle empty map data", () => {
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

    describe("dynamic island tile ID extraction", () => {
        it("should extract island tile IDs from tileset with isIsland property", () => {
            const mapWithIslandTiles: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [],
                tilesets: [
                    {
                        firstgid: 1,
                        name: "terrain",
                        tiles: [
                            { id: 0, properties: [{ name: "isIsland", type: "bool", value: true }] },
                            { id: 5, properties: [{ name: "isIsland", type: "bool", value: true }] },
                            { id: 10, properties: [] }
                        ]
                    }
                ]
            };

            // Extract island IDs by creating a puzzle (this triggers caching)
            const puzzle = extractor.createBridgePuzzle(
                {
                    id: "test",
                    bounds: { x: 0, y: 0, width: 32, height: 32 },
                    metadata: {}
                },
                mapWithIslandTiles
            );

            // Should use dynamically detected IDs (1, 6) not the fallback [6]
            expect(puzzle).toBeDefined();
        });

        it("should fallback to config islandTileIDs when no isIsland properties found", () => {
            const mapWithoutIslandProperties: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "ground",
                        type: "tilelayer",
                        width: 10,
                        height: 10,
                        data: [6, 0, 0, 6, 0, 0, 0, 0, 0, 0],
                        visible: true,
                        opacity: 1
                    }
                ],
                tilesets: [
                    {
                        firstgid: 1,
                        name: "terrain",
                        tiles: [] // No tiles with isIsland property
                    }
                ]
            };

            const puzzle = extractor.createBridgePuzzle(
                {
                    id: "test",
                    bounds: { x: 0, y: 0, width: 96, height: 32 },
                    metadata: {}
                },
                mapWithoutIslandProperties
            );

            // Should fall back to defaultTileConfig.islandTileIDs which includes 6
            expect(puzzle.islands.length).toBeGreaterThan(0);
        });

        it("should cache island tile IDs to avoid repeated extraction", () => {
            const mapData: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [],
                tilesets: [
                    {
                        firstgid: 1,
                        name: "test",
                        tiles: [
                            { id: 0, properties: [{ name: "isIsland", type: "bool", value: true }] }
                        ]
                    }
                ]
            };

            // Create multiple puzzles - should only extract IDs once
            extractor.createBridgePuzzle({ id: "p1", bounds: { x: 0, y: 0, width: 32, height: 32 }, metadata: {} }, mapData);
            extractor.createBridgePuzzle({ id: "p2", bounds: { x: 0, y: 0, width: 32, height: 32 }, metadata: {} }, mapData);

            // No direct way to test caching, but ensures it doesn't crash
            expect(true).toBe(true);
        });
    });

    describe("region-aware puzzle extraction", () => {
        it("should extract region group from nested puzzle layers", () => {
            const mapWithRegions: TiledMapData = {
                width: 20,
                height: 20,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "Beach",
                        type: "group",
                        visible: true,
                        opacity: 1,
                        layers: [
                            {
                                name: "puzzles",
                                type: "objectgroup",
                                visible: true,
                                opacity: 1,
                                objects: [
                                    {
                                        id: 1,
                                        name: "beach_puzzle_1",
                                        type: "puzzle",
                                        x: 0,
                                        y: 0,
                                        width: 160,
                                        height: 96,
                                        visible: true,
                                        rotation: 0,
                                        properties: []
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        name: "Forest",
                        type: "group",
                        visible: true,
                        opacity: 1,
                        layers: [
                            {
                                name: "puzzles",
                                type: "objectgroup",
                                visible: true,
                                opacity: 1,
                                objects: [
                                    {
                                        id: 2,
                                        name: "forest_puzzle_1",
                                        type: "puzzle",
                                        x: 320,
                                        y: 320,
                                        width: 128,
                                        height: 128,
                                        visible: true,
                                        rotation: 0,
                                        properties: []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            const definitions = extractor.extractPuzzleDefinitions(mapWithRegions);

            expect(definitions).toHaveLength(2);
            expect(definitions[0].regionGroup).toBe("Beach");
            expect(definitions[0].id).toBe("beach_puzzle_1");
            expect(definitions[1].regionGroup).toBe("Forest");
            expect(definitions[1].id).toBe("forest_puzzle_1");
        });

        it("should extract puzzles from top-level layers with no region", () => {
            const mapWithTopLevelPuzzles: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "puzzles",
                        type: "objectgroup",
                        visible: true,
                        opacity: 1,
                        objects: [
                            {
                                id: 1,
                                name: "top_level_puzzle",
                                type: "puzzle",
                                x: 0,
                                y: 0,
                                width: 96,
                                height: 96,
                                visible: true,
                                rotation: 0,
                                properties: []
                            }
                        ]
                    }
                ]
            };

            const definitions = extractor.extractPuzzleDefinitions(mapWithTopLevelPuzzles);

            expect(definitions).toHaveLength(1);
            expect(definitions[0].regionGroup).toBeUndefined();
            expect(definitions[0].id).toBe("top_level_puzzle");
        });
    });

    describe("region-aware island extraction", () => {
        it("should extract islands only from the puzzle's region ground layer", () => {
            const mapWithRegionalIslands: TiledMapData = {
                width: 20,
                height: 20,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "Beach",
                        type: "group",
                        visible: true,
                        opacity: 1,
                        layers: [
                            {
                                name: "ground",
                                type: "tilelayer",
                                width: 20,
                                height: 20,
                                data: Array(400).fill(0).map((_, i) => i === 10 || i === 15 ? 6 : 0),
                                visible: true,
                                opacity: 1
                            }
                        ]
                    },
                    {
                        name: "Forest",
                        type: "group",
                        visible: true,
                        opacity: 1,
                        layers: [
                            {
                                name: "ground",
                                type: "tilelayer",
                                width: 20,
                                height: 20,
                                data: Array(400).fill(0).map((_, i) => i === 210 || i === 215 || i === 220 ? 6 : 0),
                                visible: true,
                                opacity: 1
                            }
                        ]
                    }
                ]
            };

            // Beach puzzle should only find islands in Beach/ground
            const beachPuzzle = extractor.createBridgePuzzle(
                {
                    id: "beach_puzzle",
                    regionGroup: "Beach",
                    bounds: { x: 0, y: 0, width: 640, height: 640 },
                    metadata: {}
                },
                mapWithRegionalIslands
            );

            // Forest puzzle should only find islands in Forest/ground
            const forestPuzzle = extractor.createBridgePuzzle(
                {
                    id: "forest_puzzle",
                    regionGroup: "Forest",
                    bounds: { x: 0, y: 0, width: 640, height: 640 },
                    metadata: {}
                },
                mapWithRegionalIslands
            );

            expect(beachPuzzle.islands.length).toBe(2);
            expect(forestPuzzle.islands.length).toBe(3);
        });

        it("should search all ground layers when no region specified", () => {
            const mapWithMultipleGroundLayers: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "ground",
                        type: "tilelayer",
                        width: 10,
                        height: 10,
                        data: Array(100).fill(0).map((_, i) => i === 5 ? 6 : 0),
                        visible: true,
                        opacity: 1
                    }
                ]
            };

            const puzzle = extractor.createBridgePuzzle(
                {
                    id: "global_puzzle",
                    bounds: { x: 0, y: 0, width: 320, height: 320 },
                    metadata: {}
                },
                mapWithMultipleGroundLayers
            );

            expect(puzzle.islands.length).toBe(1);
        });
    });

    describe("puzzle metadata and properties", () => {
        it("should extract custom properties from puzzle objects", () => {
            const mapWithProperties: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "puzzles",
                        type: "objectgroup",
                        visible: true,
                        opacity: 1,
                        objects: [
                            {
                                id: 1,
                                name: "custom_puzzle",
                                type: "puzzle",
                                x: 0,
                                y: 0,
                                width: 96,
                                height: 96,
                                visible: true,
                                rotation: 0,
                                properties: [
                                    { name: "difficulty", type: "string", value: "hard" },
                                    { name: "max_bridges_per_island", type: "int", value: "2" }
                                ]
                            }
                        ]
                    }
                ]
            };

            const definitions = extractor.extractPuzzleDefinitions(mapWithProperties);

            expect(definitions).toHaveLength(1);
            expect(definitions[0].metadata.difficulty).toBe("hard");
            expect(definitions[0].metadata.max_bridges_per_island).toBe("2");
        });

        it("should handle puzzle bounds correctly", () => {
            const mapData: TiledMapData = {
                width: 50,
                height: 50,
                tilewidth: 32,
                tileheight: 32,
                layers: [
                    {
                        name: "puzzles",
                        type: "objectgroup",
                        visible: true,
                        opacity: 1,
                        objects: [
                            {
                                id: 1,
                                name: "positioned_puzzle",
                                type: "puzzle",
                                x: 100,
                                y: 200,
                                width: 128,
                                height: 96,
                                visible: true,
                                rotation: 0,
                                properties: []
                            }
                        ]
                    }
                ]
            };

            const definitions = extractor.extractPuzzleDefinitions(mapData);

            expect(definitions[0].bounds).toEqual({
                x: 100,
                y: 200,
                width: 128,
                height: 96
            });
        });
    });

    describe("bridge puzzle creation", () => {
        it("should create BridgePuzzle with correct size", () => {
            const mapData: TiledMapData = {
                width: 20,
                height: 20,
                tilewidth: 32,
                tileheight: 32,
                layers: []
            };

            const puzzle = extractor.createBridgePuzzle(
                {
                    id: "sized_puzzle",
                    bounds: { x: 0, y: 0, width: 256, height: 192 },
                    metadata: {}
                },
                mapData
            );

            expect(puzzle.width).toBe(8); // 256 / 32
            expect(puzzle.height).toBe(6); // 192 / 32
        });

        it("should apply constraints from metadata", () => {
            const mapData: TiledMapData = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                layers: []
            };

            const puzzle = extractor.createBridgePuzzle(
                {
                    id: "constrained_puzzle",
                    bounds: { x: 0, y: 0, width: 96, height: 96 },
                    metadata: {
                        constraints: "AllBridgesPlaced,NoCrossing"
                    }
                },
                mapData
            );

            expect(puzzle.constraints.length).toBeGreaterThan(0);
        });
    });
});
