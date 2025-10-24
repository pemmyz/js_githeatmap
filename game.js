// game.js

const GAME_ROWS = 7;
const GAME_COLS = 53;

// --- TETRIS GAME ---
const TETRIS_COLORS = [ null, '#00FFFF', '#FFFF00', '#800080', '#00FF00', '#FF0000', '#0000FF', '#FFA500' ];
const SHAPES = { 'I': [[1, 1, 1, 1]], 'O': [[1, 1], [1, 1]], 'T': [[0, 1, 0], [1, 1, 1]], 'S': [[0, 1, 1], [1, 1, 0]], 'Z': [[1, 1, 0], [0, 1, 1]], 'J': [[1, 0, 0], [1, 1, 1]], 'L': [[0, 0, 1], [1, 1, 1]] };
const SHAPE_KEYS = Object.keys(SHAPES);

class SidewaysTetris {
    constructor() {
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
        const colorIndex = SHAPE_KEYS.indexOf(type) + 1;
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
    
    render(ctx, cellSize, gap) {
        for (let r = 0; r < GAME_ROWS; r++) {
            for (let c = 0; c < GAME_COLS; c++) {
                if (this.grid[r][c] !== 0) {
                    this.drawBlock(ctx, r, c, this.grid[r][c], cellSize, gap, TETRIS_COLORS);
                }
            }
        }
        if (this.piece) {
            this.piece.shape.forEach((row, r) => {
                row.forEach((value, c) => {
                    if (value !== 0) {
                        this.drawBlock(ctx, this.piece.row + r, this.piece.col + c, this.piece.colorIndex, cellSize, gap, TETRIS_COLORS);
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
    drawBlock(ctx, r, c, colorIndex, cellSize, gap, colors) { const x = c * (cellSize + gap); const y = r * (cellSize + gap); ctx.fillStyle = colors[colorIndex]; ctx.fillRect(x, y, cellSize, cellSize); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1); }
}

// --- SNAKE GAME ---
const SNAKE_COLORS = { head: '#98c379', body: '#61afef', food: '#e06c75' };

class SnakeGame {
    constructor(difficulty) {
        this.difficulty = difficulty;
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

        // Handle input for next direction
        if ((keysPressed['w'] || keysPressed['arrowup']) && this.direction.y === 0) this.nextDirection = { x: 0, y: -1 };
        else if ((keysPressed['s'] || keysPressed['arrowdown']) && this.direction.y === 0) this.nextDirection = { x: 0, y: 1 };
        else if ((keysPressed['a'] || keysPressed['arrowleft']) && this.direction.x === 0) this.nextDirection = { x: -1, y: 0 };
        else if ((keysPressed['d'] || keysPressed['arrowright']) && this.direction.x === 0) this.nextDirection = { x: 1, y: 0 };
        
        this.moveCounter += deltaTime;
        if (this.moveCounter > this.moveInterval) {
            this.moveCounter = 0;
            this.direction = this.nextDirection;
            
            const head = { x: this.snake[0].x + this.direction.x, y: this.snake[0].y + this.direction.y };

            // Check for game over conditions
            if (this.checkCollision(head)) {
                this.gameOver = true;
                return;
            }

            this.snake.unshift(head);

            // Check for food
            if (head.x === this.food.x && head.y === this.food.y) {
                this.score += 10;
                this.placeFood();
            } else {
                this.snake.pop();
            }
        }
    }
    
    checkCollision(head) {
        // Wall collision
        if (head.x < 0 || head.x >= GAME_COLS || head.y < 0 || head.y >= GAME_ROWS) return true;
        // Self collision
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) return true;
        }
        return false;
    }

    render(ctx, cellSize, gap) {
        // Draw food
        this.drawBlock(ctx, this.food.y, this.food.x, SNAKE_COLORS.food, cellSize, gap);

        // Draw snake
        this.snake.forEach((part, index) => {
            const color = (index === 0) ? SNAKE_COLORS.head : SNAKE_COLORS.body;
            this.drawBlock(ctx, part.y, part.x, color, cellSize, gap);
        });
    }

    drawBlock(ctx, r, c, color, cellSize, gap) {
        const x = c * (cellSize + gap);
        const y = r * (cellSize + gap);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellSize, cellSize);
    }
}
