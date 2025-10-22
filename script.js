document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS & CONFIG ---
    const COLS = 53;
    const ROWS = 7;
    const BASE_CELL_SIZE = 10;
    const GAP_SIZE = 4;
    const PRESETS = {
        classic: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
        dark: ['#151b23', '#0e4429', '#006d32', '#26a641', '#39d353'],
        arc: ['#00000000', '#004400', '#008800', '#00bb00', '#00ff00'],
    };

    // --- DOM ELEMENTS ---
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);
    const drawingAreaContainer = $('#drawing-area-container');
    const totalContributionsEl = $('#total-contributions');
    const themeToggle = $('#theme-toggle');
    const gameModeToggle = $('#game-mode-toggle');
    const modalBackdrop = $('#modal-backdrop');
    const layerDataModal = $('#layer-data-modal');
    const layerDataBtn = $('#layer-data-btn');
    const layerDataTextarea = $('#layer-data-textarea');
    const layerDataApplyBtn = $('#layer-data-apply');
    const layerDataCloseBtn = $('#layer-data-close');


    // --- DYNAMIC INSTANCES ---
    let canvasInstances = [];
    let ctxInstances = [];

    // --- STATE MANAGEMENT ---
    let state = {};
    const undoStack = [];
    const redoStack = [];

    const defaultState = {
        thresholds: [1, 4, 8, 13],
        palette: [...PRESETS.dark],
        currentTool: 'pencil',
        brush: {
            mode: 'level',
            level: 1,
            addN: 1,
        },
        view: {
            zoom: 1.0,
            fitToWidth: false,
        },
        frames: [],
        currentFrameIndex: 0,
        activeLayerIndex: 0,
        animation: {
            playing: false,
            fps: 10,
            lastFrameTime: 0,
            onionSkin: false,
            stableMonths: false,
        },
        imageLegend: {
            img: null,
            opacity: 0.3,
            threshold: 128,
        },
        showGrid: true,
        game: {
            active: false,
            paused: false,
            score: 0,
            difficulty: 3,
            writeToHeatmap: true,
            player: { r: 3, c: 5 },
            bullets: [],
            enemies: [],
            spawnTimer: 0,
        },
    };

    // --- INITIALIZATION ---
    function init() {
        loadState();
        if (state.frames.length === 0) {
            const firstLayer = { cells: generateGridData() };
            const firstFrame = { layers: [firstLayer] };
            state.frames.push(firstFrame);
            state.currentFrameIndex = 0;
            state.activeLayerIndex = 0;
        }
        setupEventListeners();
        rebuildDrawingAreasDOM();
        updateUIFromState();
        applyTheme(localStorage.getItem('theme') || 'dark');
        requestAnimationFrame(mainLoop);
    }
    
    // --- HELPER FUNCTIONS ---
    function getActiveCells() {
        return state.frames[state.currentFrameIndex]?.layers[state.activeLayerIndex]?.cells;
    }

    function darkenColor(hex, amount) {
        if (!hex || hex === 'transparent' || hex.length < 4) return '#00000000';
        let color = hex.startsWith('#') ? hex.slice(1) : hex;
        if (color.length === 3) color = color.split('').map(char => char + char).join('');
        if (color.length === 8) color = color.slice(0, 6);
        const num = parseInt(color, 16);
        let r = Math.max(0, (num >> 16) - amount);
        let g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
        let b = Math.max(0, (num & 0x0000FF) - amount);
        return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
    }

    function lightenColor(hex, amount) {
        if (!hex || hex === 'transparent' || hex.length < 4) return '#00000000';
        let color = hex.startsWith('#') ? hex.slice(1) : hex;
        if (color.length === 3) color = color.split('').map(char => char + char).join('');
        if (color.length === 8) color = color.slice(0, 6);
        const num = parseInt(color, 16);
        let r = Math.min(255, (num >> 16) + amount);
        let g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
        let b = Math.min(255, (num & 0x0000FF) + amount);
        return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
    }

    function drawCrispCell(context, x, y, size, mainColor, level) {
        const isDarkMode = document.body.classList.contains('dark-mode');
        let borderColor;
        let highlightColor;

        if (isDarkMode) {
            borderColor = level === 0 ? mainColor : darkenColor(mainColor, 20);
            highlightColor = getComputedStyle(document.body).getPropertyValue('--bg-color');
        } else {
            borderColor = darkenColor(mainColor, 20);
            if (level === 0) {
                highlightColor = lightenColor(mainColor, 30);
            } else {
                const level1Color = state.palette[1];
                highlightColor = lightenColor(level1Color, 30);
            }
        }

        context.fillStyle = mainColor;
        context.fillRect(x, y, size, size);
        context.strokeStyle = borderColor;
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
        context.fillStyle = highlightColor;
        context.fillRect(x, y, 1, 1);
        context.fillRect(x + size - 1, y, 1, 1);
        context.fillRect(x, y + size - 1, 1, 1);
        context.fillRect(x + size - 1, y + size - 1, 1, 1);
    }

    // --- DATA & GRID LOGIC ---
    function generateGridData() {
        const cells = Array.from({ length: COLS }, () => new Array(ROWS).fill(null));
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - (COLS * ROWS - 1));
        startDate.setDate(startDate.getDate() - startDate.getDay());
        let currentDate = new Date(startDate);
        for (let i = 0; i < COLS * ROWS; i++) {
            const dayOfWeek = currentDate.getDay();
            const weekIndex = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24 * 7));
            if (weekIndex < COLS) {
                cells[weekIndex][dayOfWeek] = {
                    dateISO: currentDate.toISOString().split('T')[0],
                    count: 0,
                    level: 0,
                };
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        recalculateAllLevels(cells);
        return cells;
    }

    function calculateLevel(count) {
        if (count === 0) return 0;
        if (count >= state.thresholds[3]) return 4;
        if (count >= state.thresholds[2]) return 3;
        if (count >= state.thresholds[1]) return 2;
        if (count >= state.thresholds[0]) return 1;
        return 0;
    }

    function recalculateAllLevels(cells) {
        if (!cells) return;
        for (const col of cells) {
            for (const cell of col) {
                if(cell) cell.level = calculateLevel(cell.count);
            }
        }
    }

    function updateTotalContributions() {
        const cells = getActiveCells();
        if (!cells) return;
        const total = cells.flat().reduce((sum, cell) => sum + (cell ? cell.count : 0), 0);
        totalContributionsEl.textContent = total.toLocaleString();
    }
    
    // --- STATE & PERSISTENCE ---
    const saveState = debounce(() => {
        try {
            localStorage.setItem('heatmapEditorState', JSON.stringify(state));
        } catch (e) { console.error("Failed to save state:", e); }
    }, 500);

    function loadState() {
        const savedState = localStorage.getItem('heatmapEditorState');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed.imageLegend) parsed.imageLegend.img = null;
                state = { ...defaultState, ...parsed };
                state.animation = { ...defaultState.animation, ...parsed.animation }; // Ensure new flags are added
                state.frames = state.frames || [];
                state.currentFrameIndex = Math.min(state.currentFrameIndex, state.frames.length - 1);
                state.activeLayerIndex = state.activeLayerIndex || 0;
                if (state.frames.length > 0 && (!state.frames[0].layers || state.frames[0].layers.length === 0)) {
                    // Migration from old format
                    state.frames = state.frames.map(frame => ({ layers: [{ cells: frame.cells }] }));
                }

            } catch (e) {
                console.error("Failed to load state:", e);
                state = { ...defaultState };
            }
        } else {
            state = { ...defaultState };
        }
    }
    
    // --- UNDO / REDO ---
    function pushUndoState() {
        undoStack.push(JSON.stringify({
            frames: state.frames,
            currentFrameIndex: state.currentFrameIndex,
            activeLayerIndex: state.activeLayerIndex
        }));
        redoStack.length = 0;
        if (undoStack.length > 50) undoStack.shift();
    }

    function undo() {
        if (undoStack.length === 0) return;
        const prevState = JSON.parse(undoStack.pop());
        redoStack.push(JSON.stringify({
            frames: state.frames,
            currentFrameIndex: state.currentFrameIndex,
            activeLayerIndex: state.activeLayerIndex
        }));
        state.frames = prevState.frames;
        state.currentFrameIndex = prevState.currentFrameIndex;
        state.activeLayerIndex = prevState.activeLayerIndex;
        rebuildDrawingAreasDOM();
        updateUIFromState();
        saveState();
    }

    function redo() {
        if (redoStack.length === 0) return;
        const nextState = JSON.parse(redoStack.pop());
        undoStack.push(JSON.stringify({
            frames: state.frames,
            currentFrameIndex: state.currentFrameIndex,
            activeLayerIndex: state.activeLayerIndex
        }));
        state.frames = nextState.frames;
        state.currentFrameIndex = nextState.currentFrameIndex;
        state.activeLayerIndex = nextState.activeLayerIndex;
        rebuildDrawingAreasDOM();
        updateUIFromState();
        saveState();
    }

    // --- DOM & CANVAS MANAGEMENT ---
    let cellSize, gap;
    function rebuildDrawingAreasDOM() {
        drawingAreaContainer.innerHTML = '';
        canvasInstances = [];
        ctxInstances = [];
        const currentFrame = state.frames[state.currentFrameIndex];
        if (!currentFrame || !currentFrame.layers) return;

        currentFrame.layers.forEach((layer, index) => {
            const instanceWrapper = document.createElement('div');
            instanceWrapper.className = 'heatmap-instance';
            instanceWrapper.dataset.layerIndex = index;
            if (index === state.activeLayerIndex) {
                instanceWrapper.classList.add('active-layer');
            }

            if (index > 0) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'close-layer-btn';
                closeBtn.innerHTML = '&times;';
                closeBtn.title = 'Remove Layer';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteLayer(index);
                });
                instanceWrapper.appendChild(closeBtn);
            }

            const container = document.createElement('div');
            container.className = 'heatmap-container';

            const labelsTop = document.createElement('div');
            labelsTop.className = 'heatmap-labels-top';
            const labelsLeft = document.createElement('div');
            labelsLeft.className = 'heatmap-labels-left';
            labelsLeft.innerHTML = `<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>`;
            
            const canvas = document.createElement('canvas');
            canvas.className = 'heatmap-canvas';
            canvas.dataset.layerIndex = index;
            
            container.appendChild(labelsTop);
            container.appendChild(labelsLeft);
            container.appendChild(canvas);
            instanceWrapper.appendChild(container);
            drawingAreaContainer.appendChild(instanceWrapper);
            
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            canvasInstances.push(canvas);
            ctxInstances.push(ctx);

            instanceWrapper.addEventListener('click', () => setActiveLayer(index));
            canvas.addEventListener('pointerdown', handlePointerDown);
            canvas.addEventListener('pointermove', handlePointerMove);
            canvas.addEventListener('pointerup', handlePointerUp);
            canvas.addEventListener('pointerleave', () => { isDrawing = false; selection.active=false; renderAllLayers(); });
        });
        
        resizeAndRenderAll();
    }

    function resizeAndRenderAll() {
        if (canvasInstances.length === 0) return;
        const container = $('.heatmap-container');
        const dpr = window.devicePixelRatio || 1;
        gap = GAP_SIZE;

        if (state.view.fitToWidth) {
            const style = getComputedStyle(container);
            const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
            const availableWidth = container.clientWidth - paddingX;
            cellSize = Math.max(2, Math.floor(((availableWidth + gap) / COLS) - gap));
        } else {
            cellSize = BASE_CELL_SIZE * state.view.zoom;
        }

        const w = (cellSize + gap) * COLS - gap;
        const h = (cellSize + gap) * ROWS - gap;

        canvasInstances.forEach(canvas => {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = false;
        });
        
        renderAllLayers();
        renderAllMonthLabels();
    }

    function renderAllLayers() {
        const currentFrame = state.frames[state.currentFrameIndex];
        if (!currentFrame || !currentFrame.layers) return;
        
        currentFrame.layers.forEach((layer, index) => {
            const ctx = ctxInstances[index];
            if (!ctx) return;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            if (index === state.activeLayerIndex && state.imageLegend.img) {
                ctx.globalAlpha = state.imageLegend.opacity;
                ctx.drawImage(state.imageLegend.img, 0, 0, (cellSize+gap)*COLS, (cellSize+gap)*ROWS);
                ctx.globalAlpha = 1.0;
            }
            
            if (index === state.activeLayerIndex && state.animation.onionSkin && state.animation.playing) {
                let prevFrameIndex = state.currentFrameIndex;
                let prevLayerIndex = state.activeLayerIndex - 1;

                if (prevLayerIndex < 0) {
                    prevFrameIndex--;
                    if (prevFrameIndex >= 0) {
                        prevLayerIndex = state.frames[prevFrameIndex].layers.length - 1;
                    }
                }

                if (prevFrameIndex >= 0) {
                    const prevLayer = state.frames[prevFrameIndex]?.layers[prevLayerIndex];
                    if (prevLayer) {
                         drawGrid(ctx, prevLayer.cells, 0.3);
                    }
                }
            }

            drawGrid(ctx, layer.cells);
            
            if (index === state.activeLayerIndex && selection.active) {
                drawSelection(ctx);
            }
            if (index === state.activeLayerIndex && state.game.active) {
                renderGame(ctx);
            }
        });
    }

    function drawGrid(ctx, cells, alpha = 1.0) {
        if (!cells) return;
        ctx.globalAlpha = alpha;
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const cell = cells[c][r];
                if (!cell) continue;
                const x = c * (cellSize + gap);
                const y = r * (cellSize + gap);
                const mainColor = state.palette[cell.level] || state.palette[0];
                drawCrispCell(ctx, x, y, cellSize, mainColor, cell.level);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    function renderAllMonthLabels() {
        $$('.heatmap-labels-top').forEach((container, index) => {
            container.innerHTML = '';

            let cells;
            if (state.animation.stableMonths) {
                cells = state.frames[0]?.layers[0]?.cells;
            } else {
                cells = state.frames[state.currentFrameIndex]?.layers[index]?.cells;
            }

            if (!cells || cells.length === 0) return;

            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let lastMonth = -1;
            for (let c = 0; c < COLS; c++) {
                const cell = cells[c]?.find(cell => cell);
                if (!cell) continue;
                const date = new Date(cell.dateISO + 'T00:00:00');
                const month = date.getUTCMonth();
                if (month !== lastMonth && date.getUTCDate() < 8) {
                    const label = document.createElement('span');
                    label.className = 'heatmap-month-label';
                    label.textContent = months[month];
                    label.style.left = `${c * (cellSize + gap)}px`;
                    container.appendChild(label);
                    lastMonth = month;
                }
            }
        });
    }


    // --- DRAWING & TOOLS ---
    let isDrawing = false;
    let selection = { active: false, x1: 0, y1: 0, x2: 0, y2: 0 };
    
    function getCellFromCoords(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor(x / (cellSize + gap));
        const r = Math.floor(y / (cellSize + gap));
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) { return { c, r }; }
        return null;
    }
    
    function handlePointerDown(e) {
        const layerIndex = parseInt(e.target.dataset.layerIndex);
        setActiveLayer(layerIndex);
        if (state.game.active) return;
        isDrawing = true;
        const pos = getCellFromCoords(e);
        if (!pos) return;
        pushUndoState();
        switch (state.currentTool) {
            case 'pencil': case 'eraser': applyBrush(pos.c, pos.r); break;
            case 'rect':
                selection.active = true;
                selection.x1 = selection.x2 = pos.c;
                selection.y1 = selection.y2 = pos.r;
                break;
            case 'picker': pickColor(pos.c, pos.r); break;
        }
        renderAllLayers();
    }
    
    function handlePointerMove(e) {
        if (!isDrawing || state.game.active) return;
        const pos = getCellFromCoords(e);
        if (!pos) return;
        switch (state.currentTool) {
            case 'pencil': case 'eraser': applyBrush(pos.c, pos.r); break;
            case 'rect':
                selection.x2 = pos.c;
                selection.y2 = pos.r;
                break;
        }
        renderAllLayers();
    }
    
    function handlePointerUp(e) {
        if (!isDrawing || state.game.active) return;
        isDrawing = false;
        if (state.currentTool === 'rect' && selection.active) {
            applyRectFill();
        }
        selection.active = false;
        updateTotalContributions();
        updateFramesUI();
        saveState();
        renderAllLayers();
    }
    
    function applyBrush(c, r) {
        const cells = getActiveCells();
        const cell = cells?.[c]?.[r];
        if (!cell) return;
        if (state.currentTool === 'eraser') {
            cell.count = 0;
        } else if (state.brush.mode === 'level') {
            const minCountForLevel = state.thresholds[state.brush.level - 1] || 1;
            cell.count = (state.brush.level === 0) ? 0 : minCountForLevel;
        } else {
            cell.count += state.brush.addN;
        }
        cell.level = calculateLevel(cell.count);
    }
    
    function applyRectFill() {
        const c1 = Math.min(selection.x1, selection.x2), c2 = Math.max(selection.x1, selection.x2);
        const r1 = Math.min(selection.y1, selection.y2), r2 = Math.max(selection.y1, selection.y2);
        for (let c = c1; c <= c2; c++) {
            for (let r = r1; r <= r2; r++) {
                applyBrush(c, r);
            }
        }
    }
    
    function pickColor(c, r) {
        const cells = getActiveCells();
        const cell = cells?.[c]?.[r];
        if (!cell) return;
        state.brush.level = cell.level;
        state.brush.addN = cell.count;
        $('#brush-add-n').value = cell.count;
        updateBrushUI();
    }

    function drawSelection(ctx) {
        const c1 = Math.min(selection.x1, selection.x2), c2 = Math.max(selection.x1, selection.x2);
        const r1 = Math.min(selection.y1, selection.y2), r2 = Math.max(selection.y1, selection.y2);
        const x = c1 * (cellSize + gap), y = r1 * (cellSize + gap);
        const w = (c2 - c1 + 1) * (cellSize + gap) - gap, h = (r2 - r1 + 1) * (cellSize + gap) - gap;
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-color');
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    // --- LAYERS LOGIC ---
    function addLayer() {
        pushUndoState();
        const newLayerCells = generateGridData();
        state.frames.forEach(frame => {
            frame.layers.push({ cells: JSON.parse(JSON.stringify(newLayerCells)) });
        });
        state.activeLayerIndex = state.frames[0].layers.length - 1;
        rebuildDrawingAreasDOM();
        saveState();
    }

    function deleteLayer(layerIndex) {
        if (state.frames[0].layers.length <= 1) {
            alert("Cannot delete the last layer.");
            return;
        }
        if (!confirm("Are you sure you want to delete this layer from all frames? This cannot be undone.")) {
            return;
        }
        pushUndoState();
        state.frames.forEach(frame => {
            frame.layers.splice(layerIndex, 1);
        });
        if (state.activeLayerIndex >= layerIndex) {
            state.activeLayerIndex = Math.max(0, state.activeLayerIndex - 1);
        }
        rebuildDrawingAreasDOM();
        saveState();
    }
    
    function setActiveLayer(layerIndex) {
        if (state.activeLayerIndex === layerIndex && document.querySelector(`.heatmap-instance[data-layer-index="${layerIndex}"]`)?.classList.contains('active-layer')) return;
        
        state.activeLayerIndex = layerIndex;

        $$('.heatmap-instance').forEach(el => {
            el.classList.toggle('active-layer', parseInt(el.dataset.layerIndex) === layerIndex);
        });
        
        updateTotalContributions();
        renderAllLayers();
        saveState();
    }

    // --- MODAL LOGIC ---
    function openLayerDataModal() {
        const activeCells = getActiveCells();
        if (!activeCells) {
            alert("No active layer to export.");
            return;
        }
        layerDataTextarea.value = JSON.stringify(activeCells, null, 2);
        modalBackdrop.classList.remove('hidden');
        layerDataModal.classList.remove('hidden');
        layerDataTextarea.select();
    }

    function closeLayerDataModal() {
        modalBackdrop.classList.add('hidden');
        layerDataModal.classList.add('hidden');
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        window.addEventListener('resize', debounce(resizeAndRenderAll, 200));
        themeToggle.addEventListener('click', toggleTheme);
        gameModeToggle.addEventListener('click', () => toggleGameMode());
        
        $('#add-layer-btn').addEventListener('click', addLayer);

        layerDataBtn.addEventListener('click', openLayerDataModal);
        layerDataCloseBtn.addEventListener('click', closeLayerDataModal);
        modalBackdrop.addEventListener('click', closeLayerDataModal);
        layerDataApplyBtn.addEventListener('click', () => {
            const dataToLoad = layerDataTextarea.value;
            try {
                const parsedData = JSON.parse(dataToLoad);

                // Basic validation
                if (!Array.isArray(parsedData) || parsedData.length !== COLS || !Array.isArray(parsedData[0]) || parsedData[0].length !== ROWS) {
                    throw new Error("Data structure is invalid. Expected a 53x7 grid.");
                }
                
                pushUndoState();
                const activeCells = getActiveCells();
                if (activeCells) {
                    state.frames[state.currentFrameIndex].layers[state.activeLayerIndex].cells = parsedData;
                }
                rebuildDrawingAreasDOM();
                updateFramesUI();
                saveState();
                closeLayerDataModal();

            } catch (error) {
                alert("Failed to load layer data. Please ensure it is valid JSON with the correct 53x7 structure.\n\n" + error.message);
            }
        });

        $('.toolbar').addEventListener('click', e => {
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                state.currentTool = btn.dataset.tool;
                updateToolUI();
            }
        });
        $$('input[name="brush-mode"]').forEach(radio => radio.addEventListener('change', e => {
            state.brush.mode = e.target.value;
            saveState();
        }));
        $('#brush-add-n').addEventListener('input', e => {
            state.brush.addN = parseInt(e.target.value) || 1;
            saveState();
        });
        $('#brush-levels').addEventListener('click', e => {
            const btn = e.target.closest('.level-btn');
            if(btn) {
                state.brush.level = parseInt(btn.dataset.level);
                updateBrushUI();
                saveState();
            }
        });
        $('#palette-preset').addEventListener('change', e => {
            state.palette = [...PRESETS[e.target.value]];
            updatePaletteUI();
            saveState();
            renderAllLayers();
        });
        $('.palette-editor').addEventListener('input', e => {
            if (e.target.matches('input[type="color"]')) {
                const level = parseInt(e.target.dataset.level);
                state.palette[level] = e.target.value;
                saveState();
                renderAllLayers();
            }
        });
        $('.thresholds').addEventListener('input', e => {
            if (e.target.matches('input[type="number"]')) {
                const level = parseInt(e.target.dataset.level);
                state.thresholds[level - 1] = parseInt(e.target.value);
                for(let i=1; i<state.thresholds.length; i++) {
                    if (state.thresholds[i] <= state.thresholds[i-1]) {
                        state.thresholds[i] = state.thresholds[i-1] + 1;
                    }
                }
                recalculateAllLevels(getActiveCells());
                updateThresholdsUI();
                updateFramesUI();
                saveState();
                renderAllLayers();
            }
        });
        $('#import-json').addEventListener('click', () => openFilePicker('.json'));
        $('#export-json').addEventListener('click', exportJSON);
        $('#import-csv').addEventListener('click', () => openFilePicker('.csv'));
        $('#export-csv').addEventListener('click', exportCSV);
        $('#file-input').addEventListener('change', handleFileLoad);
        
        $('#zoom-100').addEventListener('click', () => { state.view.fitToWidth = false; state.view.zoom = 1.0; resizeAndRenderAll(); saveState(); });
        $('#zoom-150').addEventListener('click', () => { state.view.fitToWidth = false; state.view.zoom = 1.5; resizeAndRenderAll(); saveState(); });
        $('#zoom-200').addEventListener('click', () => { state.view.fitToWidth = false; state.view.zoom = 2.0; resizeAndRenderAll(); saveState(); });
        $('#zoom-fit').addEventListener('click', () => { state.view.fitToWidth = true; resizeAndRenderAll(); saveState(); });

        $('#load-image-legend').addEventListener('click', () => openFilePicker('image/*'));
        $('#reset-all-settings').addEventListener('click', resetAllSettings);
        $('#image-opacity').addEventListener('input', e => { state.imageLegend.opacity = parseFloat(e.target.value); renderAllLayers(); });
        $('#image-threshold').addEventListener('input', e => { state.imageLegend.threshold = parseInt(e.target.value); });
        $('#apply-image-legend').addEventListener('click', applyImageToFrame);
        $('#clear-image-legend').addEventListener('click', clearImageLegend);
        $('#anim-fps').addEventListener('input', e => {
            const fps = parseInt(e.target.value);
            state.animation.fps = fps;
            $('#anim-fps-display').textContent = fps;
        });
        $('#anim-play').addEventListener('click', toggleAnimation);
        $('#anim-onion-skin').addEventListener('change', e => state.animation.onionSkin = e.target.checked);
        $('#anim-stable-months').addEventListener('change', e => {
            state.animation.stableMonths = e.target.checked;
            renderAllMonthLabels();
            saveState();
        });
        $('#frame-new').addEventListener('click', newFrame);
        $('#frame-duplicate').addEventListener('click', duplicateFrame);
        $('#frame-add-layer-as-frame').addEventListener('click', addActiveLayerAsNewFrame);
        $('#frame-delete').addEventListener('click', deleteFrame);
        $('#frame-move-up').addEventListener('click', () => shiftFrame(0, -1));
        $('#frame-move-down').addEventListener('click', () => shiftFrame(0, 1));
        $('#frame-move-left').addEventListener('click', () => shiftFrame(-1, 0));
        $('#frame-move-right').addEventListener('click', () => shiftFrame(1, 0));
        $('#export-frame-png').addEventListener('click', () => exportFrame('image/png'));
        $('#export-frame-webp').addEventListener('click', () => exportFrame('image/webp'));
        $('#export-anim').addEventListener('click', exportAnimation);
        $('#export-anim-webp').addEventListener('click', exportAnimationWEBP);
        $('#export-anim-gif').addEventListener('click', exportAnimationGIF);
        $('#game-difficulty').addEventListener('input', e => state.game.difficulty = parseInt(e.target.value));
        $('#game-pause').addEventListener('click', () => { state.game.paused = !state.game.paused; });
        $('#game-reset').addEventListener('click', initGame);
        $('#game-write-heatmap').addEventListener('change', e => state.game.writeToHeatmap = e.target.checked);
        document.addEventListener('keydown', handleKeyDown);
    }
    
    function updateUIFromState() {
        updateToolUI(); updateBrushUI(); updatePaletteUI(); updateThresholdsUI(); updateFramesUI(); updateTotalContributions();
        $('#anim-fps').value = state.animation.fps;
        $('#anim-fps-display').textContent = state.animation.fps;
        $('#anim-onion-skin').checked = state.animation.onionSkin;
        $('#anim-stable-months').checked = state.animation.stableMonths;
    }

    function updateToolUI() { $$('.tool-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === state.currentTool)); }
    function updateBrushUI() {
        $$('.level-btn').forEach(b => b.style.outline = b.dataset.level == state.brush.level ? `2px solid ${getComputedStyle(document.body).getPropertyValue('--accent-color')}` : 'none');
        $('input[name="brush-mode"][value="'+state.brush.mode+'"]').checked = true;
        $('#brush-add-n').value = state.brush.addN;
    }
    function updatePaletteUI() {
        for (let i = 0; i < 5; i++) {
            $(`#palette-color-${i}`).value = state.palette[i];
            const btn = $(`.level-btn[data-level="${i}"]`);
            if (btn) { document.documentElement.style.setProperty(`--level-${i}-bg`, state.palette[i]); }
        }
    }
    function updateThresholdsUI() { for (let i = 1; i <= 4; i++) { $(`#threshold-${i}`).value = state.thresholds[i - 1]; } }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function handleKeyDown(e) {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        const keyMap = {
            'p': () => state.currentTool = 'pencil', 'r': () => state.currentTool = 'rect',
            'e': () => state.currentTool = 'eraser', 'i': () => state.currentTool = 'picker',
            '1': () => state.brush.level = 0, '2': () => state.brush.level = 1,
            '3': () => state.brush.level = 2, '4': () => state.brush.level = 3,
            '5': () => state.brush.level = 4,
            'a': () => {
                state.brush.mode = (state.brush.mode === 'level') ? 'add' : 'level';
                $('input[name="brush-mode"][value="'+state.brush.mode+'"]').checked = true;
            },
            'g': () => { state.showGrid = !state.showGrid; renderAllLayers(); },
            't': () => toggleGameMode(),
            'v': toggleTheme,
        };
        if (keyMap[e.key]) { e.preventDefault(); keyMap[e.key](); updateUIFromState(); }
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
        }
        if (state.game.active && !state.game.paused) {
            if (['w', 'ArrowUp', 'a', 'ArrowLeft', 's', 'ArrowDown', 'd', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); }
        }
    }

    function applyTheme(theme) {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', theme);

        if (theme === 'dark') {
            state.palette = [...PRESETS.dark];
            $('#palette-preset').value = 'dark';
        } else {
            state.palette = [...PRESETS.classic];
            $('#palette-preset').value = 'classic';
        }
        
        updatePaletteUI();
        renderAllLayers();
    }
    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        applyTheme(newTheme);
    }
    
    function resetAllSettings() {
        if (confirm("Are you sure you want to reset all settings to their default values? This will clear your current project and cannot be undone.")) {
            localStorage.removeItem('heatmapEditorState');
            localStorage.removeItem('theme');
            location.reload();
        }
    }

    function openFilePicker(type) {
        const fileInput = $('#file-input');
        fileInput.accept = type;
        fileInput.click();
    }
    
    function handleFileLoad(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            pushUndoState();
            if (file.type.startsWith('image/')) { loadImageLegend(content); } 
            else if (file.name.endsWith('.json')) { importJSON(content); } 
            else if (file.name.endsWith('.csv')) { importCSV(content); }
            e.target.value = '';
            saveState();
        };
        if(file.type.startsWith('image/')) { reader.readAsDataURL(file); } 
        else { reader.readAsText(file); }
    }

    function importJSON(content) {
        try {
            const importedState = JSON.parse(content);
            state = { ...defaultState, ...importedState };
            rebuildDrawingAreasDOM();
            updateUIFromState();
        } catch (err) { alert('Error parsing JSON file.'); console.error(err); }
    }
    function exportJSON() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        downloadFile(dataStr, "heatmap.json");
    }

    function importCSV(content) {
        const cells = getActiveCells();
        if (!cells) return;
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
        const dateMap = new Map(cells.flat().filter(Boolean).map(cell => [cell.dateISO, cell]));
        let changed = 0;
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length === 2) {
                const [date, countStr] = parts;
                const cell = dateMap.get(date);
                if (cell) {
                    cell.count = parseInt(countStr) || 0;
                    changed++;
                }
            }
        });
        recalculateAllLevels(cells);
        updateFramesUI();
        updateUIFromState();
        renderAllLayers();
        alert(`Imported ${changed} data points from CSV.`);
    }

    function exportCSV() {
        let csvContent = "date,count\n";
        const cells = getActiveCells();
        if (!cells) return;
        cells.flat().filter(Boolean).forEach(cell => {
            if (cell.count > 0) { csvContent += `${cell.dateISO},${cell.count}\n`; }
        });
        const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
        downloadFile(dataStr, "heatmap.csv");
    }

    // --- EXPORT RENDERING LOGIC ---
    function drawFrameWithLabels(tempCtx, cells) {
        const PADDING = 30;
        const exportCellSize = BASE_CELL_SIZE;
        const exportGap = GAP_SIZE;

        const gridW = (exportCellSize + exportGap) * COLS - exportGap;
        const gridH = (exportCellSize + exportGap) * ROWS - exportGap;
        tempCtx.canvas.width = gridW + PADDING;
        tempCtx.canvas.height = gridH + PADDING;
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color');
        tempCtx.fillRect(0, 0, tempCtx.canvas.width, tempCtx.canvas.height);
        tempCtx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--font-family');
        tempCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted-color');
        tempCtx.textAlign = 'left';
        tempCtx.textBaseline = 'middle';
        const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
        dayLabels.forEach((label, i) => {
            const y = PADDING + i * (exportCellSize + exportGap) + exportCellSize / 2;
            tempCtx.fillText(label, 0, y);
        });
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let lastMonth = -1;
        for (let c = 0; c < COLS; c++) {
            const cell = cells[c]?.find(cell => cell);
            if (!cell) continue;
            const date = new Date(cell.dateISO + 'T00:00:00');
            const month = date.getUTCMonth();
            if (month !== lastMonth && date.getUTCDate() < 8) {
                tempCtx.fillText(months[month], PADDING + c * (exportCellSize + exportGap), 15);
                lastMonth = month;
            }
        }
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const cell = cells[c][r];
                if (!cell) continue;
                const x = PADDING + c * (exportCellSize + exportGap);
                const y = PADDING + r * (exportCellSize + exportGap);
                const mainColor = state.palette[cell.level];
                drawCrispCell(tempCtx, x, y, exportCellSize, mainColor, cell.level);
            }
        }
    }

    function createFrameCanvas(cells, includeLabels) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        if (includeLabels) {
            drawFrameWithLabels(tempCtx, cells);
        } else {
            const exportCellSize = BASE_CELL_SIZE;
            const exportGap = GAP_SIZE;

            tempCanvas.width = (exportCellSize + exportGap) * COLS - exportGap;
            tempCanvas.height = (exportCellSize + exportGap) * ROWS - exportGap;
            tempCtx.imageSmoothingEnabled = false;
            tempCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color');
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const cell = cells[c][r];
                    if (!cell) continue;
                    const x = c * (exportCellSize + exportGap);
                    const y = r * (exportCellSize + exportGap);
                    const mainColor = state.palette[cell.level];
                    drawCrispCell(tempCtx, x, y, exportCellSize, mainColor, cell.level);
                }
            }
        }
        return tempCanvas;
    }

    function exportFrame(format = 'image/png') {
        const includeLabels = $('#export-include-labels').checked;
        const frameCanvas = createFrameCanvas(getActiveCells(), includeLabels);
        const dataURL = frameCanvas.toDataURL(format);
        const ext = format.split('/')[1];
        downloadFile(dataURL, `frame-${state.currentFrameIndex}-layer-${state.activeLayerIndex}.${ext}`);
    }

    function exportAnimation() {
        if (state.frames.length === 0) return;
        const warningEl = $('#export-anim-warning');
        warningEl.textContent = "This will trigger multiple downloads.";
        warningEl.classList.remove('hidden');
        const includeLabels = $('#export-include-labels').checked;
        const firstFrameCells = state.frames[0]?.layers[0]?.cells;

        const downloads = [];
        state.frames.forEach((frame, frameIdx) => {
            const topLayer = frame.layers[0];
            if (topLayer) {
                let cellsForExport = topLayer.cells;
                if (state.animation.stableMonths && includeLabels && firstFrameCells) {
                    const hybridCells = JSON.parse(JSON.stringify(topLayer.cells));
                    for (let c = 0; c < COLS; c++) {
                        for (let r = 0; r < ROWS; r++) {
                            if (hybridCells[c][r] && firstFrameCells[c][r]) {
                                hybridCells[c][r].dateISO = firstFrameCells[c][r].dateISO;
                            }
                        }
                    }
                    cellsForExport = hybridCells;
                }
                downloads.push({ cells: cellsForExport, frameIdx });
            }
        });
        
        let downloadIndex = 0;
        const downloadNext = () => {
            if (downloadIndex >= downloads.length) {
                warningEl.classList.add('hidden');
                return;
            }
            const { cells, frameIdx } = downloads[downloadIndex];
            const frameCanvas = createFrameCanvas(cells, includeLabels);
            const dataURL = frameCanvas.toDataURL('image/png');
            downloadFile(dataURL, `anim-frame-${String(frameIdx).padStart(3, '0')}.png`);
            downloadIndex++;
            setTimeout(downloadNext, 200);
        };
        downloadNext();
    }

    async function exportAnimationWEBP() {
        if (state.frames.length < 1) { return alert("Animation requires at least 1 frame."); }
        const warningEl = $('#export-anim-warning');
        const exportButtons = $$('.export-buttons button, #export-anim-webp');
        const includeLabels = $('#export-include-labels').checked;
        const frameDuration = 1000 / state.animation.fps;
        try {
            warningEl.textContent = `Processing top layer of ${state.frames.length} frames...`;
            warningEl.classList.remove('hidden');
            exportButtons.forEach(b => b.disabled = true);
            const writer = new WebPWriter();
            const firstFrameCells = state.frames[0]?.layers[0]?.cells;

            for (const frame of state.frames) {
                const topLayer = frame.layers[0];
                if (topLayer && topLayer.cells) {
                    let cellsForExport = topLayer.cells;
                    if (state.animation.stableMonths && includeLabels && firstFrameCells) {
                        const hybridCells = JSON.parse(JSON.stringify(topLayer.cells));
                        for (let c = 0; c < COLS; c++) {
                            for (let r = 0; r < ROWS; r++) {
                                if (hybridCells[c][r] && firstFrameCells[c][r]) {
                                    hybridCells[c][r].dateISO = firstFrameCells[c][r].dateISO;
                                }
                            }
                        }
                        cellsForExport = hybridCells;
                    }
                    const frameCanvas = createFrameCanvas(cellsForExport, includeLabels);
                    writer.addFrame(frameCanvas.toDataURL('image/webp', {quality: 0.8}), { duration: frameDuration });
                }
            }
            warningEl.textContent = "Encoding WEBP... Please wait.";
            const webpBlob = await writer.complete({ loop: 0 }); 
            const url = URL.createObjectURL(webpBlob);
            downloadFile(url, 'animation.webp');
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to export WEBP:", error);
            warningEl.textContent = "Error exporting WEBP. See console for details.";
        } finally {
            warningEl.classList.add('hidden');
            exportButtons.forEach(b => b.disabled = false);
        }
    }

    async function exportAnimationGIF() {
        if (state.frames.length < 1) { return alert("Animation requires at least 1 frame."); }
        const warningEl = $('#export-anim-warning');
        const exportButtons = $$('.export-buttons button, #export-anim-gif');
        const includeLabels = $('#export-include-labels').checked;
        const frameDelay = 1000 / state.animation.fps;
        try {
            warningEl.textContent = `Processing GIF... This may take a while.`;
            warningEl.classList.remove('hidden');
            exportButtons.forEach(b => b.disabled = true);
            const gif = new GIF({ workers: 2, quality: 10, workerScript: 'gif.worker.js' });
            gif.on('progress', function(p) {
                const progressPercent = Math.round(p * 100);
                warningEl.textContent = `Encoding GIF... ${progressPercent}%`;
            });
            const firstFrameCells = state.frames[0]?.layers[0]?.cells;

            for (const frame of state.frames) {
                 const topLayer = frame.layers[0];
                if (topLayer && topLayer.cells) {
                    let cellsForExport = topLayer.cells;
                    if (state.animation.stableMonths && includeLabels && firstFrameCells) {
                        const hybridCells = JSON.parse(JSON.stringify(topLayer.cells));
                        for (let c = 0; c < COLS; c++) {
                            for (let r = 0; r < ROWS; r++) {
                                if (hybridCells[c][r] && firstFrameCells[c][r]) {
                                    hybridCells[c][r].dateISO = firstFrameCells[c][r].dateISO;
                                }
                            }
                        }
                        cellsForExport = hybridCells;
                    }
                    const frameCanvas = createFrameCanvas(cellsForExport, includeLabels);
                    gif.addFrame(frameCanvas, { delay: frameDelay });
                }
            }
            await new Promise((resolve, reject) => {
                gif.on('finished', (blob) => {
                    try {
                        const url = URL.createObjectURL(blob);
                        downloadFile(url, 'animation.gif');
                        URL.revokeObjectURL(url);
                        resolve();
                    } catch (e) { reject(e); }
                });
                gif.on('abort', () => reject(new Error("GIF encoding aborted.")));
                gif.render();
            });
        } catch (error) {
            console.error("Failed to export GIF:", error);
            warningEl.textContent = "Error exporting GIF. Check console for details.";
        } finally {
            warningEl.classList.add('hidden');
            exportButtons.forEach(b => b.disabled = false);
        }
    }


    function downloadFile(data, filename) {
        const link = document.createElement('a');
        link.href = data;
        link.download = filename;
        link.click();
    }
    
    function loadImageLegend(dataURL) {
        const img = new Image();
        img.onload = () => {
            state.imageLegend.img = img;
            $('#image-legend-controls').classList.remove('hidden');
            renderAllLayers();
        };
        img.src = dataURL;
    }
    
    function clearImageLegend() {
        state.imageLegend.img = null;
        $('#image-legend-controls').classList.add('hidden');
        renderAllLayers();
    }
    
    function applyImageToFrame() {
        if (!state.imageLegend.img) return;
        pushUndoState();
        const cells = getActiveCells();
        if (!cells) return;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = COLS; tempCanvas.height = ROWS;
        tempCtx.drawImage(state.imageLegend.img, 0, 0, COLS, ROWS);
        const imageData = tempCtx.getImageData(0, 0, COLS, ROWS);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const index = (r * COLS + c) * 4;
                const brightness = (imageData.data[index] + imageData.data[index+1] + imageData.data[index+2]) / 3;
                const cell = cells[c][r];
                if(cell) {
                    const level = Math.floor(brightness / 256 * 5);
                    const minCount = state.thresholds[level - 1] || (level > 0 ? 1 : 0);
                    cell.count = (level === 0) ? 0 : minCount;
                }
            }
        }
        recalculateAllLevels(cells);
        updateFramesUI();
        updateUIFromState();
        renderAllLayers();
    }

    let dragSrcElement = null;
    function updateFramesUI() {
        const list = $('#frames-list');
        list.innerHTML = '';
        state.frames.forEach((frame, index) => {
            const item = document.createElement('div');
            item.className = 'frame-item';
            item.dataset.index = index;
            if (index === state.currentFrameIndex) item.classList.add('selected');

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 106;
            thumbCanvas.height = 14;
            
            const topLayerCells = frame.layers[0]?.cells;
            if (topLayerCells) {
                drawThumbnail(thumbCanvas, topLayerCells);
            }

            const indexEl = document.createElement('span');
            indexEl.className = 'frame-index';
            indexEl.textContent = index;
            item.appendChild(indexEl);
            item.appendChild(thumbCanvas);
            item.addEventListener('click', () => selectFrame(index));
            item.draggable = true;
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            list.appendChild(item);
        });
    }
    function handleDragStart(e) {
        dragSrcElement = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
    }
    function handleDragOver(e) { e.preventDefault(); }
    function handleDrop(e) {
        e.stopPropagation();
        if (dragSrcElement !== this) {
            const srcIndex = parseInt(dragSrcElement.dataset.index);
            const destIndex = parseInt(this.dataset.index);
            const [removed] = state.frames.splice(srcIndex, 1);
            state.frames.splice(destIndex, 0, removed);
            if (state.currentFrameIndex === srcIndex) {
                state.currentFrameIndex = destIndex;
            } else if (srcIndex < state.currentFrameIndex && destIndex >= state.currentFrameIndex) {
                state.currentFrameIndex--;
            } else if (srcIndex > state.currentFrameIndex && destIndex <= state.currentFrameIndex) {
                state.currentFrameIndex++;
            }
            updateFramesUI();
            rebuildDrawingAreasDOM();
            saveState();
        }
    }
    function handleDragEnd(e) { this.classList.remove('dragging'); }
    function drawThumbnail(canvas, cells) {
        const thumbCtx = canvas.getContext('2d');
        const thumbCellSize = 2;
        thumbCtx.clearRect(0, 0, canvas.width, canvas.height);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const cell = cells[c][r];
                if (cell) {
                    thumbCtx.fillStyle = state.palette[cell.level];
                    thumbCtx.fillRect(c * thumbCellSize, r * thumbCellSize, thumbCellSize, thumbCellSize);
                }
            }
        }
    }
    
    function shiftFrame(dx, dy) {
        pushUndoState();
        const wrap = $('#frame-shift-wrap').checked;
        const currentFrame = state.frames[state.currentFrameIndex];
        if (!currentFrame) return;

        const originalLayers = JSON.parse(JSON.stringify(currentFrame.layers));
        const numLayers = originalLayers.length;
        const newLayers = JSON.parse(JSON.stringify(originalLayers));

        // Clear the newLayers to be blank
        for (let l = 0; l < numLayers; l++) {
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    newLayers[l].cells[c][r].count = 0;
                    newLayers[l].cells[c][r].level = 0;
                }
            }
        }

        for (let l = 0; l < numLayers; l++) {
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    let newL = l, newC = c, newR = r;

                    if (dy !== 0) { // Vertical shift (within the same layer)
                        newR = r + dy;
                        if (wrap) {
                            newR = (newR + ROWS) % ROWS;
                        }
                    } else if (dx !== 0) { // Horizontal shift (across layers)
                        if (wrap) {
                            const totalCols = COLS * numLayers;
                            const globalCol = l * COLS + c;
                            const newGlobalCol = (globalCol + dx + totalCols) % totalCols;
                            newL = Math.floor(newGlobalCol / COLS);
                            newC = newGlobalCol % COLS;
                        } else {
                            newC = c + dx;
                            while (newC < 0) {
                                newC += COLS;
                                newL--;
                            }
                            while (newC >= COLS) {
                                newC -= COLS;
                                newL++;
                            }
                        }
                    }
                    
                    if (newL >= 0 && newL < numLayers && newR >= 0 && newR < ROWS) {
                         newLayers[newL].cells[newC][newR] = originalLayers[l].cells[c][r];
                    }
                }
            }
        }

        currentFrame.layers = newLayers;
        rebuildDrawingAreasDOM();
        updateFramesUI();
        saveState();
    }


    function addActiveLayerAsNewFrame() {
        if (state.frames.length === 0) return;
        pushUndoState();

        const sourceCells = getActiveCells();
        if (!sourceCells) return;

        const numLayers = state.frames[0].layers.length;
        const newLayers = [];

        newLayers.push({ cells: JSON.parse(JSON.stringify(sourceCells)) });

        for (let i = 1; i < numLayers; i++) {
            newLayers.push({ cells: generateGridData() });
        }
        
        const newFrame = { layers: newLayers };

        state.frames.splice(state.currentFrameIndex + 1, 0, newFrame);
        state.currentFrameIndex++;
        
        rebuildDrawingAreasDOM();
        updateFramesUI();
        saveState();
    }

    function newFrame() {
        pushUndoState();
        const currentFrame = state.frames[state.currentFrameIndex];
        const numLayers = currentFrame ? currentFrame.layers.length : 1;
        
        const newLayers = [];
        for (let i=0; i < numLayers; i++) {
            newLayers.push({ cells: generateGridData() });
        }
        
        state.frames.push({ layers: newLayers });
        state.currentFrameIndex = state.frames.length - 1;
        rebuildDrawingAreasDOM();
        updateFramesUI();
        saveState();
    }
    function duplicateFrame() {
        if (state.frames.length === 0) return;
        pushUndoState();
        const newFrame = JSON.parse(JSON.stringify(state.frames[state.currentFrameIndex]));
        state.frames.splice(state.currentFrameIndex + 1, 0, newFrame);
        state.currentFrameIndex++;
        rebuildDrawingAreasDOM();
        updateFramesUI();
        saveState();
    }
    function deleteFrame() {
        if (state.frames.length <= 1) return;
        pushUndoState();
        state.frames.splice(state.currentFrameIndex, 1);
        if (state.currentFrameIndex >= state.frames.length) {
            state.currentFrameIndex = state.frames.length - 1;
        }
        selectFrame(state.currentFrameIndex);
    }
    function selectFrame(index) {
        if (index < 0 || index >= state.frames.length || index === state.currentFrameIndex) return;
        state.currentFrameIndex = index;
        rebuildDrawingAreasDOM();
        updateUIFromState();
    }
    function toggleAnimation() {
        state.animation.playing = !state.animation.playing;
        $('#anim-play').innerHTML = state.animation.playing ? '<svg viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>';
    }

    let lastTime = 0;
    function mainLoop(timestamp) {
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;

        if (state.animation.playing && !state.game.active) {
            state.animation.lastFrameTime += deltaTime;
            const frameDuration = 1000 / state.animation.fps;

            if (state.animation.lastFrameTime >= frameDuration) {
                state.animation.lastFrameTime %= frameDuration;
                
                let nextLayer = state.activeLayerIndex + 1;
                let nextFrame = state.currentFrameIndex;
                const numLayersInCurrentFrame = state.frames[nextFrame].layers.length;

                if (nextLayer >= numLayersInCurrentFrame) {
                    nextLayer = 0;
                    nextFrame++;
                    if (nextFrame >= state.frames.length) {
                        nextFrame = 0;
                    }
                }

                if (state.currentFrameIndex !== nextFrame) {
                    selectFrame(nextFrame);
                }
                setActiveLayer(nextLayer);
            }
        }

        if (state.game.active && !state.game.paused) { 
            updateGame(deltaTime);
            renderAllLayers();
        }
        
        requestAnimationFrame(mainLoop);
    }

    const keysPressed = {};
    document.addEventListener('keydown', (e) => keysPressed[e.key] = true);
    document.addEventListener('keyup', (e) => keysPressed[e.key] = false);

    function toggleGameMode() {
        state.game.active = !state.game.active;
        $('#main-content').classList.toggle('game-active', state.game.active);
        $('#game-hud').classList.toggle('hidden', !state.game.active);
        $('#tools-panel').classList.toggle('hidden', state.game.active);
        $('#timeline-panel').classList.toggle('hidden', state.game.active);
        if (state.game.active) {
            initGame();
            state.animation.playing = false;
            updateUIFromState();
            rebuildDrawingAreasDOM();
        }
    }
    function initGame() {
        state.game.score = 0; state.game.paused = false; state.game.player = { r: 3, c: 5 };
        state.game.bullets = []; state.game.enemies = []; state.game.spawnTimer = 0;
        $('#game-score').textContent = 0;
    }
    function updateGame(dt) {
        const playerSpeed = 0.01;
        if (keysPressed['w'] || keysPressed['ArrowUp']) state.game.player.r -= playerSpeed * dt;
        if (keysPressed['s'] || keysPressed['ArrowDown']) state.game.player.r += playerSpeed * dt;
        if (keysPressed['a'] || keysPressed['ArrowLeft']) state.game.player.c -= playerSpeed * dt;
        if (keysPressed['d'] || keysPressed['ArrowRight']) state.game.player.c += playerSpeed * dt;
        state.game.player.r = Math.max(0, Math.min(ROWS - 1, state.game.player.r));
        state.game.player.c = Math.max(0, Math.min(COLS - 1, state.game.player.c));
        if (keysPressed[' ']) {
            if (!state.game.lastShotTime || (performance.now() - state.game.lastShotTime > 200)) {
                state.game.bullets.push({ r: state.game.player.r, c: state.game.player.c, vx: 0.02 });
                state.game.lastShotTime = performance.now();
            }
        }
        state.game.bullets = state.game.bullets.filter(b => b.c < COLS);
        state.game.bullets.forEach(b => b.c += b.vx * dt);
        state.game.spawnTimer += dt;
        const spawnInterval = 2000 / state.game.difficulty;
        if (state.game.spawnTimer > spawnInterval) {
            state.game.spawnTimer = 0;
            state.game.enemies.push({r: Math.random() * ROWS, c: COLS - 1, vx: -0.005 * (1 + Math.random() * state.game.difficulty)});
        }
        state.game.enemies = state.game.enemies.filter(e => e.c > -1);
        state.game.enemies.forEach(e => e.c += e.vx * dt);
        let scoreToAdd = 0;
        state.game.bullets = state.game.bullets.filter(b => {
            const hitEnemy = state.game.enemies.find(e => !e.hit && Math.abs(b.r - e.r) < 0.8 && Math.abs(b.c - e.c) < 0.8);
            if (hitEnemy) {
                hitEnemy.hit = true; scoreToAdd += 10;
                if (state.game.writeToHeatmap) {
                    const cells = getActiveCells();
                    if(cells) {
                        const cell = cells[Math.floor(hitEnemy.c)]?.[Math.floor(hitEnemy.r)];
                        if (cell) {
                            cell.count++;
                            cell.level = calculateLevel(cell.count);
                        }
                    }
                }
                return false;
            }
            return true;
        });
        state.game.enemies = state.game.enemies.filter(e => !e.hit);
        if (scoreToAdd > 0) {
            state.game.score += scoreToAdd;
            $('#game-score').textContent = state.game.score;
            updateTotalContributions();
            updateFramesUI();
        }
    }
    function renderGame(ctx) {
        const getPixelPos = (r, c) => ({x: c * (cellSize + gap) + cellSize / 2, y: r * (cellSize + gap) + cellSize / 2});
        const pPos = getPixelPos(state.game.player.r, state.game.player.c);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-color');
        ctx.beginPath();
        ctx.moveTo(pPos.x + 8, pPos.y);
        ctx.lineTo(pPos.x - 4, pPos.y - 5);
        ctx.lineTo(pPos.x - 4, pPos.y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffcc00';
        state.game.bullets.forEach(b => {
            const bPos = getPixelPos(b.r, b.c);
            ctx.fillRect(bPos.x, bPos.y - 1, 6, 2);
        });
        ctx.fillStyle = '#ff4444';
        state.game.enemies.forEach(e => {
            const ePos = getPixelPos(e.r, e.c);
            ctx.fillRect(ePos.x - 4, ePos.y - 4, 8, 8);
        });
    }

    init();
});
