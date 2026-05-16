// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ClientAgentVault
 * @notice Per-agent secure spending vault with daily budget rules.
 *         Each AI agent registered on the platform gets its own vault.
 *         The vault enforces spending limits so agents cannot drain funds
 *         beyond the configured daily budget per target contract.
 */
contract ClientAgentVault is Ownable, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct SpendingRule {
        uint256 timeWindow;            // Rolling window in seconds (e.g. 86400 = 24h)
        uint256 budget;                // Max spend within the window (in wei)
        uint256 windowStartTime;       // Start of the current window
        uint256 spentInWindow;         // Accumulated spend in current window
        address[] targetContracts;     // Whitelisted contracts this rule applies to
    }

    struct CallRequest {
        address target;
        uint256 value;
        bytes   data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    // The agent AA address authorised to submit calls
    address public agent;

    // Platform-level operator that can update rules
    address public operator;

    SpendingRule[] public spendingRules;

    uint256 public totalDeposited;
    uint256 public totalSpent;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event Deposited(address indexed from, uint256 amount);
    event CallExecuted(address indexed target, uint256 value, bytes data, bytes returnData);
    event BatchExecuted(uint256 callCount);
    event AgentUpdated(address indexed newAgent);
    event OperatorUpdated(address indexed newOperator);
    event RulesConfigured(uint256 ruleCount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error Unauthorized();
    error BudgetExceeded(uint256 attempted, uint256 remaining);
    error TargetNotWhitelisted(address target);
    error CallFailed(address target, bytes returnData);
    error InvalidRule();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner, address initialAgent, address initialOperator)
        Ownable(initialOwner)
    {
        agent    = initialAgent;
        operator = initialOperator;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAgent() {
        if (msg.sender != agent) revert Unauthorized();
        _;
    }

    modifier onlyOperatorOrOwner() {
        if (msg.sender != operator && msg.sender != owner()) revert Unauthorized();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────────────────────────────────

    receive() external payable {
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rule configuration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Replace all spending rules. Called by the platform operator.
     */
    function configureSpendingRules(
        uint256[]   calldata timeWindows,
        uint256[]   calldata budgets,
        uint256[]   calldata windowStartTimes,
        address[][] calldata targetContractArrays
    ) external onlyOperatorOrOwner {
        require(
            timeWindows.length == budgets.length &&
            budgets.length == windowStartTimes.length &&
            windowStartTimes.length == targetContractArrays.length,
            "Array length mismatch"
        );

        delete spendingRules;

        for (uint256 i = 0; i < timeWindows.length; i++) {
            if (timeWindows[i] == 0 || budgets[i] == 0) revert InvalidRule();

            spendingRules.push(SpendingRule({
                timeWindow:      timeWindows[i],
                budget:          budgets[i],
                windowStartTime: windowStartTimes[i],
                spentInWindow:   0,
                targetContracts: targetContractArrays[i]
            }));
        }

        emit RulesConfigured(timeWindows.length);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent execution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Execute a single call from the agent. Enforces spending rules.
     */
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyAgent
        nonReentrant
        returns (bytes memory returnData)
    {
        _enforceSpendingRules(target, value);

        bool success;
        (success, returnData) = target.call{value: value}(data);
        if (!success) revert CallFailed(target, returnData);

        totalSpent += value;
        emit CallExecuted(target, value, data, returnData);
    }

    /**
     * @notice Execute a batch of calls atomically. All calls succeed or all revert.
     */
    function executeBatch(CallRequest[] calldata calls)
        external
        onlyAgent
        nonReentrant
    {
        for (uint256 i = 0; i < calls.length; i++) {
            _enforceSpendingRules(calls[i].target, calls[i].value);
        }

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory returnData) = calls[i].target.call{
                value: calls[i].value
            }(calls[i].data);
            if (!success) revert CallFailed(calls[i].target, returnData);
            totalSpent += calls[i].value;
            emit CallExecuted(calls[i].target, calls[i].value, calls[i].data, returnData);
        }

        emit BatchExecuted(calls.length);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _enforceSpendingRules(address target, uint256 value) internal {
        if (value == 0) return; // No-value calls bypass budget checks

        for (uint256 i = 0; i < spendingRules.length; i++) {
            SpendingRule storage rule = spendingRules[i];

            bool targetMatches = false;
            for (uint256 j = 0; j < rule.targetContracts.length; j++) {
                if (rule.targetContracts[j] == target) {
                    targetMatches = true;
                    break;
                }
            }
            if (!targetMatches) continue;

            // Roll window if expired
            if (block.timestamp >= rule.windowStartTime + rule.timeWindow) {
                rule.windowStartTime = block.timestamp;
                rule.spentInWindow   = 0;
            }

            uint256 remaining = rule.budget > rule.spentInWindow
                ? rule.budget - rule.spentInWindow
                : 0;

            if (value > remaining)
                revert BudgetExceeded(value, remaining);

            rule.spentInWindow += value;
            return; // Rule matched — done
        }

        // If no rule covers this target and value > 0, it's not whitelisted
        if (spendingRules.length > 0) revert TargetNotWhitelisted(target);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getRuleCount() external view returns (uint256) {
        return spendingRules.length;
    }

    function getRemainingBudget(uint256 ruleIndex) external view returns (uint256) {
        SpendingRule storage rule = spendingRules[ruleIndex];
        if (block.timestamp >= rule.windowStartTime + rule.timeWindow) return rule.budget;
        return rule.budget > rule.spentInWindow ? rule.budget - rule.spentInWindow : 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setAgent(address newAgent) external onlyOwner {
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        (bool sent,) = to.call{value: amount}("");
        require(sent, "Transfer failed");
        emit FundsWithdrawn(to, amount);
    }
}
