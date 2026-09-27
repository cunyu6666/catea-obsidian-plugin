/**
 * [WHO]: RunTraceRecorder, RunTraceSink, redaction/failure policies, and InMemoryRunTraceSink
 * [FROM]: Depends on the V1 run trace protocol
 * [TO]: Consumed by agent loops, host sinks, and deterministic eval fixtures
 * [HERE]: core/lib/agent-core/src/run-trace-recorder.ts - bounded serialized trace delivery
 */
import { randomUUID } from "node:crypto";
import {
	parseRunTraceEvent,
	type RunTraceEventV1,
	type RunTraceKindV1,
	type RunTracePayloadMapV1,
} from "./run-trace.js";

export interface RunTraceSink {
	append(event: RunTraceEventV1): Promise<void>;
}

export type RunTraceRedactor = (event: RunTraceEventV1) => RunTraceEventV1 | Promise<RunTraceEventV1>;
export type RunTraceFailureMode = "best_effort" | "required";

export interface RunTraceRecorderOptions {
	runId: string;
	sessionId?: string;
	sink: RunTraceSink;
	redactor?: RunTraceRedactor;
	failureMode?: RunTraceFailureMode;
	maxPending?: number;
	now?: () => number;
	createEventId?: () => string;
}

export interface RunTraceRecordContext {
	turnId?: string;
	parentEventId?: string;
}

export interface RunTraceRecorderFailure {
	sequence: number;
	message: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class RunTraceRecorder {
	readonly #options: Required<Pick<RunTraceRecorderOptions, "failureMode" | "maxPending" | "now" | "createEventId">> & RunTraceRecorderOptions;
	readonly #failures: RunTraceRecorderFailure[] = [];
	#tail: Promise<void> = Promise.resolve();
	#pending = 0;
	#sequence = 0;
	#requiredFailure: unknown;

	constructor(options: RunTraceRecorderOptions) {
		if (options.runId.length === 0) throw new Error("Run trace runId must not be empty");
		const maxPending = options.maxPending ?? 1024;
		if (!Number.isInteger(maxPending) || maxPending < 1) throw new Error("Run trace maxPending must be a positive integer");
		this.#options = {
			...options,
			failureMode: options.failureMode ?? "best_effort",
			maxPending,
			now: options.now ?? Date.now,
			createEventId: options.createEventId ?? randomUUID,
		};
	}

	get failures(): readonly RunTraceRecorderFailure[] {
		return this.#failures.map((failure) => ({ ...failure }));
	}

	record<K extends RunTraceKindV1>(
		kind: K,
		payload: RunTracePayloadMapV1[K],
		context: RunTraceRecordContext = {},
	): Promise<RunTraceEventV1 | undefined> {
		if (this.#pending >= this.#options.maxPending) {
			const sequence = this.#sequence + 1;
			const error = new Error(`Run trace queue limit reached at sequence ${sequence}`);
			if (this.#options.failureMode === "required") {
				this.#requiredFailure ??= error;
				return Promise.reject(error);
			}
			this.#failures.push({ sequence, message: error.message });
			return Promise.resolve(undefined);
		}

		const sequence = ++this.#sequence;
		const event = parseRunTraceEvent({
			version: 1,
			eventId: this.#options.createEventId(),
			sequence,
			timestamp: this.#options.now(),
			runId: this.#options.runId,
			...(this.#options.sessionId === undefined ? {} : { sessionId: this.#options.sessionId }),
			...(context.turnId === undefined ? {} : { turnId: context.turnId }),
			...(context.parentEventId === undefined ? {} : { parentEventId: context.parentEventId }),
			kind,
			payload,
		});
		this.#pending += 1;
		let resolveResult: (value: RunTraceEventV1 | undefined) => void;
		let rejectResult: (reason: unknown) => void;
		const result = new Promise<RunTraceEventV1 | undefined>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
		this.#tail = this.#tail
			.then(async () => {
				const redacted = parseRunTraceEvent(
					this.#options.redactor ? await this.#options.redactor(structuredClone(event)) : event,
				);
				await this.#options.sink.append(redacted);
				resolveResult(redacted);
			})
			.catch((error: unknown) => {
				this.#failures.push({ sequence, message: errorMessage(error) });
				if (this.#options.failureMode === "required") {
					this.#requiredFailure ??= error;
					rejectResult(error);
				}
				else resolveResult(undefined);
			})
			.finally(() => {
				this.#pending -= 1;
			});
		return result;
	}

	async flush(): Promise<void> {
		await this.#tail;
		if (this.#requiredFailure !== undefined) throw this.#requiredFailure;
	}
}

export class InMemoryRunTraceSink implements RunTraceSink {
	readonly #events: RunTraceEventV1[] = [];

	async append(event: RunTraceEventV1): Promise<void> {
		this.#events.push(structuredClone(event));
	}

	snapshot(): RunTraceEventV1[] {
		return structuredClone(this.#events);
	}
}
