const TicTacToe = (() => {
    const symbols = ['X', 'O'];
    const HUMAN = 0;
    const COMPUTER = 1;

    function generateWinCombinations(size, winLength) {
        const combinations = [];
        const lines = [];

        for (let row = 0; row < size; row++) {
            for (let col = 0; col <= size - winLength; col++) {
                const line = [];
                for (let i = 0; i < winLength; i++) line.push(row * size + col + i);
                lines.push(line);
            }
        }

        for (let col = 0; col < size; col++) {
            for (let row = 0; row <= size - winLength; row++) {
                const line = [];
                for (let i = 0; i < winLength; i++) line.push((row + i) * size + col);
                lines.push(line);
            }
        }

        for (let row = 0; row <= size - winLength; row++) {
            for (let col = 0; col <= size - winLength; col++) {
                const diag = [];
                for (let i = 0; i < winLength; i++) diag.push((row + i) * size + col + i);
                lines.push(diag);
            }
        }

        for (let row = 0; row <= size - winLength; row++) {
            for (let col = winLength - 1; col < size; col++) {
                const diag = [];
                for (let i = 0; i < winLength; i++) diag.push((row + i) * size + col - i);
                lines.push(diag);
            }
        }

        const seen = new Set();
        for (const line of lines) {
            const key = line.join(',');
            if (!seen.has(key)) {
                seen.add(key);
                combinations.push(line);
            }
        }

        return combinations;
    }

    function getWinner(board, winCombinations) {
        for (const combination of winCombinations) {
            const first = board[combination[0]];
            if (!first) continue;
            if (combination.every(index => board[index] === first)) return first;
        }
        return null;
    }

    function getWinningLine(board, winCombinations) {
        for (const combination of winCombinations) {
            const first = board[combination[0]];
            if (!first) continue;
            if (combination.every(index => board[index] === first)) return combination;
        }
        return null;
    }

    function isBoardFull(board) {
        return board.every(cell => cell !== null);
    }

    function getEmptyIndices(board) {
        return board.reduce((indices, cell, index) => {
            if (cell === null) indices.push(index);
            return indices;
        }, []);
    }

    function pickRandom(indices) {
        return indices[Math.floor(Math.random() * indices.length)];
    }

    function findWinningMove(board, symbol, winCombinations) {
        for (const index of getEmptyIndices(board)) {
            board[index] = symbol;
            const won = getWinner(board, winCombinations) === symbol;
            board[index] = null;
            if (won) return index;
        }
        return null;
    }

    function minimax(boardState, depth, isMaximizing, winCombinations, size) {
        const winner = getWinner(boardState, winCombinations);
        if (winner === symbols[COMPUTER]) return 10 - depth;
        if (winner === symbols[HUMAN]) return depth - 10;
        if (isBoardFull(boardState)) return 0;

        if (isMaximizing) {
            let best = -Infinity;
            for (const index of getEmptyIndices(boardState)) {
                boardState[index] = symbols[COMPUTER];
                best = Math.max(best, minimax(boardState, depth + 1, false, winCombinations, size));
                boardState[index] = null;
            }
            return best;
        }

        let best = Infinity;
        for (const index of getEmptyIndices(boardState)) {
            boardState[index] = symbols[HUMAN];
            best = Math.min(best, minimax(boardState, depth + 1, true, winCombinations, size));
            boardState[index] = null;
        }
        return best;
    }

    function findBestMove(board, winCombinations) {
        let bestScore = -Infinity;
        let bestMove = null;

        for (const index of getEmptyIndices(board)) {
            board[index] = symbols[COMPUTER];
            const score = minimax(board, 0, false, winCombinations, Math.sqrt(board.length));
            board[index] = null;

            if (score > bestScore) {
                bestScore = score;
                bestMove = index;
            }
        }

        return bestMove;
    }

    function getHeuristicMove(board, size) {
        const center = Math.floor(size / 2) * size + Math.floor(size / 2);
        const empty = getEmptyIndices(board);
        if (empty.includes(center)) return center;

        const corners = [];
        if (size % 2 === 1) {
            const c = Math.floor(size / 2);
            corners.push(0, size - 1, size * (size - 1), size * size - 1);
        }
        const availableCorners = corners.filter(index => empty.includes(index));
        if (availableCorners.length) return pickRandom(availableCorners);

        return pickRandom(empty);
    }

    function findComputerMove(board, difficulty, winCombinations, size) {
        const empty = getEmptyIndices(board);
        if (!empty.length) return null;

        if (size > 3) {
            if (difficulty === 'easy' && Math.random() < 0.8) return pickRandom(empty);

            const winMove = findWinningMove(board, symbols[COMPUTER], winCombinations);
            if (winMove !== null) return winMove;

            const blockMove = findWinningMove(board, symbols[HUMAN], winCombinations);
            if (blockMove !== null) return blockMove;

            return getHeuristicMove(board, size);
        }

        if (difficulty === 'easy') {
            if (Math.random() < 0.7) return pickRandom(empty);
            return findBestMove(board, winCombinations) ?? pickRandom(empty);
        }

        if (difficulty === 'medium') {
            const winMove = findWinningMove(board, symbols[COMPUTER], winCombinations);
            if (winMove !== null) return winMove;

            const blockMove = findWinningMove(board, symbols[HUMAN], winCombinations);
            if (blockMove !== null) return blockMove;

            if (Math.random() < 0.5) return getHeuristicMove(board, size);
            return findBestMove(board, winCombinations) ?? pickRandom(empty);
        }

        return findBestMove(board, winCombinations) ?? pickRandom(empty);
    }

    function createGame(size = 3) {
        const winLength = size;
        const cellCount = size * size;
        const winCombinations = generateWinCombinations(size, winLength);

        return {
            size,
            winLength,
            winCombinations,
            board: Array(cellCount).fill(null),
            moveHistory: [],
            currentPlayer: HUMAN,
            gameOver: false,
            vsComputer: false,
            difficulty: 'hard',
            tournament: false,
            seriesWins: { x: 0, o: 0 }
        };
    }

    return {
        symbols,
        HUMAN,
        COMPUTER,
        SERIES_TARGET: 3,
        generateWinCombinations,
        getWinner,
        getWinningLine,
        isBoardFull,
        getEmptyIndices,
        findComputerMove,
        createGame
    };
})();
