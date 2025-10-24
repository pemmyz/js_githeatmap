// game.js

const GAME_ROWS = 7;
const GAME_COLS = 53;

// --- TETRIS GAME ---
const SHAPES = { 'I': [[1, 1, 1, 1]], 'O': [[1, 1], [1, 1]], 'T': [[0, 1, 0], [1, 1, 1]], 'S': [[0, 1, 1], [1, 1, 0]], 'Z': [[1, 1, 0], [0, 1, 1]], 'J': [[1, 0, 0], [1, 1, 1]], 'L': [[0, 0, 1], [1, 1, 1]] };
const SHAPE_KEYS = Object.keys(SHAPES);

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
        // Use a random color index from the palette (levels 1-4)
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
        // Draw merged pieces
        for (let r = 0; r < GAME_ROWS; r++) {
            for (let c = 0; c < GAME_COLS; c++) {
                const colorIndex = this.grid[r][c];
                if (colorIndex !== 0) {
                    drawCellFn(ctx, c * (cellSize + gap), r * (cellSize + gap), cellSize, this.palette[colorIndex], colorIndex);
                }
            }
        }
        // Draw active piece
        if (this.piece) {
            this.piece.shape.forEach((row, r) => {
                row.forEach((value, c) => {
                    if (value !== 0) {
                        const gridX = this.piece.col + c;
                        const gridY = this.piece.row + r;
                        const colorIndex = this.piece.colorIndex;
                        drawCellFn(ctx, gridX * (cellSize + gap), gridY * (cellSize + gap), cellSize, this.palette[colorIndex], colorIndex);
                    }
                });
            });
        }
    }

    move(dir) { if (!this.checkCollision(this.piece, dir, 0)) this.piece.row += dir; }
    hardDrop() { if (this.gameOver) return; while (!this.checkCollision(this.piece, 0, 1)) this.piece.col++; this.mergePiece(); this.clearColumns(); this.spawnNewPiece(); }
    rotate() { if (this.gameOver) return; const originalShape = this.piece.shape; const rotated = this.piece.shape[0].map((_, colIndex) => this.piece.shape.map(row => row[colIndex]).reverse()); this.piece.shape = rotated; let offset = 0, kick = 0; while (this.checkCollision(this.piece, 0, 0)) { kick = (offset >= 0) ? (offset + 1) : (offset - 1); offset = -offset; this.piece.row += kick; if (Math.abs(kick) > this.piece.shape.length + 1) { this.piece.shape = originalShape; this.piece.row -= kick; return; } } }
    checkCollision(piece, rowOffset, colOffset) { for (let r = 0; r < piece.shape.length; r++) { for (let c = 0; c < piece.shape[r].length; c++) { if (piece.shape[r][c] !== 0) { const newRow = piece.row + r + rowOffset; const newCol = piece.col + c + colOffset; if (newRow < 0 || newRow >= GAME_ROWS || newCol >= GAME_COLS) return true; if (newCol >= 0 && this.grid[newRow] && this.grid[newRow][newCol] !== 0) return true; } } } return false; }
    mergePiece() { this.piece.shape.forEach((row, r) => { row.forEach((value, c) => { if (value !== 0) { const gridRow = this.piece.row + r; const gridCol = this.piece.col + c; if (gridRow >= 0 && gridRow < GAME_ROWS && gridCol >= 0 && gridCol < GAME_COLS) this.grid[gridRow][gridCol] = this.piece.colorIndex; } }); }); }
    clearColumns() { let columnsCleared = 0; for (let c = GAME_COLS - 1; c >= 0; c--) { let isFull = true; for (let r = 0; r < GAME_ROWS; r++) { if (this.grid[r][c] === 0) { isFull = false; break; } } if (isFull) { columnsCleared++; for (let r = 0; r < GAME_ROWS; r++) { this.grid[r].splice(c, 1); this.grid[r].unshift(0); } } } if (columnsCleared > 0) { const points = [0, 40, 100, 300, 1200]; this.score += points[columnsCleared] || points[4]; } }
}

// --- SNAKE GAME ---
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
        // Draw food (Level 1 color)
        const foodLevel = 1;
        drawCellFn(ctx, this.food.x * (cellSize + gap), this.food.y * (cellSize + gap), cellSize, this.palette[foodLevel], foodLevel);

        // Draw snake
        this.snake.forEach((part, index) => {
            const level = (index === 0) ? 4 : 3; // Head is Level 4, body is Level 3
            drawCellFn(ctx, part.x * (cellSize + gap), part.y * (cellSize + gap), cellSize, this.palette[level], level);
        });
    }
}
