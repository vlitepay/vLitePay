// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface for Circle's CCTP TokenMessenger (depositForBurn / v2 fast transfer).
/// @dev See Circle CCTP docs for full ABI; only the functions vLitePay needs are declared here.
interface ITokenMessenger {
    /// @notice Legacy V1-style signature. NOT reliably supported by TokenMessengerV2 deployments
    /// (e.g. Arc Testnet) — calling this selector against a V2 contract reverts. Kept only for
    /// reference / other chains that still run V1. vLitePay always uses the 7-arg fast-transfer
    /// overload below.
    function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)
        external
        returns (uint64 nonce);

    /// @notice CCTP V2 fast-transfer variant with max fee + finality threshold. This is the
    /// function TokenMessengerV2 actually implements — always use this one.
    /// @param destinationCaller bytes32(0) allows any address to complete the mint on the
    ///        destination domain (no permissioned relayer required).
    /// @param maxFee Maximum fee (in burn-token smallest units) the depositor is willing to pay
    ///        for fast (soft-finality) attestation. Must be >= Circle's current fast-transfer fee
    ///        for the amount/route or the message falls back to standard finality instead of
    ///        reverting.
    /// @param minFinalityThreshold 1000 = fast (soft finality, ~8-20s); 2000 = standard (waits for
    ///        hard finality). See Circle's CCTP V2 technical guide for current values.
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external returns (uint64 nonce);
}
