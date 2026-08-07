// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title UsernameRegistry
/// @notice On-chain bidirectional username <-> wallet resolution for vLitePay.
/// @dev Registration fee is paid in USDC (or any configured fee token) and is
///      fully configurable by the DEFAULT_ADMIN_ROLE (vLitePay owner). No values
///      are hardcoded beyond safe fallback defaults set in the constructor.
contract UsernameRegistry is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    /// @notice Token used to pay the registration fee (e.g. native USDC on Arc).
    IERC20 public feeToken;

    /// @notice Registration fee, denominated in `feeToken` smallest units.
    /// @dev Configurable via setUsernameFee. Default set in constructor (e.g. $1 USDC = 1_000_000 for 6 decimals).
    uint256 public registrationFee;

    /// @notice Treasury address that receives collected fees.
    address public treasury;

    /// @notice username => wallet address
    mapping(string => address) public usernameToAddress;

    /// @notice wallet address => username (reverse lookup)
    mapping(address => string) public addressToUsername;

    /// @notice Minimum / maximum username length, configurable.
    uint256 public minUsernameLength = 3;
    uint256 public maxUsernameLength = 20;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event UsernameRegistered(address indexed wallet, string username, uint256 feePaid);
    event UsernameReleased(address indexed wallet, string username);
    event UsernameTransferred(address indexed from, address indexed to, string username);
    event FeeTokenUpdated(address indexed oldToken, address indexed newToken);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event UsernameLengthBoundsUpdated(uint256 minLength, uint256 maxLength);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error UsernameTaken();
    error UsernameNotOwned();
    error InvalidUsernameLength();
    error InvalidUsernameCharacters();
    error NoUsernameRegistered();
    error ZeroAddress();

    constructor(address _feeToken, uint256 _registrationFee, address _treasury, address _owner) {
        if (_feeToken == address(0) || _treasury == address(0) || _owner == address(0)) revert ZeroAddress();

        feeToken = IERC20(_feeToken);
        registrationFee = _registrationFee;
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(OWNER_ROLE, _owner);
    }

    // ---------------------------------------------------------------------
    // Public / external — user actions
    // ---------------------------------------------------------------------

    /// @notice Register a username for msg.sender, paying the configured fee.
    function registerUsername(string calldata username) external nonReentrant whenNotPaused {
        _validateUsername(username);
        if (usernameToAddress[username] != address(0)) revert UsernameTaken();

        // Release any previous username owned by this address first.
        string memory existing = addressToUsername[msg.sender];
        if (bytes(existing).length != 0) {
            delete usernameToAddress[existing];
            emit UsernameReleased(msg.sender, existing);
        }

        if (registrationFee > 0) {
            feeToken.safeTransferFrom(msg.sender, treasury, registrationFee);
        }

        usernameToAddress[username] = msg.sender;
        addressToUsername[msg.sender] = username;

        emit UsernameRegistered(msg.sender, username, registrationFee);
    }

    /// @notice Voluntarily release the caller's username.
    function releaseUsername() external nonReentrant whenNotPaused {
        string memory username = addressToUsername[msg.sender];
        if (bytes(username).length == 0) revert NoUsernameRegistered();

        delete usernameToAddress[username];
        delete addressToUsername[msg.sender];

        emit UsernameReleased(msg.sender, username);
    }

    /// @notice Transfer ownership of a username to another address (e.g. wallet migration).
    function transferUsername(address to) external nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        string memory username = addressToUsername[msg.sender];
        if (bytes(username).length == 0) revert NoUsernameRegistered();
        if (usernameToAddress[username] != msg.sender) revert UsernameNotOwned();

        // If recipient already has a username, keep it — usernames are 1:1 per wallet,
        // so recipient's existing mapping (if any) is left untouched and the new one overwrites.
        string memory recipientExisting = addressToUsername[to];
        if (bytes(recipientExisting).length != 0) {
            delete usernameToAddress[recipientExisting];
        }

        delete addressToUsername[msg.sender];
        usernameToAddress[username] = to;
        addressToUsername[to] = username;

        emit UsernameTransferred(msg.sender, to, username);
    }

    // ---------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------

    function resolve(string calldata username) external view returns (address) {
        return usernameToAddress[username];
    }

    function reverseResolve(address wallet) external view returns (string memory) {
        return addressToUsername[wallet];
    }

    function isAvailable(string calldata username) external view returns (bool) {
        return usernameToAddress[username] == address(0);
    }

    // ---------------------------------------------------------------------
    // Owner / admin configuration — fully dynamic, nothing hardcoded
    // ---------------------------------------------------------------------

    function setUsernameFee(uint256 newFee) external onlyRole(OWNER_ROLE) {
        emit RegistrationFeeUpdated(registrationFee, newFee);
        registrationFee = newFee;
    }

    function setFeeToken(address newToken) external onlyRole(OWNER_ROLE) {
        if (newToken == address(0)) revert ZeroAddress();
        emit FeeTokenUpdated(address(feeToken), newToken);
        feeToken = IERC20(newToken);
    }

    function setTreasury(address newTreasury) external onlyRole(OWNER_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setUsernameLengthBounds(uint256 minLength, uint256 maxLength) external onlyRole(OWNER_ROLE) {
        require(minLength > 0 && minLength <= maxLength, "invalid bounds");
        minUsernameLength = minLength;
        maxUsernameLength = maxLength;
        emit UsernameLengthBoundsUpdated(minLength, maxLength);
    }

    function addArbiterLikeAdmin(address account) external onlyRole(OWNER_ROLE) {
        // Convenience for granting additional OWNER_ROLE admins (e.g. ops team).
        grantRole(OWNER_ROLE, account);
    }

    function pause() external onlyRole(OWNER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OWNER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _validateUsername(string calldata username) internal view {
        bytes memory b = bytes(username);
        if (b.length < minUsernameLength || b.length > maxUsernameLength) revert InvalidUsernameLength();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            bool isLower = (char >= 0x61 && char <= 0x7A); // a-z
            bool isDigit = (char >= 0x30 && char <= 0x39); // 0-9
            bool isUnderscore = (char == 0x5F); // _
            if (!isLower && !isDigit && !isUnderscore) revert InvalidUsernameCharacters();
        }
    }
}
