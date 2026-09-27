/**
 * [WHO]: consolidateEpisodes, extractFactsFromEpisodes, extractLessonsFromEpisodes
 * [FROM]: Depends on ./config.js, ./diagnostics.js, ./i18n.js, ./llm-json.js, ./scoring.js, ./store.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/consolidation.ts - episodic→semantic consolidation, heart of multi-store memory model
 */


import type { NanomemConfig } from "./config.js";
import { reportDiagnostic } from "./diagnostics.js";
import { PROMPTS } from "./i18n.js";
import { parseLlmJson } from "./llm-json.js";
import { extractTags } from "./scoring.js";
import { deriveNameFromContent, deriveSummaryFromContent } from "./store.js";
import type { Episode, LlmFn, MemoryEntry } from "./types.js";

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function consolidateEpisodes(
	episodes: Episode[],
	cfg: NanomemConfig,
	llmFn?: LlmFn,
	options?: { signal?: AbortSignal },
): Promise<MemoryEntry[]> {
	const unconsolidated = episodes.filter((ep) => !ep.consolidated);
	if (unconsolidated.length < cfg.consolidationThreshold) return [];
	if (options?.signal?.aborted) {
		throw new Error("AbortError");
	}

	let newEntries: MemoryEntry[];
	if (llmFn) {
		newEntries = await llmConsolidation(unconsolidated, cfg, llmFn, options?.signal);
	} else {
		newEntries = heuristicConsolidation(unconsolidated, cfg);
	}

	if (options?.signal?.aborted) {
		throw new Error("AbortError");
	}
	for (const ep of unconsolidated) ep.consolidated = true;
	return newEntries;
}

async function llmConsolidation(
	episodes: Episode[],
	cfg: NanomemConfig,
	llmFn: LlmFn,
	signal?: AbortSignal,
): Promise<MemoryEntry[]> {
	const p = PROMPTS[cfg.locale] ?? PROMPTS.en;
	const summary = episodes
		.map(
			(ep) =>
				`[${ep.date}] ${ep.project}: ${ep.summary}\nFiles: ${ep.filesModified.join(", ")}\nErrors: ${ep.errors.join("; ") || "none"}`,
		)
		.join("\n\n");

	if (signal?.aborted) throw new Error("AbortError");
	const raw = await llmFn(p.consolidationSystem, summary);
	if (signal?.aborted) throw new Error("AbortError");

	try {
		const items = parseLlmJson<Array<{
			type: string;
			name?: string;
			summary?: string;
			detail?: string;
			content?: string;
			importance?: number;
		}>>(raw);
		if (!Array.isArray(items)) throw new Error("LLM consolidation response must be a JSON array");
		const now = new Date().toISOString();
		return items.map((item) => {
			const type: MemoryEntry["type"] =
				item.type === "lesson" ? "lesson" : item.type === "event" ? "event" : "fact";
			const detail = item.detail || item.content || "";
			const name = item.name || deriveNameFromContent(detail);
			const summary = item.summary || deriveSummaryFromContent(detail);
			return {
				id: makeId(),
				type,
				name,
				summary,
				detail,
				content: detail,
				tags: extractTags(`${name} ${summary} ${detail}`),
				project: episodes[0]?.project ?? "unknown",
				importance: item.importance ?? 6,
				strength: cfg.halfLife[type] ?? 30,
				created: now,
				eventTime: now,
				accessCount: 0,
				relatedIds: [],
				retention: type === "event" ? "key-event" : type === "lesson" ? "key-event" : "ambient",
				salience: type === "event" ? Math.max(8, item.importance ?? 8) : item.importance ?? 6,
				stability: type === "event" ? "stable" : type === "lesson" ? "stable" : "situational",
				scope: cfg.defaultScope,
			};
		});
	} catch (err) {
		reportDiagnostic({
			source: "mem-core.consolidate",
			severity: "warning",
			category: "fallback",
			message: "consolidateWithLLM failed, falling back to heuristic",
			detail: { error: formatFallbackError(err) },
			fingerprint: "mem-core.consolidate:fallback:llm-failure",
		});
		return heuristicConsolidation(episodes, cfg);
	}
}

function formatFallbackError(err: unknown): string {
	if (err instanceof Error) return `${err.name}: ${err.message}`;
	return String(err);
}

function heuristicConsolidation(episodes: Episode[], cfg: NanomemConfig): MemoryEntry[] {
	const now = new Date().toISOString();
	const result: MemoryEntry[] = [];

	const fileCounts = new Map<string, number>();
	for (const ep of episodes) {
		for (const f of ep.filesModified) fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
	}
	const hotFiles = [...fileCounts.entries()]
		.filter(([, c]) => c >= 3)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);

	if (hotFiles.length) {
		const detail = `Frequently modified files: ${hotFiles.map(([f, c]) => `${f} (${c}x)`).join(", ")}`;
		const name = deriveNameFromContent(detail);
		const summary = deriveSummaryFromContent(detail);
		result.push({
			id: makeId(),
			type: "fact",
			name,
			summary,
			detail,
			content: detail,
			tags: extractTags(detail),
			project: episodes[0]?.project ?? "unknown",
			importance: 5,
			strength: cfg.halfLife.fact ?? 60,
			created: now,
			eventTime: now,
			accessCount: 0,
			relatedIds: [],
			stability: "situational",
			scope: cfg.defaultScope,
		});
	}

	const allErrors = episodes.flatMap((ep) => ep.errors).filter(Boolean);
	if (allErrors.length) {
		const errorSet = [...new Set(allErrors)].slice(0, 5);
		const detail = `Recurring issues: ${errorSet.join("; ")}`;
		const name = deriveNameFromContent(detail);
		const summary = deriveSummaryFromContent(detail);
		result.push({
			id: makeId(),
			type: "lesson",
			name,
			summary,
			detail,
			content: detail,
			tags: extractTags(detail),
			project: episodes[0]?.project ?? "unknown",
			importance: 7,
			strength: cfg.halfLife.lesson ?? 90,
			created: now,
			eventTime: now,
			accessCount: 0,
			relatedIds: [],
			retention: "key-event",
			salience: 8,
			stability: "stable",
			scope: cfg.defaultScope,
		});
	}

	const significantEpisodes = [...episodes]
		.filter((ep) => ep.importance >= 8 || ep.errors.length >= 2)
		.sort((a, b) => b.importance - a.importance)
		.slice(0, 3);

	for (const ep of significantEpisodes) {
		const detailParts = [
			ep.summary,
			ep.userGoal ? `Goal: ${ep.userGoal}` : "",
			ep.errors.length ? `Errors: ${ep.errors.join("; ")}` : "",
			ep.keyObservations.length ? `Observations: ${ep.keyObservations.slice(0, 4).join("; ")}` : "",
		].filter(Boolean);
		const detail = detailParts.join("\n");
		const name = ep.userGoal ? deriveNameFromContent(ep.userGoal) : deriveNameFromContent(ep.summary);
		const summary = deriveSummaryFromContent(ep.summary || ep.userGoal || detail);
		result.push({
			id: makeId(),
			type: "event",
			name,
			summary,
			detail,
			content: detail,
			tags: extractTags(`${ep.project} ${ep.summary} ${ep.userGoal || ""} ${ep.errors.join(" ")}`),
			project: ep.project || "unknown",
			importance: Math.min(10, Math.max(8, ep.importance)),
			strength: cfg.halfLife.event ?? 180,
			created: now,
			eventTime: ep.date ? new Date(ep.date).toISOString() : now,
			accessCount: 0,
			relatedIds: [],
			retention: "key-event",
			salience: Math.min(10, Math.max(8, ep.importance + ep.errors.length)),
			stability: ep.errors.length ? "situational" : "stable",
			eventData: {
				kind: ep.errors.length ? "incident" : "milestone",
				outcome: ep.errors.length ? "Captured from a high-friction session" : "Captured from a high-importance session",
				emotionalWeight: Math.min(10, ep.importance),
			},
			scope: cfg.defaultScope,
		});
	}

	return result;
}
