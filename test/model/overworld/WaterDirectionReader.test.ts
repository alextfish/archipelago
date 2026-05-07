import { describe, it, expect } from 'vitest';
import { WaterDirectionReader } from '@model/overworld/WaterDirectionReader';
import { gridKey } from '@model/puzzle/FlowTypes';

/**
 * Helper to build minimal Tiled JSON map data for tests.
 *
 * The `water directions` tileset GID 83 = firstgid 83 (local ID 0).
 * Each tile in the tileset has flow direction properties according to the
 * encoding:  bit3=N, bit2=S, bit1=W, bit0=E (IDs 0–15 non-source).
 *
 *   GID 83 = firstgid 83 + local 0  → no directions (pure decoration)
 *   GID 84 = firstgid 83 + local 1  → flowEast
 *   GID 85 = firstgid 83 + local 2  → flowWest
 *   GID 92 = firstgid 83 + local 9  → flowNorth + flowEast  → "NE"
 *   GID 95 = firstgid 83 + local 12 → flowNorth + flowSouth → "NS"
 *   GID 98 = firstgid 83 + local 15 → NSEW
 */

/** Build a tileset entry that covers all 16 non-source direction combos. */
const FIRST_GID = 83;
function waterDirectionsTileset() {
    const tiles = [];
    for (let localID = 0; localID < 16; localID++) {
        tiles.push({
            id: localID,
            properties: [
                { name: 'flowNorth', value: !!(localID & 8) },
                { name: 'flowSouth', value: !!(localID & 4) },
                { name: 'flowWest',  value: !!(localID & 2) },
                { name: 'flowEast',  value: !!(localID & 1) },
                { name: 'source',    value: false },
            ],
        });
    }
    return { name: 'water directions', firstgid: FIRST_GID, tiles };
}

/**
 * Build minimal Tiled map JSON with a single 'water' layer.
 *
 * @param mapWidth  Map width in tiles.
 * @param gids      Flat tile GID array (length = mapWidth × mapHeight).
 */
function buildMapData(mapWidth: number, gids: number[]) {
    return {
        width: mapWidth,
        height: Math.ceil(gids.length / mapWidth),
        tilesets: [waterDirectionsTileset()],
        layers: [
            { name: 'water', type: 'tilelayer', data: gids },
        ],
    };
}

// ── readDirections ───────────────────────────────────────────────────────────

describe('WaterDirectionReader.readDirections', () => {
    it('returns an empty map when tiledMapData is null', () => {
        const result = WaterDirectionReader.readDirections(null);
        expect(result.size).toBe(0);
    });

    it('returns an empty map when there are no water layers', () => {
        const mapData = {
            width: 3,
            height: 1,
            tilesets: [waterDirectionsTileset()],
            layers: [
                { name: 'ground', type: 'tilelayer', data: [FIRST_GID + 1, 0, 0] },
            ],
        };
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(0);
    });

    it('skips tiles with no flow directions', () => {
        // GID = FIRST_GID + 0 → local ID 0 → all flows false
        const mapData = buildMapData(3, [FIRST_GID + 0, 0, 0]);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(0);
    });

    it('reads a single east-flowing tile', () => {
        // GID = FIRST_GID + 1 → localID 1 → flowEast only → key "E"
        const mapData = buildMapData(3, [0, FIRST_GID + 1, 0]);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(1);
        expect(result.get(gridKey(1, 0))).toBe('E');
    });

    it('reads a north+south flowing tile as "NS"', () => {
        // localID 12 = 0b1100 = N|S → direction key "NS"
        const mapData = buildMapData(5, [0, 0, FIRST_GID + 12, 0, 0]);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(1);
        expect(result.get(gridKey(2, 0))).toBe('NS');
    });

    it('reads all-four-direction tile as "NSEW"', () => {
        // localID 15 = 0b1111 = N|S|E|W → "NSEW"
        const mapData = buildMapData(2, [FIRST_GID + 15, 0]);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.get(gridKey(0, 0))).toBe('NSEW');
    });

    it('converts world tile coordinates from flat array index', () => {
        // Map 4 wide, 2 rows.  GID at position (2,1) = index 4*1+2=6.
        const gids = [0, 0, 0, 0, 0, 0, FIRST_GID + 4, 0]; // local 4 = S
        const mapData = buildMapData(4, gids);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.get(gridKey(2, 1))).toBe('S');
    });

    it('collects multiple tiles from one water layer', () => {
        // localID 1=E at (0,0), localID 2=W at (2,0)
        const mapData = buildMapData(3, [FIRST_GID + 1, 0, FIRST_GID + 2]);
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(2);
        expect(result.get(gridKey(0, 0))).toBe('E');
        expect(result.get(gridKey(2, 0))).toBe('W');
    });

    it('merges multiple water layers — later layer wins', () => {
        // Two layers both with a tile at (0,0). Second layer defines direction 'S'.
        const mapData = {
            width: 2,
            height: 1,
            tilesets: [waterDirectionsTileset()],
            layers: [
                { name: 'first/water', type: 'tilelayer', data: [FIRST_GID + 1, 0] }, // E
                { name: 'second/water', type: 'tilelayer', data: [FIRST_GID + 4, 0] }, // S
            ],
        };
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(1);
        expect(result.get(gridKey(0, 0))).toBe('S'); // second layer wins
    });

    it('ignores non-water layers even if they contain direction tiles', () => {
        const mapData = {
            width: 2,
            height: 1,
            tilesets: [waterDirectionsTileset()],
            layers: [
                { name: 'ground', type: 'tilelayer', data: [FIRST_GID + 1, 0] },
            ],
        };
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(0);
    });

    it('finds water layers inside group layers', () => {
        const mapData = {
            width: 2,
            height: 1,
            tilesets: [waterDirectionsTileset()],
            layers: [
                {
                    name: 'Forest',
                    type: 'group',
                    layers: [
                        { name: 'water', type: 'tilelayer', data: [FIRST_GID + 9, 0] }, // NE
                    ],
                },
            ],
        };
        const result = WaterDirectionReader.readDirections(mapData);
        expect(result.size).toBe(1);
        expect(result.get(gridKey(0, 0))).toBe('NE');
    });
});
