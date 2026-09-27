/**
 * [WHO]: Provides TurnContext, MemoryRecallRecord, getTurnContext(), setTurnContext(), TURN_CONTEXT_GLOBAL_KEY
 * [FROM]: Depends on nothing; reads/writes globalThis using the documented key
 * [TO]: Consumed by engine-scoring-v2.ts (reads structuralAnchor), engine.ts (writes memoryRecallSnapshot)
 * [HERE]: packages/mem-core/src/turn-context.ts - structural mirror of core/runtime/turn-context; mem-core cannot reverse-import the main app, so the contract is shared via the globalThis key string and schema, not the source file
 *
 * Keep this file structurally aligned with core/runtime/turn-context.ts.
 * If the schema changes there, mirror the change here.
 */

export interface MemoryRecallRecord {
	memoryId: string;
	memoryKind: string;
	anchorModule?: string;
	anchorFile?: string;
	scoreBreakdownStatus: "available" | "unavailable";
	scoreRecency?: number;
	scoreImportance?: number;
	scoreRelevance?: number;
	scoreStructural?: number;
	scoreFinal: number;
	wasInjected: boolean;
	injectRank?: number;
}

export interface TurnContext {
	structuralAnchor?: {
		modulePath?: string;
		filePath?: string;
		candidatePaths?: string[];
	};
	memoryRecallSnapshot?: MemoryRecallRecord[];
}

export const TURN_CONTEXT_GLOBAL_KEY = "__catuiTurnContext";

function store(): TurnContext {
	const g = globalThis as unknown as Record<string, TurnContext | undefined>;
	if (!g[TURN_CONTEXT_GLOBAL_KEY]) g[TURN_CONTEXT_GLOBAL_KEY] = {};
	return g[TURN_CONTEXT_GLOBAL_KEY] as TurnContext;
}

/** Read the current value of a turn-context channel. Returns undefined when no producer has published. */
export function getTurnContext<K extends keyof TurnContext>(key: K): TurnContext[K] {
	return store()[key];
}

/** Publish (or clear) a turn-context channel. mem-core uses this to publish memoryRecallSnapshot. */
export function setTurnContext<K extends keyof TurnContext>(key: K, value: TurnContext[K]): void {
	const s = store();
	if (value === undefined) {
		delete s[key];
	} else {
		s[key] = value;
	}
}
