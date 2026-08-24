// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SendWithFee
/// @notice Minimal helper for vLitePay's Send screen: atomically sends
///         `netAmount` of an ERC20 token to a recipient and `feeAmount` to a
///         treasury in a single transaction, pulling both from the caller's
///         own balance via `transferFrom` (requires the caller to have
///         approved this contract for at least `netAmount + feeAmount`
///         beforehand).
/// @dev Deliberately narrow — no ownership, no pausability, no upgradeability,
///      no token allowlist, no fee configuration on-chain (the app computes
///      netAmount/feeAmount off-chain from its own fee-bps config and passes
///      both explicitly). This exists solely to collapse Send's previous
///      two-transaction flow (transfer to recipient, then a separate
///      transfer to treasury) into one wallet confirmation — it is not a
///      replacement for, or extension of, P2PEscrow.
contract SendWithFee is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error ZeroAddress();
    error ZeroAmount();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event Sent(
        address indexed sender,
        address indexed token,
        address indexed recipient,
        uint256 netAmount,
        address treasury,
        uint256 feeAmount
    );

    /// @param token      ERC20 token being sent (USDC/EURC/cirBTC on Arc).
    /// @param recipient  Final recipient of `netAmount`. Must not be zero.
    /// @param netAmount  Amount the recipient receives. Must be > 0.
    /// @param treasury   Fee recipient. Only validated/used if feeAmount > 0.
    /// @param feeAmount  Fee amount — may be 0. The zero-fee case still
    ///                   completes in this same single transaction; the fee
    ///                   leg is simply skipped rather than needing a
    ///                   separate call path.
    function sendWithFee(address token, address recipient, uint256 netAmount, address treasury, uint256 feeAmount)
        external
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (netAmount == 0) revert ZeroAmount();

        IERC20 t = IERC20(token);

        t.safeTransferFrom(msg.sender, recipient, netAmount);

        if (feeAmount > 0) {
            if (treasury == address(0)) revert ZeroAddress();
            t.safeTransferFrom(msg.sender, treasury, feeAmount);
        }

        emit Sent(msg.sender, token, recipient, netAmount, treasury, feeAmount);
    }
}
