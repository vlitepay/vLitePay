// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {P2PEscrow} from "../src/P2PEscrow.sol";

/// @notice Deploys UsernameRegistry + P2PEscrow to Arc Testnet and wires initial config.
/// @dev Run with:
///   forge script script/Deploy.s.sol:Deploy --rpc-url arc_testnet --broadcast --verify -vvvv
contract Deploy is Script {
    // Arc Testnet token addresses (from project brief / Circle faucet docs).
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant CIRBTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;

    // Circle CCTP TokenMessenger on Arc Testnet — confirmed address, Arc's own domain is 26.
    address constant ARC_CCTP_TOKEN_MESSENGER = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(deployerKey);
        address treasury = vm.envOr("TREASURY_ADDRESS", owner);

        vm.startBroadcast(deployerKey);

        // $1 USDC registration fee (6 decimals) — configurable post-deploy via setUsernameFee.
        UsernameRegistry registry = new UsernameRegistry(USDC, 1_000_000, treasury, owner);
        console2.log("UsernameRegistry deployed:", address(registry));

        P2PEscrow escrow = new P2PEscrow(owner, treasury, USDC);
        console2.log("P2PEscrow deployed:", address(escrow));

        // Wire up supported tokens.
        escrow.setSupportedToken(USDC, true);
        escrow.setSupportedToken(EURC, true);
        escrow.setSupportedToken(CIRBTC, true);

        // Seed initial supported fiat pairs — owner can add more later via setSupportedFiat.
        escrow.setSupportedFiat("NGN", true);
        escrow.setSupportedFiat("PHP", true);
        escrow.setSupportedFiat("EUR", true);
        escrow.setSupportedFiat("USD", true);
        escrow.setSupportedFiat("KES", true);
        escrow.setSupportedFiat("GHS", true);

        // Wire up Circle CCTP so the escrow's own trade-linked cross-chain payout
        // (releaseFundsViaCCTP) can actually burn USDC on Arc.
        escrow.setTokenMessenger(ARC_CCTP_TOKEN_MESSENGER, USDC);

        // Seed CCTP destination domains (Circle-assigned domain ids).
        escrow.setCCTPChain("base_sepolia", 6, true);
        escrow.setCCTPChain("arbitrum_sepolia", 3, true);
        escrow.setCCTPChain("ethereum_sepolia", 0, true);
        escrow.setCCTPChain("avalanche_fuji", 1, true);
        escrow.setCCTPChain("solana_devnet", 5, true);

        vm.stopBroadcast();

        console2.log("--- Deployment summary ---");
        console2.log("Owner:", owner);
        console2.log("Treasury:", treasury);
        console2.log("USDC:", USDC);
        console2.log("EURC:", EURC);
        console2.log("cirBTC:", CIRBTC);
        console2.log("CCTP TokenMessenger (V2):", ARC_CCTP_TOKEN_MESSENGER);
        console2.log("CCTP min finality threshold (default, fast):", escrow.cctpMinFinalityThreshold());
        console2.log("CCTP max fee bps (default):", escrow.cctpMaxFeeBps());
        console2.log("  -> tune via escrow.setCCTPFastTransferParams(...) if Circle's live fee schedule changes");
    }
}
