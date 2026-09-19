// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { FraudeRERB } from "../src/FraudeRERB.sol";

contract FraudeRERBTest is Test {
    FraudeRERB internal game;

    uint8 constant COMMIT = 10;
    uint8 constant REVEAL = 5;

    // deterministic salts for the test
    bytes32 constant SALT = keccak256("choice-salt");

    function setUp() public {
        vm.warp(1_000_000); // sane base timestamp
        game = new FraudeRERB();
    }

    // ---------------------------------------------------------------- helpers
    function _rc(address p, FraudeRERB.Role r, bytes32 salt, uint256 gid) internal pure returns (bytes32) {
        return keccak256(abi.encode(p, r, salt, gid));
    }

    function _ch(uint8 car, FraudeRERB.Action a, bytes32 salt, address p, uint8 st)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(car, a, salt, p, st));
    }

    function _roleSalt(address p) internal pure returns (bytes32) {
        return keccak256(abi.encode("role", p));
    }

    function _newGame(uint8 stations) internal returns (uint256 gid) {
        gid = game.createGame(stations, COMMIT, REVEAL);
    }

    function _register(uint256 gid, address p, string memory nick, FraudeRERB.Role r) internal {
        game.registerPlayer(gid, p, nick, _rc(p, r, _roleSalt(p), gid));
    }

    function _commit(uint256 gid, uint8 st, address p, uint8 car, FraudeRERB.Action a) internal {
        vm.prank(p);
        game.commit(gid, st, _ch(car, a, SALT, p, st));
    }

    function _reveal(uint256 gid, uint8 st, address p, uint8 car, FraudeRERB.Action a) internal {
        bytes32 rs = a == FraudeRERB.Action.INSPECT ? _roleSalt(p) : bytes32(0);
        vm.prank(p);
        game.reveal(gid, st, car, a, SALT, rs);
    }

    function _commitWindow(uint256 gid, uint8 st) internal {
        (uint256 cStart,,) = game.stationTimes(gid, st);
        vm.warp(cStart + 1);
    }

    function _revealWindow(uint256 gid, uint8 st) internal {
        (, uint256 cEnd,) = game.stationTimes(gid, st);
        vm.warp(cEnd + 1);
    }

    function _afterReveal(uint256 gid, uint8 st) internal {
        (,, uint256 rEnd) = game.stationTimes(gid, st);
        vm.warp(rEnd + 1);
    }

    // ---------------------------------------------------------------- happy path
    function test_FullGameHappyPath() public {
        uint256 gid = _newGame(2);
        address alice = vm.addr(1); // passenger, pays
        address bob = vm.addr(2); // passenger, frauds in car 0
        address carol = vm.addr(3); // passenger, frauds in car 1 (never inspected)
        address dave = vm.addr(4); // contrôleur, inspects car 0

        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        _register(gid, bob, "bob", FraudeRERB.Role.PASSAGER);
        _register(gid, carol, "carol", FraudeRERB.Role.PASSAGER);
        _register(gid, dave, "dave", FraudeRERB.Role.CONTROLEUR);

        game.startGame(gid);

        // ---- Station 0 ----
        _commitWindow(gid, 0);
        _commit(gid, 0, alice, 0, FraudeRERB.Action.PAY);
        _commit(gid, 0, bob, 0, FraudeRERB.Action.FRAUD);
        _commit(gid, 0, carol, 1, FraudeRERB.Action.FRAUD);
        _commit(gid, 0, dave, 0, FraudeRERB.Action.INSPECT);

        _revealWindow(gid, 0);
        _reveal(gid, 0, alice, 0, FraudeRERB.Action.PAY);
        _reveal(gid, 0, bob, 0, FraudeRERB.Action.FRAUD);
        _reveal(gid, 0, carol, 1, FraudeRERB.Action.FRAUD);
        _reveal(gid, 0, dave, 0, FraudeRERB.Action.INSPECT);

        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        assertEq(game.playerPoints(gid, alice), 98, "alice paid ticket");
        assertEq(game.playerPoints(gid, bob), 80, "bob caught in car0");
        assertEq(game.playerPoints(gid, carol), 100, "carol frauded safely in car1");
        assertEq(game.playerPoints(gid, dave), 120, "dave earns bob's fine");

        // ---- Station 1: everyone pays, no fines ----
        _commitWindow(gid, 1);
        _commit(gid, 1, alice, 0, FraudeRERB.Action.PAY);
        _commit(gid, 1, bob, 0, FraudeRERB.Action.PAY);
        _commit(gid, 1, carol, 0, FraudeRERB.Action.PAY);
        _commit(gid, 1, dave, 2, FraudeRERB.Action.INSPECT);

        _revealWindow(gid, 1);
        _reveal(gid, 1, alice, 0, FraudeRERB.Action.PAY);
        _reveal(gid, 1, bob, 0, FraudeRERB.Action.PAY);
        _reveal(gid, 1, carol, 0, FraudeRERB.Action.PAY);
        _reveal(gid, 1, dave, 2, FraudeRERB.Action.INSPECT);

        _afterReveal(gid, 1);
        game.resolveStation(gid, 1);

        assertEq(game.playerPoints(gid, alice), 96);
        assertEq(game.playerPoints(gid, bob), 78);
        assertEq(game.playerPoints(gid, carol), 98);
        assertEq(game.playerPoints(gid, dave), 120, "no frauds to catch at station 1");

        // ---- Finish: reveal roles ----
        (,,,,,,,, uint256 gameEnd) = game.getGame(gid);
        vm.warp(gameEnd + 1);
        address[] memory players = new address[](4);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;
        players[3] = dave;
        FraudeRERB.Role[] memory roles = new FraudeRERB.Role[](4);
        roles[0] = FraudeRERB.Role.PASSAGER;
        roles[1] = FraudeRERB.Role.PASSAGER;
        roles[2] = FraudeRERB.Role.PASSAGER;
        roles[3] = FraudeRERB.Role.CONTROLEUR;
        bytes32[] memory salts = new bytes32[](4);
        salts[0] = _roleSalt(alice);
        salts[1] = _roleSalt(bob);
        salts[2] = _roleSalt(carol);
        salts[3] = _roleSalt(dave);

        game.finishGame(gid, players, roles, salts);

        (, FraudeRERB.Role[] memory outRoles) = game.getRoles(gid);
        assertEq(uint256(outRoles[3]), uint256(FraudeRERB.Role.CONTROLEUR), "dave unmasked");
        assertEq(uint256(outRoles[0]), uint256(FraudeRERB.Role.PASSAGER), "alice passenger");
        (,,,,, bool finished,,,) = game.getGame(gid);
        assertTrue(finished);
    }

    // ---------------------------------------------------------------- hash mismatch
    function test_RevertWhen_HashMismatch() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, alice, 0, FraudeRERB.Action.PAY);

        _revealWindow(gid, 0);
        // reveal a DIFFERENT action than committed
        vm.prank(alice);
        vm.expectRevert(FraudeRERB.HashMismatch.selector);
        game.reveal(gid, 0, 0, FraudeRERB.Action.FRAUD, SALT, bytes32(0));
    }

    // ---------------------------------------------------------------- late commit / reveal
    function test_RevertWhen_LateCommit() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _revealWindow(gid, 0); // past commit window
        vm.prank(alice);
        vm.expectRevert(FraudeRERB.NotInCommitWindow.selector);
        game.commit(gid, 0, _ch(0, FraudeRERB.Action.PAY, SALT, alice, 0));
    }

    function test_RevertWhen_LateReveal() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, alice, 0, FraudeRERB.Action.PAY);

        _afterReveal(gid, 0); // past reveal window
        vm.prank(alice);
        vm.expectRevert(FraudeRERB.NotInRevealWindow.selector);
        game.reveal(gid, 0, 0, FraudeRERB.Action.PAY, SALT, bytes32(0));
    }

    function test_RevertWhen_EarlyReveal() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, alice, 0, FraudeRERB.Action.PAY);

        // still in commit window
        vm.prank(alice);
        vm.expectRevert(FraudeRERB.NotInRevealWindow.selector);
        game.reveal(gid, 0, 0, FraudeRERB.Action.PAY, SALT, bytes32(0));
    }

    // ---------------------------------------------------------------- fake inspection
    function test_RevertWhen_PassengerFakesInspection() public {
        uint256 gid = _newGame(1);
        address mallory = vm.addr(1); // registered as PASSAGER
        _register(gid, mallory, "mallory", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _commitWindow(gid, 0);
        // commit a valid INSPECT hash so we get past HashMismatch
        _commit(gid, 0, mallory, 0, FraudeRERB.Action.INSPECT);

        _revealWindow(gid, 0);
        vm.prank(mallory);
        vm.expectRevert(FraudeRERB.NotController.selector);
        // provide ANY roleSalt: role commitment was for PASSAGER, so INSPECT proof fails
        game.reveal(gid, 0, 0, FraudeRERB.Action.INSPECT, SALT, _roleSalt(mallory));
    }

    // ---------------------------------------------------------------- fine split, 2 contrôleurs same car
    function test_FineSplit_TwoControllersSameCar() public {
        uint256 gid = _newGame(1);
        address a = vm.addr(1); // fraud car0
        address b = vm.addr(2); // fraud car0
        address c1 = vm.addr(3); // contrôleur inspect car0
        address c2 = vm.addr(4); // contrôleur inspect car0
        _register(gid, a, "a", FraudeRERB.Role.PASSAGER);
        _register(gid, b, "b", FraudeRERB.Role.PASSAGER);
        _register(gid, c1, "c1", FraudeRERB.Role.CONTROLEUR);
        _register(gid, c2, "c2", FraudeRERB.Role.CONTROLEUR);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, a, 0, FraudeRERB.Action.FRAUD);
        _commit(gid, 0, b, 0, FraudeRERB.Action.FRAUD);
        _commit(gid, 0, c1, 0, FraudeRERB.Action.INSPECT);
        _commit(gid, 0, c2, 0, FraudeRERB.Action.INSPECT);

        _revealWindow(gid, 0);
        _reveal(gid, 0, a, 0, FraudeRERB.Action.FRAUD);
        _reveal(gid, 0, b, 0, FraudeRERB.Action.FRAUD);
        _reveal(gid, 0, c1, 0, FraudeRERB.Action.INSPECT);
        _reveal(gid, 0, c2, 0, FraudeRERB.Action.INSPECT);

        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        // two 20 pt fines = 40, split 20/20
        assertEq(game.playerPoints(gid, a), 80);
        assertEq(game.playerPoints(gid, b), 80);
        assertEq(game.playerPoints(gid, c1), 120);
        assertEq(game.playerPoints(gid, c2), 120);
    }

    // odd split → remainder to first inspector
    function test_FineSplit_OddRemainderToFirstInspector() public {
        uint256 gid = _newGame(1);
        address a = vm.addr(1); // fraud car0 (single fine = 20)
        address c1 = vm.addr(2); // inspect car0
        address c2 = vm.addr(3); // inspect car0
        address c3 = vm.addr(4); // inspect car0
        _register(gid, a, "a", FraudeRERB.Role.PASSAGER);
        _register(gid, c1, "c1", FraudeRERB.Role.CONTROLEUR);
        _register(gid, c2, "c2", FraudeRERB.Role.CONTROLEUR);
        _register(gid, c3, "c3", FraudeRERB.Role.CONTROLEUR);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, a, 0, FraudeRERB.Action.FRAUD);
        _commit(gid, 0, c1, 0, FraudeRERB.Action.INSPECT);
        _commit(gid, 0, c2, 0, FraudeRERB.Action.INSPECT);
        _commit(gid, 0, c3, 0, FraudeRERB.Action.INSPECT);

        _revealWindow(gid, 0);
        _reveal(gid, 0, a, 0, FraudeRERB.Action.FRAUD);
        _reveal(gid, 0, c1, 0, FraudeRERB.Action.INSPECT);
        _reveal(gid, 0, c2, 0, FraudeRERB.Action.INSPECT);
        _reveal(gid, 0, c3, 0, FraudeRERB.Action.INSPECT);

        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        // pot=20, 3 inspectors: share=6 each, remainder 2 to first (c1)
        assertEq(game.playerPoints(gid, a), 80);
        assertEq(game.playerPoints(gid, c1), 108); // 100 + 6 + 2
        assertEq(game.playerPoints(gid, c2), 106);
        assertEq(game.playerPoints(gid, c3), 106);
    }

    // ---------------------------------------------------------------- non-revealer penalty
    function test_NonRevealerTreatedAsFraud() public {
        // X commits then never reveals; four contrôleurs cover every car → X is always caught.
        uint256 gid = _newGame(1);
        address x = vm.addr(1);
        address[4] memory cs = [vm.addr(10), vm.addr(11), vm.addr(12), vm.addr(13)];
        _register(gid, x, "x", FraudeRERB.Role.PASSAGER);
        for (uint8 i = 0; i < 4; ++i) {
            _register(gid, cs[i], "ctrl", FraudeRERB.Role.CONTROLEUR);
        }
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, x, 0, FraudeRERB.Action.FRAUD); // commits but won't reveal
        for (uint8 i = 0; i < 4; ++i) {
            _commit(gid, 0, cs[i], i, FraudeRERB.Action.INSPECT);
        }

        _revealWindow(gid, 0);
        // X does NOT reveal
        for (uint8 i = 0; i < 4; ++i) {
            _reveal(gid, 0, cs[i], i, FraudeRERB.Action.INSPECT);
        }

        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        assertEq(game.playerPoints(gid, x), 80, "non-revealer fined as fraudster in a random (covered) car");
    }

    // never committed at all → also a fraudster
    function test_NonCommitterTreatedAsFraud() public {
        uint256 gid = _newGame(1);
        address x = vm.addr(1);
        address[4] memory cs = [vm.addr(10), vm.addr(11), vm.addr(12), vm.addr(13)];
        _register(gid, x, "x", FraudeRERB.Role.PASSAGER);
        for (uint8 i = 0; i < 4; ++i) {
            _register(gid, cs[i], "ctrl", FraudeRERB.Role.CONTROLEUR);
        }
        game.startGame(gid);

        _commitWindow(gid, 0);
        for (uint8 i = 0; i < 4; ++i) {
            _commit(gid, 0, cs[i], i, FraudeRERB.Action.INSPECT);
        }
        _revealWindow(gid, 0);
        for (uint8 i = 0; i < 4; ++i) {
            _reveal(gid, 0, cs[i], i, FraudeRERB.Action.INSPECT);
        }
        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        assertEq(game.playerPoints(gid, x), 80, "non-committer fined as fraudster");
    }

    // ---------------------------------------------------------------- resolve twice
    function test_RevertWhen_ResolveTwice() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);

        _commitWindow(gid, 0);
        _commit(gid, 0, alice, 0, FraudeRERB.Action.PAY);
        _revealWindow(gid, 0);
        _reveal(gid, 0, alice, 0, FraudeRERB.Action.PAY);
        _afterReveal(gid, 0);
        game.resolveStation(gid, 0);

        vm.expectRevert(FraudeRERB.AlreadyResolved.selector);
        game.resolveStation(gid, 0);
    }

    function test_RevertWhen_ResolveBeforeRevealOver() public {
        uint256 gid = _newGame(1);
        address alice = vm.addr(1);
        _register(gid, alice, "alice", FraudeRERB.Role.PASSAGER);
        game.startGame(gid);
        _commitWindow(gid, 0);
        vm.expectRevert(FraudeRERB.RevealWindowNotOver.selector);
        game.resolveStation(gid, 0);
    }

    // ---------------------------------------------------------------- access control
    function test_RevertWhen_NonGMRegisters() public {
        uint256 gid = _newGame(1);
        vm.prank(vm.addr(99));
        vm.expectRevert(FraudeRERB.NotGM.selector);
        game.registerPlayer(gid, vm.addr(1), "x", bytes32(0));
    }

    // ---------------------------------------------------------------- 64 players gas check
    function test_Gas_64Players() public {
        uint256 gid = _newGame(1);
        uint256 N = 64;
        // 8 contrôleurs (idx 0..7) inspect cars round-robin; rest alternate pay/fraud.
        for (uint256 i = 0; i < N; ++i) {
            address p = vm.addr(1000 + i);
            FraudeRERB.Role r = i < 8 ? FraudeRERB.Role.CONTROLEUR : FraudeRERB.Role.PASSAGER;
            _register(gid, p, "p", r);
        }
        game.startGame(gid);

        _commitWindow(gid, 0);
        for (uint256 i = 0; i < N; ++i) {
            address p = vm.addr(1000 + i);
            if (i < 8) {
                _commit(gid, 0, p, uint8(i % 4), FraudeRERB.Action.INSPECT);
            } else if (i % 2 == 0) {
                _commit(gid, 0, p, uint8(i % 4), FraudeRERB.Action.FRAUD);
            } else {
                _commit(gid, 0, p, 0, FraudeRERB.Action.PAY);
            }
        }

        _revealWindow(gid, 0);
        for (uint256 i = 0; i < N; ++i) {
            address p = vm.addr(1000 + i);
            if (i < 8) {
                _reveal(gid, 0, p, uint8(i % 4), FraudeRERB.Action.INSPECT);
            } else if (i % 2 == 0) {
                _reveal(gid, 0, p, uint8(i % 4), FraudeRERB.Action.FRAUD);
            } else {
                _reveal(gid, 0, p, 0, FraudeRERB.Action.PAY);
            }
        }

        _afterReveal(gid, 0);
        uint256 g0 = gasleft();
        game.resolveStation(gid, 0);
        uint256 used = g0 - gasleft();
        console.log("resolveStation gas with 64 players:", used);
        assertLt(used, 8_000_000, "resolve must fit comfortably in a block");
    }
}
