// game.js

const GAME_ROWS = 7;
const GAME_COLS = 53;

// --- TETRIS SHAPES (Used by Block Auto & Tetris games) ---
const SHAPES = {
    'I': [[1, 1, 1, 1]],
    'O': [[1, 1], [1, 1]],
    'T': [[0, 1, 0], [1, 1, 1]],
    'S': [[0, 1, 1], [1, 1, 0]],
    'Z': [[1, 1, 0], [0, 1, 1]],
    'J': [[1, 0, 0], [1, 1, 1]],
    'L': [[0, 0, 1], [1, 1, 1]]
};
const SHAPE_KEYS = Object.keys(SHAPES);


// --- MODIFIED GAME: Block Auto ---
// A single player-controlled block dodges incoming Tetris-shaped obstacles.
class BlockAutoGame {
    constructor(difficulty, palette, initialGrid = null) {
        this.difficulty = difficulty;
        this.palette = palette;
        // The 'initialGrid' allows for the seamless mode where drawings become static obstacles.
        this.staticGrid = initialGrid ? initialGrid.map(col => col.map(cell => (cell && cell.count > 0) ? cell.level : 0)) : null;
        this.reset();
    }

    reset() {
        this.player = { col: 5, row: 3 }; // Player starts near the left
        this.obstacles = [];
        this.score = 0;
        this.gameOver = false;
        
        this.spawnTimer = 0;
        // Slower spawn rate
        this.spawnInterval = 4000 / this.difficulty;
        // Slower obstacle speed that scales gently
        this.obstacleSpeed = 2 + this.difficulty;
    }

    spawnObstacle() {
        const type = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
        const shape = SHAPES[type];
        const colorIndex = Math.floor(Math.random() * 4) + 1;
        
        const shapeHeight = shape.length;
        const row = Math.floor(Math.random() * (GAME_ROWS - shapeHeight + 1));
        
        // Always spawn off-screen to the right
        const col = GAME_COLS; 
        // Always move to the left
        const dx = -1;

        this.obstacles.push({ shape, col, row, colorIndex, dx });
    }

    update(deltaTime, keysPressed) {
        if (this.gameOver) return;
        
        // --- Player Movement (Now includes Left/Right) ---
        if (keysPressed['w'] || keysPressed['arrowup']) this.player.row = Math.max(0, this.player.row - 1);
        if (keysPressed['s'] || keysPressed['arrowdown']) this.player.row = Math.min(GAME_ROWS - 1, this.player.row + 1);
        if (keysPressed['a'] || keysPressed['arrowleft']) this.player.col = Math.max(0, this.player.col - 1);
        if (keysPressed['d'] || keysPressed['arrowright']) this.player.col = Math.min(GAME_COLS - 1, this.player.col + 1);
        
        // Clear keys to prevent continuous movement from one press
        keysPressed['w'] = keysPressed['arrowup'] = false;
        keysPressed['s'] = keysPressed['arrowdown'] = false;
        keysPressed['a'] = keysPressed['arrowleft'] = false;
        keysPressed['d'] = keysPressed['arrowright'] = false;

        // --- Obstacle Spawning & Movement ---
        this.spawnTimer += deltaTime;
        if (this.spawnTimer > this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnObstacle();
        }

        this.obstacles.forEach(obs => {
            obs.col += obs.dx * this.obstacleSpeed * (deltaTime / 1000);
        });

        // --- Cleanup and Score ---
        // Only need to check for obstacles that have gone past the left edge
        this.obstacles = this.obstacles.filter(obs => obs.col > -obs.shape[0].length);
        this.score += deltaTime / 100; // Score increases over time

        // --- Collision Detection ---
        if (this.checkCollision()) {
            this.gameOver = true;
        }
    }

    checkCollision() {
        // Check against static grid (drawn obstacles)
        if (this.staticGrid && this.staticGrid[this.player.col][this.player.row] !== 0) {
            return true;
        }

        // Check against moving obstacles
        for (const obs of this.obstacles) {
            for (let r = 0; r < obs.shape.length; r++) {
                for (let c = 0; c < obs.shape[r].length; c++) {
                    if (obs.shape[r][c] !== 0) {
                        const obsGridCol = Math.floor(obs.col + c);
                        const obsGridRow = obs.row + r;
                        if (obsGridCol === this.player.col && obsGridRow === this.player.row) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    render(ctx, cellSize, gap, drawCellFn) {
        // Draw static grid if it exists
        if (this.staticGrid) {
            for (let c = 0; c < GAME_COLS; c++) {
                for (let r = 0; r < GAME_ROWS; r++) {
                    const level = this.staticGrid[c][r];
                    if (level > 0) {
                        drawCellFn(ctx, c * (cellSize + gap), r * (cellSize + gap), cellSize, this.palette[level], level);
                    }
                }
            }
        }
        
        // Draw moving obstacles
        this.obstacles.forEach(obs => {
            obs.shape.forEach((row, r) => {
                row.forEach((value, c) => {
                    if (value !== 0) {
                        const gridX = Math.floor(obs.col + c);
                        const gridY = obs.row + r;
                        drawCellFn(ctx, gridX * (cellSize + gap), gridY * (cellSize + gap), cellSize, this.palette[obs.colorIndex], obs.colorIndex);
                    }
                });
            });
        });

        // Draw player
        const playerLevel = 4; // Make player brightest color
        drawCellFn(ctx, this.player.col * (cellSize + gap), this.player.row * (cellSize + gap), cellSize, this.palette[playerLevel], playerLevel);
    }
}


// --- NEW GAME: Conway's Game of Life ---
// Evolves the user's drawing based on the rules of GoL. Supports multiple independent instances.
class GameOfLife {
    constructor(difficulty, palette, initialCells) {
        this.palette = palette;
        this.difficulty = difficulty; // Controls speed
        this.stepInterval = Math.max(50, 500 - this.difficulty * 40);
        this.timer = 0;
        this.score = 0; // Represents generations
        this.gameOver = false; // GoL never ends, but required by game loop
    }

    update(deltaTime, cells) {
        this.timer += deltaTime;
        if (this.timer < this.stepInterval) {
            return;
        }
        this.timer = 0;
        this.score++; // Increment generation count

        const currentState = cells.map(col => col.map(cell => cell && cell.count > 0));
        const nextState = currentState.map(col => [...col]);

        for (let c = 0; c < GAME_COLS; c++) {
            for (let r = 0; r < GAME_ROWS; r++) {
                let liveNeighbors = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (i === 0 && j === 0) continue;
                        const nc = c + i;
                        const nr = r + j;
                        if (nc >= 0 && nc < GAME_COLS && nr >= 0 && nr < GAME_ROWS && currentState[nc][nr]) {
                            liveNeighbors++;
                        }
                    }
                }

                const isAlive = currentState[c][r];
                if (isAlive && (liveNeighbors < 2 || liveNeighbors > 3)) {
                    nextState[c][r] = false; // Dies
                } else if (!isAlive && liveNeighbors === 3) {
                    nextState[c][r] = true; // Becomes alive
                }
            }
        }

        // Apply the next state back to the main cells data structure
        for (let c = 0; c < GAME_COLS; c++) {
            for (let r = 0; r < GAME_ROWS; r++) {
                if (cells[c][r]) {
                    if (nextState[c][r]) {
                        cells[c][r].count = 1; // Or some other value
                        cells[c][r].level = 1;
                    } else {
                        cells[c][r].count = 0;
                        cells[c][r].level = 0;
                    }
                }
            }
        }
    }

    // Render is handled by the main script's drawGrid function, so this can be empty.
    render(ctx, cellSize, gap, drawCellFn) {}
}


// --- EXISTING GAME: Sideways Tetris ---
class SidewaysTetris {
    constructor(palette) {
        this.palette = palette;
        this.reset();
    }

    reset() {
        this.grid = Array.from({ length: GAME_ROWS }, () => Array(GAME_COLS).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.dropCounter = 0;
        this.dropInterval = 500;
        this.moveCounter = 0;
        this.moveInterval = 80;
        this.piece = null;
        this.spawnNewPiece();
    }

    spawnNewPiece() {
        const type = SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
        const shape = SHAPES[type];
        const colorIndex = Math.floor(Math.random() * 4) + 1;
        this.piece = {
            shape: shape, colorIndex: colorIndex,
            row: Math.floor(GAME_ROWS / 2) - Math.floor(shape.length / 2),
            col: 0
        };
        if (this.checkCollision(this.piece, 0, 0)) {
            this.gameOver = true;
        }
    }

    update(deltaTime, keysPressed) {
        if (this.gameOver) return;
        this.moveCounter += deltaTime;
        if (this.moveCounter > this.moveInterval) {
            this.moveCounter = 0;
            if (keysPressed['s'] || keysPressed['arrowdown']) this.move(1);
            if (keysPressed['w'] || keysPressed['arrowup']) this.move(-1);
        }
        const currentDropInterval = (keysPressed['d'] || keysPressed['arrowright']) ? 50 : this.dropInterval;
        this.dropCounter += deltaTime;
        if (this.dropCounter > currentDropInterval) {
            this.dropCounter = 0;
            if (!this.checkCollision(this.piece, 0, 1)) {
                this.piece.col++;
            } else {
                this.mergePiece();
                this.clearColumns();
                this.spawnNewPiece();
            }
        }
    }
    
    render(ctx, cellSize, gap, drawCellFn) {
        for (let r = 0; r < GAME_ROWS; r++) {
            for (let c = 0; c < GAME_COLS; c++) {
                const level = this.grid[r][c];
                if (level !== 0) {
                    drawCellFn(ctx, c * (cellSize + gap), r * (cellSize + gap), cellSize, this.palette[level], level);
                }
            }
        }
        if (this.piece) {
            const level = this.piece.colorIndex;
            this.piece.shape.forEach((row, r) => {
                row.forEach((value, c) => {
                    if (value !== 0) {
                        const gridX = this.piece.col + c;
                        const gridY = this.piece.row + r;
                        drawCellFn(ctx, gridX * (cellSize + gap), gridY * (cellSize + gap), cellSize, this.palette[level], level);
                    }
                });
            });
        }
    }

    move(dir) { if (!this.checkCollision(this.piece, dir, 0)) this.piece.row += dir; }
    hardDrop() { if (this.gameOver) return; while (!this.checkCollision(this.piece, 0, 1)) this.piece.col++; this.mergePiece(); this.clearColumns(); this.spawnNewPiece(); }
    
    rotate() {
        if (this.gameOver || !this.piece) return;

        const originalCol = this.piece.col;
        const rotatedShape = this.piece.shape[0].map((_, colIndex) => this.piece.shape.map(row => row[colIndex]).reverse());
        const kickTests = [ [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0] ];

        for (const [colKick, rowKick] of kickTests) {
            const tempPiece = { ...this.piece, shape: rotatedShape, col: originalCol + colKick, row: this.piece.row + rowKick };
            if (!this.checkCollision(tempPiece, 0, 0)) {
                this.piece.shape = rotatedShape;
                this.piece.col = tempPiece.col;
                this.piece.row = tempPiece.row;
                return;
            }
        }
    }

    checkCollision(piece, rowOffset, colOffset) { for (let r = 0; r < piece.shape.length; r++) { for (let c = 0; c < piece.shape[r].length; c++) { if (piece.shape[r][c] !== 0) { const newRow = piece.row + r + rowOffset; const newCol = piece.col + c + colOffset; if (newRow < 0 || newRow >= GAME_ROWS || newCol >= GAME_COLS || newCol < 0) return true; if (this.grid[newRow] && this.grid[newRow][newCol] !== 0) return true; } } } return false; }
    mergePiece() { this.piece.shape.forEach((row, r) => { row.forEach((value, c) => { if (value !== 0) { const gridRow = this.piece.row + r; const gridCol = this.piece.col + c; if (gridRow >= 0 && gridRow < GAME_ROWS && gridCol >= 0 && gridCol < GAME_COLS) this.grid[gridRow][gridCol] = this.piece.colorIndex; } }); }); }
    
    clearColumns() {
        let fullColumnsIndices = [];
        for (let c = 0; c < GAME_COLS; c++) {
            let isFull = true;
            for (let r = 0; r < GAME_ROWS; r++) { if (this.grid[r][c] === 0) { isFull = false; break; } }
            if (isFull) fullColumnsIndices.push(c);
        }

        const columnsCleared = fullColumnsIndices.length;
        if (columnsCleared > 0) {
            for (let i = columnsCleared - 1; i >= 0; i--) {
                const colIndex = fullColumnsIndices[i];
                for (let r = 0; r < GAME_ROWS; r++) { this.grid[r].splice(colIndex, 1); }
            }
            for (let i = 0; i < columnsCleared; i++) {
                for (let r = 0; r < GAME_ROWS; r++) { this.grid[r].unshift(0); }
            }
            const points = [0, 40, 100, 300, 1200];
            this.score += points[columnsCleared] || points[4];
        }
    }
}


// --- EXISTING GAME: Snake ---
class SnakeGame {
    constructor(difficulty, palette) {
        this.difficulty = difficulty;
        this.palette = palette;
        this.reset();
    }

    reset() {
        this.snake = [{ x: 10, y: 3 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.food = null;
        this.placeFood();
        this.score = 0;
        this.gameOver = false;
        this.moveCounter = 0;
        this.moveInterval = Math.max(20, 200 - this.difficulty * 15);
    }

    placeFood() {
        let foodX, foodY;
        do {
            foodX = Math.floor(Math.random() * GAME_COLS);
            foodY = Math.floor(Math.random() * GAME_ROWS);
        } while (this.snake.some(p => p.x === foodX && p.y === foodY));
        this.food = { x: foodX, y: foodY };
    }

    update(deltaTime, keysPressed) {
        if (this.gameOver) return;
        if ((keysPressed['w'] || keysPressed['arrowup']) && this.direction.y === 0) this.nextDirection = { x: 0, y: -1 };
        else if ((keysPressed['s'] || keysPressed['arrowdown']) && this.direction.y === 0) this.nextDirection = { x: 0, y: 1 };
        else if ((keysPressed['a'] || keysPressed['arrowleft']) && this.direction.x === 0) this.nextDirection = { x: -1, y: 0 };
        else if ((keysPressed['d'] || keysPressed['arrowright']) && this.direction.x === 0) this.nextDirection = { x: 1, y: 0 };
        
        this.moveCounter += deltaTime;
        if (this.moveCounter > this.moveInterval) {
            this.moveCounter = 0;
            this.direction = this.nextDirection;
            const head = { x: this.snake[0].x + this.direction.x, y: this.snake[0].y + this.direction.y };
            if (this.checkCollision(head)) { this.gameOver = true; return; }
            this.snake.unshift(head);
            if (head.x === this.food.x && head.y === this.food.y) { this.score += 10; this.placeFood(); } 
            else { this.snake.pop(); }
        }
    }
    
    checkCollision(head) {
        if (head.x < 0 || head.x >= GAME_COLS || head.y < 0 || head.y >= GAME_ROWS) return true;
        for (let i = 1; i < this.snake.length; i++) { if (head.x === this.snake[i].x && head.y === this.snake[i].y) return true; }
        return false;
    }

    render(ctx, cellSize, gap, drawCellFn) {
        const foodLevel = 1;
        drawCellFn(ctx, this.food.x * (cellSize + gap), this.food.y * (cellSize + gap), cellSize, this.palette[foodLevel], foodLevel);

        this.snake.forEach((part, index) => {
            const level = (index === 0) ? 4 : 3;
            drawCellFn(ctx, part.x * (cellSize + gap), part.y * (cellSize + gap), cellSize, this.palette[level], level);
        });
    }
}
