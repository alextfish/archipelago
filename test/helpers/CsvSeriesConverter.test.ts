import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const describeOnWindows = process.platform === 'win32' ? describe : describe.skip;
const scriptPath = path.join(process.cwd(), 'scripts', 'convert-csv-series.ps1');

function runConverter(csvContent: string): { outputDir: string; cleanup: () => void } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archipelago-csv-series-'));
    const inputPath = path.join(tempDir, 'input.csv');
    const outputDir = path.join(tempDir, 'output');

    fs.writeFileSync(inputPath, csvContent, 'utf8');

    const result = spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath,
            '-InputPath', inputPath,
            '-OutputDir', outputDir,
        ],
        {
            encoding: 'utf8',
            cwd: process.cwd(),
        }
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    return {
        outputDir,
        cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
    };
}

describeOnWindows('convert-csv-series.ps1', () => {
    it('writes one embedded series file per NPC section with linear puzzle progression', () => {
        const csv = [
            'NPC: BAY 1 SEE,,,,,',
            ',,"First, Puzzle:",,,,,',
            ',4,--,4,2 x1,',
            ',,,,,',
            ',,"Second Puzzle:",,,,,',
            ',4,--,4,2 x2,',
            ',,,,,',
            'NPC: BAY 2 ADJ,,,,,',
            ',,"Third Puzzle:",,,,,',
            ',4,--,4,2 x1,',
        ].join('\n');

        const { outputDir, cleanup } = runConverter(csv);
        try {
            const outputFiles = fs.readdirSync(outputDir).sort();
            expect(outputFiles).toEqual(['bay-1-see.json', 'bay-2-adj.json']);

            const firstSeries = JSON.parse(fs.readFileSync(path.join(outputDir, 'bay-1-see.json'), 'utf8'));
            expect(firstSeries.id).toBe('bay-1-see');
            expect(firstSeries.puzzles).toHaveLength(2);
            expect(firstSeries.puzzles[0].id).toBe('first-puzzle');
            expect(firstSeries.puzzles[0].title).toBe('First, Puzzle');
            expect(firstSeries.puzzles[0].requiredPuzzles).toEqual([]);
            expect(firstSeries.puzzles[1].id).toBe('second-puzzle');
            expect(firstSeries.puzzles[1].requiredPuzzles).toEqual(['first-puzzle']);
        }
        finally {
            cleanup();
        }
    });

    it('parses see, adj, and bri island constraints and both bridge inventory syntaxes', () => {
        const csv = [
            'NPC: BAY 3,,,,,,,',
            ',,"See Adj Bri:",,,,,,',
            ',6,see2,--,adj1,6,3 x8,',
            ',6,bri3,6,4,6,2 x3,',
            ',,,,,,,',
            ',,"Alt Inventory:",,,,,,',
            ',4,--,4,8x 2,,',
        ].join('\n');

        const { outputDir, cleanup } = runConverter(csv);
        try {
            const series = JSON.parse(fs.readFileSync(path.join(outputDir, 'bay-3.json'), 'utf8'));
            expect(series.puzzles).toHaveLength(2);

            const firstPuzzle = series.puzzles[0].puzzleData;
            expect(firstPuzzle.maxNumBridges).toBe(2);
            expect(firstPuzzle.bridgeTypes).toEqual([
                { id: 'bridge-length-2', colour: '#8B4513', length: 2, count: 3, width: 1 },
                { id: 'bridge-length-3', colour: '#8B4513', length: 3, count: 8, width: 1 },
            ]);

            expect(firstPuzzle.islands).toEqual([
                { id: 'I1', x: 2, y: 1, constraints: ['num_visible=2'] },
                { id: 'I2', x: 4, y: 1, constraints: ['num_passing=1', 'direction=adjacent'] },
                { id: 'I3', x: 2, y: 2, constraints: ['num_bridges=3'] },
                { id: 'I4', x: 4, y: 2 },
            ]);

            expect(firstPuzzle.constraints).toEqual([
                { type: 'AllBridgesPlacedConstraint' },
                { type: 'IslandVisibilityConstraint', params: { islandId: 'I1', count: 2 } },
                { type: 'IslandPassingBridgeCountConstraint', params: { islandId: 'I2', direction: 'adjacent', count: 1 } },
                { type: 'IslandBridgeCountConstraint' },
            ]);

            const secondPuzzle = series.puzzles[1].puzzleData;
            expect(secondPuzzle.bridgeTypes).toEqual([
                { id: 'bridge-length-2', colour: '#8B4513', length: 2, count: 8, width: 1 },
            ]);
        }
        finally {
            cleanup();
        }
    });
});