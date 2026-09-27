/**
 * [WHO]: Provides output-token recovery and token-budget continuation helpers for agent loops.
 * [FROM]: Depends on @catui/ai message types and AgentLoopConfig budget settings.
 * [TO]: Consumed by standard and structured-adaptive agent loops.
 * [HERE]: core/lib/agent-core/src/agent-loop-continuations.ts within agent-core; shared loop continuation policy.
 */

import type { AssistantMessage, UserMessage } from "@catui/ai/types";
import type { AgentLoopConfig } from "./types.js";

export const DEFAULT_OUTPUT_TOKEN_BUDGET_THRESHOLD_PCT = 0.9;
export const DEFAULT_OUTPUT_TOKEN_BUDGET_CONTINUATIONS = 3;

export function computeRecoveryMaxTokens(config: AgentLoopConfig, message: AssistantMessage): number | undefined {
	const modelMaxTokens = Math.max(1, Math.floor(config.model.maxTokens || 1));
	const configured = config.maxTokens !== undefined ? Math.max(1, Math.floor(config.maxTokens)) : undefined;
	const observedOutput = Math.max(1, Math.floor(message.usage.output || 1));
	const baseline = configured ?? observedOutput;
	const expanded = Math.max(baseline + 1, Math.ceil(Math.max(baseline, observedOutput) * 1.5));
	return Math.min(modelMaxTokens, expanded);
}

export function createOutputTokenRecoveryMessage(attempt: number): UserMessage {
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: `Continue the previous response from exactly where it stopped. This is automatic output-token recovery attempt ${attempt}.`,
			},
		],
		timestamp: Date.now(),
	};
}

export function createTokenBudgetContinuation(
	config: AgentLoopConfig,
	outputTokens: number,
	continuationCount: number,
): { message: UserMessage; outputTokens: number; targetTokens: number } | undefined {
	const budget = config.outputTokenBudget;
	if (!budget) return undefined;
	const targetTokens = Math.max(1, Math.floor(budget.targetTokens));
	const thresholdPct = clamp(
		budget.thresholdPct ?? DEFAULT_OUTPUT_TOKEN_BUDGET_THRESHOLD_PCT,
		0,
		1,
	);
	const maxContinuations = Math.max(
		0,
		Math.floor(budget.maxContinuations ?? DEFAULT_OUTPUT_TOKEN_BUDGET_CONTINUATIONS),
	);
	if (maxContinuations <= continuationCount) return undefined;

	const normalizedOutputTokens = Math.max(0, Math.floor(outputTokens));
	const requiredTokens = Math.ceil(targetTokens * thresholdPct);
	if (normalizedOutputTokens >= requiredTokens) return undefined;

	const message: UserMessage = {
		role: "user",
		content: [
			{
				type: "text",
				text:
					`Continue because the output token budget is underused ` +
					`(${normalizedOutputTokens}/${targetTokens} tokens). Add the missing useful detail directly; ` +
					`do not recap or apologize.`,
			},
		],
		timestamp: Date.now(),
	};
	return { message, outputTokens: normalizedOutputTokens, targetTokens };
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}
