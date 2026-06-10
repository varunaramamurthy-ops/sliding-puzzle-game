document.addEventListener('DOMContentLoaded', () => {
    const boardContainer = document.getElementById('puzzle-board');
    const winOverlay = document.getElementById('win-overlay');
    const restartBtn = document.getElementById('restart-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const resetGameBtn = document.getElementById('reset-game-btn');
    const movesCountVal = document.getElementById('moves-count');
    const finalMovesVal = document.getElementById('final-moves');
    const timerVal = document.getElementById('timer-val');
    const finalTimeVal = document.getElementById('final-time');
    
    // Constants for grid size
    const ROWS = 2;
    const COLS = 6;

    // Board state: 1D array representing the 2x6 grid.
    // Numbers 1-11 represent image tiles, null is the empty space.
    // Solved layout: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null]
    let board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null];
    let initialScrambleState = [...board];
    
    // Game Tracking State
    let movesCount = 0;
    let timerInterval = null;
    let secondsElapsed = 0;
    let isTimerRunning = false;
    let isTransitioning = false; // Transition lock to prevent double clicks
    
    // Safe LocalStorage helpers to prevent SecurityError exceptions under file:// or iframe sandboxes
    function safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage is not available:', e);
            return null;
        }
    }

    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('localStorage is not available:', e);
        }
    }

    // Best Scores State (Loaded from Local Storage specifically for 2x6 board)
    let bestMoves = safeGetItem('sliding_puzzle_2x6_best_moves') ? parseInt(safeGetItem('sliding_puzzle_2x6_best_moves')) : null;
    let bestTime = safeGetItem('sliding_puzzle_2x6_best_time') ? parseInt(safeGetItem('sliding_puzzle_2x6_best_time')) : null;

    /**
     * Reads current grid variables dynamically from computed CSS styles.
     * This ensures the layout translates pixel-perfectly on mobile responsive views.
     */
    function getGridParams() {
        const style = getComputedStyle(document.documentElement);
        const tileWidth = parseInt(style.getPropertyValue('--tile-width')) || 76;
        const tileHeight = parseInt(style.getPropertyValue('--tile-height')) || 95;
        const gap = parseInt(style.getPropertyValue('--tile-gap')) || 8;
        const padding = 10; // Padding inside the board container
        return { tileWidth, tileHeight, gap, padding };
    }

    /**
     * Updates the moves counter elements in the DOM.
     */
    function updateMovesDisplay() {
        movesCountVal.textContent = movesCount;
        finalMovesVal.textContent = movesCount;
    }

    /**
     * Formats seconds into MM:SS format.
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    /**
     * Updates the timer elements in the DOM.
     */
    function updateTimerDisplay() {
        const formatted = formatTime(secondsElapsed);
        timerVal.textContent = formatted;
        finalTimeVal.textContent = formatted;
    }

    /**
     * Starts the game timer.
     */
    function startTimer() {
        if (isTimerRunning) return;
        isTimerRunning = true;
        timerInterval = setInterval(() => {
            secondsElapsed++;
            updateTimerDisplay();
        }, 1000);
    }

    /**
     * Stops the game timer.
     */
    function stopTimer() {
        clearInterval(timerInterval);
        isTimerRunning = false;
    }

    /**
     * Resets the game timer.
     */
    function resetTimer() {
        stopTimer();
        secondsElapsed = 0;
        updateTimerDisplay();
    }

    /**
     * Updates the best scores badges in the DOM.
     */
    function updateBestScoresDisplay() {
        const bestMovesVal = document.getElementById('best-moves');
        const bestTimeVal = document.getElementById('best-time');
        bestMovesVal.textContent = bestMoves !== null ? bestMoves : '-';
        bestTimeVal.textContent = bestTime !== null ? formatTime(bestTime) : '-';
    }

    /**
     * Creates and appends the tile elements in the DOM once during initialization.
     * Slices the background landscape image across the 11 image tiles.
     */
    function initializeTilesDOM() {
        boardContainer.innerHTML = '';
        
        // Render 11 artwork tiles (values 1-11)
        for (let val = 1; val <= 11; val++) {
            createTileElement(val);
        }
    }

    /**
     * Helper to create a single tile element and attach click handlers.
     */
    function createTileElement(value) {
        const tile = document.createElement('div');
        tile.classList.add('puzzle-tile');
        tile.id = `tile-${value}`;
        
        // Slicing background image dynamically (2x6 grid layout)
        const origIndex = value - 1;
        const origRow = Math.floor(origIndex / COLS);
        const origCol = origIndex % COLS;
        
        tile.style.backgroundImage = "url('artwork.jpg')";
        tile.style.backgroundSize = "calc(6 * var(--tile-width)) calc(2 * var(--tile-height))";
        tile.style.backgroundPosition = `calc(-1 * var(--tile-width) * ${origCol}) calc(-1 * var(--tile-height) * ${origRow})`;
        
        // Add click listener
        tile.addEventListener('click', () => {
            const currentIndex = board.indexOf(value);
            if (currentIndex !== -1) {
                handleTileClick(currentIndex);
            }
        });
        
        boardContainer.appendChild(tile);
    }

    /**
     * Positions all active DOM tile elements using translate3d based on the board state.
     * @param {boolean} animate - Whether to use smooth CSS transitions or position instantly.
     */
    function updateTilePositions(animate = true) {
        const { tileWidth, tileHeight, gap, padding } = getGridParams();
        
        board.forEach((value, index) => {
            if (value !== null) {
                const tileEl = document.getElementById(`tile-${value}`);
                if (tileEl) {
                    const row = Math.floor(index / COLS);
                    const col = index % COLS;
                    const x = col * (tileWidth + gap) + padding;
                    const y = row * (tileHeight + gap) + padding;
                    
                    if (!animate) {
                        // Temporarily bypass transition for instant updates (e.g. initial loads, shuffles)
                        const prevTransition = tileEl.style.transition;
                        tileEl.style.transition = 'none';
                        tileEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                        // Force reflow
                        tileEl.offsetHeight;
                        tileEl.style.transition = prevTransition;
                    } else {
                        tileEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                    }
                }
            }
        });
    }

    /**
     * Handles clicks on a tile, checks for adjacency to the empty slot,
     * and performs the move if valid.
     * @param {number} clickedIndex - Index of the clicked tile in the board array (0-11)
     */
    function handleTileClick(clickedIndex) {
        if (isTransitioning) return; // Prevent double clicks during active slide transitions
        
        const emptyIndex = board.indexOf(null);
        
        // Convert 1D array index to 2D coordinates (row, col)
        const clickedRow = Math.floor(clickedIndex / COLS);
        const clickedCol = clickedIndex % COLS;
        const emptyRow = Math.floor(emptyIndex / COLS);
        const emptyCol = emptyIndex % COLS;
        
        // Calculate Manhattan distance between the clicked tile and the empty slot
        const distance = Math.abs(clickedRow - emptyRow) + Math.abs(clickedCol - emptyCol);
        
        // A move is valid only if the distance is exactly 1 (adjacent horizontally or vertically)
        if (distance === 1) {
            isTransitioning = true; // Lock interactions
            
            // Swap the clicked tile with the empty slot in the state array
            board[emptyIndex] = board[clickedIndex];
            board[clickedIndex] = null;
            
            // Start the timer on the very first move
            if (movesCount === 0) {
                startTimer();
            }
            
            // Increment moves count and update display
            movesCount++;
            updateMovesDisplay();
            
            // Update physical translation coordinates of tiles
            updateTilePositions(true);
            
            // Unlock interactions and check victory after CSS transition completes (220ms)
            setTimeout(() => {
                isTransitioning = false;
                if (checkWin()) {
                    stopTimer();
                    showWinOverlay();
                }
            }, 220);
        }
    }

    /**
     * Checks if the current board state matches the solved target state.
     * @returns {boolean} True if the board matches [1, 2, ... 11, null]
     */
    function checkWin() {
        const target = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null];
        return board.every((val, index) => val === target[index]);
    }

    /**
     * Shows the victory overlay screen, updates high scores, and shows record alerts.
     */
    function showWinOverlay() {
        let isNewRecord = false;

        // Check if user broke the Moves record
        if (bestMoves === null || movesCount < bestMoves) {
            bestMoves = movesCount;
            safeSetItem('sliding_puzzle_2x6_best_moves', bestMoves);
            isNewRecord = true;
        }

        // Check if user broke the Time record
        if (bestTime === null || secondsElapsed < bestTime) {
            bestTime = secondsElapsed;
            safeSetItem('sliding_puzzle_2x6_best_time', bestTime);
            isNewRecord = true;
        }

        const newRecordMsg = document.getElementById('new-record-msg');
        if (isNewRecord) {
            newRecordMsg.classList.remove('hidden');
            updateBestScoresDisplay();
        } else {
            newRecordMsg.classList.add('hidden');
        }

        winOverlay.classList.remove('hidden');
    }

    /**
     * Hides the victory overlay screen.
     */
    function hideWinOverlay() {
        winOverlay.classList.add('hidden');
    }

    /**
     * Shuffles the board using random walk moves from a solved state.
     * This guarantees that the puzzle remains in a solvable state.
     */
    function shuffleBoard() {
        // Reset to solved state before scrambling
        board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null];
        
        let lastMoveIndex = null;
        const shuffleSteps = 80; // Solvable swaps for 2x6 grid
        
        for (let i = 0; i < shuffleSteps; i++) {
            const emptyIndex = board.indexOf(null);
            const emptyRow = Math.floor(emptyIndex / COLS);
            const emptyCol = emptyIndex % COLS;
            
            const candidates = [];
            const directions = [
                { r: -1, c: 0 }, // Up
                { r: 1, c: 0 },  // Down
                { r: 0, c: -1 }, // Left
                { r: 0, c: 1 }   // Right
            ];
            
            directions.forEach(dir => {
                const newRow = emptyRow + dir.r;
                const newCol = emptyCol + dir.c;
                
                if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
                    const candidateIndex = newRow * COLS + newCol;
                    // Avoid immediately reverting the last move for a better shuffle
                    if (candidateIndex !== lastMoveIndex) {
                        candidates.push(candidateIndex);
                    }
                }
            });
            
            // Fallback to any valid move if candidates array is empty
            if (candidates.length === 0) {
                directions.forEach(dir => {
                    const newRow = emptyRow + dir.r;
                    const newCol = emptyCol + dir.c;
                    if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
                        candidates.push(newRow * COLS + newCol);
                    }
                });
            }
            
            // Select a random valid tile index to swap with the empty space
            const chosenIndex = candidates[Math.floor(Math.random() * candidates.length)];
            
            // Perform the swap
            board[emptyIndex] = board[chosenIndex];
            board[chosenIndex] = null;
            
            lastMoveIndex = emptyIndex;
        }
        
        // Save the scramble configuration so we can restart it if requested
        initialScrambleState = [...board];
        isTransitioning = false; // Reset lock state on shuffle
    }

    // Play Again/Restart button click listener
    restartBtn.addEventListener('click', () => {
        hideWinOverlay();
        shuffleBoard();
        movesCount = 0;
        updateMovesDisplay();
        resetTimer();
        updateTilePositions(false); // position instantly
        console.log('Board shuffled and restarted.');
    });

    // Shuffle button click listener
    shuffleBtn.addEventListener('click', () => {
        hideWinOverlay();
        shuffleBoard();
        movesCount = 0;
        updateMovesDisplay();
        resetTimer();
        updateTilePositions(false); // position instantly
        console.log('Board shuffled manually.');
    });

    // Restart button click listener (resets board to the current scramble state)
    resetGameBtn.addEventListener('click', () => {
        if (isTransitioning) return;
        hideWinOverlay();
        board = [...initialScrambleState];
        movesCount = 0;
        updateMovesDisplay();
        resetTimer();
        updateTilePositions(true); // position with slide animation
        console.log('Board reset to current scramble configuration.');
    });

    // Watch for window resize to recalibrate tile layouts automatically
    window.addEventListener('resize', () => {
        updateTilePositions(false);
    });

    // Populate best scores from local storage
    updateBestScoresDisplay();
    
    // Initialize the tiles once in the DOM
    initializeTilesDOM();
    
    // Render the initial positions of the tiles on load (solved state initially)
    updateTilePositions(false);
    console.log('2x6 Standalone sliding puzzle loaded successfully.');
});
