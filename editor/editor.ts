// Puzzle Editor for Archipelago
// A minimal web-based editor for creating bridge puzzles

import { BridgePuzzle, type PuzzleSpec } from '../src/model/puzzle/BridgePuzzle';
import { PuzzleValidator } from '../src/model/puzzle/PuzzleValidator';

interface Island {
    id: string;
    x: number;
    y: number;
    constraints?: string[];
}

interface BridgeTypeSpec {
    id: string;
    colour?: string;
    length?: number;
    count?: number;
}

interface ConstraintSpec {
    type: string;
    params?: Record<string, any>;
}

interface PuzzleData {
    id: string;
    type: string;
    size: { width: number; height: number };
    islands: Island[];
    bridgeTypes: BridgeTypeSpec[];
    constraints: ConstraintSpec[];
    maxNumBridges: number;
}

interface TestBridge {
    start: { x: number; y: number };
    end: { x: number; y: number };
    bridgeTypeId: string;
}

interface ParamDef {
    name: string;
    type: 'string' | 'number';
    isCoord?: boolean;
    hint?: string;
}

interface ConstraintTypeDef {
    type: string;
    name: string;
    description: string;
    params?: ParamDef[];
    needsCell?: boolean;
    note?: string;
}

const CONSTRAINT_TYPES: ConstraintTypeDef[] = [
    {
        type: 'AllBridgesPlacedConstraint',
        name: 'All Bridges Placed',
        description: 'All bridges from inventory must be placed',
        params: []
    },
    {
        type: 'NoCrossingConstraint',
        name: 'No Crossing',
        description: 'Bridges must not cross each other',
        params: []
    },
    {
        type: 'MustTouchAHorizontalBridge',
        name: 'Must Touch Horizontal Bridge',
        description: 'Cell must be adjacent to a horizontal bridge',
        params: [
            { name: 'x', type: 'number', isCoord: true },
            { name: 'y', type: 'number', isCoord: true }
        ],
        needsCell: true
    },
    {
        type: 'MustTouchAVerticalBridge',
        name: 'Must Touch Vertical Bridge',
        description: 'Cell must be adjacent to a vertical bridge',
        params: [
            { name: 'x', type: 'number', isCoord: true },
            { name: 'y', type: 'number', isCoord: true }
        ],
        needsCell: true
    },
    {
        type: 'MustHaveWaterConstraint',
        name: 'Must Have Water',
        description: 'A specific cell must contain water',
        params: [
            { name: 'x', type: 'number', isCoord: true },
            { name: 'y', type: 'number', isCoord: true }
        ],
        needsCell: true
    },
    {
        type: 'IslandMustBeCoveredConstraint',
        name: 'Island Must Be Covered',
        description: 'Specified island must be covered by at least one bridge',
        params: [{ name: 'islandId', type: 'string' }]
    },
    {
        type: 'IslandColourSeparationConstraint',
        name: 'Island Colour Separation',
        description: 'Islands of different colours must be separated by bridge colours',
        params: [{ name: 'colour1', type: 'string' }, { name: 'colour2', type: 'string' }]
    },
    {
        type: 'IslandDirectionalBridgeConstraint',
        name: 'Island Directional Bridge',
        description: 'Island must have bridges in a specific direction pattern',
        params: [
            { name: 'islandId', type: 'string' },
            {
                name: 'constraintType',
                type: 'string',
                hint: 'double_horizontal | double_vertical | double_any_direction | no_double_any_direction'
            }
        ]
    },
    {
        type: 'IslandPassingBridgeCountConstraint',
        name: 'Island Passing Bridge Count',
        description: 'Number of bridges passing by an island in a given direction',
        params: [
            { name: 'islandId', type: 'string' },
            { name: 'direction', type: 'string', hint: 'above | below | left | right | adjacent' },
            { name: 'count', type: 'number' }
        ]
    },
    {
        type: 'IslandVisibilityConstraint',
        name: 'Island Visibility',
        description: 'Precise count of islands visible from a specific island',
        params: [
            { name: 'islandId', type: 'string' },
            { name: 'count', type: 'number' }
        ]
    },
    {
        type: 'EnclosedAreaSizeConstraint',
        name: 'Enclosed Area Size',
        description: 'Size of enclosed area at a grid cell (0 = open or covered)',
        params: [
            { name: 'x', type: 'number', isCoord: true },
            { name: 'y', type: 'number', isCoord: true },
            { name: 'size', type: 'number' }
        ],
        needsCell: true
    },
    {
        type: 'BridgeMustCoverIslandConstraint',
        name: 'Bridge Must Cover Island',
        description: 'A specific bridge must cover an island',
        params: [{ name: 'islandId', type: 'string' }],
        note: 'Applied to individual bridge types'
    },
    {
        type: 'IslandBridgeCountConstraint',
        name: 'Island Bridge Count',
        description: 'Number of bridges required at an island',
        params: [
            { name: 'islandId', type: 'string' },
            { name: 'count', type: 'number' }
        ]
    }
];

// Map constraint data to grid label items for rendering
function getConstraintGridItems(
    constraints: ConstraintSpec[],
    islands: Island[]
): Array<{ x: number; y: number; label: string }> {
    const items: Array<{ x: number; y: number; label: string }> = [];

    for (const c of constraints) {
        const p = c.params;
        switch (c.type) {
            case 'MustTouchAHorizontalBridge':
                if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: 'TH' });
                break;
            case 'MustTouchAVerticalBridge':
                if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: 'TV' });
                break;
            case 'MustHaveWaterConstraint':
                if (p?.x != null && p?.y != null) items.push({ x: p.x, y: p.y, label: 'W' });
                break;
            case 'EnclosedAreaSizeConstraint':
                if (p?.x != null && p?.y != null) {
                    items.push({ x: p.x, y: p.y, label: `A=${p.size ?? '?'}` });
                }
                break;
            case 'IslandMustBeCoveredConstraint': {
                const island = islands.find(i => i.id === p?.islandId);
                if (island) items.push({ x: island.x, y: island.y, label: 'COV' });
                break;
            }
            case 'IslandDirectionalBridgeConstraint': {
                const island = islands.find(i => i.id === p?.islandId);
                if (island) {
                    const labelMap: Record<string, string> = {
                        double_horizontal: 'DH',
                        double_vertical: 'DV',
                        double_any_direction: 'D',
                        no_double_any_direction: 'DX',
                    };
                    const label = labelMap[p?.constraintType ?? ''] ?? 'D?';
                    items.push({ x: island.x, y: island.y, label });
                }
                break;
            }
            case 'IslandPassingBridgeCountConstraint': {
                const island = islands.find(i => i.id === p?.islandId);
                if (island) {
                    const dirMap: Record<string, string> = {
                        above: 'PU', below: 'PD', left: 'PL', right: 'PR', adjacent: 'P',
                    };
                    const prefix = dirMap[p?.direction ?? ''] ?? 'P';
                    items.push({ x: island.x, y: island.y, label: `${prefix}=${p?.count ?? '?'}` });
                }
                break;
            }
            case 'IslandVisibilityConstraint': {
                const island = islands.find(i => i.id === p?.islandId);
                if (island) items.push({ x: island.x, y: island.y, label: `V=${p?.count ?? '?'}` });
                break;
            }
            case 'IslandBridgeCountConstraint': {
                const island = islands.find(i => i.id === p?.islandId);
                if (island && p?.count != null) {
                    items.push({ x: island.x, y: island.y, label: `B=${p.count}` });
                }
                break;
            }
        }
    }

    // Also show B=N labels from island.constraints (backwards compat with loaded JSON)
    for (const island of islands) {
        const rule = island.constraints?.find(c => c.startsWith('num_bridges='));
        if (rule) {
            const n = rule.split('=')[1];
            const alreadyAdded = items.some(i => i.x === island.x && i.y === island.y && i.label.startsWith('B='));
            if (!alreadyAdded) {
                items.push({ x: island.x, y: island.y, label: `B=${n}` });
            }
        }
    }

    return items;
}

class PuzzleEditor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private puzzle: PuzzleData;
    private cellSize = 60;
    private tool: 'island' | 'remove' | 'bridge' = 'island';
    private selectedBridgeTypeId: string | null = null;
    private testBridges: TestBridge[] = [];
    private bridgePlacementStart: { x: number; y: number } | null = null;
    private nextIslandId = 0;

    // Constraint form state
    private constraintFormVisible = false;
    private constraintFormNeedsCell = false;
    private selectedConstraintType: ConstraintTypeDef | null = null;

    constructor() {
        this.canvas = document.getElementById('gridCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        this.puzzle = {
            id: 'new_puzzle',
            type: 'standard',
            size: { width: 4, height: 4 },
            islands: [],
            bridgeTypes: [],
            constraints: [],
            maxNumBridges: 10
        };

        this.setupEventListeners();
        this.renderConstraintTypeList();
        this.updateCanvasSize();
        this.renderAll();
    }

    private setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Tool buttons
        document.getElementById('addIslandBtn')?.addEventListener('click', () => {
            this.tool = 'island';
            this.updateToolButtons();
        });
        document.getElementById('removeIslandBtn')?.addEventListener('click', () => {
            this.tool = 'remove';
            this.updateToolButtons();
        });
        document.getElementById('addBridgeBtn')?.addEventListener('click', () => {
            this.tool = 'bridge';
            this.updateToolButtons();
        });

        // Puzzle info
        document.getElementById('puzzleId')?.addEventListener('change', (e) => {
            this.puzzle.id = (e.target as HTMLInputElement).value;
        });
        document.getElementById('resizeGrid')?.addEventListener('click', () => {
            const width = parseInt((document.getElementById('gridWidth') as HTMLInputElement).value);
            const height = parseInt((document.getElementById('gridHeight') as HTMLInputElement).value);
            if (!isNaN(width) && !isNaN(height)) {
                this.puzzle.size = { width, height };
                this.updateCanvasSize();
                this.renderAll();
            }
        });

        // Header buttons
        document.getElementById('saveBtn')?.addEventListener('click', () => this.savePuzzle());
        document.getElementById('loadBtn')?.addEventListener('click', () => this.loadPuzzle());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportJSON());
        document.getElementById('newBtn')?.addEventListener('click', () => this.newPuzzle());

        // Bridge type management
        document.getElementById('addBridgeType')?.addEventListener('click', () => this.addBridgeType());

        // Test solution
        document.getElementById('validateBtn')?.addEventListener('click', () => this.validateSolution());
        document.getElementById('clearTestBtn')?.addEventListener('click', () => {
            this.testBridges = [];
            this.bridgePlacementStart = null;
            document.getElementById('validationResults')!.innerHTML = '';
            this.renderAll();
        });

        // Left panel constraint buttons
        document.getElementById('showConstraintListBtn')?.addEventListener('click', () => {
            this.toggleConstraintTypePanel();
        });
        document.getElementById('editConstraintsBtn')?.addEventListener('click', () => {
            this.togglePuzzleConstraintsPanel();
        });
        document.getElementById('cancelConstraintTypeBtn')?.addEventListener('click', () => {
            this.hideConstraintTypePanel();
        });
        document.getElementById('cancelConstraintFormBtn')?.addEventListener('click', () => {
            this.hideConstraintForm();
        });
        document.getElementById('confirmAddConstraintBtn')?.addEventListener('click', () => {
            this.addConstraintFromForm();
        });
    }

    private toggleConstraintTypePanel() {
        const sidebar = document.getElementById('constraintTypeSidebar')!;
        const panel = document.getElementById('constraintTypePanel')!;
        if (sidebar.style.display !== 'none' && panel.style.display !== 'none') {
            this.hideConstraintTypePanel();
        } else {
            this.hideConstraintForm();
            sidebar.style.display = 'block';
            panel.style.display = 'block';
        }
    }

    private hideConstraintTypePanel() {
        document.getElementById('constraintTypePanel')!.style.display = 'none';
        document.getElementById('constraintTypeSidebar')!.style.display = 'none';
    }

    private togglePuzzleConstraintsPanel() {
        const panel = document.getElementById('puzzleConstraintsPanel')!;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') {
            this.renderPuzzleConstraints();
        }
    }

    private showConstraintForm(ctDef: ConstraintTypeDef) {
        this.selectedConstraintType = ctDef;
        this.constraintFormVisible = true;
        this.constraintFormNeedsCell = ctDef.needsCell === true;

        const title = document.getElementById('constraintFormTitle')!;
        const fields = document.getElementById('constraintFormFields')!;

        title.textContent = ctDef.name;

        let html = '';
        if (ctDef.needsCell) {
            html += `<p class="cell-hint">Click a grid cell to set position, or type coordinates below.</p>`;
        }
        if (ctDef.note) {
            html += `<p class="constraint-note">${ctDef.note}</p>`;
        }

        for (const param of ctDef.params ?? []) {
            const hintHtml = param.hint ? ` <small>${param.hint}</small>` : '';
            html += `<div class="param-group">
                <label for="param_${param.name}">${param.name}:${hintHtml}</label>
                <input type="${param.type === 'number' ? 'number' : 'text'}"
                       id="param_${param.name}"
                       placeholder="${param.name}">
            </div>`;
        }

        fields.innerHTML = html;
        document.getElementById('constraintFormPanel')!.style.display = 'block';
    }

    private hideConstraintForm() {
        this.constraintFormVisible = false;
        this.constraintFormNeedsCell = false;
        this.selectedConstraintType = null;
        document.getElementById('constraintFormPanel')!.style.display = 'none';
    }

    private addConstraintFromForm() {
        const ctDef = this.selectedConstraintType;
        if (!ctDef) return;

        const params: Record<string, any> = {};
        for (const param of ctDef.params ?? []) {
            const input = document.getElementById(`param_${param.name}`) as HTMLInputElement | null;
            if (!input || !input.value.trim()) {
                alert(`Please enter a value for "${param.name}"`);
                return;
            }
            if (param.type === 'number') {
                const n = parseInt(input.value, 10);
                if (isNaN(n)) {
                    alert(`"${param.name}" must be a valid integer`);
                    return;
                }
                params[param.name] = n;
            } else {
                params[param.name] = input.value.trim();
            }
        }

        this.puzzle.constraints.push({
            type: ctDef.type,
            params: Object.keys(params).length > 0 ? params : undefined
        });

        this.hideConstraintForm();
        this.renderAll();

        // Keep puzzle constraints panel in sync if it's open
        const panel = document.getElementById('puzzleConstraintsPanel')!;
        if (panel.style.display !== 'none') {
            this.renderPuzzleConstraints();
        }
    }

    private handleCanvasClick(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridX = Math.floor(x / this.cellSize) + 1;
        const gridY = Math.floor(y / this.cellSize) + 1;

        if (gridX < 1 || gridX > this.puzzle.size.width || gridY < 1 || gridY > this.puzzle.size.height) {
            return;
        }

        // If constraint form is visible and needs a cell, populate coords
        if (this.constraintFormVisible && this.constraintFormNeedsCell) {
            const xInput = document.getElementById('param_x') as HTMLInputElement | null;
            const yInput = document.getElementById('param_y') as HTMLInputElement | null;
            if (xInput) xInput.value = String(gridX);
            if (yInput) yInput.value = String(gridY);
            return;
        }

        // Normal editing
        if (this.tool === 'island') {
            this.addIsland(gridX, gridY);
        } else if (this.tool === 'remove') {
            this.removeIsland(gridX, gridY);
        } else if (this.tool === 'bridge') {
            this.handleBridgePlacement(gridX, gridY);
        }
    }

    private handleBridgePlacement(gridX: number, gridY: number) {
        if (!this.selectedBridgeTypeId) {
            alert('Please select a bridge type first from the Bridge Types panel below');
            return;
        }

        if (!this.bridgePlacementStart) {
            this.bridgePlacementStart = { x: gridX, y: gridY };
            this.renderAll();
        } else {
            const start = this.bridgePlacementStart;
            const end = { x: gridX, y: gridY };

            if (start.x !== end.x && start.y !== end.y) {
                alert('Bridges must be horizontal or vertical');
                this.bridgePlacementStart = null;
                this.renderAll();
                return;
            }
            if (start.x === end.x && start.y === end.y) {
                this.bridgePlacementStart = null;
                this.renderAll();
                return;
            }

            this.testBridges.push({ start, end, bridgeTypeId: this.selectedBridgeTypeId });
            this.bridgePlacementStart = null;
            this.renderAll();
        }
    }

    private addIsland(x: number, y: number) {
        if (this.puzzle.islands.find(i => i.x === x && i.y === y)) return;
        const id = this.generateIslandId();
        this.puzzle.islands.push({ id, x, y });
        this.renderAll();
    }

    private removeIsland(x: number, y: number) {
        const index = this.puzzle.islands.findIndex(i => i.x === x && i.y === y);
        if (index >= 0) {
            this.puzzle.islands.splice(index, 1);
            this.renderAll();
        }
    }

    private generateIslandId(): string {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letters[this.nextIslandId++ % 26];
    }

    private addBridgeType() {
        const id = `bridge_${this.puzzle.bridgeTypes.length + 1}`;
        this.puzzle.bridgeTypes.push({ id, colour: 'black', length: 1, count: 1 });
        this.renderAll();
    }

    private removeBridgeType(id: string) {
        const index = this.puzzle.bridgeTypes.findIndex(b => b.id === id);
        if (index >= 0) {
            this.puzzle.bridgeTypes.splice(index, 1);
            this.renderAll();
        }
    }

    private updateBridgeType(id: string, field: keyof BridgeTypeSpec, value: any) {
        const bridge = this.puzzle.bridgeTypes.find(b => b.id === id);
        if (bridge) (bridge as any)[field] = value;
    }

    private removeConstraint(index: number) {
        this.puzzle.constraints.splice(index, 1);
        this.renderAll();
        this.renderPuzzleConstraints();
    }

    private savePuzzle() {
        try {
            localStorage.setItem('archipelago_puzzle_draft', JSON.stringify(this.puzzle));
            alert('Puzzle saved to local storage!');
        } catch (e) {
            alert('Failed to save: ' + e);
        }
    }

    private loadPuzzle() {
        try {
            const saved = localStorage.getItem('archipelago_puzzle_draft');
            if (saved) {
                this.puzzle = JSON.parse(saved);
                this.nextIslandId = this.puzzle.islands.length;
                (document.getElementById('puzzleId') as HTMLInputElement).value = this.puzzle.id;
                (document.getElementById('gridWidth') as HTMLInputElement).value = String(this.puzzle.size.width);
                (document.getElementById('gridHeight') as HTMLInputElement).value = String(this.puzzle.size.height);
                this.updateCanvasSize();
                this.renderAll();
                alert('Puzzle loaded!');
            } else {
                alert('No saved puzzle found in local storage');
            }
        } catch (e) {
            alert('Failed to load: ' + e);
        }
    }

    // Transform editor-internal puzzle data to game-compatible export format
    private buildExportSpec(): PuzzleData {
        const spec: PuzzleData = JSON.parse(JSON.stringify(this.puzzle));

        // Convert IslandBridgeCountConstraint entries (with islandId/count params)
        // into island.constraints entries (num_bridges=N) for game engine compatibility
        const bridgeCountConstraints = spec.constraints.filter(
            c => c.type === 'IslandBridgeCountConstraint' && c.params?.islandId != null && c.params?.count != null
        );

        for (const bc of bridgeCountConstraints) {
            const island = spec.islands.find(i => i.id === bc.params!.islandId);
            if (island) {
                if (!island.constraints) island.constraints = [];
                island.constraints = island.constraints.filter(c => !c.startsWith('num_bridges='));
                island.constraints.push(`num_bridges=${bc.params!.count}`);
            }
        }

        // Replace parameterised IslandBridgeCountConstraint entries with a single no-param one
        spec.constraints = spec.constraints.filter(
            c => !(c.type === 'IslandBridgeCountConstraint' && c.params?.islandId != null)
        );
        if (bridgeCountConstraints.length > 0 && !spec.constraints.find(c => c.type === 'IslandBridgeCountConstraint')) {
            spec.constraints.push({ type: 'IslandBridgeCountConstraint' });
        }

        return spec;
    }

    private exportJSON() {
        const spec = this.buildExportSpec();
        const json = JSON.stringify(spec, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.puzzle.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private newPuzzle() {
        if (!confirm('Create a new puzzle? Unsaved changes will be lost.')) return;
        this.puzzle = {
            id: 'new_puzzle',
            type: 'standard',
            size: { width: 4, height: 4 },
            islands: [],
            bridgeTypes: [],
            constraints: [],
            maxNumBridges: 10
        };
        this.nextIslandId = 0;
        this.testBridges = [];
        this.bridgePlacementStart = null;
        (document.getElementById('puzzleId') as HTMLInputElement).value = 'new_puzzle';
        (document.getElementById('gridWidth') as HTMLInputElement).value = '4';
        (document.getElementById('gridHeight') as HTMLInputElement).value = '4';
        this.hideConstraintForm();
        this.updateCanvasSize();
        this.renderAll();
    }

    private validateSolution() {
        try {
            const exported = this.buildExportSpec();
            const puzzleSpec: PuzzleSpec = {
                id: exported.id,
                type: exported.type,
                size: exported.size,
                islands: exported.islands,
                bridgeTypes: exported.bridgeTypes,
                constraints: exported.constraints,
                maxNumBridges: exported.maxNumBridges
            };
            const bridgePuzzle = new BridgePuzzle(puzzleSpec);

            for (const tb of this.testBridges) {
                const bridgeType = bridgePuzzle.inventory.takeBridge(tb.bridgeTypeId);
                if (!bridgeType) {
                    document.getElementById('validationResults')!.innerHTML =
                        `<div class="validation-message error">No more bridges of type "${tb.bridgeTypeId}" available</div>`;
                    return;
                }
                bridgePuzzle.placeBridge(bridgeType.id, tb.start, tb.end);
            }

            const validator = new PuzzleValidator(bridgePuzzle);
            const result = validator.validateAll();
            const resultsDiv = document.getElementById('validationResults')!;

            if (result.allSatisfied) {
                resultsDiv.innerHTML = '<div class="validation-message success">✓ All constraints satisfied!</div>';
            } else {
                let html = `<div class="validation-message error">✗ ${result.unsatisfiedCount} constraint(s) failed:</div>`;
                for (const c of result.perConstraint) {
                    if (!c.result.satisfied) {
                        html += `<div class="validation-message error"><strong>${c.type}:</strong> ${c.result.message ?? 'Not satisfied'}</div>`;
                    }
                }
                resultsDiv.innerHTML = html;
            }
        } catch (error) {
            document.getElementById('validationResults')!.innerHTML =
                `<div class="validation-message error">Validation error: ${error}</div>`;
            console.error('Validation error:', error);
        }
    }

    private updateCanvasSize() {
        this.canvas.width = this.puzzle.size.width * this.cellSize;
        this.canvas.height = this.puzzle.size.height * this.cellSize;
    }

    private updateToolButtons() {
        document.querySelectorAll('.tool-controls .btn').forEach(btn => btn.classList.remove('active'));
        if (this.tool === 'island') document.getElementById('addIslandBtn')?.classList.add('active');
        else if (this.tool === 'remove') document.getElementById('removeIslandBtn')?.classList.add('active');
        else if (this.tool === 'bridge') document.getElementById('addBridgeBtn')?.classList.add('active');
    }

    private renderAll() {
        this.renderGrid();
        this.renderBridgeTypes();
    }

    private renderGrid() {
        const ctx = this.ctx;
        const { width, height } = this.puzzle.size;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid lines
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= width; gx++) {
            ctx.beginPath();
            ctx.moveTo(gx * this.cellSize, 0);
            ctx.lineTo(gx * this.cellSize, height * this.cellSize);
            ctx.stroke();
        }
        for (let gy = 0; gy <= height; gy++) {
            ctx.beginPath();
            ctx.moveTo(0, gy * this.cellSize);
            ctx.lineTo(width * this.cellSize, gy * this.cellSize);
            ctx.stroke();
        }

        // Constraint cell highlights and labels
        this.renderConstraintLabels();

        // Test bridges
        this.renderTestBridges();

        // Bridge placement start indicator
        if (this.bridgePlacementStart) {
            const px = (this.bridgePlacementStart.x - 0.5) * this.cellSize;
            const py = (this.bridgePlacementStart.y - 0.5) * this.cellSize;
            ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
            ctx.fillRect(px - this.cellSize / 2, py - this.cellSize / 2, this.cellSize, this.cellSize);
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 3;
            ctx.strokeRect(px - this.cellSize / 2, py - this.cellSize / 2, this.cellSize, this.cellSize);
        }

        // Islands
        this.puzzle.islands.forEach(island => {
            const ix = (island.x - 0.5) * this.cellSize;
            const iy = (island.y - 0.5) * this.cellSize;

            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.arc(ix, iy, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(island.id, ix, iy);
        });
    }

    private renderConstraintLabels() {
        const items = getConstraintGridItems(this.puzzle.constraints, this.puzzle.islands);

        // Group labels by cell position
        const byPos = new Map<string, string[]>();
        for (const item of items) {
            const key = `${item.x},${item.y}`;
            if (!byPos.has(key)) byPos.set(key, []);
            byPos.get(key)!.push(item.label);
        }

        const ctx = this.ctx;
        byPos.forEach((labels, key) => {
            const [gx, gy] = key.split(',').map(Number);
            const cx = (gx - 0.5) * this.cellSize;
            const cy = (gy - 0.5) * this.cellSize;
            const half = this.cellSize / 2;

            // Soft yellow highlight for constrained cells
            ctx.fillStyle = 'rgba(255, 193, 7, 0.15)';
            ctx.fillRect(cx - half, cy - half, this.cellSize, this.cellSize);
            ctx.strokeStyle = 'rgba(255, 150, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - half, cy - half, this.cellSize, this.cellSize);

            // Draw labels stacked at the top of the cell
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            labels.forEach((label, idx) => {
                const textY = cy - half + 9 + idx * 13;
                const metrics = ctx.measureText(label);
                const bgW = metrics.width + 6;
                const bgH = 12;
                // Badge background
                ctx.fillStyle = 'rgba(255, 193, 7, 0.9)';
                ctx.fillRect(cx - bgW / 2, textY - bgH + 3, bgW, bgH);
                // Label text
                ctx.fillStyle = '#333';
                ctx.fillText(label, cx, textY);
            });
        });
    }

    private renderTestBridges() {
        // Group by normalised span to offset duplicates
        const bridgesBySpan = new Map<string, TestBridge[]>();
        this.testBridges.forEach(bridge => {
            const key = bridge.start.x === bridge.end.x
                ? `v_${bridge.start.x}_${Math.min(bridge.start.y, bridge.end.y)}_${Math.max(bridge.start.y, bridge.end.y)}`
                : `h_${Math.min(bridge.start.x, bridge.end.x)}_${Math.max(bridge.start.x, bridge.end.x)}_${bridge.start.y}`;
            if (!bridgesBySpan.has(key)) bridgesBySpan.set(key, []);
            bridgesBySpan.get(key)!.push(bridge);
        });

        const ctx = this.ctx;
        bridgesBySpan.forEach(bridges => {
            bridges.forEach((bridge, index) => {
                const sx = (bridge.start.x - 0.5) * this.cellSize;
                const sy = (bridge.start.y - 0.5) * this.cellSize;
                const ex = (bridge.end.x - 0.5) * this.cellSize;
                const ey = (bridge.end.y - 0.5) * this.cellSize;
                // Centre-offset multiple bridges on same span
                const offset = (index - (bridges.length - 1) / 2) * 5;

                ctx.strokeStyle = '#3498db';
                ctx.lineWidth = 3;
                ctx.beginPath();
                if (bridge.start.x === bridge.end.x) {
                    ctx.moveTo(sx + offset, sy);
                    ctx.lineTo(ex + offset, ey);
                } else {
                    ctx.moveTo(sx, sy + offset);
                    ctx.lineTo(ex, ey + offset);
                }
                ctx.stroke();
            });
        });
    }

    private renderConstraintTypeList() {
        const listDiv = document.getElementById('constraintList')!;
        let html = '';
        CONSTRAINT_TYPES.forEach(ct => {
            html += `<div class="constraint-item" data-type="${ct.type}">
                <h4>${ct.name}</h4>
                <p>${ct.description}</p>
                ${ct.note ? `<p><em>${ct.note}</em></p>` : ''}
            </div>`;
        });
        listDiv.innerHTML = html;

        listDiv.querySelectorAll('.constraint-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.getAttribute('data-type')!;
                const ctDef = CONSTRAINT_TYPES.find(c => c.type === type);
                if (!ctDef) return;
                this.hideConstraintTypePanel();
                this.showConstraintForm(ctDef);
            });
        });
    }

    private renderPuzzleConstraints() {
        const listDiv = document.getElementById('puzzleConstraintsList')!;

        if (this.puzzle.constraints.length === 0) {
            listDiv.innerHTML = '<p class="empty-note">No constraints added yet</p>';
            return;
        }

        let html = '';
        this.puzzle.constraints.forEach((constraint, index) => {
            const info = CONSTRAINT_TYPES.find(c => c.type === constraint.type);
            const name = info ? info.name : constraint.type;
            const paramsStr = constraint.params ? JSON.stringify(constraint.params) : '';
            html += `<div class="puzzle-constraint">
                <button class="remove-btn" data-index="${index}">×</button>
                <strong>${name}</strong>
                ${paramsStr ? `<br><small>${paramsStr}</small>` : ''}
            </div>`;
        });
        listDiv.innerHTML = html;

        listDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt((e.target as HTMLElement).getAttribute('data-index')!);
                this.removeConstraint(index);
            });
        });
    }

    private renderBridgeTypes() {
        const listDiv = document.getElementById('bridgeTypeList')!;

        if (this.puzzle.bridgeTypes.length === 0) {
            listDiv.innerHTML = '<p class="empty-note">No bridge types defined</p>';
            return;
        }

        let html = '';
        this.puzzle.bridgeTypes.forEach(bridge => {
            const selected = this.selectedBridgeTypeId === bridge.id ? 'selected' : '';
            html += `<div class="bridge-type-item ${selected}" data-bridge-id="${bridge.id}">
                <button class="remove-btn" data-id="${bridge.id}">×</button>
                <div><strong>ID:</strong> ${bridge.id}</div>
                <label>Colour:
                    <input type="text" value="${bridge.colour || 'black'}"
                           data-id="${bridge.id}" data-field="colour">
                </label>
                <label>Length (−1 = variable):
                    <input type="number" value="${bridge.length ?? 1}"
                           data-id="${bridge.id}" data-field="length">
                </label>
                <label>Count:
                    <input type="number" value="${bridge.count ?? 1}"
                           data-id="${bridge.id}" data-field="count">
                </label>
            </div>`;
        });

        listDiv.innerHTML = html;

        listDiv.querySelectorAll('.bridge-type-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const t = e.target as HTMLElement;
                if (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.classList.contains('remove-btn')) return;
                const bridgeId = (item as HTMLElement).getAttribute('data-bridge-id')!;
                this.selectedBridgeTypeId = bridgeId;
                this.renderBridgeTypes();
            });
        });

        listDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (e.target as HTMLElement).getAttribute('data-id')!;
                this.removeBridgeType(id);
            });
        });

        listDiv.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const id = target.getAttribute('data-id')!;
                const field = target.getAttribute('data-field') as keyof BridgeTypeSpec;
                const value = target.type === 'number' ? parseInt(target.value, 10) : target.value;
                this.updateBridgeType(id, field, value);
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PuzzleEditor();
});
