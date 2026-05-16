// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SubscriptionPass
 * @notice Soulbound ERC-1155 subscription pass contract. Subscribers pay in testnet
 *         USDT and receive a time-bounded, non-transferable access pass.
 *
 *  Passes are SOULBOUND — transfers between non-zero addresses are blocked.
 *  isActive() verifies BOTH on-chain balanceOf AND unexpired timestamp, preventing
 *  any authorization bypass via stale mappings.
 *
 *  Token IDs (tiers):
 *    1 = Basic   — 7 days   — 1 USDT
 *    2 = Pro     — 7 days   — 5 USDT
 *    3 = Elite   — 30 days  — 15 USDT
 *
 *  Each subscriber holds at most one active pass at a time. Purchasing a new
 *  pass while one is active extends it from the current expiry (not from now).
 */
contract SubscriptionPass is ERC1155, Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint8 public constant TIER_BASIC = 1;
    uint8 public constant TIER_PRO   = 2;
    uint8 public constant TIER_ELITE = 3;

    // Duration in seconds
    uint256 public constant DURATION_7D  = 7  days;
    uint256 public constant DURATION_30D = 30 days;

    // Price in USDT (18-decimal testnet USDT: 0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63)
    uint256 public constant PRICE_BASIC = 1  * 1e18;  // 1 USDT
    uint256 public constant PRICE_PRO   = 5  * 1e18;  // 5 USDT
    uint256 public constant PRICE_ELITE = 15 * 1e18;  // 15 USDT

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    IERC20 public immutable usdt;

    // subscriber → expiry timestamp (0 = no active pass)
    mapping(address => uint256) private _expiresAt;

    // subscriber → current tier
    mapping(address => uint8) private _tier;

    // Total revenue collected (in USDT wei)
    uint256 public totalRevenue;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PassPurchased(
        address indexed subscriber,
        uint8           tier,
        uint256         expiresAt,
        uint256         price
    );

    event RevenueWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InvalidTier(uint8 tier);
    error PaymentFailed();
    error TransferNotAllowed();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner, address usdtAddress)
        ERC1155("https://kite-signal.io/api/metadata/{id}.json")
        Ownable(initialOwner)
    {
        usdt = IERC20(usdtAddress);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Soulbound: block all transfers between non-zero addresses
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Override _update to make passes soulbound. Only minting (from == 0)
     *      and burning (to == 0) are allowed. Any peer-to-peer transfer reverts.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert TransferNotAllowed();
        }
        super._update(from, to, ids, values);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Purchase
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Purchase a subscription pass.
     * @param tier  1 = Basic (7d, 1 USDT), 2 = Pro (7d, 5 USDT), 3 = Elite (30d, 15 USDT)
     */
    function purchase(uint8 tier) external nonReentrant {
        (uint256 price, uint256 duration) = _tierConfig(tier);

        // Pull payment from caller (requires prior ERC-20 approval)
        bool ok = usdt.transferFrom(msg.sender, address(this), price);
        if (!ok) revert PaymentFailed();

        totalRevenue += price;

        // Calculate new expiry — extend from current expiry if still active
        uint256 currentExpiry = _expiresAt[msg.sender];
        uint256 baseTime = (currentExpiry > block.timestamp) ? currentExpiry : block.timestamp;
        uint256 newExpiry = baseTime + duration;

        // Burn any existing pass token for the old tier, mint new one
        uint8 oldTier = _tier[msg.sender];
        if (oldTier != 0 && currentExpiry > block.timestamp) {
            _burn(msg.sender, uint256(oldTier), 1);
        }

        _expiresAt[msg.sender] = newExpiry;
        _tier[msg.sender]      = tier;

        _mint(msg.sender, uint256(tier), 1, "");

        emit PassPurchased(msg.sender, tier, newExpiry, price);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Check if a subscriber has an active pass.
     *         Verifies BOTH token ownership (balanceOf > 0) AND unexpired timestamp.
     *         Since passes are soulbound, this dual check is the authoritative
     *         source of truth — no mapping-only bypass is possible.
     *
     * @return active    True if the pass is unexpired AND the wallet holds the token.
     * @return tier      The subscriber's current tier (0 if none).
     * @return expiresAt The unix timestamp when the pass expires (0 if none).
     */
    function isActive(address subscriber)
        external
        view
        returns (bool active, uint8 tier, uint256 expiresAt)
    {
        tier      = _tier[subscriber];
        expiresAt = _expiresAt[subscriber];

        // Dual verification: unexpired timestamp AND on-chain token balance
        bool unexpired = (expiresAt > block.timestamp);
        bool hasToken  = (tier != 0 && balanceOf(subscriber, uint256(tier)) > 0);

        active = unexpired && hasToken;
    }

    /**
     * @notice Get the price and duration for a given tier.
     */
    function tierConfig(uint8 tier)
        external
        pure
        returns (uint256 price, uint256 duration, string memory name)
    {
        if (tier == TIER_BASIC)  return (PRICE_BASIC, DURATION_7D,  "Basic");
        if (tier == TIER_PRO)    return (PRICE_PRO,   DURATION_7D,  "Pro");
        if (tier == TIER_ELITE)  return (PRICE_ELITE, DURATION_30D, "Elite");
        revert InvalidTier(tier);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw accumulated USDT revenue.
     */
    function withdrawRevenue(address to) external onlyOwner nonReentrant {
        uint256 balance = usdt.balanceOf(address(this));
        require(balance > 0, "No balance");
        bool ok = usdt.transfer(to, balance);
        require(ok, "Transfer failed");
        emit RevenueWithdrawn(to, balance);
    }

    function setURI(string memory newURI) external onlyOwner {
        _setURI(newURI);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _tierConfig(uint8 tier)
        internal
        pure
        returns (uint256 price, uint256 duration)
    {
        if (tier == TIER_BASIC)  return (PRICE_BASIC, DURATION_7D);
        if (tier == TIER_PRO)    return (PRICE_PRO,   DURATION_7D);
        if (tier == TIER_ELITE)  return (PRICE_ELITE, DURATION_30D);
        revert InvalidTier(tier);
    }
}
