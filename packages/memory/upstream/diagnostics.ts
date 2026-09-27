/**
 * [WHO]: Thin shell exporting reportDiagnostic / isDevRuntime for mem-core
 * [FROM]: Depends only on node:events
 * [TO]: Consumed by mem-core internals (extension.ts, extraction.ts, consolidation.ts, …) so deep utilities can report background failures without threading api.events
 * [HERE]: packages/mem-core/src/diagnostics.ts - mirrors utils/diagnostics.ts; explicit dev/debug mode prints to console, and both copies bind to the same Symbol.for slot on globalThis at runtime so the diagnostics extension subscribed via utils/diagnostics.ts receives mem-core events too
 *
 * Keep this file structurally identical to utils/diagnostics.ts. mem-core is a
 * separately-compiled package, so we cannot import the canonical helper. The
 * Symbol.for(...) slot is the runtime contract that ties both copies together.
 */

import { EventEmitter } from "node:events";

export type DiagnosticSeverity = "debug" | "info" | "warning" | "error";

export type DiagnosticCategory =
	| "network"
	| "fallback"
	| "persistence"
	| "config"
	| "extension_timeout"
	| "schema"
	| "unknown";

export interface DiagnosticEvent {
	source: string;
	severity: DiagnosticSeverity;
	category: DiagnosticCategory;
	message: string;
	detail?: unknown;
	fingerprint?: string;
	context?: Record<string, unknown>;
}

interface BusSlot {
	bus: EventEmitter;
	queue: DiagnosticEvent[];
}

const SLOT_KEY = Symbol.for("catui.diagnostic.bus.v1");
const QUEUE_LIMIT = 100;
const CHANNEL = "diagnostic:event";

function getSlot(): BusSlot {
	const holder = globalThis as unknown as Record<symbol, BusSlot | undefined>;
	let slot = holder[SLOT_KEY];
	if (!slot) {
		slot = { bus: new EventEmitter(), queue: [] };
		holder[SLOT_KEY] = slot;
	}
	return slot;
}

export function isDevRuntime(): boolean {
	if (process.env.NODE_ENV === "production") return false;
	if (process.env.NODE_ENV === "development") return true;
	const lifecycle = process.env.npm_lifecycle_event;
	if (lifecycle === "dev" || lifecycle === "test") return true;
	if (["1", "true", "yes", "on"].includes((process.env.CATUI_DEBUG ?? "").toLowerCase())) return true;
	return false;
}

export function reportDiagnostic(event: DiagnosticEvent): void {
	if (isDevRuntime()) {
		const tag = `[${event.source}]`;
		const fn =
			event.severity === "error" ? console.error :
			event.severity === "warning" ? console.warn :
			console.log;
		if (event.detail !== undefined) {
			fn(`${tag} ${event.message}`, event.detail);
		} else {
			fn(`${tag} ${event.message}`);
		}
	}
	const slot = getSlot();
	if (slot.bus.listenerCount(CHANNEL) > 0) {
		slot.bus.emit(CHANNEL, event);
	} else if (slot.queue.length < QUEUE_LIMIT) {
		slot.queue.push(event);
	}
}
