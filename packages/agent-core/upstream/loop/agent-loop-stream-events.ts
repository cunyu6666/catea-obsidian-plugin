/**
 * [WHO]: Provides waitForAbortableOperation(), waitForAssistantStream(), waitForAssistantStreamEvent()
 * [FROM]: Depends on @catui/ai AssistantMessageEvent/AssistantMessageEventStream contracts.
 * [TO]: Consumed by standard and structured-adaptive agent loops.
 * [HERE]: core/lib/agent-core/src/agent-loop-stream-events.ts within agent-core; shared abortable operation and assistant-stream iterator utilities.
 */

import type { AssistantMessageEvent } from "@catui/ai/types";
import type { AssistantMessageEventStream } from "@catui/ai/events";

export type AssistantStreamNext = IteratorResult<AssistantMessageEvent> | "aborted";
export type AssistantStreamStart = AssistantMessageEventStream | "aborted";
export type AbortableOperationResult<T> = { type: "resolved"; value: T } | { type: "aborted" };

export function waitForAbortableOperation<T>(
	valueOrPromise: T | Promise<T>,
	signal?: AbortSignal,
): Promise<AbortableOperationResult<T>> {
	if (signal?.aborted) return Promise.resolve({ type: "aborted" });
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			resolve({ type: "aborted" });
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		Promise.resolve(valueOrPromise).then(
			(value) => {
				cleanup();
				resolve({ type: "resolved", value });
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}

export function waitForAssistantStream(
	streamOrPromise: AssistantMessageEventStream | Promise<AssistantMessageEventStream>,
	signal?: AbortSignal,
): Promise<AssistantStreamStart> {
	return waitForAbortableOperation(streamOrPromise, signal).then((result) => {
		if (result.type === "aborted") return "aborted";
		return result.value;
	});
}

export function waitForAssistantStreamEvent(
	iterator: AsyncIterator<AssistantMessageEvent>,
	signal?: AbortSignal,
): Promise<AssistantStreamNext> {
	if (signal?.aborted) return Promise.resolve("aborted");
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			resolve("aborted");
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		iterator.next().then(
			(result) => {
				cleanup();
				resolve(result);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}
