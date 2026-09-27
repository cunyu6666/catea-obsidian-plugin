/**
 * [WHO]: Provides resolveAgentRunLoopFramework(), buildAgentRunPolicy()
 * [FROM]: Depends on AgentLoopConfig, AgentRunPolicy, normalizeAgentLoopFramework
 * [TO]: Consumed by standard and structured-adaptive agent loops
 * [HERE]: core/lib/agent-core/src/agent-run-result.ts - shared result telemetry helpers
 */
import type { AgentLoopConfig, AgentLoopFramework, AgentRunPolicy } from "./types.js";
import { normalizeAgentLoopFramework } from "./types.js";

export function resolveAgentRunLoopFramework(config: AgentLoopConfig): AgentLoopFramework {
	return normalizeAgentLoopFramework(config.loopFramework) ?? "standard";
}

export function buildAgentRunPolicy(config: AgentLoopConfig): AgentRunPolicy {
	const policy: AgentRunPolicy = {};
	if (config.maxModelErrorRecoveryAttempts !== undefined) {
		policy.maxModelErrorRecoveryAttempts = config.maxModelErrorRecoveryAttempts;
	}
	if (config.maxOutputTokenRecoveryAttempts !== undefined) {
		policy.maxOutputTokenRecoveryAttempts = config.maxOutputTokenRecoveryAttempts;
	}
	if (config.outputTokenBudget !== undefined) {
		policy.outputTokenBudget = { ...config.outputTokenBudget };
	}
	if (config.maxStopHookContinuations !== undefined) {
		policy.maxStopHookContinuations = config.maxStopHookContinuations;
	}
	if (config.maxToolConcurrency !== undefined) {
		policy.maxToolConcurrency = config.maxToolConcurrency;
	}
	if (config.maxToolResultBatchSizeChars !== undefined) {
		policy.maxToolResultBatchSizeChars = config.maxToolResultBatchSizeChars;
	}
	if (config.maxTurnsPerPrompt !== undefined) {
		policy.maxTurnsPerPrompt = config.maxTurnsPerPrompt;
	}
	if (config.maxToolCallsPerPrompt !== undefined) {
		policy.maxToolCallsPerPrompt = config.maxToolCallsPerPrompt;
	}
	if (config.loopProgress !== undefined) {
		policy.loopProgress = { ...config.loopProgress };
	}
	return policy;
}
