// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Ping — trivial contract for M0 latency/throughput risk-check on Monad Testnet.
/// @notice Each `ping()` bumps a counter and stamps the block. Used to blast N txs and
///         measure inclusion latency, to confirm 20s commit/reveal stations are feasible.
contract Ping {
    uint256 public count;
    mapping(address => uint256) public lastBlock;

    event Pinged(address indexed from, uint256 count, uint256 blockNumber);

    function ping() external {
        unchecked {
            count += 1;
        }
        lastBlock[msg.sender] = block.number;
        emit Pinged(msg.sender, count, block.number);
    }
}
