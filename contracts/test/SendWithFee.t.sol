// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SendWithFee} from "../src/SendWithFee.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SendWithFeeTest is Test {
    SendWithFee sender_;
    MockERC20 usdc;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address treasury = makeAddr("treasury");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        sender_ = new SendWithFee();
        usdc.mint(sender, 10_000e6);
    }

    function testSendWithFeeMovesBothLegsAtomically() public {
        uint256 netAmount = 100e6;
        uint256 feeAmount = 1e6;

        vm.prank(sender);
        usdc.approve(address(sender_), netAmount + feeAmount);

        vm.prank(sender);
        sender_.sendWithFee(address(usdc), recipient, netAmount, treasury, feeAmount);

        assertEq(usdc.balanceOf(recipient), netAmount);
        assertEq(usdc.balanceOf(treasury), feeAmount);
        assertEq(usdc.balanceOf(sender), 10_000e6 - netAmount - feeAmount);
    }

    /// @dev Zero-fee sends still complete in one transaction — the fee leg
    /// is skipped, treasury is untouched, only the recipient leg executes.
    function testZeroFeeSendSkipsFeeLeg() public {
        uint256 netAmount = 50e6;

        vm.prank(sender);
        usdc.approve(address(sender_), netAmount);

        vm.prank(sender);
        sender_.sendWithFee(address(usdc), recipient, netAmount, treasury, 0);

        assertEq(usdc.balanceOf(recipient), netAmount);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function testRevertsWithoutSufficientAllowance() public {
        vm.prank(sender);
        usdc.approve(address(sender_), 10e6); // less than netAmount + feeAmount below

        vm.prank(sender);
        vm.expectRevert();
        sender_.sendWithFee(address(usdc), recipient, 100e6, treasury, 1e6);
    }

    function testRevertsOnZeroRecipient() public {
        vm.prank(sender);
        usdc.approve(address(sender_), 100e6);

        vm.prank(sender);
        vm.expectRevert(SendWithFee.ZeroAddress.selector);
        sender_.sendWithFee(address(usdc), address(0), 100e6, treasury, 0);
    }

    function testRevertsOnZeroAmount() public {
        vm.prank(sender);
        vm.expectRevert(SendWithFee.ZeroAmount.selector);
        sender_.sendWithFee(address(usdc), recipient, 0, treasury, 0);
    }

    /// @dev A zero treasury address is only invalid when a fee is actually
    /// being charged — with feeAmount == 0 the fee leg (and this check)
    /// never runs, so this must succeed.
    function testZeroTreasuryAllowedWhenFeeIsZero() public {
        vm.prank(sender);
        usdc.approve(address(sender_), 100e6);

        vm.prank(sender);
        sender_.sendWithFee(address(usdc), recipient, 100e6, address(0), 0);

        assertEq(usdc.balanceOf(recipient), 100e6);
    }

    function testEmitsSentEvent() public {
        uint256 netAmount = 100e6;
        uint256 feeAmount = 1e6;

        vm.prank(sender);
        usdc.approve(address(sender_), netAmount + feeAmount);

        vm.expectEmit(true, true, true, true);
        emit SendWithFee.Sent(sender, address(usdc), recipient, netAmount, treasury, feeAmount);

        vm.prank(sender);
        sender_.sendWithFee(address(usdc), recipient, netAmount, treasury, feeAmount);
    }
}
