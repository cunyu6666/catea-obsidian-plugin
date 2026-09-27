/**
 * [WHO]: Provides PendingToolUseSummary, flushReadyToolUseSummaries(), and startToolUseSummary().
 * [FROM]: Depends on AgentLoopConfig/AgentMessage contracts and tool result message shapes.
 * [TO]: Consumed by standard and structured-adaptive agent loops for non-blocking tool summaries.
 * [HERE]: core/lib/agent-core/src/agent-loop-tool-summaries.ts within agent-core; shared tool summary policy.
 */

import type { ToolResultMessage } from "@catui/ai/types";
import type { EventStream } from "@catui/ai/events";
import type { AgentEvent, AgentLoopConfig, AgentMessage } from "./types.js";

export type PendingToolUseSummary = {
	read(): { settled: boolean; value?: AgentMessage };
};

export function flushReadyToolUseSummaries(
	pendingSummaries: PendingToolUseSummary[],
	currentMessages: AgentMessage[],
	newMessages: AgentMessage[],
	stream: EventStream<AgentEvent, AgentMessage[]>,
): PendingToolUseSummary[] {
	if (pendingSummaries.length === 0) {
		return pendingSummaries;
	}

	const pending: PendingToolUseSummary[] = [];
	for (const summary of pendingSummaries) {
		const result = summary.read();
		if (!result.settled) {
			pending.push(summary);
			continue;
		}
		if (!result.value) {
			continue;
		}
		currentMessages.push(result.value);
		newMessages.push(result.value);
		stream.push({ type: "message_start", message: result.value });
		stream.push({ type: "message_end", message: result.value });
	}
	return pending;
}

export function startToolUseSummary(
	config: AgentLoopConfig,
	event: {
		assistantMessage: AgentMessage;
		toolResults: ToolResultMessage[];
		contextMessages: AgentMessage[];
		messages: AgentMessage[];
	},
): PendingToolUseSummary | undefined {
	if (!config.createToolUseSummary) {
		return undefined;
	}

	try {
		const value = config.createToolUseSummary({
			...event,
			messages: [...event.messages],
		});
		return trackToolUseSummary(value);
	} catch {
		return undefined;
	}
}

function trackToolUseSummary(
	value: AgentMessage | undefined | Promise<AgentMessage | undefined>,
): PendingToolUseSummary | undefined {
	if (!value) {
		return undefined;
	}

	if (typeof (value as Promise<AgentMessage | undefined>).then !== "function") {
		return {
			read: () => ({ settled: true, value: value as AgentMessage }),
		};
	}

	let settled = false;
	let settledValue: AgentMessage | undefined;
	(value as Promise<AgentMessage | undefined>).then(
		(summary) => {
			settled = true;
			settledValue = summary;
		},
		() => {
			settled = true;
			settledValue = undefined;
		},
	);
	return {
		read: () => ({ settled, value: settledValue }),
	};
}
