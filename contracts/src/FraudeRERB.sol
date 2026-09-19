// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Fraude sur le RER B — on-chain social-deduction party game (Monad Blitz Paris).
/// @notice The whole room rides the RER B. At each station every passenger secretly picks a car
///         and either PAYER (ticket, -2 pts) or FRAUDER (free). Hidden CONTRÔLEURS secretly
///         inspect one car; fraudsters caught there pay a 20 pt fine, split among the inspectors
///         of that car. Roles are hidden on-chain via a commitment until the game finishes.
/// @dev    Points are in-game only (start 100) — NOT money, not gambling. Players capped at 64
///         so all loops are bounded. State is designed to be read by ~400ms polling from the UI.
contract FraudeRERB {
    // ------------------------------------------------------------------ types
    enum Role {
        NONE, // 0
        PASSAGER, // 1
        CONTROLEUR // 2
    }

    enum Action {
        NONE, // 0
        PAY, // 1  passenger buys a ticket
        FRAUD, // 2  passenger rides for free
        INSPECT // 3  contrôleur inspects `car`
    }

    /// @dev Per-player outcome for a resolved station (used by the screen).
    enum Outcome {
        NONE, // 0  never committed / no position
        PAID, // 1  bought a ticket
        FRAUD_SAFE, // 2  frauded, car not inspected
        CAUGHT, // 3  frauded in an inspected car → fined
        INSPECT_HIDDEN // 4  contrôleur (car hidden until game finishes)
    }

    struct Player {
        bool exists;
        uint8 index;
        Role role; // set publicly only at finishGame
        int256 points;
        bytes32 roleCommit;
        string nickname;
    }

    struct Entry {
        bytes32 commitHash;
        bool committed;
        bool revealed;
        uint8 car; // meaningful for FRAUD / INSPECT
        Action action;
    }

    struct Game {
        address gm;
        uint8 numStations;
        uint32 commitDuration;
        uint32 revealDuration;
        uint64 startedAt; // 0 until startGame
        bool finished;
        uint8 playerCount;
    }

    // ------------------------------------------------------------------ constants
    uint8 public constant CARS = 4;
    uint8 public constant MAX_PLAYERS = 64;
    uint8 public constant MAX_STATIONS = 6;
    int256 public constant START_POINTS = 100;
    int256 public constant TICKET_COST = 2;
    int256 public constant FINE = 20;
    uint32 public constant RESOLVE_BUFFER = 3; // seconds of animation gap between stations

    // ------------------------------------------------------------------ storage
    uint256 public gameCount;
    mapping(uint256 => Game) public games;
    mapping(uint256 => address[]) internal _players;
    mapping(uint256 => mapping(address => Player)) internal _player;
    mapping(uint256 => mapping(uint8 => mapping(address => Entry))) internal _entries;
    mapping(uint256 => mapping(uint8 => bool)) public stationResolved;

    // ------------------------------------------------------------------ events
    event GameCreated(uint256 indexed gameId, address indexed gm, uint8 numStations);
    event PlayerJoined(uint256 indexed gameId, address indexed player, string nickname, uint8 index);
    event GameStarted(uint256 indexed gameId, uint64 startedAt, uint32 stationDuration, uint8 numStations);
    event Committed(uint256 indexed gameId, address indexed player, uint8 indexed station);
    event Revealed(uint256 indexed gameId, address indexed player, uint8 indexed station);
    event StationResolved(
        uint256 indexed gameId,
        uint8 indexed station,
        uint8[] inspectedCars,
        address[] caught,
        uint8[] caughtCars,
        uint256 totalFines
    );
    event GameFinished(uint256 indexed gameId, address[] players, int256[] points, Role[] roles);

    // ------------------------------------------------------------------ errors
    error NotGM();
    error AlreadyStarted();
    error NotStarted();
    error AlreadyFinished();
    error TooManyPlayers();
    error AlreadyRegistered();
    error NotAPlayer();
    error NotInCommitWindow();
    error NotInRevealWindow();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyRevealed();
    error HashMismatch();
    error NotController();
    error InvalidCar();
    error InvalidAction();
    error AlreadyResolved();
    error RevealWindowNotOver();
    error StationsNotAllResolved();
    error GameNotOver();
    error LengthMismatch();
    error BadRoleProof();
    error InvalidParams();
    error InvalidStation();

    // ------------------------------------------------------------------ modifiers
    modifier onlyGM(uint256 gameId) {
        if (msg.sender != games[gameId].gm) revert NotGM();
        _;
    }

    // ------------------------------------------------------------------ admin
    /// @notice Create a new game. Caller becomes the Game Master.
    function createGame(uint8 numStations, uint32 commitDuration, uint32 revealDuration)
        external
        returns (uint256 gameId)
    {
        if (numStations == 0 || numStations > MAX_STATIONS) revert InvalidParams();
        if (commitDuration < 5 || commitDuration > 120) revert InvalidParams();
        if (revealDuration < 3 || revealDuration > 120) revert InvalidParams();

        gameId = ++gameCount;
        Game storage g = games[gameId];
        g.gm = msg.sender;
        g.numStations = numStations;
        g.commitDuration = commitDuration;
        g.revealDuration = revealDuration;
        emit GameCreated(gameId, msg.sender, numStations);
    }

    /// @notice Register a player before the game starts. GM only.
    /// @param roleCommit keccak256(abi.encode(player, role, roleSalt, gameId)).
    function registerPlayer(uint256 gameId, address player, string calldata nick, bytes32 roleCommit)
        external
        onlyGM(gameId)
    {
        Game storage g = games[gameId];
        if (g.startedAt != 0) revert AlreadyStarted();
        if (g.playerCount >= MAX_PLAYERS) revert TooManyPlayers();
        if (_player[gameId][player].exists) revert AlreadyRegistered();

        uint8 idx = g.playerCount;
        _player[gameId][player] = Player({
            exists: true,
            index: idx,
            role: Role.NONE,
            points: START_POINTS,
            roleCommit: roleCommit,
            nickname: nick
        });
        _players[gameId].push(player);
        g.playerCount = idx + 1;
        emit PlayerJoined(gameId, player, nick, idx);
    }

    /// @notice Start the game; fixes the deterministic schedule from block.timestamp.
    function startGame(uint256 gameId) external onlyGM(gameId) {
        Game storage g = games[gameId];
        if (g.startedAt != 0) revert AlreadyStarted();
        if (g.playerCount == 0) revert InvalidParams();
        g.startedAt = uint64(block.timestamp);
        emit GameStarted(gameId, g.startedAt, _stationDuration(g), g.numStations);
    }

    // ------------------------------------------------------------------ play
    /// @notice Commit to a hidden choice for a station.
    /// @param h keccak256(abi.encode(car, action, salt, player, stationIndex)).
    function commit(uint256 gameId, uint8 station, bytes32 h) external {
        Game storage g = games[gameId];
        if (g.startedAt == 0) revert NotStarted();
        if (g.finished) revert AlreadyFinished();
        if (station >= g.numStations) revert InvalidStation();
        if (!_player[gameId][msg.sender].exists) revert NotAPlayer();
        (uint256 cStart, uint256 cEnd,) = _times(g, station);
        if (block.timestamp < cStart || block.timestamp >= cEnd) revert NotInCommitWindow();

        Entry storage e = _entries[gameId][station][msg.sender];
        if (e.committed) revert AlreadyCommitted();
        e.commitHash = h;
        e.committed = true;
        emit Committed(gameId, msg.sender, station);
    }

    /// @notice Reveal a committed choice during the reveal window.
    /// @param roleSalt only needed for INSPECT (proves CONTRÔLEUR against the role commitment).
    function reveal(
        uint256 gameId,
        uint8 station,
        uint8 car,
        Action action,
        bytes32 salt,
        bytes32 roleSalt
    ) external {
        Game storage g = games[gameId];
        if (g.startedAt == 0) revert NotStarted();
        if (station >= g.numStations) revert InvalidStation();
        if (car >= CARS) revert InvalidCar();
        if (action != Action.PAY && action != Action.FRAUD && action != Action.INSPECT) {
            revert InvalidAction();
        }
        (, uint256 cEnd, uint256 rEnd) = _times(g, station);
        if (block.timestamp < cEnd || block.timestamp >= rEnd) revert NotInRevealWindow();

        Entry storage e = _entries[gameId][station][msg.sender];
        if (!e.committed) revert NotCommitted();
        if (e.revealed) revert AlreadyRevealed();

        bytes32 h = keccak256(abi.encode(car, action, salt, msg.sender, station));
        if (h != e.commitHash) revert HashMismatch();

        if (action == Action.INSPECT) {
            bytes32 rc = keccak256(abi.encode(msg.sender, Role.CONTROLEUR, roleSalt, gameId));
            if (rc != _player[gameId][msg.sender].roleCommit) revert NotController();
        }

        e.revealed = true;
        e.car = car;
        e.action = action;
        emit Revealed(gameId, msg.sender, station);
    }

    /// @notice Resolve a station after its reveal window: apply tickets, fines and splits.
    ///         Callable by anyone (the keeper). Non-revealers ride as fraudsters in a
    ///         pseudo-random car.
    function resolveStation(uint256 gameId, uint8 station) external {
        Game storage g = games[gameId];
        if (g.startedAt == 0) revert NotStarted();
        if (station >= g.numStations) revert InvalidStation();
        (,, uint256 rEnd) = _times(g, station);
        if (block.timestamp < rEnd) revert RevealWindowNotOver();
        if (stationResolved[gameId][station]) revert AlreadyResolved();
        stationResolved[gameId][station] = true;

        address[] storage pl = _players[gameId];
        uint256 n = pl.length;

        uint8[] memory effCar = new uint8[](n);
        uint8[] memory effKind = new uint8[](n); // 1 pay, 2 fraud, 3 inspect
        uint256[CARS] memory fraudPerCar;
        uint256[CARS] memory inspPerCar;

        bytes32 seed = blockhash(block.number - 1);
        if (seed == bytes32(0)) seed = keccak256(abi.encode(gameId, station));

        // Pass 1: derive effective positions and tally per-car counts.
        for (uint256 i = 0; i < n; ++i) {
            Entry storage e = _entries[gameId][station][pl[i]];
            if (e.revealed) {
                if (e.action == Action.INSPECT) {
                    effKind[i] = 3;
                    effCar[i] = e.car;
                    inspPerCar[e.car] += 1;
                } else if (e.action == Action.PAY) {
                    effKind[i] = 1;
                } else {
                    effKind[i] = 2;
                    effCar[i] = e.car;
                    fraudPerCar[e.car] += 1;
                }
            } else {
                uint8 c = uint8(uint256(keccak256(abi.encode(seed, pl[i], station))) % CARS);
                effKind[i] = 2;
                effCar[i] = c;
                fraudPerCar[c] += 1;
            }
        }

        // Count caught + inspected cars for event array sizing.
        uint256 caughtN;
        uint256 inspectedCarsN;
        for (uint256 c = 0; c < CARS; ++c) {
            if (inspPerCar[c] > 0) {
                inspectedCarsN += 1;
                caughtN += fraudPerCar[c];
            }
        }

        address[] memory caught = new address[](caughtN);
        uint8[] memory caughtCars = new uint8[](caughtN);
        uint8[] memory inspectedCars = new uint8[](inspectedCarsN);
        {
            uint256 k;
            for (uint8 c = 0; c < CARS; ++c) {
                if (inspPerCar[c] > 0) inspectedCars[k++] = c;
            }
        }

        // Pass 2: apply ticket costs & fines.
        uint256 ci;
        uint256 totalFines;
        for (uint256 i = 0; i < n; ++i) {
            if (effKind[i] == 1) {
                _player[gameId][pl[i]].points -= TICKET_COST;
            } else if (effKind[i] == 2) {
                if (inspPerCar[effCar[i]] > 0) {
                    _player[gameId][pl[i]].points -= FINE;
                    caught[ci] = pl[i];
                    caughtCars[ci] = effCar[i];
                    ci += 1;
                    totalFines += uint256(FINE);
                }
            }
        }

        // Pass 3: split each inspected car's fine pot among its inspectors (remainder to the first).
        bool[CARS] memory remGiven;
        for (uint256 i = 0; i < n; ++i) {
            if (effKind[i] == 3) {
                uint8 c = effCar[i];
                uint256 pot = uint256(FINE) * fraudPerCar[c];
                if (pot > 0) {
                    uint256 share = pot / inspPerCar[c];
                    int256 add = int256(share);
                    if (!remGiven[c]) {
                        add += int256(pot % inspPerCar[c]);
                        remGiven[c] = true;
                    }
                    _player[gameId][pl[i]].points += add;
                }
            }
        }

        emit StationResolved(gameId, station, inspectedCars, caught, caughtCars, totalFines);
    }

    /// @notice Finish the game: GM reveals every role salt so roles become public & verifiable.
    function finishGame(
        uint256 gameId,
        address[] calldata players,
        Role[] calldata roles,
        bytes32[] calldata roleSalts
    ) external onlyGM(gameId) {
        Game storage g = games[gameId];
        if (g.startedAt == 0) revert NotStarted();
        if (g.finished) revert AlreadyFinished();
        if (block.timestamp < _gameEnd(g)) revert GameNotOver();
        for (uint8 s = 0; s < g.numStations; ++s) {
            if (!stationResolved[gameId][s]) revert StationsNotAllResolved();
        }
        if (players.length != g.playerCount || roles.length != g.playerCount || roleSalts.length != g.playerCount)
        {
            revert LengthMismatch();
        }

        for (uint256 i = 0; i < players.length; ++i) {
            Player storage p = _player[gameId][players[i]];
            if (!p.exists) revert NotAPlayer();
            bytes32 rc = keccak256(abi.encode(players[i], roles[i], roleSalts[i], gameId));
            if (rc != p.roleCommit) revert BadRoleProof();
            p.role = roles[i];
        }

        g.finished = true;

        address[] memory addrs = _players[gameId];
        int256[] memory pts = new int256[](addrs.length);
        Role[] memory rs = new Role[](addrs.length);
        for (uint256 i = 0; i < addrs.length; ++i) {
            pts[i] = _player[gameId][addrs[i]].points;
            rs[i] = _player[gameId][addrs[i]].role;
        }
        emit GameFinished(gameId, addrs, pts, rs);
    }

    // ------------------------------------------------------------------ schedule (pure/view)
    function _stationDuration(Game storage g) internal view returns (uint32) {
        return g.commitDuration + g.revealDuration + RESOLVE_BUFFER;
    }

    function _times(Game storage g, uint8 station)
        internal
        view
        returns (uint256 commitStart, uint256 commitEnd, uint256 revealEnd)
    {
        commitStart = uint256(g.startedAt) + uint256(station) * _stationDuration(g);
        commitEnd = commitStart + g.commitDuration;
        revealEnd = commitEnd + g.revealDuration;
    }

    function _gameEnd(Game storage g) internal view returns (uint256) {
        return uint256(g.startedAt) + uint256(g.numStations) * _stationDuration(g);
    }

    /// @notice Timestamps for a station's phases (for UI countdowns).
    function stationTimes(uint256 gameId, uint8 station)
        external
        view
        returns (uint256 commitStart, uint256 commitEnd, uint256 revealEnd)
    {
        return _times(games[gameId], station);
    }

    // ------------------------------------------------------------------ views for the UI
    function getGame(uint256 gameId)
        external
        view
        returns (
            address gm,
            uint8 numStations,
            uint32 commitDuration,
            uint32 revealDuration,
            uint64 startedAt,
            bool finished,
            uint8 playerCount,
            uint32 stationDuration,
            uint256 gameEnd
        )
    {
        Game storage g = games[gameId];
        return (
            g.gm,
            g.numStations,
            g.commitDuration,
            g.revealDuration,
            g.startedAt,
            g.finished,
            g.playerCount,
            _stationDuration(g),
            _gameEnd(g)
        );
    }

    function getPlayers(uint256 gameId) external view returns (address[] memory) {
        return _players[gameId];
    }

    /// @notice Leaderboard snapshot. `roles` are Role.NONE until the game finishes.
    function getBoard(uint256 gameId)
        external
        view
        returns (address[] memory addrs, string[] memory nicks, int256[] memory pts, Role[] memory roles)
    {
        addrs = _players[gameId];
        uint256 n = addrs.length;
        nicks = new string[](n);
        pts = new int256[](n);
        roles = new Role[](n);
        for (uint256 i = 0; i < n; ++i) {
            Player storage p = _player[gameId][addrs[i]];
            nicks[i] = p.nickname;
            pts[i] = p.points;
            roles[i] = p.role;
        }
    }

    /// @notice Commit/reveal dots for a station (no choices leaked).
    function getStationBoard(uint256 gameId, uint8 station)
        external
        view
        returns (address[] memory addrs, bool[] memory committed, bool[] memory revealed)
    {
        addrs = _players[gameId];
        uint256 n = addrs.length;
        committed = new bool[](n);
        revealed = new bool[](n);
        for (uint256 i = 0; i < n; ++i) {
            Entry storage e = _entries[gameId][station][addrs[i]];
            committed[i] = e.committed;
            revealed[i] = e.revealed;
        }
    }

    /// @notice Per-player positions/outcomes for a RESOLVED station, for the screen animation.
    ///         Contrôleurs are returned as INSPECT_HIDDEN with car=255 until the game finishes;
    ///         inspected cars are exposed anonymously via `inspectedCars`.
    function getStationResult(uint256 gameId, uint8 station)
        external
        view
        returns (
            bool resolved,
            uint8[] memory inspectedCars,
            address[] memory addrs,
            uint8[] memory cars, // 0..3, or 255 when hidden
            Outcome[] memory outcomes
        )
    {
        Game storage g = games[gameId];
        resolved = stationResolved[gameId][station];
        addrs = _players[gameId];
        uint256 n = addrs.length;
        cars = new uint8[](n);
        outcomes = new Outcome[](n);
        if (!resolved) {
            inspectedCars = new uint8[](0);
            for (uint256 i = 0; i < n; ++i) cars[i] = 255;
            return (resolved, inspectedCars, addrs, cars, outcomes);
        }

        uint256[CARS] memory inspPerCar;
        uint8[] memory effCar = new uint8[](n);
        uint8[] memory effKind = new uint8[](n);
        bytes32 seed = keccak256(abi.encode(gameId, station)); // view can't rely on blockhash

        for (uint256 i = 0; i < n; ++i) {
            Entry storage e = _entries[gameId][station][addrs[i]];
            if (e.revealed) {
                if (e.action == Action.INSPECT) {
                    effKind[i] = 3;
                    effCar[i] = e.car;
                    inspPerCar[e.car] += 1;
                } else if (e.action == Action.PAY) {
                    effKind[i] = 1;
                } else {
                    effKind[i] = 2;
                    effCar[i] = e.car;
                }
            } else {
                effKind[i] = 2;
                effCar[i] = uint8(uint256(keccak256(abi.encode(seed, addrs[i], station))) % CARS);
            }
        }

        uint256 m;
        for (uint256 c = 0; c < CARS; ++c) {
            if (inspPerCar[c] > 0) m += 1;
        }
        inspectedCars = new uint8[](m);
        uint256 k;
        for (uint8 c = 0; c < CARS; ++c) {
            if (inspPerCar[c] > 0) inspectedCars[k++] = c;
        }

        bool showRoles = g.finished;
        for (uint256 i = 0; i < n; ++i) {
            if (effKind[i] == 1) {
                outcomes[i] = Outcome.PAID;
                cars[i] = effCar[i];
            } else if (effKind[i] == 2) {
                if (inspPerCar[effCar[i]] > 0) outcomes[i] = Outcome.CAUGHT;
                else outcomes[i] = Outcome.FRAUD_SAFE;
                cars[i] = effCar[i];
            } else if (effKind[i] == 3) {
                outcomes[i] = Outcome.INSPECT_HIDDEN;
                cars[i] = showRoles ? effCar[i] : 255;
            } else {
                outcomes[i] = Outcome.NONE;
                cars[i] = 255;
            }
        }
    }

    /// @notice Public roles after finishGame (Role.NONE while the game is running).
    function getRoles(uint256 gameId) external view returns (address[] memory addrs, Role[] memory roles) {
        addrs = _players[gameId];
        roles = new Role[](addrs.length);
        for (uint256 i = 0; i < addrs.length; ++i) {
            roles[i] = _player[gameId][addrs[i]].role;
        }
    }

    function getEntry(uint256 gameId, uint8 station, address player)
        external
        view
        returns (bool committed, bool revealed, uint8 car, Action action)
    {
        Entry storage e = _entries[gameId][station][player];
        return (e.committed, e.revealed, e.car, e.action);
    }

    function playerPoints(uint256 gameId, address player) external view returns (int256) {
        return _player[gameId][player].points;
    }

    function roleCommitOf(uint256 gameId, address player) external view returns (bytes32) {
        return _player[gameId][player].roleCommit;
    }
}
