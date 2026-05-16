// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SignalRegistry
 * @notice Immutable on-chain attestation ledger for AI trading signals.
 *         Agents commit a cryptographic hash of their signal before broadcasting
 *         to prevent post-hoc deletion or fabrication of predictions.
 */
contract SignalRegistry is Ownable, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum SignalStatus {
        Pending,    // Committed, not yet settled
        Settled,    // Resolved — outcome recorded
        Expired     // Past deadline, no settlement submitted
    }

    struct Signal {
        bytes32   signalHash;    // keccak256 of (asset, direction, targetPrice, expiration)
        address   agent;         // Agent vault address that committed
        uint256   expiration;    // Unix timestamp when signal resolves
        uint256   committedAt;   // Block timestamp of commitment
        uint256   stakeAmount;   // Entry stake locked (in settlement token units)
        SignalStatus status;
        bool      accurate;      // Set on settlement: was signal correct?
        int256    pnlBps;        // Performance in basis points (set on settlement)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public nextSignalId;
    mapping(uint256 => Signal) public signals;

    // Agent address → list of signal IDs they have committed
    mapping(address => uint256[]) public agentSignals;

    // Track whether a hash has already been committed (prevent replay)
    mapping(bytes32 => bool) public hashCommitted;

    // Authorised settler: the off-chain keeper that resolves outcomes
    address public settler;

    // Minimum stake required per signal submission (in wei)
    uint256 public minStake;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event SignalCommitted(
        uint256 indexed signalId,
        address indexed agent,
        bytes32 signalHash,
        uint256 expiration,
        uint256 stakeAmount
    );

    event SignalSettled(
        uint256 indexed signalId,
        address indexed agent,
        bool accurate,
        int256 pnlBps
    );

    event SignalExpired(uint256 indexed signalId);
    event SettlerUpdated(address indexed newSettler);
    event MinStakeUpdated(uint256 newMinStake);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InsufficientStake(uint256 sent, uint256 required);
    error HashAlreadyCommitted(bytes32 signalHash);
    error ExpirationInPast(uint256 expiration, uint256 now_);
    error SignalNotFound(uint256 signalId);
    error SignalNotPending(uint256 signalId, SignalStatus status);
    error SignalNotExpired(uint256 signalId);
    error Unauthorized();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner, address initialSettler, uint256 initialMinStake)
        Ownable(initialOwner)
    {
        settler = initialSettler;
        minStake = initialMinStake;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlySettler() {
        if (msg.sender != settler) revert Unauthorized();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent actions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Commit a signal hash to the attestation ledger.
     * @param signalHash  keccak256(abi.encodePacked(asset, direction, targetPrice, expiration))
     * @param expiration  Unix timestamp when the prediction resolves
     */
    function commitSignal(bytes32 signalHash, uint256 expiration)
        external
        payable
        nonReentrant
        returns (uint256 signalId)
    {
        if (msg.value < minStake)
            revert InsufficientStake(msg.value, minStake);
        if (hashCommitted[signalHash])
            revert HashAlreadyCommitted(signalHash);
        if (expiration <= block.timestamp)
            revert ExpirationInPast(expiration, block.timestamp);

        signalId = nextSignalId++;
        hashCommitted[signalHash] = true;

        signals[signalId] = Signal({
            signalHash:  signalHash,
            agent:       msg.sender,
            expiration:  expiration,
            committedAt: block.timestamp,
            stakeAmount: msg.value,
            status:      SignalStatus.Pending,
            accurate:    false,
            pnlBps:      0
        });

        agentSignals[msg.sender].push(signalId);

        emit SignalCommitted(signalId, msg.sender, signalHash, expiration, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settler actions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Settle a signal after its expiration with the oracle-verified outcome.
     * @param signalId  The ID of the signal to settle
     * @param accurate  Whether the agent's prediction was correct
     * @param pnlBps    Profit/loss in basis points (can be negative)
     */
    function settleSignal(uint256 signalId, bool accurate, int256 pnlBps)
        external
        onlySettler
        nonReentrant
    {
        Signal storage sig = signals[signalId];
        if (sig.committedAt == 0) revert SignalNotFound(signalId);
        if (sig.status != SignalStatus.Pending)
            revert SignalNotPending(signalId, sig.status);

        sig.status   = SignalStatus.Settled;
        sig.accurate = accurate;
        sig.pnlBps   = pnlBps;

        // Return stake to agent on accurate prediction; retain on miss
        if (accurate && sig.stakeAmount > 0) {
            (bool sent,) = sig.agent.call{value: sig.stakeAmount}("");
            // Silently continue if transfer fails — funds remain in contract
            if (!sent) {
                sig.stakeAmount = 0;
            }
        }

        emit SignalSettled(signalId, sig.agent, accurate, pnlBps);
    }

    /**
     * @notice Mark a signal as expired if it was never settled.
     */
    function markExpired(uint256 signalId) external {
        Signal storage sig = signals[signalId];
        if (sig.committedAt == 0) revert SignalNotFound(signalId);
        if (sig.status != SignalStatus.Pending)
            revert SignalNotPending(signalId, sig.status);
        if (block.timestamp <= sig.expiration + 1 hours)
            revert SignalNotExpired(signalId);

        sig.status = SignalStatus.Expired;
        emit SignalExpired(signalId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return signals[signalId];
    }

    function getAgentSignalIds(address agent) external view returns (uint256[] memory) {
        return agentSignals[agent];
    }

    function getAgentSignalCount(address agent) external view returns (uint256) {
        return agentSignals[agent].length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setSettler(address newSettler) external onlyOwner {
        settler = newSettler;
        emit SettlerUpdated(newSettler);
    }

    function setMinStake(uint256 newMinStake) external onlyOwner {
        minStake = newMinStake;
        emit MinStakeUpdated(newMinStake);
    }

    function withdrawFunds(address payable to, uint256 amount) external onlyOwner nonReentrant {
        (bool sent,) = to.call{value: amount}("");
        require(sent, "Transfer failed");
        emit FundsWithdrawn(to, amount);
    }

    receive() external payable {}
}
