// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { RERBSurvival } from "../src/RERBSurvival.sol";

contract RERBSurvivalTest is Test {
    RERBSurvival internal game;
    uint128 constant FEE = 1 ether;
    uint32 constant BOARD = 10;

    function setUp() public {
        vm.warp(1_000_000);
        game = new RERBSurvival();
    }

    // -------- helpers
    function _rc(address p, RERBSurvival.Role r, bytes32 salt, uint256 gid) internal pure returns (bytes32) {
        return keccak256(abi.encode(p, r, salt, gid));
    }

    function _salt(address p) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", p));
    }

    function _mk(uint256 k) internal returns (address a) {
        a = vm.addr(k);
        vm.deal(a, 10 ether);
    }

    function _join(uint256 gid, address p, string memory nick) internal {
        vm.prank(p);
        game.join{ value: FEE }(gid, nick);
    }

    function _start(uint256 gid, address[] memory pl, RERBSurvival.Role[] memory roles) internal {
        bytes32[] memory commits = new bytes32[](pl.length);
        for (uint256 i = 0; i < pl.length; ++i) commits[i] = _rc(pl[i], roles[i], _salt(pl[i]), gid);
        game.startGame(gid, commits);
    }

    function _board(uint256 gid, uint8 station, address p, uint8 wagon) internal {
        (uint256 bStart,,) = game.stationWindow(gid, station);
        if (block.timestamp < bStart + 1) vm.warp(bStart + 1);
        vm.prank(p);
        game.board(gid, station, wagon);
    }

    function _settle(uint256 gid, address[] memory pl, RERBSurvival.Role[] memory roles) internal {
        (,,,,,,,,,,,,, uint256 gameEnd) = game.getGame(gid);
        vm.warp(gameEnd + 1);
        bytes32[] memory salts = new bytes32[](pl.length);
        for (uint256 i = 0; i < pl.length; ++i) salts[i] = _salt(pl[i]);
        game.settle(gid, roles, salts);
    }

    // -------- full game + payout
    function test_FullGame_CatchAndPayout() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1); // fraudeur, wagon0 -> caught
        address b = _mk(2); // fraudeur, wagon1 -> safe
        address c = _mk(3); // controleur, wagon0
        address d = _mk(4); // fraudeur, wagon1 -> safe
        _join(gid, a, "a");
        _join(gid, b, "b");
        _join(gid, c, "c");
        _join(gid, d, "d");

        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](4);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.FRAUDEUR;
        roles[2] = RERBSurvival.Role.CONTROLEUR;
        roles[3] = RERBSurvival.Role.FRAUDEUR;
        _start(gid, pl, roles);

        _board(gid, 0, a, 0);
        _board(gid, 0, b, 1);
        _board(gid, 0, c, 0);
        _board(gid, 0, d, 1);

        assertEq(address(game).balance, 4 ether, "pot held");

        uint256 balB = b.balance;
        uint256 balC = c.balance;
        uint256 balD = d.balance;
        _settle(gid, pl, roles);

        assertTrue(game.eliminated(gid, a), "a caught");
        assertFalse(game.eliminated(gid, c), "controller survives (not idle)");
        // 3 survivors split 4 ether: 1.333.. each, dust to first survivor (b)
        uint256 share = uint256(4 ether) / 3;
        uint256 dust = 4 ether - share * 3;
        assertEq(b.balance, balB + share + dust, "b payout + dust");
        assertEq(c.balance, balC + share, "c payout");
        assertEq(d.balance, balD + share, "d payout");
        assertEq(address(game).balance, 0, "pot fully paid");
    }

    // -------- idle controller eliminated after 2 lonely stations
    function test_IdleControllerEliminated() public {
        uint256 gid = game.createGame(2, 5, 1, 2, BOARD, FEE);
        address c = _mk(1); // controleur, always alone in wagon0
        address a = _mk(2); // fraudeur, always wagon1
        _join(gid, c, "c");
        _join(gid, a, "a");

        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.CONTROLEUR;
        roles[1] = RERBSurvival.Role.FRAUDEUR;
        _start(gid, pl, roles);

        _board(gid, 0, c, 0);
        _board(gid, 0, a, 1);
        _board(gid, 1, c, 0);
        _board(gid, 1, a, 1);

        uint256 balA = a.balance;
        _settle(gid, pl, roles);

        assertTrue(game.eliminated(gid, c), "idle controller eliminated after 2 lonely stations");
        assertFalse(game.eliminated(gid, a), "fraudeur survived");
        assertEq(a.balance, balA + 2 ether, "sole survivor takes the whole pot");
    }

    // -------- wagon cap
    function test_RevertWhen_WagonFull() public {
        uint256 gid = game.createGame(2, 1, 1, 1, BOARD, FEE); // cap = 1
        address a = _mk(1);
        address b = _mk(2);
        _join(gid, a, "a");
        _join(gid, b, "b");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.CONTROLEUR;
        roles[1] = RERBSurvival.Role.FRAUDEUR;
        _start(gid, pl, roles);

        _board(gid, 0, a, 0);
        (uint256 bStart,,) = game.stationWindow(gid, 0);
        vm.warp(bStart + 1);
        vm.prank(b);
        vm.expectRevert(RERBSurvival.WagonFull.selector);
        game.board(gid, 0, 0);
    }

    // -------- changing wagon frees the old slot
    function test_ChangeWagonUpdatesCounts() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1);
        address b = _mk(2);
        _join(gid, a, "a");
        _join(gid, b, "b");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.CONTROLEUR;
        _start(gid, pl, roles);

        _board(gid, 0, a, 0);
        _board(gid, 0, a, 1); // move a from wagon0 to wagon1
        (,,, uint16[] memory counts) = game.getBoarding(gid, 0);
        assertEq(counts[0], 0, "wagon0 emptied");
        assertEq(counts[1], 1, "wagon1 has a");
    }

    // -------- join guards
    function test_RevertWhen_WrongFee() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1);
        vm.prank(a);
        vm.expectRevert(RERBSurvival.WrongFee.selector);
        game.join{ value: 0.5 ether }(gid, "a");
    }

    function test_RevertWhen_JoinAfterStart() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1);
        address b = _mk(2);
        _join(gid, a, "a");
        _join(gid, b, "b");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.CONTROLEUR;
        _start(gid, pl, roles);
        address c = _mk(3);
        vm.prank(c);
        vm.expectRevert(RERBSurvival.AlreadyStarted.selector);
        game.join{ value: FEE }(gid, "c");
    }

    // -------- board window
    function test_RevertWhen_BoardOutsideWindow() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1);
        address b = _mk(2);
        _join(gid, a, "a");
        _join(gid, b, "b");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.CONTROLEUR;
        _start(gid, pl, roles);
        (, uint256 bEnd,) = game.stationWindow(gid, 0);
        vm.warp(bEnd + 1);
        vm.prank(a);
        vm.expectRevert(RERBSurvival.NotBoardingWindow.selector);
        game.board(gid, 0, 0);
    }

    // -------- bad role proof at settle
    function test_RevertWhen_BadRoleProof() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1);
        address b = _mk(2);
        _join(gid, a, "a");
        _join(gid, b, "b");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](2);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.CONTROLEUR;
        _start(gid, pl, roles);
        _board(gid, 0, a, 0);
        _board(gid, 0, b, 1);
        (,,,,,,,,,,,,, uint256 gameEnd) = game.getGame(gid);
        vm.warp(gameEnd + 1);
        // swap roles => commitments won't match
        RERBSurvival.Role[] memory wrong = new RERBSurvival.Role[](2);
        wrong[0] = RERBSurvival.Role.CONTROLEUR;
        wrong[1] = RERBSurvival.Role.FRAUDEUR;
        bytes32[] memory salts = new bytes32[](2);
        salts[0] = _salt(a);
        salts[1] = _salt(b);
        vm.expectRevert(RERBSurvival.BadRoleProof.selector);
        game.settle(gid, wrong, salts);
    }

    // -------- non-boarder still processed (random wagon), settle succeeds
    function test_NonBoarderHandled() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE);
        address a = _mk(1); // will NOT board
        address b = _mk(2);
        address c = _mk(3);
        _join(gid, a, "a");
        _join(gid, b, "b");
        _join(gid, c, "c");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](3);
        roles[0] = RERBSurvival.Role.FRAUDEUR;
        roles[1] = RERBSurvival.Role.FRAUDEUR;
        roles[2] = RERBSurvival.Role.CONTROLEUR;
        _start(gid, pl, roles);
        _board(gid, 0, b, 0);
        _board(gid, 0, c, 1);
        // a never boards -> pseudo-random wagon at settle
        _settle(gid, pl, roles);
        // just assert the game settled and pot distributed (no revert)
        (,,,,,,,, bool settled,,,,,) = game.getGame(gid);
        assertTrue(settled);
        assertEq(address(game).balance, 0, "pot paid out");
    }

    // -------- registration cap = 3 x wagons
    function test_RevertWhen_TooManyPlayers() public {
        uint256 gid = game.createGame(2, 5, 1, 1, BOARD, FEE); // cap = 6
        for (uint256 i = 0; i < 6; ++i) _join(gid, _mk(2000 + i), "p");
        address extra = _mk(2999);
        vm.prank(extra);
        vm.expectRevert(RERBSurvival.TooManyPlayers.selector);
        game.join{ value: FEE }(gid, "x");
    }

    // -------- max-size settle gas (8 wagons x 3 = 24 players, the hard game cap)
    function test_Gas_MaxPlayers_Settle() public {
        uint256 gid = game.createGame(8, 5, 6, 3, BOARD, FEE);
        uint256 N = 24;
        for (uint256 i = 0; i < N; ++i) _join(gid, _mk(1000 + i), "p");
        address[] memory pl = game.getPlayers(gid);
        RERBSurvival.Role[] memory roles = new RERBSurvival.Role[](N);
        for (uint256 i = 0; i < N; ++i) roles[i] = i < 8 ? RERBSurvival.Role.CONTROLEUR : RERBSurvival.Role.FRAUDEUR;
        _start(gid, pl, roles);
        for (uint8 s = 0; s < 3; ++s) {
            for (uint256 i = 0; i < N; ++i) _board(gid, s, pl[i], uint8(i % 8));
        }
        (,,,,,,,,,,,,, uint256 gameEnd) = game.getGame(gid);
        vm.warp(gameEnd + 1);
        bytes32[] memory salts = new bytes32[](N);
        for (uint256 i = 0; i < N; ++i) salts[i] = _salt(pl[i]);
        uint256 g0 = gasleft();
        game.settle(gid, roles, salts);
        emit log_named_uint("settle gas (24 players, 3 stations)", g0 - gasleft());
    }
}
