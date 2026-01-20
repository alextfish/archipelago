// Puzzle Editor for Archipelago
// A minimal web-based editor for creating bridge puzzles
// Available constraint types with descriptions
const CONSTRAINT_TYPES = [
    {
        type: 'AllBridgesPlacedConstraint',
        name: 'All Bridges Placed',
        description: 'All bridges from inventory must be placed',
        needsParams: false,
        needsCell: false
    },
    {
        type: 'NoCrossingConstraint',
        name: 'No Crossing',
        description: 'Bridges must not cross each other',
        needsParams: false,
        needsCell: false
    },
    {
        type: 'MustTouchAHorizontalBridge',
        name: 'Must Touch Horizontal Bridge',
        description: 'Cell must be adjacent to a horizontal bridge',
        needsParams: true,
        needsCell: true,
        params: ['x', 'y']
    },
    {
        type: 'MustTouchAVerticalBridge',
        name: 'Must Touch Vertical Bridge',
        description: 'Cell must be adjacent to a vertical bridge',
        needsParams: true,
        needsCell: true,
        params: ['x', 'y']
    },
    {
        type: 'IslandMustBeCoveredConstraint',
        name: 'Island Must Be Covered',
        description: 'Specified island must be covered by at least one bridge',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'islandId', type: 'string' }]
    },
    {
        type: 'IslandColorSeparationConstraint',
        name: 'Island Colour Separation',
        description: 'Islands must be separated by bridge colours',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'island1Id', type: 'string' }, { name: 'island2Id', type: 'string' }]
    },
    {
        type: 'IslandDirectionalBridgeConstraint',
        name: 'Island Directional Bridge',
        description: 'Island must have a bridge in a specific direction',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'islandId', type: 'string' }, { name: 'direction', type: 'string' }]
    },
    {
        type: 'IslandPassingBridgeCountConstraint',
        name: 'Island Passing Bridge Count',
        description: 'Number of bridges passing by an island',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'islandId', type: 'string' }, { name: 'count', type: 'number' }]
    },
    {
        type: 'IslandVisibilityConstraint',
        name: 'Island Visibility',
        description: 'Islands must be visible from each other',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'island1Id', type: 'string' }, { name: 'island2Id', type: 'string' }]
    },
    {
        type: 'EnclosedAreaSizeConstraint',
        name: 'Enclosed Area Size',
        description: 'Size of enclosed areas created by bridges',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'minSize', type: 'number' }, { name: 'maxSize', type: 'number' }]
    },
    {
        type: 'BridgeMustCoverIslandConstraint',
        name: 'Bridge Must Cover Island',
        description: 'A specific bridge must cover an island',
        needsParams: true,
        needsCell: false,
        params: [{ name: 'islandId', type: 'string' }],
        note: 'Applied to individual bridge types'
    }
];
class PuzzleEditor {
    canvas;
    ctx;
    puzzle;
    cellSize = 60;
    mode = 'edit';
    tool = 'island';
    selectedConstraintType = null;
    testBridges = [];
    nextIslandId = 0;
    constructor() {
        this.canvas = document.getElementById('gridCanvas');
        this.ctx = this.canvas.getContext('2d');
        // Initialize with default puzzle
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
        this.renderAll();
    }
    setupEventListeners() {
        // Canvas click
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        // Mode selection
        document.querySelectorAll('input[name="mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.mode = e.target.value;
                this.updateUI();
            });
        });
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
            this.puzzle.id = e.target.value;
        });
        document.getElementById('resizeGrid')?.addEventListener('click', () => {
            const width = parseInt(document.getElementById('gridWidth').value);
            const height = parseInt(document.getElementById('gridHeight').value);
            this.puzzle.size = { width, height };
            this.updateCanvasSize();
            this.renderAll();
        });
        // Header buttons
        document.getElementById('saveBtn')?.addEventListener('click', () => this.savePuzzle());
        document.getElementById('loadBtn')?.addEventListener('click', () => this.loadPuzzle());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportJSON());
        document.getElementById('newBtn')?.addEventListener('click', () => this.newPuzzle());
        // Bridge type management
        document.getElementById('addBridgeType')?.addEventListener('click', () => this.addBridgeType());
        // Test solution buttons
        document.getElementById('validateBtn')?.addEventListener('click', () => this.validateSolution());
        document.getElementById('clearTestBtn')?.addEventListener('click', () => {
            this.testBridges = [];
            this.renderAll();
        });
    }
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const gridX = Math.floor(x / this.cellSize) + 1;
        const gridY = Math.floor(y / this.cellSize) + 1;
        if (gridX < 1 || gridX > this.puzzle.size.width || gridY < 1 || gridY > this.puzzle.size.height) {
            return;
        }
        if (this.mode === 'edit') {
            this.handleEditClick(gridX, gridY);
        }
        else if (this.mode === 'constraint') {
            this.handleConstraintClick(gridX, gridY);
        }
    }
    handleEditClick(gridX, gridY) {
        if (this.tool === 'island') {
            this.addIsland(gridX, gridY);
        }
        else if (this.tool === 'remove') {
            this.removeIsland(gridX, gridY);
        }
        else if (this.tool === 'bridge') {
            // For MVP, bridge placement will be in test mode
            alert('Use Test Solution section to add bridges for testing');
        }
    }
    handleConstraintClick(gridX, gridY) {
        if (!this.selectedConstraintType) {
            alert('Please select a constraint type first');
            return;
        }
        const constraintInfo = CONSTRAINT_TYPES.find(c => c.type === this.selectedConstraintType);
        if (!constraintInfo)
            return;
        if (constraintInfo.needsCell) {
            this.showConstraintConfig(constraintInfo, { x: gridX, y: gridY });
        }
        else {
            alert('This constraint does not apply to grid cells. Configure it in the left panel.');
        }
    }
    addIsland(x, y) {
        // Check if island already exists at this position
        const existing = this.puzzle.islands.find(i => i.x === x && i.y === y);
        if (existing) {
            alert('Island already exists at this position');
            return;
        }
        const id = this.generateIslandId();
        this.puzzle.islands.push({ id, x, y });
        this.renderAll();
    }
    removeIsland(x, y) {
        const index = this.puzzle.islands.findIndex(i => i.x === x && i.y === y);
        if (index >= 0) {
            this.puzzle.islands.splice(index, 1);
            this.renderAll();
        }
    }
    generateIslandId() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letters[this.nextIslandId++ % 26];
    }
    addBridgeType() {
        const id = `bridge_${this.puzzle.bridgeTypes.length + 1}`;
        this.puzzle.bridgeTypes.push({
            id,
            colour: 'black',
            length: 1,
            count: 1
        });
        this.renderAll();
    }
    removeBridgeType(id) {
        const index = this.puzzle.bridgeTypes.findIndex(b => b.id === id);
        if (index >= 0) {
            this.puzzle.bridgeTypes.splice(index, 1);
            this.renderAll();
        }
    }
    updateBridgeType(id, field, value) {
        const bridge = this.puzzle.bridgeTypes.find(b => b.id === id);
        if (bridge) {
            bridge[field] = value;
        }
    }
    showConstraintConfig(constraintInfo, cell) {
        const configDiv = document.getElementById('cellConstraintConfig');
        const cellConstraintsDiv = document.getElementById('cellConstraints');
        cellConstraintsDiv.style.display = 'block';
        let html = `<h4>${constraintInfo.name}</h4>`;
        if (cell) {
            html += `<div class="param-group">
                <label>X:</label>
                <input type="number" id="param_x" value="${cell.x}" readonly>
            </div>
            <div class="param-group">
                <label>Y:</label>
                <input type="number" id="param_y" value="${cell.y}" readonly>
            </div>`;
        }
        if (constraintInfo.params && Array.isArray(constraintInfo.params)) {
            constraintInfo.params.forEach((param) => {
                const paramName = typeof param === 'string' ? param : param.name;
                const paramType = typeof param === 'string' ? 'text' : param.type;
                if (paramName !== 'x' && paramName !== 'y') {
                    html += `<div class="param-group">
                        <label>${paramName}:</label>
                        <input type="${paramType === 'number' ? 'number' : 'text'}" 
                               id="param_${paramName}" 
                               placeholder="${paramName}">
                    </div>`;
                }
            });
        }
        html += `<button class="btn-small" id="addConstraintBtn">Add Constraint</button>`;
        configDiv.innerHTML = html;
        document.getElementById('addConstraintBtn')?.addEventListener('click', () => {
            this.addConstraintFromConfig(constraintInfo);
        });
    }
    addConstraintFromConfig(constraintInfo) {
        const params = {};
        if (constraintInfo.needsCell) {
            params.x = parseInt(document.getElementById('param_x').value);
            params.y = parseInt(document.getElementById('param_y').value);
        }
        if (constraintInfo.params) {
            constraintInfo.params.forEach((param) => {
                const paramName = typeof param === 'string' ? param : param.name;
                const paramType = typeof param === 'string' ? 'text' : param.type;
                if (paramName !== 'x' && paramName !== 'y') {
                    const input = document.getElementById(`param_${paramName}`);
                    if (input) {
                        params[paramName] = paramType === 'number' ? parseInt(input.value) : input.value;
                    }
                }
            });
        }
        this.puzzle.constraints.push({
            type: constraintInfo.type,
            params: Object.keys(params).length > 0 ? params : undefined
        });
        this.renderAll();
        document.getElementById('cellConstraints').style.display = 'none';
    }
    removeConstraint(index) {
        this.puzzle.constraints.splice(index, 1);
        this.renderAll();
    }
    savePuzzle() {
        try {
            localStorage.setItem('archipelago_puzzle_draft', JSON.stringify(this.puzzle));
            alert('Puzzle saved to local storage!');
        }
        catch (e) {
            alert('Failed to save puzzle: ' + e);
        }
    }
    loadPuzzle() {
        try {
            const saved = localStorage.getItem('archipelago_puzzle_draft');
            if (saved) {
                this.puzzle = JSON.parse(saved);
                this.nextIslandId = this.puzzle.islands.length;
                document.getElementById('puzzleId').value = this.puzzle.id;
                document.getElementById('gridWidth').value = this.puzzle.size.width.toString();
                document.getElementById('gridHeight').value = this.puzzle.size.height.toString();
                this.updateCanvasSize();
                this.renderAll();
                alert('Puzzle loaded from local storage!');
            }
            else {
                alert('No saved puzzle found in local storage');
            }
        }
        catch (e) {
            alert('Failed to load puzzle: ' + e);
        }
    }
    exportJSON() {
        const json = JSON.stringify(this.puzzle, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.puzzle.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    newPuzzle() {
        if (confirm('Create a new puzzle? Unsaved changes will be lost.')) {
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
            document.getElementById('puzzleId').value = this.puzzle.id;
            document.getElementById('gridWidth').value = '4';
            document.getElementById('gridHeight').value = '4';
            this.updateCanvasSize();
            this.renderAll();
        }
    }
    validateSolution() {
        // Placeholder for solution validation
        // In a full implementation, this would instantiate the puzzle and validate
        const resultsDiv = document.getElementById('validationResults');
        resultsDiv.innerHTML = '<div class="validation-message success">Validation feature requires full constraint implementation. Export your puzzle and test it in the main game!</div>';
    }
    updateCanvasSize() {
        this.canvas.width = this.puzzle.size.width * this.cellSize;
        this.canvas.height = this.puzzle.size.height * this.cellSize;
    }
    updateToolButtons() {
        document.querySelectorAll('.tool-controls .btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (this.tool === 'island') {
            document.getElementById('addIslandBtn')?.classList.add('active');
        }
        else if (this.tool === 'remove') {
            document.getElementById('removeIslandBtn')?.classList.add('active');
        }
        else if (this.tool === 'bridge') {
            document.getElementById('addBridgeBtn')?.classList.add('active');
        }
    }
    updateUI() {
        this.renderConstraintList();
        this.renderPuzzleConstraints();
        this.renderBridgeTypes();
        this.renderIslandsList();
    }
    renderAll() {
        this.updateUI();
        this.renderGrid();
    }
    renderGrid() {
        const ctx = this.ctx;
        const { width, height } = this.puzzle.size;
        // Clear canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Draw grid
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x++) {
            ctx.beginPath();
            ctx.moveTo(x * this.cellSize, 0);
            ctx.lineTo(x * this.cellSize, height * this.cellSize);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * this.cellSize);
            ctx.lineTo(width * this.cellSize, y * this.cellSize);
            ctx.stroke();
        }
        // Draw constraint indicators
        this.puzzle.constraints.forEach(constraint => {
            if (constraint.params && constraint.params.x && constraint.params.y) {
                const x = (constraint.params.x - 0.5) * this.cellSize;
                const y = (constraint.params.y - 0.5) * this.cellSize;
                ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
                ctx.fillRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
                ctx.strokeStyle = '#ffc107';
                ctx.lineWidth = 2;
                ctx.strokeRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
            }
        });
        // Draw test bridges
        this.testBridges.forEach(bridge => {
            const startX = (bridge.start.x - 0.5) * this.cellSize;
            const startY = (bridge.start.y - 0.5) * this.cellSize;
            const endX = (bridge.end.x - 0.5) * this.cellSize;
            const endY = (bridge.end.y - 0.5) * this.cellSize;
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        });
        // Draw islands as circles
        this.puzzle.islands.forEach(island => {
            const x = (island.x - 0.5) * this.cellSize;
            const y = (island.y - 0.5) * this.cellSize;
            // Circle
            ctx.fillStyle = '#2ecc71';
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Island ID
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(island.id, x, y);
        });
    }
    renderConstraintList() {
        const listDiv = document.getElementById('constraintList');
        let html = '';
        CONSTRAINT_TYPES.forEach(constraint => {
            const selected = this.selectedConstraintType === constraint.type ? 'selected' : '';
            html += `
                <div class="constraint-item ${selected}" data-type="${constraint.type}">
                    <h4>${constraint.name}</h4>
                    <p>${constraint.description}</p>
                    ${constraint.note ? `<p><em>${constraint.note}</em></p>` : ''}
                </div>
            `;
        });
        listDiv.innerHTML = html;
        // Add click handlers
        listDiv.querySelectorAll('.constraint-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.getAttribute('data-type');
                this.selectedConstraintType = type;
                this.renderConstraintList();
                const constraintInfo = CONSTRAINT_TYPES.find(c => c.type === type);
                if (constraintInfo && !constraintInfo.needsCell) {
                    this.showConstraintConfig(constraintInfo);
                }
            });
        });
    }
    renderPuzzleConstraints() {
        const listDiv = document.getElementById('puzzleConstraintsList');
        if (this.puzzle.constraints.length === 0) {
            listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No constraints added yet</p>';
            return;
        }
        let html = '';
        this.puzzle.constraints.forEach((constraint, index) => {
            const info = CONSTRAINT_TYPES.find(c => c.type === constraint.type);
            const name = info ? info.name : constraint.type;
            const paramsStr = constraint.params ? JSON.stringify(constraint.params) : '';
            html += `
                <div class="puzzle-constraint">
                    <button class="remove-btn" data-index="${index}">×</button>
                    <strong>${name}</strong>
                    ${paramsStr ? `<br><small>${paramsStr}</small>` : ''}
                </div>
            `;
        });
        listDiv.innerHTML = html;
        // Add remove handlers
        listDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                this.removeConstraint(index);
            });
        });
    }
    renderBridgeTypes() {
        const listDiv = document.getElementById('bridgeTypeList');
        if (this.puzzle.bridgeTypes.length === 0) {
            listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No bridge types defined</p>';
            return;
        }
        let html = '';
        this.puzzle.bridgeTypes.forEach((bridge, index) => {
            html += `
                <div class="bridge-type-item">
                    <button class="remove-btn" data-id="${bridge.id}">×</button>
                    <div><strong>ID:</strong> ${bridge.id}</div>
                    <div>
                        <label>Colour: 
                            <input type="text" 
                                   value="${bridge.colour || 'black'}" 
                                   data-id="${bridge.id}" 
                                   data-field="colour">
                        </label>
                    </div>
                    <div>
                        <label>Length: 
                            <input type="number" 
                                   value="${bridge.length ?? 1}" 
                                   data-id="${bridge.id}" 
                                   data-field="length"
                                   placeholder="-1 for variable">
                        </label>
                    </div>
                    <div>
                        <label>Count: 
                            <input type="number" 
                                   value="${bridge.count ?? 1}" 
                                   data-id="${bridge.id}" 
                                   data-field="count">
                        </label>
                    </div>
                </div>
            `;
        });
        listDiv.innerHTML = html;
        // Add event listeners
        listDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                this.removeBridgeType(id);
            });
        });
        listDiv.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const target = e.target;
                const id = target.getAttribute('data-id');
                const field = target.getAttribute('data-field');
                const value = target.type === 'number' ? parseInt(target.value) : target.value;
                this.updateBridgeType(id, field, value);
            });
        });
    }
    renderIslandsList() {
        const listDiv = document.getElementById('islandsList');
        if (this.puzzle.islands.length === 0) {
            listDiv.innerHTML = '<p style="color: #999; font-size: 0.9rem;">No islands added yet</p>';
            return;
        }
        let html = '';
        this.puzzle.islands.forEach(island => {
            const constraintsStr = island.constraints ? island.constraints.join(', ') : '';
            html += `
                <div class="island-item">
                    <button class="remove-btn" data-x="${island.x}" data-y="${island.y}">×</button>
                    <div><strong>${island.id}</strong> (${island.x}, ${island.y})</div>
                    <div class="island-constraints">
                        <label>Constraints (e.g., num_bridges=3):
                            <input type="text" 
                                   value="${constraintsStr}" 
                                   data-id="${island.id}"
                                   placeholder="num_bridges=3">
                        </label>
                    </div>
                </div>
            `;
        });
        listDiv.innerHTML = html;
        // Add event listeners
        listDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target;
                const x = parseInt(target.getAttribute('data-x'));
                const y = parseInt(target.getAttribute('data-y'));
                this.removeIsland(x, y);
            });
        });
        listDiv.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const target = e.target;
                const id = target.getAttribute('data-id');
                const island = this.puzzle.islands.find(i => i.id === id);
                if (island) {
                    const value = target.value.trim();
                    island.constraints = value ? value.split(',').map(s => s.trim()) : undefined;
                }
            });
        });
    }
}
// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PuzzleEditor();
});
