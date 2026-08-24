// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SendWithFee} from "../src/SendWithFee.sol";

/// @notice Deploys the standalone SendWithFee helper to Arc Testnet.
/// @dev Deliberately kept separate from Deploy.s.sol — SendWithFee has no
///      relationship to P2PEscrow/UsernameRegistry's deployment (no shared
///      constructor args, no wiring between them), so running this script
///      can never affect the already-deployed escrow/registry addresses.
///
///      Run with:
///        forge script script/DeploySendWithFee.s.sol:DeploySendWithFee \
///          --rpc-url arc_testnet --broadcast --verify -vvvv
contract DeploySendWithFee is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        SendWithFee sendWithFee = new SendWithFee();
        console2.log("SendWithFee deployed:", address(sendWithFee));

        vm.stopBroadcast();
    }
}
