// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationRegistry
 * @notice Immutable on-chain settlement and reputation ledger for Kite agents.
 *
 * After an off-chain scorer settles a signal, the designated scorer wallet writes
 * the outcome here so subscribers can audit agent reputation against the
 * SignalRegistry signal ID.
 */
contract ReputationRegistry is Ownable {

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct Reputation {
        uint256 totalSignals;
        uint256 settledSignals;
        uint256 accurateSignals;
        int256 cumulativePnlBps;
        uint256 reputationScore;
    }

    struct SettlementRecord {
        address agent;
        bool accurate;
        int256 pnlBps;
        uint256 signalId;
        uint256 recordedAt;
        uint256 reputationScore;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public scorer;

    mapping(address => Reputation) private _reputations;
    mapping(uint256 => SettlementRecord) private _settlements;
    mapping(uint256 => bool) public signalRecorded;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ScorerUpdated(address indexed scorer);

    event ReputationUpdated(
        address indexed agent,
        uint256 reputationScore,
        uint256 totalSignals
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error SignalAlreadyRecorded(uint256 signalId);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner, address initialScorer) Ownable(initialOwner) {
        scorer = initialScorer;
        emit ScorerUpdated(initialScorer);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setScorer(address newScorer) external onlyOwner {
        scorer = newScorer;
        emit ScorerUpdated(newScorer);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settlement recording
    // ─────────────────────────────────────────────────────────────────────────

    function recordSettlement(
        address agent,
        bool accurate,
        int256 pnlBps,
        uint256 signalId
    ) external {
        if (msg.sender != scorer) revert Unauthorized();
        if (signalRecorded[signalId]) revert SignalAlreadyRecorded(signalId);

        signalRecorded[signalId] = true;

        Reputation storage reputation = _reputations[agent];
        reputation.totalSignals += 1;
        reputation.settledSignals += 1;
        if (accurate) {
            reputation.accurateSignals += 1;
        }
        reputation.cumulativePnlBps += pnlBps;
        reputation.reputationScore = _score(reputation.accurateSignals, reputation.settledSignals);

        _settlements[signalId] = SettlementRecord({
            agent: agent,
            accurate: accurate,
            pnlBps: pnlBps,
            signalId: signalId,
            recordedAt: block.timestamp,
            reputationScore: reputation.reputationScore
        });

        emit ReputationUpdated(agent, reputation.reputationScore, reputation.totalSignals);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getReputation(address agent) external view returns (Reputation memory) {
        return _reputations[agent];
    }

    function getScore(address agent) external view returns (uint256) {
        return _reputations[agent].reputationScore;
    }

    function getSettlement(uint256 signalId) external view returns (SettlementRecord memory) {
        return _settlements[signalId];
    }

    function _score(uint256 accurateSignals, uint256 settledSignals) private pure returns (uint256) {
        if (settledSignals == 0) return 0;
        return (accurateSignals * 10000) / settledSignals;
    }
}
