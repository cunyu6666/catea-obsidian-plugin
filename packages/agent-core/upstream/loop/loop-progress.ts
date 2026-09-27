/**
 * [WHO]: LoopProgressTracker and deterministic tool evidence fingerprints
 * [FROM]: No external dependencies
 * [TO]: Consumed by agent loops when progress-aware stopping is enabled
 * [HERE]: core/lib/agent-core/src/loop-progress.ts - bounded livelock detection primitive
 */

export interface LoopProgressOptions {
	repetitionThreshold: number;
	historySize?: number;
}

export interface LoopProgressEvidence {
	toolName: string;
	input: unknown;
	outcome: "success" | "error" | "denied";
	output?: unknown;
	progressMarker?: string;
}

export interface LivelockDetection {
	fingerprint: string;
	repeatCount: number;
}

function canonicalize(value: unknown, seen = new WeakSet<object>()): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
	if (seen.has(value)) return '"[circular]"';
	seen.add(value);
	if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, seen)}`)
		.join(",")}}`;
}

export function fingerprintProgressEvidence(evidence: LoopProgressEvidence): string {
	return `${evidence.toolName}:${canonicalize(evidence.input)}:${evidence.outcome}:${canonicalize(evidence.output)}`;
}

export class LoopProgressTracker {
	readonly #threshold: number;
	readonly #historySize: number;
	#history: string[] = [];
	#lastMarker?: string;
	stagnationCount = 0;

	constructor(options: LoopProgressOptions) {
		if (!Number.isInteger(options.repetitionThreshold) || options.repetitionThreshold < 2) {
			throw new Error("repetitionThreshold must be an integer of at least 2");
		}
		this.#threshold = options.repetitionThreshold;
		this.#historySize = Math.max(options.historySize ?? options.repetitionThreshold * 4, options.repetitionThreshold);
	}

	reset(): void {
		this.#history = [];
		this.#lastMarker = undefined;
		this.stagnationCount = 0;
	}

	observe(evidence: LoopProgressEvidence): LivelockDetection | undefined {
		const fingerprint = fingerprintProgressEvidence(evidence);
		const markerChanged = evidence.progressMarker !== undefined && evidence.progressMarker !== this.#lastMarker;
		if (markerChanged) {
			this.reset();
			if (evidence.progressMarker !== undefined) this.#lastMarker = evidence.progressMarker;
			this.#history.push(fingerprint);
			return undefined;
		}
		if (evidence.progressMarker !== undefined) this.#lastMarker = evidence.progressMarker;
		if (evidence.outcome === "success" && !this.#history.includes(fingerprint)) {
			this.#history = [fingerprint];
			this.stagnationCount = 0;
			return undefined;
		}
		this.#history.push(fingerprint);
		if (this.#history.length > this.#historySize) this.#history.shift();

		this.stagnationCount = 0;
		for (let period = 1; period * this.#threshold <= this.#history.length; period++) {
			const pattern = this.#history.slice(-period);
			let repeated = true;
			for (let repeat = 2; repeat <= this.#threshold && repeated; repeat++) {
				const start = this.#history.length - period * repeat;
				for (let offset = 0; offset < period; offset++) {
					if (this.#history[start + offset] !== pattern[offset]) { repeated = false; break; }
				}
			}
			if (repeated) {
				this.stagnationCount = this.#threshold;
				return { fingerprint: `cycle:${pattern.join("|")}`, repeatCount: this.#threshold };
			}
		}
		return undefined;
	}
}
