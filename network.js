const Network = (() => {
    const { symbols, generateWinCombinations, getWinningLine, isBoardFull } = TicTacToe;
    const WIN_COMBINATIONS = generateWinCombinations(3, 3);
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let db = null;
    let roomRef = null;
    let listener = null;
    let playerId = null;
    let role = null;
    let roomCode = null;
    let onStateChange = null;
    let onError = null;
    let activeDisconnectMode = null;

    function isConfigured() {
        return Boolean(
            typeof firebaseConfig !== 'undefined' &&
            firebaseConfig.apiKey &&
            firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
            firebaseConfig.databaseURL &&
            !firebaseConfig.databaseURL.includes('YOUR_PROJECT')
        );
    }

    function init(stateCallback, errorCallback) {
        onStateChange = stateCallback;
        onError = errorCallback;

        if (!isConfigured()) {
            return false;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        db = firebase.database();
        return true;
    }

    function generateRoomCode() {
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        }
        return code;
    }

    function createInitialRoomData(hostId) {
        return {
            currentPlayer: 0,
            gameOver: false,
            winner: null,
            winningLine: null,
            hostId,
            guestId: null,
            status: 'waiting',
            endReason: null,
            disconnectedPlayer: null,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastMoveAt: null
        };
    }

    function getPlayerIndex(room) {
        if (!room || !playerId) return -1;
        if (room.hostId === playerId) return 0;
        if (room.guestId === playerId) return 1;
        return -1;
    }

    function normalizeIndexList(value, size = 9) {
        if (Array.isArray(value)) {
            return value.map(Number).filter(index => index >= 0 && index < size);
        }
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .map(Number)
                .filter(index => !Number.isNaN(index) && index >= 0 && index < size)
                .sort((a, b) => a - b);
        }
        return null;
    }

    function normalizeBoard(board, size = 9) {
        const normalized = Array(size).fill(null);

        if (Array.isArray(board)) {
            for (let i = 0; i < size; i++) {
                if (board[i] != null && board[i] !== '') {
                    normalized[i] = board[i];
                }
            }
            return normalized;
        }

        if (board && typeof board === 'object') {
            for (const [key, symbol] of Object.entries(board)) {
                const index = Number(key);
                if (!Number.isNaN(index) && index >= 0 && index < size && symbol != null && symbol !== '') {
                    normalized[index] = symbol;
                }
            }
        }

        return normalized;
    }

    function boardToFirebase(board) {
        const payload = {};
        for (let i = 0; i < board.length; i++) {
            if (board[i] != null) {
                payload[i] = board[i];
            }
        }
        return payload;
    }

    function normalizeRoom(room) {
        if (!room) return room;

        return {
            ...room,
            board: normalizeBoard(room.board),
            currentPlayer: Number(room.currentPlayer) || 0,
            winningLine: normalizeIndexList(room.winningLine)
        };
    }

    function setupListener() {
        if (!roomRef) return;

        listener = roomRef.on('value', snapshot => {
            const room = normalizeRoom(snapshot.val());
            if (room && onStateChange) {
                if (room.status === 'playing') {
                    refreshDisconnectHandler(room);
                }
                onStateChange(room);
            }
        }, error => {
            if (onError) onError(error.message || 'Connection error.');
        });
    }

    function winnerOnDisconnect(disconnectedRole) {
        return disconnectedRole === 'host' ? 'O' : 'X';
    }

    function setupDisconnectHandler() {
        if (!roomRef || !role) return;

        roomRef.onDisconnect().cancel();

        roomRef.onDisconnect().update({
            status: 'finished',
            gameOver: true,
            endReason: 'disconnect',
            disconnectedPlayer: role,
            winner: winnerOnDisconnect(role)
        });
    }

    function refreshDisconnectHandler(room) {
        if (!roomRef || !role || !room) return;

        const targetMode = room.status === 'waiting' && role === 'host'
            ? 'waiting-remove'
            : room.status === 'playing'
                ? 'playing'
                : null;

        if (targetMode === activeDisconnectMode) return;

        roomRef.onDisconnect().cancel();
        activeDisconnectMode = targetMode;

        if (targetMode === 'waiting-remove') {
            roomRef.onDisconnect().remove();
        } else if (targetMode === 'playing') {
            setupDisconnectHandler();
        }
    }

    function cleanup() {
        if (roomRef && listener) {
            roomRef.off('value', listener);
        }

        if (roomRef) {
            roomRef.onDisconnect().cancel();
        }

        roomRef = null;
        listener = null;
        playerId = null;
        role = null;
        roomCode = null;
        activeDisconnectMode = null;
    }

    async function createRoom() {
        if (!db) throw new Error('Firebase is not configured.');

        playerId = crypto.randomUUID();
        role = 'host';

        for (let attempt = 0; attempt < 10; attempt++) {
            const code = generateRoomCode();
            const ref = db.ref(`rooms/${code}`);
            const snapshot = await ref.once('value');

            if (snapshot.exists()) continue;

            roomCode = code;
            roomRef = ref;
            await ref.set(createInitialRoomData(playerId));
            refreshDisconnectHandler({ status: 'waiting' });
            setupListener();

            return { roomCode, playerId, role };
        }

        cleanup();
        throw new Error('Could not create a room. Please try again.');
    }

    async function joinRoom(code) {
        if (!db) throw new Error('Firebase is not configured.');

        const normalizedCode = code.trim().toUpperCase();
        if (normalizedCode.length !== 6) {
            throw new Error('Room code must be 6 characters.');
        }

        const ref = db.ref(`rooms/${normalizedCode}`);
        const snapshot = await ref.once('value');

        if (!snapshot.exists()) {
            throw new Error('Room not found.');
        }

        const room = snapshot.val();
        if (room.guestId) {
            throw new Error('Room is full.');
        }
        if (room.status === 'finished') {
            throw new Error('This game has already ended.');
        }

        playerId = crypto.randomUUID();
        role = 'guest';
        roomCode = normalizedCode;
        roomRef = ref;

        await ref.update({
            guestId: playerId,
            status: 'playing'
        });

        refreshDisconnectHandler({ status: 'playing' });
        setupListener();

        return { roomCode: normalizedCode, playerId, role };
    }

    async function sendMove(cellIndex) {
        if (!roomRef || !playerId) {
            throw new Error('Not connected to a room.');
        }

        const result = await roomRef.transaction(current => {
            if (!current || current.gameOver || current.status !== 'playing') {
                return;
            }

            const normalized = normalizeRoom(current);
            const playerIndex = getPlayerIndex(normalized);
            if (playerIndex < 0 || normalized.currentPlayer !== playerIndex) {
                return;
            }

            if (normalized.board[cellIndex] !== null) {
                return;
            }

            const board = normalized.board.slice();
            const symbol = symbols[playerIndex];
            board[cellIndex] = symbol;

            const winningLine = getWinningLine(board, WIN_COMBINATIONS);
            if (winningLine) {
                return {
                    ...normalized,
                    board: boardToFirebase(board),
                    gameOver: true,
                    winner: symbol,
                    winningLine,
                    endReason: 'win',
                    status: 'finished',
                    lastMoveAt: Date.now()
                };
            }

            if (isBoardFull(board)) {
                return {
                    ...normalized,
                    board: boardToFirebase(board),
                    gameOver: true,
                    winner: 'draw',
                    winningLine: null,
                    endReason: 'draw',
                    status: 'finished',
                    lastMoveAt: Date.now()
                };
            }

            return {
                ...normalized,
                board: boardToFirebase(board),
                currentPlayer: playerIndex === 0 ? 1 : 0,
                lastMoveAt: Date.now()
            };
        });

        return result.committed;
    }

    async function resetRoom() {
        if (!roomRef || role !== 'host') {
            throw new Error('Only the host can start a new game.');
        }

        const result = await roomRef.transaction(current => {
            if (!current || current.hostId !== playerId) {
                return;
            }

            const nextRoom = createInitialRoomData(playerId);
            nextRoom.guestId = current.guestId;
            nextRoom.status = current.guestId ? 'playing' : 'waiting';
            return nextRoom;
        });

        if (!result.committed) {
            throw new Error('Could not start a new game.');
        }
    }

    async function leaveRoom() {
        if (!roomRef || !playerId) {
            cleanup();
            return;
        }

        await roomRef.onDisconnect().cancel();

        const snapshot = await roomRef.once('value');
        const room = snapshot.val();

        if (room && !room.gameOver && room.status === 'playing') {
            await roomRef.update({
                status: 'finished',
                gameOver: true,
                endReason: 'disconnect',
                disconnectedPlayer: role,
                winner: winnerOnDisconnect(role)
            });
        } else if (room && room.status === 'waiting' && role === 'host') {
            await roomRef.remove();
        }

        cleanup();
    }

    function isInRoom() {
        return Boolean(roomRef && roomCode);
    }

    function getRoomCode() {
        return roomCode;
    }

    return {
        init,
        isConfigured,
        createRoom,
        joinRoom,
        sendMove,
        resetRoom,
        leaveRoom,
        getRoomCode,
        isInRoom
    };
})();
