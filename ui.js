(() => {
    const {
        symbols,
        HUMAN,
        COMPUTER,
        SERIES_TARGET,
        getWinningLine,
        isBoardFull,
        findComputerMove,
        createGame
    } = TicTacToe;

    const gameEl = document.querySelector('.game');
    const boardWrap = document.querySelector('.board-wrap');
    const winLineSvg = document.getElementById('win-line');
    const statusEl = document.getElementById('status');
    const seriesEl = document.getElementById('series-score');
    const restartBtn = document.getElementById('restart-btn');
    const undoBtn = document.getElementById('undo-btn');
    const resetScoresBtn = document.getElementById('reset-scores-btn');
    const mode2pBtn = document.getElementById('mode-2p');
    const modeAiBtn = document.getElementById('mode-ai');
    const modeOnlineBtn = document.getElementById('mode-online');
    const difficultySelect = document.getElementById('difficulty');
    const boardSizeSelect = document.getElementById('board-size');
    const tournamentBtn = document.getElementById('tournament-btn');
    const themeBtn = document.getElementById('theme-btn');
    const muteBtn = document.getElementById('mute-btn');
    const scoreXEl = document.getElementById('score-x');
    const scoreOEl = document.getElementById('score-o');
    const scoreDrawsEl = document.getElementById('score-draws');
    const aiControls = document.getElementById('ai-controls');
    const onlineLobby = document.getElementById('online-lobby');
    const onlineSetup = document.getElementById('online-setup');
    const onlineActive = document.getElementById('online-active');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const lobbyStatusEl = document.getElementById('lobby-status');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const onlineErrorEl = document.getElementById('online-error');
    const scoreboardEl = document.querySelector('.scoreboard');

    let state = createGame(3);
    let cells = [];
    let scores = loadScores();
    let sessionScores = { x: 0, o: 0, draws: 0 };
    let muted = loadMuted();
    let theme = loadTheme();
    let audioCtx = null;

    let onlineMode = false;
    let onlineRole = null;
    let roomStatus = null;
    let inOnlineRoom = false;
    let applyingRemote = false;
    let pendingOnlineMove = false;

    function loadScores() {
        try {
            const saved = localStorage.getItem('xoxo-scores');
            if (saved) return JSON.parse(saved);
        } catch (_) {}
        return { x: 0, o: 0, draws: 0 };
    }

    function saveScores() {
        if (!onlineMode) {
            localStorage.setItem('xoxo-scores', JSON.stringify(scores));
        }
    }

    function loadTheme() {
        return localStorage.getItem('xoxo-theme') || 'dark';
    }

    function saveTheme() {
        localStorage.setItem('xoxo-theme', theme);
    }

    function loadMuted() {
        return localStorage.getItem('xoxo-muted') === 'true';
    }

    function saveMuted() {
        localStorage.setItem('xoxo-muted', String(muted));
    }

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playTone(frequency, duration, type = 'sine', volume = 0.08) {
        if (muted) return;
        try {
            const ctx = getAudioContext();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = type;
            oscillator.frequency.value = frequency;
            gain.gain.value = volume;
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + duration);
        } catch (_) {}
    }

    function playMoveSound() {
        playTone(440, 0.08, 'triangle');
    }

    function playWinSound() {
        playTone(523, 0.12);
        setTimeout(() => playTone(659, 0.12), 100);
        setTimeout(() => playTone(784, 0.18), 200);
    }

    function playDrawSound() {
        playTone(330, 0.2, 'square', 0.05);
    }

    function setStatus(message) {
        statusEl.textContent = message;
    }

    function showOnlineError(message) {
        if (!message) {
            onlineErrorEl.textContent = '';
            onlineErrorEl.classList.add('hidden');
            return;
        }
        onlineErrorEl.textContent = message;
        onlineErrorEl.classList.remove('hidden');
    }

    function getActiveScores() {
        return onlineMode ? sessionScores : scores;
    }

    function updateScoreboard() {
        const activeScores = getActiveScores();
        scoreXEl.textContent = `X: ${activeScores.x}`;
        scoreOEl.textContent = `O: ${activeScores.o}`;
        scoreDrawsEl.textContent = `Draws: ${activeScores.draws}`;
    }

    function updateSeriesDisplay() {
        if (!state.tournament || onlineMode) {
            seriesEl.classList.add('hidden');
            return;
        }
        seriesEl.classList.remove('hidden');
        seriesEl.textContent = `Series (best of ${SERIES_TARGET * 2 - 1}): X ${state.seriesWins.x} – O ${state.seriesWins.o}`;
    }

    function getOnlinePlayerIndex() {
        return onlineRole === 'host' ? HUMAN : COMPUTER;
    }

    function isMyOnlineTurn() {
        return onlineMode && inOnlineRoom && roomStatus === 'playing' &&
            Number(state.currentPlayer) === getOnlinePlayerIndex();
    }

    function updateUndoButton() {
        undoBtn.disabled = state.gameOver || state.moveHistory.length === 0 || state.vsComputer || onlineMode;
    }

    function updateOnlineControls() {
        const disableLocalOptions = onlineMode;
        boardSizeSelect.disabled = disableLocalOptions;
        tournamentBtn.disabled = disableLocalOptions;
        resetScoresBtn.disabled = onlineMode;

        onlineLobby.classList.toggle('hidden', !onlineMode);
        scoreboardEl.classList.toggle('hidden', onlineMode && !inOnlineRoom);

        if (onlineMode) {
            aiControls.classList.add('hidden');
            const networkConfigured = Network.isConfigured();
            createRoomBtn.disabled = !networkConfigured;
            joinRoomBtn.disabled = !networkConfigured;
        } else {
            updateAiControls();
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
        }
    }

    function updateAiControls() {
        const showAi = state.vsComputer && !onlineMode;
        aiControls.classList.toggle('hidden', !showAi);

        const hardOption = difficultySelect.querySelector('option[value="hard"]');
        if (state.size > 3) {
            hardOption.disabled = true;
            if (state.difficulty === 'hard') {
                state.difficulty = 'medium';
                difficultySelect.value = 'medium';
            }
        } else {
            hardOption.disabled = false;
        }
    }

    function updateLobbyUi() {
        if (!onlineMode) return;

        onlineSetup.classList.toggle('hidden', inOnlineRoom);
        onlineActive.classList.toggle('hidden', !inOnlineRoom);

        if (inOnlineRoom) {
            roomCodeDisplay.textContent = Network.getRoomCode() || '';
        }

        if (!inOnlineRoom) {
            lobbyStatusEl.textContent = Network.isConfigured()
                ? 'Create a room or join with a code.'
                : 'Add your Firebase config in firebase-config.js first.';
            return;
        }

        if (roomStatus === 'waiting') {
            lobbyStatusEl.textContent = onlineRole === 'host'
                ? 'Waiting for opponent to join...'
                : 'Connecting...';
        } else if (roomStatus === 'playing') {
            lobbyStatusEl.textContent = 'Game in progress';
        } else if (roomStatus === 'finished') {
            lobbyStatusEl.textContent = 'Game finished';
        }
    }

    function setBoardInteractionEnabled(enabled) {
        cells.forEach((cell, index) => {
            const canPlay = enabled && state.board[index] == null;
            cell.classList.toggle('disabled', !canPlay);
        });
    }

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', theme);
        themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }

    function applyMuteButton() {
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.setAttribute('aria-label', muted ? 'Unmute sounds' : 'Mute sounds');
        muteBtn.classList.toggle('active', !muted);
    }

    function buildBoard() {
        gameEl.innerHTML = '';
        cells = [];
        gameEl.className = `game size-${state.size}`;
        hideWinLine();

        for (let i = 0; i < state.board.length; i++) {
            const cell = document.createElement('div');
            cell.classList.add('box');
            cell.dataset.index = i;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('tabindex', '0');
            cell.setAttribute('aria-label', `Cell ${i + 1}, empty`);
            cell.addEventListener('click', handleClick);
            cell.addEventListener('keydown', handleKeydown);
            cells.push(cell);
            gameEl.appendChild(cell);
        }
    }

    function hideWinLine() {
        winLineSvg.classList.remove('visible');
        winLineSvg.innerHTML = '';
    }

    function drawWinLine(winningLine) {
        if (!winningLine || winningLine.length < 2) return;

        const wrapRect = boardWrap.getBoundingClientRect();
        const firstRect = cells[winningLine[0]].getBoundingClientRect();
        const lastRect = cells[winningLine[winningLine.length - 1]].getBoundingClientRect();

        const x1 = firstRect.left + firstRect.width / 2 - wrapRect.left;
        const y1 = firstRect.top + firstRect.height / 2 - wrapRect.top;
        const x2 = lastRect.left + lastRect.width / 2 - wrapRect.left;
        const y2 = lastRect.top + lastRect.height / 2 - wrapRect.top;

        winLineSvg.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);
        winLineSvg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
        winLineSvg.classList.add('visible');
    }

    function renderCell(index, symbol) {
        const cell = cells[index];
        if (!symbol) {
            cell.textContent = '';
            cell.classList.remove('taken', 'winner', 'x', 'o');
            cell.setAttribute('aria-label', `Cell ${index + 1}, empty`);
            return;
        }

        cell.textContent = symbol;
        cell.classList.add('taken', symbol.toLowerCase());
        cell.classList.remove('winner', 'x', 'o');
        cell.classList.add(symbol.toLowerCase());
        cell.setAttribute('aria-label', `Cell ${index + 1}, ${symbol}`);
    }

    function placeMove(index, player, options = {}) {
        const { trackHistory = true, playSound = true } = options;
        const symbol = symbols[player];
        state.board[index] = symbol;
        renderCell(index, symbol);

        if (trackHistory) {
            state.moveHistory.push({ index, player });
        }

        state.currentPlayer = player;
        if (playSound) playMoveSound();
    }

    function clearCell(index) {
        state.board[index] = null;
        renderCell(index, null);
    }

    function handleKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        handleClick({ target: e.target });
    }

    function handleClick(e) {
        if (state.gameOver || pendingOnlineMove) return;

        const cell = e.target;
        const index = Number(cell.dataset.index);

        if (state.board[index] != null) return;
        if (state.vsComputer && state.currentPlayer === COMPUTER) return;
        if (onlineMode) {
            if (!inOnlineRoom || roomStatus !== 'playing') return;
            if (!isMyOnlineTurn()) return;
            requestOnlineMove(index);
            return;
        }

        makeMove(index);
    }

    async function requestOnlineMove(index) {
        pendingOnlineMove = true;
        setBoardInteractionEnabled(false);
        showOnlineError('');

        try {
            const committed = await Network.sendMove(index);
            if (!committed) {
                setBoardInteractionEnabled(isMyOnlineTurn() && !state.gameOver && roomStatus === 'playing');
            }
        } catch (error) {
            showOnlineError(error.message || 'Move failed.');
            setBoardInteractionEnabled(!state.gameOver && roomStatus === 'playing');
        } finally {
            pendingOnlineMove = false;
        }
    }

    function makeMove(index) {
        const player = state.currentPlayer;
        placeMove(index, player);

        const winningLine = getWinningLine(state.board, state.winCombinations);
        if (winningLine) {
            endGame('win', winningLine);
            return;
        }

        if (isBoardFull(state.board)) {
            endGame('draw');
            return;
        }

        state.currentPlayer = player === HUMAN ? COMPUTER : HUMAN;
        updateStatusForTurn();
        updateUndoButton();

        if (state.vsComputer && state.currentPlayer === COMPUTER && !state.gameOver) {
            setTimeout(computerMove, 350);
        }
    }

    function updateStatusForTurn() {
        if (onlineMode) {
            if (!inOnlineRoom) {
                setStatus('Create or join a room to play online.');
                return;
            }
            if (roomStatus === 'waiting') {
                setStatus(onlineRole === 'host' ? 'Waiting for opponent...' : 'Connecting...');
                return;
            }
            if (state.gameOver) return;
            if (isMyOnlineTurn()) {
                setStatus(`Your turn (${symbols[getOnlinePlayerIndex()]})`);
            } else {
                setStatus("Opponent's turn...");
            }
            return;
        }

        if (state.vsComputer) {
            setStatus(state.currentPlayer === HUMAN ? 'Your turn (X)' : 'Computer is thinking...');
        } else {
            setStatus(`Player ${symbols[state.currentPlayer]}'s turn`);
        }
    }

    function computerMove() {
        if (state.gameOver) return;
        const index = findComputerMove(state.board, state.difficulty, state.winCombinations, state.size);
        if (index !== null) makeMove(index);
    }

    function endGame(result, winningLine = null, options = {}) {
        const { skipScoreSave = false, endReason = null } = options;
        state.gameOver = true;
        cells.forEach(cell => cell.classList.add('disabled'));

        const activeScores = getActiveScores();

        if (result === 'win') {
            const winner = symbols[state.currentPlayer];
            winningLine.forEach(index => cells[index].classList.add('winner'));
            drawWinLine(winningLine);
            playWinSound();

            if (onlineMode) {
                if (endReason === 'disconnect') {
                    const mySymbol = symbols[getOnlinePlayerIndex()];
                    setStatus(winner === mySymbol ? 'Opponent left — you win!' : 'You left the game.');
                } else {
                    const mySymbol = symbols[getOnlinePlayerIndex()];
                    setStatus(winner === mySymbol ? 'You win!' : 'Opponent wins!');
                }
            } else if (state.vsComputer) {
                setStatus(winner === 'X' ? 'You win!' : 'Computer wins!');
            } else {
                setStatus(`Player ${winner} wins!`);
            }

            if (winner === 'X') activeScores.x++;
            else activeScores.o++;

            if (state.tournament && !onlineMode) {
                if (winner === 'X') state.seriesWins.x++;
                else state.seriesWins.o++;

                if (state.seriesWins.x >= SERIES_TARGET || state.seriesWins.o >= SERIES_TARGET) {
                    const seriesWinner = state.seriesWins.x >= SERIES_TARGET ? 'X' : 'O';
                    setStatus(`${state.vsComputer && seriesWinner === 'O' ? 'Computer' : 'Player ' + seriesWinner} wins the series!`);
                    state.seriesWins = { x: 0, o: 0 };
                }
            }
        } else {
            setStatus(endReason === 'disconnect' ? 'Game ended.' : "It's a draw!");
            activeScores.draws++;
            playDrawSound();
        }

        if (!skipScoreSave) {
            saveScores();
            updateScoreboard();
        }
        updateSeriesDisplay();
        updateUndoButton();
        updateLobbyUi();
    }

    function resetBoard() {
        state.board.fill(null);
        state.moveHistory.length = 0;
        state.gameOver = false;
        state.currentPlayer = HUMAN;
        hideWinLine();

        cells.forEach((cell, i) => {
            cell.textContent = '';
            cell.classList.remove('taken', 'disabled', 'winner', 'x', 'o');
            cell.setAttribute('aria-label', `Cell ${i + 1}, empty`);
        });

        updateStatusForTurn();
        updateUndoButton();

        if (onlineMode) {
            setBoardInteractionEnabled(inOnlineRoom && roomStatus === 'playing');
        }
    }

    async function resetGame() {
        if (onlineMode && inOnlineRoom) {
            if (state.gameOver && onlineRole === 'host') {
                showOnlineError('');
                try {
                    await Network.resetRoom();
                } catch (error) {
                    showOnlineError(error.message || 'Could not start a new game.');
                }
                return;
            }
            if (!state.gameOver) return;
            showOnlineError('Only the host can start a new online game.');
            return;
        }

        resetBoard();
    }

    function undoMove() {
        if (state.gameOver || state.moveHistory.length === 0 || state.vsComputer || onlineMode) return;

        const last = state.moveHistory.pop();
        clearCell(last.index);
        state.currentPlayer = last.player;
        updateStatusForTurn();
        updateUndoButton();
    }

    function applyRemoteState(room) {
        if (!Network.isInRoom() || applyingRemote) return;

        applyingRemote = true;
        try {
            const board = room.board;
            const wasGameOver = state.gameOver;
            const previousBoard = state.board.slice();
            if (room.guestId && room.status === 'waiting') {
                room.status = 'playing';
            }
            roomStatus = room.status;
            board.forEach((symbol, index) => {
                if (symbol !== previousBoard[index]) renderCell(index, symbol);
            });
            const newMoves = board.filter((symbol, index) => symbol && !previousBoard[index]).length;
            if (newMoves > 0 && !room.gameOver) playMoveSound();
            state.board = board.slice();
            state.currentPlayer = Number(room.currentPlayer) || 0;
            state.gameOver = Boolean(room.gameOver);
            if (room.gameOver) {
                cells.forEach(cell => cell.classList.add('disabled'));
                if (room.winningLine) {
                    room.winningLine.forEach(index => cells[index].classList.add('winner'));
                    drawWinLine(room.winningLine);
                }
                if (!wasGameOver) {
                    if (room.winner === 'draw') {
                        sessionScores.draws++;
                        setStatus(room.endReason === 'disconnect' ? 'Game ended.' : "It's a draw!");
                        playDrawSound();
                    } else {
                        if (room.winner === 'X') sessionScores.x++;
                        else sessionScores.o++;
                        playWinSound();
                        const mySymbol = symbols[getOnlinePlayerIndex()];
                        if (room.endReason === 'disconnect') {
                            setStatus(room.winner === mySymbol ? 'Opponent left — you win!' : 'You disconnected.');
                        } else {
                            setStatus(room.winner === mySymbol ? 'You win!' : 'Opponent wins!');
                        }
                    }
                    updateScoreboard();
                }
            } else {
                hideWinLine();
                cells.forEach(cell => cell.classList.remove('winner', 'disabled'));
                setBoardInteractionEnabled(room.status === 'playing' && isMyOnlineTurn());
                updateStatusForTurn();
            }

            updateLobbyUi();
            updateUndoButton();
        } finally {
            applyingRemote = false;
        }
    }

    async function leaveOnlineRoom() {
        showOnlineError('');
        await Network.leaveRoom();
        inOnlineRoom = false;
        onlineRole = null;
        roomStatus = null;
        sessionScores = { x: 0, o: 0, draws: 0 };
        resetBoard();
        updateScoreboard();
        updateLobbyUi();
        updateOnlineControls();
        updateStatusForTurn();
    }

    async function handleCreateRoom() {
        showOnlineError('');
        createRoomBtn.disabled = true;
        joinRoomBtn.disabled = true;

        try {
            const result = await Network.createRoom();
            onlineRole = result.role;
            inOnlineRoom = true;
            roomStatus = 'waiting';
            resetBoard();
            updateScoreboard();
            updateLobbyUi();
            updateOnlineControls();
            updateStatusForTurn();
            setBoardInteractionEnabled(false);
        } catch (error) {
            showOnlineError(error.message || 'Could not create room.');
        } finally {
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
        }
    }

    async function handleJoinRoom() {
        showOnlineError('');
        createRoomBtn.disabled = true;
        joinRoomBtn.disabled = true;

        try {
            const result = await Network.joinRoom(roomCodeInput.value);
            onlineRole = result.role;
            inOnlineRoom = true;
            roomStatus = 'playing';
            resetBoard();
            updateScoreboard();
            updateLobbyUi();
            updateOnlineControls();
            updateStatusForTurn();
        } catch (error) {
            showOnlineError(error.message || 'Could not join room.');
        } finally {
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
        }
    }

    async function handleCopyCode() {
        const code = Network.getRoomCode();
        if (!code) return;

        try {
            await navigator.clipboard.writeText(code);
            lobbyStatusEl.textContent = 'Room code copied!';
            setTimeout(updateLobbyUi, 1500);
        } catch (_) {
            showOnlineError('Could not copy room code.');
        }
    }

    function setMode(mode) {
        const previousOnline = onlineMode;

        onlineMode = mode === 'online';
        state.vsComputer = mode === 'ai';

        mode2pBtn.classList.toggle('active', mode === 'local');
        mode2pBtn.setAttribute('aria-pressed', String(mode === 'local'));
        modeAiBtn.classList.toggle('active', mode === 'ai');
        modeAiBtn.setAttribute('aria-pressed', String(mode === 'ai'));
        modeOnlineBtn.classList.toggle('active', onlineMode);
        modeOnlineBtn.setAttribute('aria-pressed', String(onlineMode));

        if (previousOnline && mode !== 'online') {
            Network.leaveRoom();
            inOnlineRoom = false;
            onlineRole = null;
            roomStatus = null;
            sessionScores = { x: 0, o: 0, draws: 0 };
            showOnlineError('');
        }

        if (onlineMode) {
            state = createGame(3);
            state.tournament = false;
            tournamentBtn.classList.remove('active');
            tournamentBtn.setAttribute('aria-pressed', 'false');
            boardSizeSelect.value = '3';
            buildBoard();
        }

        updateAiControls();
        updateOnlineControls();
        updateSeriesDisplay();
        resetBoard();
        updateScoreboard();
        updateLobbyUi();
        updateStatusForTurn();
    }

    function setBoardSize(size) {
        if (onlineMode) return;

        const vsComputer = state.vsComputer;
        const difficulty = difficultySelect.value;
        const tournament = state.tournament;
        const seriesWins = { ...state.seriesWins };

        state = createGame(Number(size));
        state.vsComputer = vsComputer;
        state.difficulty = difficulty;
        state.tournament = tournament;
        state.seriesWins = seriesWins;

        buildBoard();
        updateAiControls();
        updateSeriesDisplay();
        resetBoard();
    }

    function toggleTournament() {
        if (onlineMode) return;

        state.tournament = !state.tournament;
        tournamentBtn.classList.toggle('active', state.tournament);
        tournamentBtn.setAttribute('aria-pressed', String(state.tournament));
        state.seriesWins = { x: 0, o: 0 };
        updateSeriesDisplay();
        resetBoard();
    }

    function resetScores() {
        if (onlineMode) return;

        scores = { x: 0, o: 0, draws: 0 };
        saveScores();
        updateScoreboard();
    }

    function toggleTheme() {
        theme = theme === 'dark' ? 'light' : 'dark';
        saveTheme();
        applyTheme();
    }

    function toggleMute() {
        muted = !muted;
        saveMuted();
        applyMuteButton();
        if (!muted) playMoveSound();
    }

    restartBtn.addEventListener('click', resetGame);
    undoBtn.addEventListener('click', undoMove);
    resetScoresBtn.addEventListener('click', resetScores);
    mode2pBtn.addEventListener('click', () => setMode('local'));
    modeAiBtn.addEventListener('click', () => setMode('ai'));
    modeOnlineBtn.addEventListener('click', () => setMode('online'));
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    leaveRoomBtn.addEventListener('click', leaveOnlineRoom);
    copyCodeBtn.addEventListener('click', handleCopyCode);
    roomCodeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleJoinRoom();
    });
    difficultySelect.addEventListener('change', () => {
        state.difficulty = difficultySelect.value;
    });
    boardSizeSelect.addEventListener('change', () => setBoardSize(boardSizeSelect.value));
    tournamentBtn.addEventListener('click', toggleTournament);
    themeBtn.addEventListener('click', toggleTheme);
    muteBtn.addEventListener('click', toggleMute);

    window.addEventListener('resize', () => {
        if (state.gameOver) {
            const winningLine = getWinningLine(state.board, state.winCombinations);
            if (winningLine) drawWinLine(winningLine);
        }
    });

    Network.init(
        room => applyRemoteState(room),
        message => showOnlineError(message)
    );

    applyTheme();
    applyMuteButton();
    buildBoard();
    updateScoreboard();
    updateSeriesDisplay();
    updateAiControls();
    updateOnlineControls();
    updateUndoButton();
    updateStatusForTurn();
    updateLobbyUi();
})();

