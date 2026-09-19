// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Fraude sur le RER B — survival edition (Monad Blitz Paris).
/// @notice Players pay a small MON stake to board the train. Each station everyone secretly
///         picks a wagon (choices are public as the wagon fills, but ROLES stay hidden). Hidden
///         CONTRÔLEURS ride too — everyone sharing a wagon with a contrôleur is ELIMINATED. A
///         contrôleur who catches nobody two stations in a row is eliminated. Survivors split the
///         whole pot at Aéroport CDG.
/// @dev    Roles are committed at start and only revealed at `settle`, where the contract itself
///         recomputes the entire elimination sequence from the public boarding history and pays
///         out — so payouts are trustless and roles are truly hidden during play. Bounded to 64
///         players / 8 wagons / 10 stations.
contract RERBSurvival {
    // ---------------------------------------------------------------- types
    enum Role {
        NONE, // 0
        FRAUDEUR, // 1  a passenger trying to survive
        CONTROLEUR // 2  eliminates everyone in their wagon
    }

    struct Game {
        address creator;
        uint8 numWagons;
        uint8 wagonCap;
        uint8 numControllers;
        uint8 numStations;
        uint32 boardDuration; // seconds to pick a wagon
        uint64 startedAt; // 0 until start
        bool started;
        bool settled;
        uint8 playerCount;
        uint128 entryFee;
        uint128 pot;
    }

    struct Player {
        bool exists;
        uint8 index;
        Role role; // set publicly only at settle
        bytes32 roleCommit; // set at startGame
        string nickname;
    }

    struct Board {
        bool boarded;
        uint8 wagon;
    }

    // ---------------------------------------------------------------- constants
    uint8 public constant MAX_PLAYERS = 40;
    uint8 public constant MAX_WAGONS = 20;
    uint8 public constant MAX_STATIONS = 10;
    uint8 public constant MAX_CAP = 20;
    uint32 public constant REVEAL_BUFFER = 10; // seconds of reveal/elimination before the next station

    // ---------------------------------------------------------------- storage
    uint256 public gameCount;
    mapping(uint256 => Game) public games;
    mapping(uint256 => address[]) internal _players;
    mapping(uint256 => mapping(address => Player)) internal _player;
    // gameId => station => player => board
    mapping(uint256 => mapping(uint8 => mapping(address => Board))) internal _board;
    // gameId => station => wagon => live count (for the "wagon full" rule + display)
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint16))) public wagonCount;
    // final results (set at settle)
    mapping(uint256 => mapping(address => bool)) public eliminated;
    mapping(uint256 => address[]) internal _survivors;
    mapping(uint256 => uint256) public payoutPerSurvivor;

    // ---------------------------------------------------------------- events
    event GameCreated(uint256 indexed gameId, address indexed creator, uint8 numWagons, uint8 numStations, uint128 entryFee);
    event PlayerJoined(uint256 indexed gameId, address indexed player, string nickname, uint8 index);
    event GameStarted(uint256 indexed gameId, uint64 startedAt, uint8 numControllers, uint32 stationDuration);
    event Boarded(uint256 indexed gameId, address indexed player, uint8 indexed station, uint8 wagon);
    event GameSettled(uint256 indexed gameId, address[] survivors, uint256 payoutPerSurvivor, uint256 pot);

    // ---------------------------------------------------------------- errors
    error NotCreator();
    error AlreadyStarted();
    error NotStarted();
    error AlreadySettled();
    error TooManyPlayers();
    error AlreadyJoined();
    error NotAPlayer();
    error WrongFee();
    error NotBoardingWindow();
    error InvalidWagon();
    error WagonFull();
    error InvalidParams();
    error GameNotOver();
    error LengthMismatch();
    error BadRoleProof();
    error NotEnoughPlayers();
    error TransferFailed();

    modifier onlyCreator(uint256 gameId) {
        if (msg.sender != games[gameId].creator) revert NotCreator();
        _;
    }

    // ---------------------------------------------------------------- create / join / start
    function createGame(
        uint8 numWagons,
        uint8 wagonCap,
        uint8 numControllers,
        uint8 numStations,
        uint32 boardDuration,
        uint128 entryFee
    ) external returns (uint256 gameId) {
        if (numWagons < 2 || numWagons > MAX_WAGONS) revert InvalidParams();
        if (wagonCap < 1 || wagonCap > MAX_CAP) revert InvalidParams();
        if (numControllers < 1) revert InvalidParams();
        if (numStations < 1 || numStations > MAX_STATIONS) revert InvalidParams();
        if (boardDuration < 5 || boardDuration > 120) revert InvalidParams();

        gameId = ++gameCount;
        Game storage g = games[gameId];
        g.creator = msg.sender;
        g.numWagons = numWagons;
        g.wagonCap = wagonCap;
        g.numControllers = numControllers;
        g.numStations = numStations;
        g.boardDuration = boardDuration;
        g.entryFee = entryFee;
        emit GameCreated(gameId, msg.sender, numWagons, numStations, entryFee);
    }

    /// @notice Registration cap for a game: at most 3 players per wagon (never above MAX_PLAYERS).
    function maxPlayers(uint256 gameId) public view returns (uint16) {
        uint16 cap = uint16(games[gameId].numWagons) * 3;
        return cap > MAX_PLAYERS ? MAX_PLAYERS : cap;
    }

    /// @notice Pay the stake and board the train's waiting list. Callable before start only.
    function join(uint256 gameId, string calldata nick) external payable {
        Game storage g = games[gameId];
        if (g.creator == address(0)) revert InvalidParams();
        if (g.started) revert AlreadyStarted();
        if (g.playerCount >= maxPlayers(gameId)) revert TooManyPlayers();
        if (_player[gameId][msg.sender].exists) revert AlreadyJoined();
        if (msg.value != g.entryFee) revert WrongFee();

        uint8 idx = g.playerCount;
        _player[gameId][msg.sender] =
            Player({ exists: true, index: idx, role: Role.NONE, roleCommit: bytes32(0), nickname: nick });
        _players[gameId].push(msg.sender);
        g.playerCount = idx + 1;
        g.pot += uint128(msg.value);
        emit PlayerJoined(gameId, msg.sender, nick, idx);
    }

    /// @notice Start the game. Creator supplies a role commitment per player (same order as
    ///         getPlayers), fixing the hidden roles. `roleCommit = keccak256(player, role, salt, gameId)`.
    function startGame(uint256 gameId, bytes32[] calldata roleCommits) external onlyCreator(gameId) {
        Game storage g = games[gameId];
        if (g.started) revert AlreadyStarted();
        address[] storage pl = _players[gameId];
        if (pl.length < 2 || g.numControllers >= pl.length) revert NotEnoughPlayers();
        if (roleCommits.length != pl.length) revert LengthMismatch();

        for (uint256 i = 0; i < pl.length; ++i) {
            _player[gameId][pl[i]].roleCommit = roleCommits[i];
        }
        g.started = true;
        g.startedAt = uint64(block.timestamp);
        emit GameStarted(gameId, g.startedAt, g.numControllers, _stationDuration(g));
    }

    // ---------------------------------------------------------------- board
    /// @notice Pick (or change) your wagon during a station's boarding window.
    function board(uint256 gameId, uint8 station, uint8 wagon) external {
        Game storage g = games[gameId];
        if (!g.started) revert NotStarted();
        if (g.settled) revert AlreadySettled();
        if (station >= g.numStations) revert InvalidParams();
        if (wagon >= g.numWagons) revert InvalidWagon();
        if (!_player[gameId][msg.sender].exists) revert NotAPlayer();

        (uint256 bStart, uint256 bEnd) = _boardWindow(g, station);
        if (block.timestamp < bStart || block.timestamp >= bEnd) revert NotBoardingWindow();

        Board storage b = _board[gameId][station][msg.sender];
        if (b.boarded && b.wagon == wagon) return; // no-op
        if (wagonCount[gameId][station][wagon] >= g.wagonCap) revert WagonFull();

        if (b.boarded) {
            wagonCount[gameId][station][b.wagon] -= 1; // leave old wagon
        }
        b.boarded = true;
        b.wagon = wagon;
        wagonCount[gameId][station][wagon] += 1;
        emit Boarded(gameId, msg.sender, station, wagon);
    }

    // ---------------------------------------------------------------- settle
    /// @notice After the last station: reveal roles, recompute eliminations, pay the pot.
    ///         Permissionless, but valid `roleSalts` are needed (only the game master knows them).
    function settle(uint256 gameId, Role[] calldata roles, bytes32[] calldata roleSalts) external {
        Game storage g = games[gameId];
        if (!g.started) revert NotStarted();
        if (g.settled) revert AlreadySettled();

        address[] storage pl = _players[gameId];
        uint256 n = pl.length;
        if (roles.length != n || roleSalts.length != n) revert LengthMismatch();

        // verify + store roles
        for (uint256 i = 0; i < n; ++i) {
            bytes32 rc = keccak256(abi.encode(pl[i], roles[i], roleSalts[i], gameId));
            if (rc != _player[gameId][pl[i]].roleCommit) revert BadRoleProof();
            _player[gameId][pl[i]].role = roles[i];
        }

        // only stations whose boarding window has closed are "played" (lets the game settle
        // as soon as a side is wiped, without waiting for the full schedule)
        uint8 played;
        for (uint8 s = 0; s < g.numStations; ++s) {
            (, uint256 bEnd) = _boardWindow(g, s);
            if (block.timestamp >= bEnd) played += 1;
        }

        // recompute eliminations, stopping the instant one side is wiped out
        bool[] memory alive = new bool[](n);
        uint8[] memory strikes = new uint8[](n);
        for (uint256 i = 0; i < n; ++i) alive[i] = true;

        bool decided = false;
        for (uint8 s = 0; s < played; ++s) {
            uint8[] memory wagonOf = new uint8[](n);
            uint16[] memory ctrlIn = new uint16[](g.numWagons);
            uint16[] memory fraudIn = new uint16[](g.numWagons);

            for (uint256 i = 0; i < n; ++i) {
                if (!alive[i]) continue;
                Board storage b = _board[gameId][s][pl[i]];
                uint8 w = b.boarded ? b.wagon : uint8(uint256(keccak256(abi.encode(gameId, s, pl[i]))) % g.numWagons);
                wagonOf[i] = w;
                if (roles[i] == Role.CONTROLEUR) ctrlIn[w] += 1;
                else fraudIn[w] += 1;
            }
            // fraudeurs caught in a controlled wagon
            for (uint256 i = 0; i < n; ++i) {
                if (alive[i] && roles[i] != Role.CONTROLEUR && ctrlIn[wagonOf[i]] > 0) alive[i] = false;
            }
            // idle-controller rule (2 lonely stations in a row)
            for (uint256 i = 0; i < n; ++i) {
                if (alive[i] && roles[i] == Role.CONTROLEUR) {
                    if (fraudIn[wagonOf[i]] == 0) {
                        strikes[i] += 1;
                        if (strikes[i] >= 2) alive[i] = false;
                    } else {
                        strikes[i] = 0;
                    }
                }
            }
            // stop if one side has been wiped out — the survivors are the winners
            uint256 aliveCtrl;
            uint256 aliveFraud;
            for (uint256 i = 0; i < n; ++i) {
                if (!alive[i]) continue;
                if (roles[i] == Role.CONTROLEUR) aliveCtrl += 1;
                else aliveFraud += 1;
            }
            if (aliveCtrl == 0 || aliveFraud == 0) {
                decided = true;
                break;
            }
        }

        // must be either fully played out, or decided (one side eliminated)
        if (!decided && played < g.numStations) revert GameNotOver();

        // tally survivors
        uint256 ns;
        for (uint256 i = 0; i < n; ++i) {
            if (alive[i]) ns += 1;
            else eliminated[gameId][pl[i]] = true;
        }

        g.settled = true;
        uint256 pot = g.pot;

        if (ns == 0) {
            // nobody survived → refund each stake
            uint256 fee = g.entryFee;
            for (uint256 i = 0; i < n; ++i) _pay(pl[i], fee);
            emit GameSettled(gameId, new address[](0), 0, pot);
            return;
        }

        uint256 share = pot / ns;
        uint256 remainder = pot - share * ns;
        payoutPerSurvivor[gameId] = share;
        address[] memory survs = new address[](ns);
        uint256 k;
        for (uint256 i = 0; i < n; ++i) {
            if (alive[i]) {
                survs[k] = pl[i];
                uint256 amt = share + (k == 0 ? remainder : 0); // dust to first survivor
                _survivors[gameId].push(pl[i]);
                k += 1;
                _pay(pl[i], amt);
            }
        }
        emit GameSettled(gameId, survs, share, pot);
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------- schedule
    function _stationDuration(Game storage g) internal view returns (uint32) {
        return g.boardDuration + REVEAL_BUFFER;
    }

    function _boardWindow(Game storage g, uint8 station) internal view returns (uint256 start, uint256 end) {
        start = uint256(g.startedAt) + uint256(station) * _stationDuration(g);
        end = start + g.boardDuration;
    }

    function _gameEnd(Game storage g) internal view returns (uint256) {
        return uint256(g.startedAt) + uint256(g.numStations) * _stationDuration(g);
    }

    function stationWindow(uint256 gameId, uint8 station)
        external
        view
        returns (uint256 boardStart, uint256 boardEnd, uint256 stationEnd)
    {
        Game storage g = games[gameId];
        (boardStart, boardEnd) = _boardWindow(g, station);
        stationEnd = boardStart + _stationDuration(g);
    }

    // ---------------------------------------------------------------- views
    function getGame(uint256 gameId)
        external
        view
        returns (
            address creator,
            uint8 numWagons,
            uint8 wagonCap,
            uint8 numControllers,
            uint8 numStations,
            uint32 boardDuration,
            uint64 startedAt,
            bool started,
            bool settled,
            uint8 playerCount,
            uint128 entryFee,
            uint128 pot,
            uint32 stationDuration,
            uint256 gameEnd
        )
    {
        Game storage g = games[gameId];
        return (
            g.creator,
            g.numWagons,
            g.wagonCap,
            g.numControllers,
            g.numStations,
            g.boardDuration,
            g.startedAt,
            g.started,
            g.settled,
            g.playerCount,
            g.entryFee,
            g.pot,
            _stationDuration(g),
            _gameEnd(g)
        );
    }

    function getPlayers(uint256 gameId) external view returns (address[] memory) {
        return _players[gameId];
    }

    function getRoster(uint256 gameId)
        external
        view
        returns (address[] memory addrs, string[] memory nicks, Role[] memory roles, bool[] memory elim)
    {
        addrs = _players[gameId];
        uint256 n = addrs.length;
        nicks = new string[](n);
        roles = new Role[](n);
        elim = new bool[](n);
        for (uint256 i = 0; i < n; ++i) {
            Player storage p = _player[gameId][addrs[i]];
            nicks[i] = p.nickname;
            roles[i] = p.role; // NONE until settle
            elim[i] = eliminated[gameId][addrs[i]];
        }
    }

    /// @notice Per-player wagon choice for a station (public — this is how the train visibly fills).
    function getBoarding(uint256 gameId, uint8 station)
        external
        view
        returns (address[] memory addrs, bool[] memory boarded, uint8[] memory wagons, uint16[] memory counts)
    {
        addrs = _players[gameId];
        uint256 n = addrs.length;
        boarded = new bool[](n);
        wagons = new uint8[](n);
        for (uint256 i = 0; i < n; ++i) {
            Board storage b = _board[gameId][station][addrs[i]];
            boarded[i] = b.boarded;
            wagons[i] = b.wagon;
        }
        Game storage g = games[gameId];
        counts = new uint16[](g.numWagons);
        for (uint8 w = 0; w < g.numWagons; ++w) counts[w] = wagonCount[gameId][station][w];
    }

    function getSurvivors(uint256 gameId) external view returns (address[] memory) {
        return _survivors[gameId];
    }

    function roleCommitOf(uint256 gameId, address player) external view returns (bytes32) {
        return _player[gameId][player].roleCommit;
    }

    function isPlayer(uint256 gameId, address player) external view returns (bool) {
        return _player[gameId][player].exists;
    }
}
