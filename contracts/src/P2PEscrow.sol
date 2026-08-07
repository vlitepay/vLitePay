// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenMessenger} from "./interfaces/ITokenMessenger.sol";

/// @title P2PEscrow
/// @notice Merchant-created P2P offers, escrow-backed trade lifecycle, dispute
///         resolution, ratings, and protocol-wide fee configuration for vLitePay.
/// @dev Every parameter (fees, timers, supported tokens/pairs, arbiters) is
///      owner-configurable at runtime — nothing is hardcoded beyond safe
///      constructor defaults.
contract P2PEscrow is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");

    // ---------------------------------------------------------------------
    // Enums
    // ---------------------------------------------------------------------
    enum OfferSide {
        MerchantBuys, // merchant pays fiat, receives crypto -> taker is the crypto seller
        MerchantSells // merchant provides crypto, receives fiat -> merchant locks crypto up front
    }

    enum TradeStatus {
        Locked, // crypto locked in escrow
        FiatMarked, // buyer (fiat sender) has marked fiat as sent
        Released, // crypto released to the crypto buyer
        Disputed, // a dispute has been raised
        Resolved, // arbiter resolved a dispute
        Cancelled // trade cancelled before fiat was marked sent
    }

    // ---------------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------------
    struct Offer {
        uint256 id;
        address merchant;
        OfferSide side;
        address token; // USDC / EURC / cirBTC
        string fiatCurrency; // e.g. "NGN", "PHP"
        uint256 rate; // fiat units per 1 token, scaled 1e18
        uint256 minAmount; // token smallest units
        uint256 maxAmount; // token smallest units
        string terms;
        bool active;
        bool paused;
        uint256 views;
        uint256 tradesCount;
        uint256 volume; // cumulative token volume traded
        uint256 createdAt;
    }

    struct Trade {
        uint256 id;
        uint256 offerId;
        address token;
        uint256 amount; // token smallest units locked in escrow (buyer's notional due)
        uint256 makerFeeAmount; // snapshotted at accept time — paid by the depositor (maker/seller) on top of `amount`
        uint256 takerFeeAmount; // snapshotted at accept time — deducted from the buyer's (taker's) payout
        address cryptoBuyer; // receives token
        address cryptoSeller; // provided token (locked it) — the "maker" side of the fee model
        uint256 fiatAmount; // informational, off-chain fiat units (2dp) at trade time
        string fiatCurrency;
        TradeStatus status;
        uint256 lockedAt;
        uint256 timerDuration; // seconds, chosen at accept time (default or alternate)
        uint256 fiatMarkedAt;
        bool disputeRaised;
        string evidenceURI;
    }

    struct Rating {
        uint8 stars; // 1-5
        string comment;
        address rater;
        uint256 timestamp;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------
    uint256 public nextOfferId = 1;
    uint256 public nextTradeId = 1;

    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Trade) public trades;
    mapping(uint256 => Rating[]) public tradeRatings; // tradeId => ratings (buyer+seller can each rate once)
    mapping(uint256 => mapping(address => bool)) public hasRated;

    /// @notice Supported ERC20 tokens for trading (USDC, EURC, cirBTC on Arc).
    mapping(address => bool) public supportedTokens;

    /// @notice Supported fiat currency codes (owner-managed allowlist for UI/offer creation).
    mapping(string => bool) public supportedFiatCurrencies;

    /// @notice Approved merchant addresses (mirrors MERCHANT_ROLE for convenient views).
    mapping(address => bool) public isApprovedMerchant;
    mapping(address => bool) public isPendingMerchant;

    address public treasury;

    // --- Protocol-wide, owner-configurable fees (basis points, 1 bps = 0.01%) ---
    uint256 public makerFeeBps = 100; // 1% default — charged to the depositor (maker/seller), added on top of the locked amount
    uint256 public takerFeeBps = 0; // 0% default — charged to the crypto buyer (taker), deducted from their payout
    uint256 public sendFeeBps = 25; // 0.25% default transfer fee
    uint256 public airtimeFeeBps = 75; // 0.75% default airtime fee
    uint256 public constant MAX_FEE_BPS = 1000; // hard safety ceiling (10%), applies per-fee

    // --- Timers ---
    uint256 public defaultTimer = 24 hours;
    uint256 public alternateTimer = 48 hours;

    /// @notice Circle CCTP TokenMessenger on Arc, used for cross-chain payouts (USDC only).
    ITokenMessenger public tokenMessenger;
    address public usdc;

    /// @notice destination chain name => CCTP domain id (owner-configurable chain list).
    mapping(string => uint32) public cctpDomains;
    mapping(string => bool) public cctpChainSupported;

    // --- CCTP V2 fast-transfer parameters (owner-configurable, nothing hardcoded) ---
    /// @notice 1000 = fast/soft finality (~8-20s); 2000 = standard/hard finality. Circle CCTP V2 constant.
    uint32 public cctpMinFinalityThreshold = 1000;
    /// @notice Max fee vLitePay is willing to pay for fast attestation, as bps of the bridged amount.
    /// Must be >= Circle's current fast-transfer fee for the route or the burn falls back to
    /// standard finality — check Circle's fee API (GET /v2/burn/USDC/fees/{src}/{dst}) and update
    /// via setCctpFastTransferParams if fast transfers start taking longer than expected.
    uint256 public cctpMaxFeeBps = 10; // 0.10% default — conservative starting ceiling, tune per Circle's live fee schedule

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event OfferCreated(uint256 indexed offerId, address indexed merchant, OfferSide side, address token, string fiatCurrency, uint256 rate);
    event OfferPaused(uint256 indexed offerId);
    event OfferResumed(uint256 indexed offerId);
    event OfferUpdated(uint256 indexed offerId, uint256 rate, uint256 minAmount, uint256 maxAmount, string terms);
    event OfferViewed(uint256 indexed offerId);

    event TradeLocked(uint256 indexed tradeId, uint256 indexed offerId, address indexed cryptoBuyer, address cryptoSeller, uint256 amount, uint256 makerFeeAmount, uint256 takerFeeAmount, uint256 timerDuration);
    event FiatMarkedSent(uint256 indexed tradeId, address indexed by);
    event TradeReleased(uint256 indexed tradeId, address indexed to, uint256 amount);
    event TradeReleasedCrossChain(uint256 indexed tradeId, address indexed to, uint256 amount, string destinationChain, uint64 cctpNonce);
    event TradeCancelled(uint256 indexed tradeId);
    event DisputeRaised(uint256 indexed tradeId, address indexed by, string evidenceURI);
    event DisputeResolved(uint256 indexed tradeId, address indexed arbiter, address recipient, uint256 amountToBuyer, uint256 amountToSeller);
    event TradeRated(uint256 indexed tradeId, address indexed rater, uint8 stars, string comment);

    event MerchantApplied(address indexed applicant);
    event MerchantApproved(address indexed merchant);
    event MerchantRejected(address indexed applicant);
    event MerchantRestricted(address indexed merchant);

    event MakerFeeUpdated(uint256 oldFee, uint256 newFee);
    event TakerFeeUpdated(uint256 oldFee, uint256 newFee);
    event SendFeeUpdated(uint256 oldFee, uint256 newFee);
    event AirtimeFeeUpdated(uint256 oldFee, uint256 newFee);
    event TimersUpdated(uint256 defaultTimer, uint256 alternateTimer);
    event SupportedTokenUpdated(address indexed token, bool enabled);
    event SupportedFiatUpdated(string currency, bool enabled);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event CCTPConfigUpdated(string chain, uint32 domain, bool enabled);
    event CCTPFastTransferParamsUpdated(uint32 minFinalityThreshold, uint256 maxFeeBps);
    event ArbiterAdded(address indexed arbiter);
    event ArbiterRemoved(address indexed arbiter);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error TokenNotSupported();
    error FiatNotSupported();
    error NotMerchant();
    error OfferNotActive();
    error OfferIsPaused();
    error AmountOutOfRange();
    error InvalidTimer();
    error NotParticipant();
    error InvalidTradeStatus();
    error TimerNotExpired();
    error TimerExpired();
    error FeeTooHigh();
    error ZeroAddress();
    error AlreadyRated();
    error CCTPChainNotSupported();
    error NotUSDC();

    constructor(address _owner, address _treasury, address _usdc) {
        if (_owner == address(0) || _treasury == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(OWNER_ROLE, _owner);
        treasury = _treasury;
        usdc = _usdc;
        if (_usdc != address(0)) supportedTokens[_usdc] = true;
    }

    // ---------------------------------------------------------------------
    // Merchant application / approval
    // ---------------------------------------------------------------------

    function applyForMerchant() external whenNotPaused {
        isPendingMerchant[msg.sender] = true;
        emit MerchantApplied(msg.sender);
    }

    function approveMerchant(address applicant) external onlyRole(OWNER_ROLE) {
        isPendingMerchant[applicant] = false;
        isApprovedMerchant[applicant] = true;
        _grantRole(MERCHANT_ROLE, applicant);
        emit MerchantApproved(applicant);
    }

    function rejectMerchant(address applicant) external onlyRole(OWNER_ROLE) {
        isPendingMerchant[applicant] = false;
        emit MerchantRejected(applicant);
    }

    function restrictMerchant(address merchant) external onlyRole(OWNER_ROLE) {
        isApprovedMerchant[merchant] = false;
        _revokeRole(MERCHANT_ROLE, merchant);
        emit MerchantRestricted(merchant);
    }

    // ---------------------------------------------------------------------
    // Offers (MyShop)
    // ---------------------------------------------------------------------

    function createOffer(
        OfferSide side,
        address token,
        string calldata fiatCurrency,
        uint256 rate,
        uint256 minAmount,
        uint256 maxAmount,
        string calldata terms
    ) external onlyRole(MERCHANT_ROLE) whenNotPaused returns (uint256 offerId) {
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (!supportedFiatCurrencies[fiatCurrency]) revert FiatNotSupported();
        require(minAmount > 0 && minAmount <= maxAmount, "invalid range");
        require(rate > 0, "invalid rate");

        offerId = nextOfferId++;
        offers[offerId] = Offer({
            id: offerId,
            merchant: msg.sender,
            side: side,
            token: token,
            fiatCurrency: fiatCurrency,
            rate: rate,
            minAmount: minAmount,
            maxAmount: maxAmount,
            terms: terms,
            active: true,
            paused: false,
            views: 0,
            tradesCount: 0,
            volume: 0,
            createdAt: block.timestamp
        });

        emit OfferCreated(offerId, msg.sender, side, token, fiatCurrency, rate);
    }

    function updateOffer(uint256 offerId, uint256 rate, uint256 minAmount, uint256 maxAmount, string calldata terms)
        external
    {
        Offer storage o = offers[offerId];
        if (o.merchant != msg.sender) revert NotMerchant();
        require(minAmount > 0 && minAmount <= maxAmount, "invalid range");
        require(rate > 0, "invalid rate");
        o.rate = rate;
        o.minAmount = minAmount;
        o.maxAmount = maxAmount;
        o.terms = terms;
        emit OfferUpdated(offerId, rate, minAmount, maxAmount, terms);
    }

    function pauseOffer(uint256 offerId) external {
        Offer storage o = offers[offerId];
        if (o.merchant != msg.sender) revert NotMerchant();
        o.paused = true;
        emit OfferPaused(offerId);
    }

    function resumeOffer(uint256 offerId) external {
        Offer storage o = offers[offerId];
        if (o.merchant != msg.sender) revert NotMerchant();
        o.paused = false;
        emit OfferResumed(offerId);
    }

    /// @notice Off-chain UI calls this (or an indexer) to track offer view counts for social proof.
    function recordOfferView(uint256 offerId) external {
        offers[offerId].views += 1;
        emit OfferViewed(offerId);
    }

    // ---------------------------------------------------------------------
    // Trade lifecycle
    // ---------------------------------------------------------------------

    /// @notice Accept an offer, locking the crypto leg of the trade in escrow.
    /// @param offerId The offer being accepted.
    /// @param amount Token amount (smallest units) for this trade.
    /// @param fiatAmount Off-chain-computed fiat amount at the agreed rate (2dp-scaled by frontend).
    /// @param useAlternateTimer If true, use the 48h window instead of the 24h default.
    function acceptOffer(uint256 offerId, uint256 amount, uint256 fiatAmount, bool useAlternateTimer)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tradeId)
    {
        Offer storage o = offers[offerId];
        if (!o.active) revert OfferNotActive();
        if (o.paused) revert OfferIsPaused();
        if (amount < o.minAmount || amount > o.maxAmount) revert AmountOutOfRange();

        address cryptoSeller;
        address cryptoBuyer;

        // Maker fee is charged to whoever deposits crypto now (the "maker" side of this
        // trade) — they must fund `amount + makerFee`, on top of the buyer's due `amount`.
        uint256 makerFee = (amount * makerFeeBps) / 10_000;
        uint256 takerFee = (amount * takerFeeBps) / 10_000; // snapshotted now, deducted from the buyer's payout later
        uint256 depositTotal = amount + makerFee;

        if (o.side == OfferSide.MerchantSells) {
            // Merchant is selling crypto; merchant must lock funds now, taker (msg.sender) receives them.
            cryptoSeller = o.merchant;
            cryptoBuyer = msg.sender;
            IERC20(o.token).safeTransferFrom(o.merchant, address(this), depositTotal);
        } else {
            // Merchant is buying crypto (paying fiat); taker (msg.sender) is selling crypto, locks funds now.
            cryptoSeller = msg.sender;
            cryptoBuyer = o.merchant;
            IERC20(o.token).safeTransferFrom(msg.sender, address(this), depositTotal);
        }

        uint256 timer = useAlternateTimer ? alternateTimer : defaultTimer;
        if (timer == 0) revert InvalidTimer();

        tradeId = nextTradeId++;
        trades[tradeId] = Trade({
            id: tradeId,
            offerId: offerId,
            token: o.token,
            amount: amount,
            makerFeeAmount: makerFee,
            takerFeeAmount: takerFee,
            cryptoBuyer: cryptoBuyer,
            cryptoSeller: cryptoSeller,
            fiatAmount: fiatAmount,
            fiatCurrency: o.fiatCurrency,
            status: TradeStatus.Locked,
            lockedAt: block.timestamp,
            timerDuration: timer,
            fiatMarkedAt: 0,
            disputeRaised: false,
            evidenceURI: ""
        });

        o.tradesCount += 1;

        emit TradeLocked(tradeId, offerId, cryptoBuyer, cryptoSeller, amount, makerFee, takerFee, timer);
    }

    /// @notice Buyer (the fiat sender, i.e. the counterparty receiving crypto) confirms fiat was sent.
    function markFiatSent(uint256 tradeId) external whenNotPaused {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoBuyer) revert NotParticipant();
        if (t.status != TradeStatus.Locked) revert InvalidTradeStatus();
        if (block.timestamp > t.lockedAt + t.timerDuration) revert TimerExpired();

        t.status = TradeStatus.FiatMarked;
        t.fiatMarkedAt = block.timestamp;

        emit FiatMarkedSent(tradeId, msg.sender);
    }

    /// @notice Crypto seller verifies fiat receipt and releases escrowed funds to the crypto buyer.
    function releaseFunds(uint256 tradeId) external nonReentrant whenNotPaused {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoSeller) revert NotParticipant();
        if (t.status != TradeStatus.FiatMarked) revert InvalidTradeStatus();

        t.status = TradeStatus.Released;

        uint256 buyerPayout = t.amount - t.takerFeeAmount;
        uint256 treasuryCut = t.makerFeeAmount + t.takerFeeAmount;

        if (treasuryCut > 0) IERC20(t.token).safeTransfer(treasury, treasuryCut);
        IERC20(t.token).safeTransfer(t.cryptoBuyer, buyerPayout);

        _recordVolume(t.offerId, t.amount);

        emit TradeReleased(tradeId, t.cryptoBuyer, buyerPayout);
    }

    /// @notice Same as releaseFunds, but bridges the payout to another chain via Circle CCTP (USDC only).
    function releaseFundsViaCCTP(uint256 tradeId, string calldata destinationChain, bytes32 mintRecipient)
        external
        nonReentrant
        whenNotPaused
        returns (uint64 nonce)
    {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoSeller) revert NotParticipant();
        if (t.status != TradeStatus.FiatMarked) revert InvalidTradeStatus();
        if (t.token != usdc) revert NotUSDC();
        if (!cctpChainSupported[destinationChain]) revert CCTPChainNotSupported();
        if (address(tokenMessenger) == address(0)) revert CCTPChainNotSupported();

        t.status = TradeStatus.Released;

        uint256 buyerPayout = t.amount - t.takerFeeAmount;
        uint256 treasuryCut = t.makerFeeAmount + t.takerFeeAmount;

        if (treasuryCut > 0) IERC20(t.token).safeTransfer(treasury, treasuryCut);

        // IMPORTANT: TokenMessengerV2 (deployed on Arc Testnet) does not reliably support the
        // legacy 4-arg depositForBurn(amount, domain, mintRecipient, burnToken) selector — calling
        // it reverts. V2 requires the fast-transfer signature below, even for what would have been
        // a "standard" V1 transfer. `forceApprove` resets any stale allowance before approving the
        // exact amount, avoiding the classic ERC20 "approve non-zero to non-zero" footgun.
        IERC20(usdc).forceApprove(address(tokenMessenger), buyerPayout);

        uint256 maxFee = (buyerPayout * cctpMaxFeeBps) / 10_000;
        nonce = tokenMessenger.depositForBurn(
            buyerPayout,
            cctpDomains[destinationChain],
            mintRecipient,
            usdc,
            bytes32(0), // destinationCaller: zero = anyone can complete the mint on the destination
            maxFee,
            cctpMinFinalityThreshold
        );

        _recordVolume(t.offerId, t.amount);

        emit TradeReleasedCrossChain(tradeId, t.cryptoBuyer, buyerPayout, destinationChain, nonce);
    }

    /// @notice Cancel an unmarked trade — either participant may cancel before fiat has been marked sent.
    function cancelTrade(uint256 tradeId) external nonReentrant whenNotPaused {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoBuyer && msg.sender != t.cryptoSeller) revert NotParticipant();
        if (t.status != TradeStatus.Locked) revert InvalidTradeStatus();

        t.status = TradeStatus.Cancelled;
        IERC20(t.token).safeTransfer(t.cryptoSeller, t.amount + t.makerFeeAmount);

        emit TradeCancelled(tradeId);
    }

    /// @notice If the crypto seller goes silent after fiat was marked sent and the window lapses,
    ///         the crypto buyer may raise a dispute for arbiter review (funds remain in escrow).
    function raiseDispute(uint256 tradeId, string calldata evidenceURI) external whenNotPaused {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoBuyer && msg.sender != t.cryptoSeller) revert NotParticipant();
        if (t.status != TradeStatus.Locked && t.status != TradeStatus.FiatMarked) revert InvalidTradeStatus();

        t.status = TradeStatus.Disputed;
        t.disputeRaised = true;
        t.evidenceURI = evidenceURI;

        emit DisputeRaised(tradeId, msg.sender, evidenceURI);
    }

    /// @notice Arbiter (or owner) resolves a dispute, splitting escrowed funds as they see fit.
    /// @param amountToBuyer Amount of the trade notional (token units, out of `t.amount`) awarded to
    ///        the crypto buyer. The remainder of the notional goes to the crypto seller. The maker
    ///        fee always goes to treasury once a dispute is resolved; the taker fee is applied
    ///        proportionally to whatever share the buyer is actually awarded.
    function resolveDispute(uint256 tradeId, uint256 amountToBuyer) external nonReentrant onlyRole(ARBITER_ROLE) {
        Trade storage t = trades[tradeId];
        if (t.status != TradeStatus.Disputed) revert InvalidTradeStatus();
        require(amountToBuyer <= t.amount, "exceeds escrow");

        t.status = TradeStatus.Resolved;
        uint256 amountToSeller = t.amount - amountToBuyer;

        // Taker fee scales with the buyer's actual award — if the buyer is awarded
        // nothing, they're charged no taker fee either.
        uint256 takerCut = t.amount > 0 ? (t.takerFeeAmount * amountToBuyer) / t.amount : 0;
        uint256 buyerPayout = amountToBuyer - takerCut;
        uint256 treasuryCut = t.makerFeeAmount + takerCut;

        if (treasuryCut > 0) IERC20(t.token).safeTransfer(treasury, treasuryCut);
        if (buyerPayout > 0) IERC20(t.token).safeTransfer(t.cryptoBuyer, buyerPayout);
        if (amountToSeller > 0) IERC20(t.token).safeTransfer(t.cryptoSeller, amountToSeller);

        emit DisputeResolved(tradeId, msg.sender, t.cryptoBuyer, buyerPayout, amountToSeller);
    }

    // ---------------------------------------------------------------------
    // Ratings
    // ---------------------------------------------------------------------

    function rateTrade(uint256 tradeId, uint8 stars, string calldata comment) external whenNotPaused {
        Trade storage t = trades[tradeId];
        if (msg.sender != t.cryptoBuyer && msg.sender != t.cryptoSeller) revert NotParticipant();
        if (t.status != TradeStatus.Released && t.status != TradeStatus.Resolved) revert InvalidTradeStatus();
        if (hasRated[tradeId][msg.sender]) revert AlreadyRated();
        require(stars >= 1 && stars <= 5, "stars 1-5");

        hasRated[tradeId][msg.sender] = true;
        tradeRatings[tradeId].push(Rating({stars: stars, comment: comment, rater: msg.sender, timestamp: block.timestamp}));

        emit TradeRated(tradeId, msg.sender, stars, comment);
    }

    function getTradeRatings(uint256 tradeId) external view returns (Rating[] memory) {
        return tradeRatings[tradeId];
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _recordVolume(uint256 offerId, uint256 amount) internal {
        offers[offerId].volume += amount;
    }

    // ---------------------------------------------------------------------
    // Owner / admin configuration — fully dynamic, nothing hardcoded
    // ---------------------------------------------------------------------

    function addArbiter(address arbiter) external onlyRole(OWNER_ROLE) {
        _grantRole(ARBITER_ROLE, arbiter);
        emit ArbiterAdded(arbiter);
    }

    function removeArbiter(address arbiter) external onlyRole(OWNER_ROLE) {
        _revokeRole(ARBITER_ROLE, arbiter);
        emit ArbiterRemoved(arbiter);
    }

    function setSupportedToken(address token, bool enabled) external onlyRole(OWNER_ROLE) {
        supportedTokens[token] = enabled;
        emit SupportedTokenUpdated(token, enabled);
    }

    function setSupportedFiat(string calldata currency, bool enabled) external onlyRole(OWNER_ROLE) {
        supportedFiatCurrencies[currency] = enabled;
        emit SupportedFiatUpdated(currency, enabled);
    }

    function setMakerFee(uint256 newFeeBps) external onlyRole(OWNER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit MakerFeeUpdated(makerFeeBps, newFeeBps);
        makerFeeBps = newFeeBps;
    }

    function setTakerFee(uint256 newFeeBps) external onlyRole(OWNER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit TakerFeeUpdated(takerFeeBps, newFeeBps);
        takerFeeBps = newFeeBps;
    }

    function setSendFee(uint256 newFeeBps) external onlyRole(OWNER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit SendFeeUpdated(sendFeeBps, newFeeBps);
        sendFeeBps = newFeeBps;
    }

    function setAirtimeFee(uint256 newFeeBps) external onlyRole(OWNER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit AirtimeFeeUpdated(airtimeFeeBps, newFeeBps);
        airtimeFeeBps = newFeeBps;
    }

    function setTimers(uint256 newDefaultTimer, uint256 newAlternateTimer) external onlyRole(OWNER_ROLE) {
        require(newDefaultTimer > 0 && newAlternateTimer >= newDefaultTimer, "invalid timers");
        defaultTimer = newDefaultTimer;
        alternateTimer = newAlternateTimer;
        emit TimersUpdated(newDefaultTimer, newAlternateTimer);
    }

    function setTreasury(address newTreasury) external onlyRole(OWNER_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setTokenMessenger(address messenger, address usdcToken) external onlyRole(OWNER_ROLE) {
        tokenMessenger = ITokenMessenger(messenger);
        usdc = usdcToken;
    }

    function setCCTPChain(string calldata chainName, uint32 domain, bool enabled) external onlyRole(OWNER_ROLE) {
        cctpDomains[chainName] = domain;
        cctpChainSupported[chainName] = enabled;
        emit CCTPConfigUpdated(chainName, domain, enabled);
    }

    /// @notice Tunes CCTP V2 fast-transfer parameters. `maxFeeBps` is capped by MAX_FEE_BPS like every other fee.
    function setCCTPFastTransferParams(uint32 minFinalityThreshold, uint256 maxFeeBps) external onlyRole(OWNER_ROLE) {
        if (maxFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        cctpMinFinalityThreshold = minFinalityThreshold;
        cctpMaxFeeBps = maxFeeBps;
        emit CCTPFastTransferParamsUpdated(minFinalityThreshold, maxFeeBps);
    }

    function pause() external onlyRole(OWNER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OWNER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
    }

    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }

    function timeRemaining(uint256 tradeId) external view returns (uint256) {
        Trade memory t = trades[tradeId];
        uint256 deadline = t.lockedAt + t.timerDuration;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }
}
