/**
 * [WHO]: Shared semantic trace helpers for run, turn, model, tool, checkpoint, and transition boundaries
 * [FROM]: Depends on agent messages, the trace recorder, and canonical fingerprints
 * [TO]: Consumed by both standard and structured-adaptive loops
 * [HERE]: core/lib/agent-core/src/run-trace-context.ts - loop-neutral trace instrumentation
 */
import type { AssistantMessage } from "@catui/ai/types";
import type { AgentLoopFramework, AgentLoopTransition, AgentMessage } from "./types.js";
import { fingerprintTraceValue } from "./run-trace.js";
import type { RunTraceRecorder } from "./run-trace-recorder.js";

interface TraceToolCall {
	id: string;
	name: string;
	arguments: unknown;
}

interface TraceToolResult {
	toolCallId: string;
	toolName: string;
	isError: boolean;
	content: unknown;
	details?: unknown;
}

export async function traceRunStarted(
	recorder: RunTraceRecorder | undefined,
	framework: AgentLoopFramework,
	messages: readonly AgentMessage[],
): Promise<void> {
	await recorder?.record("run.started", { loopFramework: framework, inputFingerprint: fingerprintTraceValue(messages) });
}

export async function traceTurnStarted(recorder: RunTraceRecorder | undefined, turn: number): Promise<void> {
	await recorder?.record("turn.started", { turn }, { turnId: `turn-${turn}` });
}

export async function traceModelRequested(
	recorder: RunTraceRecorder | undefined,
	turn: number,
	messages: readonly AgentMessage[],
): Promise<void> {
	await recorder?.record("model.requested", { turn, requestFingerprint: fingerprintTraceValue(messages) }, { turnId: `turn-${turn}` });
}

export async function traceModelResponded(
	recorder: RunTraceRecorder | undefined,
	turn: number,
	message: AssistantMessage,
): Promise<void> {
	const context = { turnId: `turn-${turn}` };
	if (message.stopReason === "error" || message.stopReason === "aborted") {
		await recorder?.record("model.failed", {
			turn,
			errorSubtype: message.stopReason,
			errorFingerprint: fingerprintTraceValue(message.errorMessage ?? message),
		}, context);
		return;
	}
	await recorder?.record("model.responded", {
		turn,
		stopReason: message.stopReason,
		responseFingerprint: fingerprintTraceValue(message),
	}, context);
}

export async function traceTurnCompleted(
	recorder: RunTraceRecorder | undefined,
	turn: number,
	message: AssistantMessage,
): Promise<void> {
	await recorder?.record("turn.completed", {
		turn,
		stopReason: message.stopReason,
		outputFingerprint: fingerprintTraceValue(message),
	}, { turnId: `turn-${turn}` });
}

export async function traceToolBatch(
	recorder: RunTraceRecorder | undefined,
	calls: readonly TraceToolCall[],
	results: readonly TraceToolResult[],
	policyEnabled: boolean,
	approvalRequired?: { checkpointId: string; policyId?: string; toolCallId: string },
): Promise<void> {
	if (!recorder) return;
	const resultById = new Map(results.map((result) => [result.toolCallId, result]));
	for (const call of calls) {
		const result = resultById.get(call.id);
		const details = result?.details && typeof result.details === "object" ? result.details as Record<string, unknown> : {};
		const errorType = details.errorType;
		const paused = errorType === "approval_required" || approvalRequired?.toolCallId === call.id;
		const denied = errorType === "permission_denied";
		await recorder.record("tool.requested", {
			toolCallId: call.id,
			toolName: call.name,
			input: call.arguments,
			inputFingerprint: fingerprintTraceValue(call.arguments),
		});
		if (policyEnabled || paused || denied) {
			await recorder.record("policy.decided", {
				toolCallId: call.id,
				policyId: typeof details.policyId === "string"
					? details.policyId
					: approvalRequired?.toolCallId === call.id
						? approvalRequired.policyId ?? "runtime-tool-policy"
						: "runtime-tool-policy",
				decision: paused ? "pause" : denied ? "deny" : "allow",
				inputFingerprint: fingerprintTraceValue(call.arguments),
			});
		}
		const checkpointId = typeof details.checkpointId === "string"
			? details.checkpointId
			: approvalRequired?.toolCallId === call.id
				? approvalRequired.checkpointId
				: undefined;
		if (paused && checkpointId) {
			await recorder.record("checkpoint.created", {
				checkpointId,
				policyId: typeof details.policyId === "string"
					? details.policyId
					: approvalRequired?.policyId ?? "runtime-tool-policy",
				toolCallId: call.id,
			});
		}
		if (!paused && !denied && result) await recorder.record("tool.started", { toolCallId: call.id, toolName: call.name });
		await recorder.record("tool.completed", {
			toolCallId: call.id,
			toolName: call.name,
			outcome: paused ? "paused" : denied ? "denied" : !result ? "skipped" : result.isError ? "error" : "success",
			outputFingerprint: fingerprintTraceValue(result ? { content: result.content, details: result.details } : undefined),
		});
	}
}

export function traceTransitionApplied(
	recorder: RunTraceRecorder | undefined,
	transition: AgentLoopTransition | { reason: string; [key: string]: unknown },
): void {
	const pending = recorder?.record("transition.applied", {
		reason: transition.reason,
		transitionFingerprint: fingerprintTraceValue(transition),
	});
	// Required failures remain latched on the recorder and surface at the final flush.
	void pending?.catch(() => undefined);
}

export async function traceRunCompleted(
	recorder: RunTraceRecorder | undefined,
	result: { stopReason: string; turnCount: number; toolCallCount: number; messages: readonly AgentMessage[] },
): Promise<void> {
	if (!recorder) return;
	await recorder.record("run.completed", {
		stopReason: result.stopReason,
		turnCount: result.turnCount,
		toolCallCount: result.toolCallCount,
		outputFingerprint: fingerprintTraceValue(result.messages),
	});
	await recorder.flush();
}
