/**
 * [WHO]: RunTraceEventV1 protocol, runtime validation, ordered trace validation, and canonical fingerprints
 * [FROM]: Depends only on Node crypto
 * [TO]: Consumed by recorders, replay, runtime persistence, and harness eval
 * [HERE]: core/lib/agent-core/src/run-trace.ts - versioned semantic audit contract
 */
import { createHash } from "node:crypto";

export type TraceLoopFramework = "standard" | "weak-model-compatible";
export type TraceToolOutcome = "success" | "error" | "denied" | "paused" | "skipped";

export interface RunTracePayloadMapV1 {
	"run.started": { loopFramework: TraceLoopFramework; inputFingerprint: string };
	"run.completed": { stopReason: string; turnCount: number; toolCallCount: number; outputFingerprint: string };
	"turn.started": { turn: number };
	"turn.completed": { turn: number; stopReason: string; outputFingerprint: string };
	"model.requested": { turn: number; requestFingerprint: string };
	"model.responded": { turn: number; stopReason: string; responseFingerprint: string };
	"model.failed": { turn: number; errorSubtype: string; errorFingerprint: string };
	"policy.decided": {
		toolCallId: string;
		policyId: string;
		decision: "allow" | "deny" | "pause";
		inputFingerprint: string;
	};
	"tool.requested": { toolCallId: string; toolName: string; inputFingerprint: string; input?: unknown };
	"tool.started": { toolCallId: string; toolName: string };
	"tool.completed": {
		toolCallId: string;
		toolName: string;
		outcome: TraceToolOutcome;
		outputFingerprint: string;
	};
	"checkpoint.created": { checkpointId: string; policyId: string; toolCallId: string };
	"checkpoint.resolved": { checkpointId: string; resolution: "approved" | "denied" | "unavailable" };
	"progress.observed": { fingerprint: string; repeatCount: number; outcome: TraceToolOutcome };
	"transition.applied": { reason: string; transitionFingerprint: string };
}

export type RunTraceKindV1 = keyof RunTracePayloadMapV1;

export type RunTraceEventV1 = {
	[K in RunTraceKindV1]: {
		version: 1;
		eventId: string;
		sequence: number;
		timestamp: number;
		runId: string;
		sessionId?: string;
		turnId?: string;
		parentEventId?: string;
		kind: K;
		payload: RunTracePayloadMapV1[K];
	}
}[RunTraceKindV1];

const TRACE_KINDS = new Set<RunTraceKindV1>([
	"run.started", "run.completed", "turn.started", "turn.completed",
	"model.requested", "model.responded", "model.failed", "policy.decided",
	"tool.requested", "tool.started", "tool.completed", "checkpoint.created",
	"checkpoint.resolved", "progress.observed", "transition.applied",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
	return typeof value[key] === "string" && value[key].length > 0;
}

function hasCount(value: Record<string, unknown>, key: string, minimum = 0): boolean {
	return typeof value[key] === "number" && Number.isInteger(value[key]) && value[key] >= minimum;
}

function isOneOf(value: unknown, choices: readonly string[]): boolean {
	return typeof value === "string" && choices.includes(value);
}

function isValidPayload(kind: RunTraceKindV1, payload: unknown): boolean {
	if (!isRecord(payload)) return false;
	switch (kind) {
		case "run.started":
			return isOneOf(payload.loopFramework, ["standard", "weak-model-compatible"]) && hasString(payload, "inputFingerprint");
		case "run.completed":
			return hasString(payload, "stopReason") && hasCount(payload, "turnCount") && hasCount(payload, "toolCallCount") && hasString(payload, "outputFingerprint");
		case "turn.started":
			return hasCount(payload, "turn", 1);
		case "turn.completed":
			return hasCount(payload, "turn", 1) && hasString(payload, "stopReason") && hasString(payload, "outputFingerprint");
		case "model.requested":
			return hasCount(payload, "turn", 1) && hasString(payload, "requestFingerprint");
		case "model.responded":
			return hasCount(payload, "turn", 1) && hasString(payload, "stopReason") && hasString(payload, "responseFingerprint");
		case "model.failed":
			return hasCount(payload, "turn", 1) && hasString(payload, "errorSubtype") && hasString(payload, "errorFingerprint");
		case "policy.decided":
			return hasString(payload, "toolCallId") && hasString(payload, "policyId") && isOneOf(payload.decision, ["allow", "deny", "pause"]) && hasString(payload, "inputFingerprint");
		case "tool.requested":
			return hasString(payload, "toolCallId") && hasString(payload, "toolName") && hasString(payload, "inputFingerprint");
		case "tool.started":
			return hasString(payload, "toolCallId") && hasString(payload, "toolName");
		case "tool.completed":
			return hasString(payload, "toolCallId") && hasString(payload, "toolName") && isOneOf(payload.outcome, ["success", "error", "denied", "paused", "skipped"]) && hasString(payload, "outputFingerprint");
		case "checkpoint.created":
			return hasString(payload, "checkpointId") && hasString(payload, "policyId") && hasString(payload, "toolCallId");
		case "checkpoint.resolved":
			return hasString(payload, "checkpointId") && isOneOf(payload.resolution, ["approved", "denied", "unavailable"]);
		case "progress.observed":
			return hasString(payload, "fingerprint") && hasCount(payload, "repeatCount", 1) && isOneOf(payload.outcome, ["success", "error", "denied", "paused", "skipped"]);
		case "transition.applied":
			return hasString(payload, "reason") && hasString(payload, "transitionFingerprint");
	}
}

export function parseRunTraceEvent(value: unknown): RunTraceEventV1 {
	if (!isRecord(value)) throw new Error("Run trace event must be an object");
	if (value.version !== 1) throw new Error(`Unsupported run trace version: ${String(value.version)}`);
	if (!hasString(value, "eventId")) throw new Error("Run trace eventId must be a non-empty string");
	if (!hasCount(value, "sequence", 1)) throw new Error("Run trace sequence must be a positive integer");
	if (typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) throw new Error("Run trace timestamp must be finite");
	if (!hasString(value, "runId")) throw new Error("Run trace runId must be a non-empty string");
	for (const key of ["sessionId", "turnId", "parentEventId"] as const) {
		if (value[key] !== undefined && !hasString(value, key)) throw new Error(`Run trace ${key} must be a non-empty string`);
	}
	if (typeof value.kind !== "string" || !TRACE_KINDS.has(value.kind as RunTraceKindV1)) {
		throw new Error(`Unsupported run trace kind: ${String(value.kind)}`);
	}
	const kind = value.kind as RunTraceKindV1;
	if (!isValidPayload(kind, value.payload)) throw new Error(`Invalid payload for run trace kind ${kind}`);
	return value as RunTraceEventV1;
}

export function validateRunTrace(events: readonly unknown[]): RunTraceEventV1[] {
	if (events.length === 0) throw new Error("Run trace must contain at least one event");
	const parsed = events.map(parseRunTraceEvent);
	const runId = parsed[0].runId;
	const eventIds = new Set<string>();
	for (let index = 0; index < parsed.length; index += 1) {
		const current = parsed[index];
		if (current.runId !== runId) throw new Error(`Run trace runId changed at sequence ${current.sequence}`);
		if (current.sequence !== index + 1) throw new Error(`Run trace sequence must be contiguous; expected ${index + 1}`);
		if (eventIds.has(current.eventId)) throw new Error(`Duplicate run trace eventId: ${current.eventId}`);
		eventIds.add(current.eventId);
		if (current.parentEventId !== undefined && !eventIds.has(current.parentEventId)) {
			throw new Error(`Run trace parentEventId must reference an earlier event: ${current.parentEventId}`);
		}
	}
	return parsed;
}

function canonicalize(value: unknown, ancestors: Set<object>): unknown {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return { $number: String(value) };
		return Object.is(value, -0) ? { $number: "-0" } : value;
	}
	if (typeof value === "undefined") return { $undefined: true };
	if (typeof value === "bigint") return { $bigint: value.toString() };
	if (typeof value === "symbol" || typeof value === "function") return { $type: typeof value };
	if (ancestors.has(value)) throw new Error("Cannot fingerprint cyclic values");
	ancestors.add(value);
	let result: unknown;
	if (Array.isArray(value)) {
		result = value.map((item) => canonicalize(item, ancestors));
	} else {
		const record = value as Record<string, unknown>;
		const normalized: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) normalized[key] = canonicalize(record[key], ancestors);
		result = normalized;
	}
	ancestors.delete(value);
	return result;
}

export function fingerprintTraceValue(value: unknown): string {
	const serialized = JSON.stringify(canonicalize(value, new Set<object>()));
	return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}
