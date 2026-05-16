// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SignalRegistry
 * @notice Immutable on-chain attestation ledger for AI trading signals.
 *
 *  Commit-Reveal Flow:
 *  1. Agent calls commitSignal(hash, expiration) — hash is stored immutably.
 *  2. Agent calls revealSignal(id, rawPayload, salt) before expiration —
 *     contract verifies keccak256(rawPayload || salt) == storedHash, marks revealed.
 *  3. After expiration, the keeper calls settleSignal(id, accurate, pnlBps)
 *     to record the oracle-verified outcome.
 *
 *  This two-step design prevents agents from fabricating historical performance
 *  or deleting bad predictions: the hash binds them to a prediction before
 *  the market moves; the reveal makes the payload auditable on-chain.
 */
contract SignalRegistry is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum SignalStatus {
        Pending,   // Committed, not yet revealed/settled
        Revealed,  // Reveal verified on-chain; awaiting settlement
        Settled,   // Resolved with oracle outcome
        Expired    // Past deadline with no reveal or settlement
    }

    struct Signal {
        bytes32       signalHash;    // keccak256(abi.encodePacked(rawPayload, salt))
        address       agent;         // Agent wallet that committed
        uint256       expiration;    // Unix timestamp when the prediction resolves
        uint256       committedAt;   // Block timestamp of commitment
        uint256       stakeAmount;   // ETH stake locked at commit
        SignalStatus  status;
        bool          accurate;      // Set on settlement
        int256        pnlBps;        // Profit/loss in basis points (set on settlement)
        string        rawPayload;    // Stored on reveal: the actual signal JSON
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public nextSignalId;

    mapping(uint256 => Signal) private _signals;
    mapping(address => uint256[]) private _agentSignals;
    mapping(bytes32 => bool) public hashCommitted;

    address public settler;
    uint256 public minStake;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event SignalCommitted(
        uint256 indexed signalId,
        address indexed agent,
        bytes32         signalHash,
        uint256         expiration,
        uint256         stakeAmount
    );

    event SignalRevealed(
        uint256 indexed signalId,
        address indexed agent,
        string          rawPayload
    );

    event SignalSettled(
        uint256 indexed signalId,
        address indexed agent,
        bool            accurate,
        int256          pnlBps
    );

    event SignalExpired(uint256 indexed signalId);
    event SettlerUpdated(address indexed newSettler);
    event MinStakeUpdated(uint256 newMinStake);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InsufficientStake(uint256 sent, uint256 required);
    error HashAlreadyCommitted(bytes32 signalHash);
    error InvalidHash();
    error ExpirationInPast(uint256 expiration, uint256 blockTs);
    error SignalNotFound(uint256 signalId);
    error SignalNotPending(uint256 signalId, SignalStatus status);
    error SignalNotRevealed(uint256 signalId);
    error SignalExpiredOnReveal(uint256 signalId, uint256 expiration);
    error HashMismatch(bytes32 expected, bytes32 computed);
    error NotSignalAgent(address caller, address agent);
    error Unauthorized();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner, address initialSettler, uint256 initialMinStake)
        Ownable(initialOwner)
    {
        settler  = initialSettler;
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
    // Agent: Commit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Commit a signal hash. The hash must be keccak256(abi.encodePacked(rawPayload, salt)).
     * @param signalHash  Hash binding the agent to a specific prediction.
     * @param expiration  Unix timestamp when the prediction resolves.
     */
    function commitSignal(bytes32 signalHash, uint256 expiration)
        external
        payable
        nonReentrant
        returns (uint256 signalId)
    {
        if (msg.value < minStake)
            revert InsufficientStake(msg.value, minStake);
        if (signalHash == bytes32(0))
            revert InvalidHash();
        if (hashCommitted[signalHash])
            revert HashAlreadyCommitted(signalHash);
        if (expiration <= block.timestamp)
            revert ExpirationInPast(expiration, block.timestamp);

        signalId = nextSignalId++;
        hashCommitted[signalHash] = true;

        _signals[signalId] = Signal({
            signalHash:  signalHash,
            agent:       msg.sender,
            expiration:  expiration,
            committedAt: block.timestamp,
            stakeAmount: msg.value,
            status:      SignalStatus.Pending,
            accurate:    false,
            pnlBps:      0,
            rawPayload:  ""
        });

        _agentSignals[msg.sender].push(signalId);

        emit SignalCommitted(signalId, msg.sender, signalHash, expiration, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent: Reveal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal the signal payload. Must be called by the committing agent
     *         before the expiration timestamp.
     * @param signalId    The on-chain ID returned by commitSignal.
     * @param rawPayload  The original signal data (e.g. JSON: asset/direction/price).
     * @param salt        Random salt appended during hashing to prevent front-running.
     */
    function revealSignal(
        uint256 signalId,
        string  calldata rawPayload,
        string  calldata salt
    ) external {
        Signal storage sig = _signals[signalId];

        if (sig.committedAt == 0)
            revert SignalNotFound(signalId);
        if (sig.status != SignalStatus.Pending)
            revert SignalNotPending(signalId, sig.status);
        if (msg.sender != sig.agent)
            revert NotSignalAgent(msg.sender, sig.agent);
        if (block.timestamp > sig.expiration)
            revert SignalExpiredOnReveal(signalId, sig.expiration);

        bytes32 computed = keccak256(abi.encodePacked(rawPayload, salt));
        if (computed != sig.signalHash)
            revert HashMismatch(sig.signalHash, computed);

        sig.status     = SignalStatus.Revealed;
        sig.rawPayload = rawPayload;

        emit SignalRevealed(signalId, sig.agent, rawPayload);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Keeper: Settle
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Settle a signal with the oracle-verified outcome. Only the
     *         designated settler (keeper) can call this. Signal must be Revealed.
     * @param signalId  The on-chain ID to settle.
     * @param accurate  Whether the prediction was correct.
     * @param pnlBps    Profit/loss in basis points (signed).
     */
    function settleSignal(uint256 signalId, bool accurate, int256 pnlBps)
        external
        onlySettler
        nonReentrant
    {
        Signal storage sig = _signals[signalId];

        if (sig.committedAt == 0)
            revert SignalNotFound(signalId);
        if (sig.status != SignalStatus.Revealed)
            revert SignalNotRevealed(signalId);

        sig.status   = SignalStatus.Settled;
        sig.accurate = accurate;
        sig.pnlBps   = pnlBps;

        // Return stake on accurate prediction
        if (accurate && sig.stakeAmount > 0) {
            (bool sent,) = sig.agent.call{value: sig.stakeAmount}("");
            if (!sent) sig.stakeAmount = 0;
        }

        emit SignalSettled(signalId, sig.agent, accurate, pnlBps);
    }

    /**
     * @notice Mark a signal as expired if not revealed past the deadline.
     *         Anyone can call this once the expiration + grace period has elapsed.
     */
    function markExpired(uint256 signalId) external {
        Signal storage sig = _signals[signalId];

        if (sig.committedAt == 0)
            revert SignalNotFound(signalId);
        if (sig.status != SignalStatus.Pending)
            revert SignalNotPending(signalId, sig.status);
        // Grace period: 1 hour after expiration
        require(block.timestamp > sig.expiration + 1 hours, "Grace period active");

        sig.status = SignalStatus.Expired;
        emit SignalExpired(signalId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getSignal(uint256 signalId) external view returns (Signal memory) {
        return _signals[signalId];
    }

    function getAgentSignalIds(address agent) external view returns (uint256[] memory) {
        return _agentSignals[agent];
    }

    function getAgentSignalCount(address agent) external view returns (uint256) {
        return _agentSignals[agent].length;
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
    }

    receive() external payable {}
}
