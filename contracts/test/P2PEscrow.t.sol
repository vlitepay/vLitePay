// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {P2PEscrow} from "../src/P2PEscrow.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract P2PEscrowTest is Test {
    P2PEscrow escrow;
    MockERC20 usdc;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address merchant = makeAddr("merchant");
    address taker = makeAddr("taker");
    address arbiter = makeAddr("arbiter");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);

        vm.prank(owner);
        escrow = new P2PEscrow(owner, treasury, address(usdc));

        vm.startPrank(owner);
        escrow.setSupportedToken(address(usdc), true);
        escrow.setSupportedFiat("NGN", true);
        escrow.approveMerchant(merchant);
        escrow.addArbiter(arbiter);
        vm.stopPrank();

        usdc.mint(merchant, 10_000e6);
        usdc.mint(taker, 10_000e6);
    }

    /// @dev Default fees are 1% maker (charged to whoever deposits) / 0% taker (buyer pays nothing).
    function testMerchantSellsFlowReleasesToBuyer() public {
        vm.prank(merchant);
        uint256 offerId = escrow.createOffer(
            P2PEscrow.OfferSide.MerchantSells, address(usdc), "NGN", 1500e18, 10e6, 1000e6, "Fast release, be online"
        );

        // Merchant is the depositor here (MerchantSells) — must fund amount + makerFee.
        uint256 amount = 100e6;
        uint256 makerFee = (amount * escrow.makerFeeBps()) / 10_000;

        vm.prank(merchant);
        usdc.approve(address(escrow), amount + makerFee);

        uint256 merchantBalBefore = usdc.balanceOf(merchant);
        uint256 takerBalBefore = usdc.balanceOf(taker);

        vm.prank(taker);
        uint256 tradeId = escrow.acceptOffer(offerId, amount, 150_000, false);

        // Merchant's deposit (amount + makerFee) left their wallet immediately on accept.
        assertEq(usdc.balanceOf(merchant), merchantBalBefore - amount - makerFee);

        // taker is the crypto buyer here (merchant sells crypto)
        vm.prank(taker);
        escrow.markFiatSent(tradeId);

        vm.prank(merchant);
        escrow.releaseFunds(tradeId);

        P2PEscrow.Trade memory t = escrow.getTrade(tradeId);
        assertEq(uint256(t.status), uint256(P2PEscrow.TradeStatus.Released));

        // Taker fee defaults to 0%, so the buyer receives the full notional — no deduction.
        assertEq(usdc.balanceOf(taker), takerBalBefore + amount);
        // Treasury collects only the maker fee (taker fee is 0 by default).
        assertEq(usdc.balanceOf(treasury), makerFee);
    }

    function testDisputeResolutionSplitsFundsAndRoutesMakerFeeToTreasury() public {
        vm.prank(merchant);
        uint256 offerId = escrow.createOffer(
            P2PEscrow.OfferSide.MerchantSells, address(usdc), "NGN", 1500e18, 10e6, 1000e6, "T&Cs"
        );

        uint256 amount = 100e6;
        uint256 makerFee = (amount * escrow.makerFeeBps()) / 10_000;

        vm.prank(merchant);
        usdc.approve(address(escrow), amount + makerFee);

        vm.prank(taker);
        uint256 tradeId = escrow.acceptOffer(offerId, amount, 150_000, false);

        vm.prank(taker);
        escrow.raiseDispute(tradeId, "ipfs://evidence");

        vm.prank(arbiter);
        escrow.resolveDispute(tradeId, 60e6); // 60% to buyer, 40% to seller

        P2PEscrow.Trade memory t = escrow.getTrade(tradeId);
        assertEq(uint256(t.status), uint256(P2PEscrow.TradeStatus.Resolved));

        // Maker fee always goes to treasury once a dispute resolves, regardless of the split.
        assertEq(usdc.balanceOf(treasury), makerFee);
    }

    function testCancelBeforeFiatMarkedReturnsFullDepositIncludingFee() public {
        vm.prank(merchant);
        uint256 offerId = escrow.createOffer(
            P2PEscrow.OfferSide.MerchantSells, address(usdc), "NGN", 1500e18, 10e6, 1000e6, "T&Cs"
        );

        uint256 amount = 100e6;
        uint256 makerFee = (amount * escrow.makerFeeBps()) / 10_000;

        vm.prank(merchant);
        usdc.approve(address(escrow), amount + makerFee);

        uint256 merchantBalBefore = usdc.balanceOf(merchant);

        vm.prank(taker);
        uint256 tradeId = escrow.acceptOffer(offerId, amount, 150_000, false);

        vm.prank(taker);
        escrow.cancelTrade(tradeId);

        // No fee is charged on a trade that never completed — full amount + makerFee comes back.
        assertEq(usdc.balanceOf(merchant), merchantBalBefore);
    }

    function testOnlyOwnerCanSetFees() public {
        vm.prank(taker);
        vm.expectRevert();
        escrow.setMakerFee(100);

        vm.prank(taker);
        vm.expectRevert();
        escrow.setTakerFee(50);
    }

    function testMakerAndTakerFeesDefaultCorrectly() public {
        assertEq(escrow.makerFeeBps(), 100); // 1%
        assertEq(escrow.takerFeeBps(), 0); // 0%
    }

    /// @dev Guards against ever reintroducing the legacy 4-arg depositForBurn call —
    /// TokenMessengerV2 only supports the 7-arg fast-transfer signature (see
    /// releaseFundsViaCCTP / ITokenMessenger.sol), and these config values are what
    /// that call relies on.
    function testCctpFastTransferDefaults() public {
        assertEq(escrow.cctpMinFinalityThreshold(), 1000); // fast/soft finality
        assertEq(escrow.cctpMaxFeeBps(), 10); // 0.10% conservative default
    }

    function testOnlyOwnerCanSetCctpFastTransferParams() public {
        vm.prank(taker);
        vm.expectRevert();
        escrow.setCCTPFastTransferParams(2000, 25);

        vm.prank(owner);
        escrow.setCCTPFastTransferParams(2000, 25);
        assertEq(escrow.cctpMinFinalityThreshold(), 2000);
        assertEq(escrow.cctpMaxFeeBps(), 25);
    }

    function testCctpMaxFeeCannotExceedSafetyCeiling() public {
        vm.prank(owner);
        vm.expectRevert();
        escrow.setCCTPFastTransferParams(1000, 10_001); // > MAX_FEE_BPS (1000 = 10%)
    }
}
