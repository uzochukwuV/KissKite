// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SignalRegistry
 * @notice Immutable on-chain attestation ledger for AI trading signals.
 *
 *  Commit-Reveal Flow:
 *  1. Agent calls commitSignal(hash, expiration) — hash, agent wallet, and
 *     block timestamp are stored immutably. This binds the agent to a specific
 *     prediction before the market moves.
 *  2. Agent calls revealSignal(id, rawPayload, salt) before expiration —
 *     contract verifies keccak256(rawPayload ++ salt) == storedHash and marks
 *     the signal as revealed. The payload is now auditable on-chain.
 *
 *  No stake, no settlement, no keeper required — verification is purely
 *  cryptographic. Off-chain components handle scoring and settlement.
 */
contract SignalRegistry {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Signal {
        bytes32 hash;        // keccak256(abi.encodePacked(rawPayload, salt))
        address agent;       // Agent wallet that committed
        uint256 committedAt; // Block timestamp of commitment
        uint256 expiration;  // Unix timestamp when the prediction resolves
        bool    revealed;    // True once revealSignal succeeds
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public nextSignalId;

    mapping(uint256 => Signal)    private _signals;
    mapping(address => uint256[]) private _agentSignals;
    mapping(bytes32 => bool)      public  hashCommitted;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event SignalCommitted(
        uint256 indexed signalId,
        address indexed agent,
        bytes32         hash,
        uint256         expiration
    );

    event SignalRevealed(
        uint256 indexed signalId,
        address indexed agent,
        string          rawPayload
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error InvalidHash();
    error HashAlreadyCommitted(bytes32 hash);
    error ExpirationInPast(uint256 expiration, uint256 blockTs);
    error SignalNotFound(uint256 signalId);
    error AlreadyRevealed(uint256 signalId);
    error SignalExpired(uint256 signalId, uint256 expiration);
    error HashMismatch(bytes32 expected, bytes32 computed);
    error NotSignalAgent(address caller, address agent);

    // ─────────────────────────────────────────────────────────────────────────
    // Commit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Commit a signal hash on-chain. The hash must be
     *         keccak256(abi.encodePacked(rawPayload, salt)).
     * @param hash        Cryptographic commitment binding the agent to a prediction.
     * @param expiration  Unix timestamp when the prediction resolves.
     * @return signalId   Auto-incremented ID for this signal.
     */
    function commitSignal(bytes32 hash, uint256 expiration)
        external
        returns (uint256 signalId)
    {
        if (hash == bytes32(0))
            revert InvalidHash();
        if (hashCommitted[hash])
            revert HashAlreadyCommitted(hash);
        if (expiration <= block.timestamp)
            revert ExpirationInPast(expiration, block.timestamp);

        signalId = nextSignalId++;
        hashCommitted[hash] = true;

        _signals[signalId] = Signal({
            hash:        hash,
            agent:       msg.sender,
            committedAt: block.timestamp,
            expiration:  expiration,
            revealed:    false
        });

        _agentSignals[msg.sender].push(signalId);

        emit SignalCommitted(signalId, msg.sender, hash, expiration);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reveal
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reveal the signal payload. Must be called by the committing agent
     *         before the expiration timestamp.
     * @param onChainId   The ID returned by commitSignal.
     * @param rawPayload  The original signal data (e.g. JSON with asset/direction/price).
     * @param salt        Random salt used during the original keccak256 hash.
     */
    function revealSignal(
        uint256 onChainId,
        string  calldata rawPayload,
        string  calldata salt
    ) external {
        Signal storage sig = _signals[onChainId];

        if (sig.committedAt == 0)
            revert SignalNotFound(onChainId);
        if (sig.revealed)
            revert AlreadyRevealed(onChainId);
        if (msg.sender != sig.agent)
            revert NotSignalAgent(msg.sender, sig.agent);
        if (block.timestamp > sig.expiration)
            revert SignalExpired(onChainId, sig.expiration);

        bytes32 computed = keccak256(abi.encodePacked(rawPayload, salt));
        if (computed != sig.hash)
            revert HashMismatch(sig.hash, computed);

        sig.revealed = true;

        emit SignalRevealed(onChainId, sig.agent, rawPayload);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the stored commit record for a signal.
     * @return hash        The committed hash.
     * @return agent       The agent wallet that committed.
     * @return committedAt Block timestamp when committed.
     * @return expiration  Unix timestamp when the prediction resolves.
     * @return revealed    True once revealSignal has been called successfully.
     */
    function getSignal(uint256 id)
        external
        view
        returns (
            bytes32 hash,
            address agent,
            uint256 committedAt,
            uint256 expiration,
            bool    revealed
        )
    {
        Signal storage sig = _signals[id];
        return (sig.hash, sig.agent, sig.committedAt, sig.expiration, sig.revealed);
    }

    function getAgentSignalIds(address agent) external view returns (uint256[] memory) {
        return _agentSignals[agent];
    }

    function getAgentSignalCount(address agent) external view returns (uint256) {
        return _agentSignals[agent].length;
    }
}
