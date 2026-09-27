/**
 * [WHO]: consolidateV2Memories
 * [FROM]: Depends on ./config.js, ./scoring.js, ./store.js, ./types.js, ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/consolidate-v2.ts - v2 episodic/procedural to semantic consolidation
 */

import type { NanomemConfig } from "./config.js";
import { extractTags } from "./scoring.js";
import { deriveNameFromContent, deriveSummaryFromContent } from "./store.js";
import type { MemoryEntry } from "./types.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";

function makeId(prefix: string): string {
	return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toMemoryEntry(
	type: MemoryEntry["type"],
	project: string,
	content: string,
	importance: number,
	cfg: NanomemConfig,
): MemoryEntry {
	const detail = content.trim();
	const name = deriveNameFromContent(detail);
	const summary = deriveSummaryFromContent(detail);
	const now = new Date().toISOString();
	return {
		id: makeId("mem"),
		type,
		name,
		summary,
		detail,
		content: detail,
		tags: extractTags(`${name} ${summary} ${detail}`),
		project,
		importance,
		strength: cfg.halfLife[type] ?? 30,
		created: now,
		eventTime: now,
		accessCount: 0,
		relatedIds: [],
		scope: cfg.defaultScope,
		retention: type === "event" || type === "lesson" || type === "decision" ? "key-event" : "ambient",
		salience: Math.max(4, importance),
		stability: type === "event" ? "stable" : "situational",
	};
}

function toSemanticMemory(
	semanticType: SemanticMemory["semanticType"],
	project: string,
	content: string,
	importance: number,
	sourceEpisodeIds: string[],
): SemanticMemory {
	const detail = content.trim();
	const name = deriveNameFromContent(detail);
	const summary = deriveSummaryFromContent(detail);
	const now = new Date().toISOString();
	return {
		id: makeId("semantic"),
		kind: "semantic",
		semanticType,
		name,
		summary,
		detail,
		accessCount: 0,
		importance,
		salience: Math.max(4, importance),
		confidence: 0.78,
		retention: semanticType === "event" || semanticType === "lesson" || semanticType === "decision" ? "key-event" : "ambient",
		stability: semanticType === "event" ? "stable" : "situational",
		tags: extractTags(`${name} ${summary} ${detail}`),
		sourceEpisodeIds,
		evidence: [],
		scope: { project },
		createdAt: now,
		updatedAt: now,
		abstractionLevel: "generalization",
	}
}

export function consolidateV2Memories(
	episodes: EpisodeMemory[],
	facets: EpisodeFacet[],
	procedural: ProceduralMemory[],
	cfg: NanomemConfig,
): {
	entries: MemoryEntry[];
	semantic: SemanticMemory[];
	episodeSemanticMap: Map<string, string[]>;
} {
	const entries: MemoryEntry[] = [];
	const semantic: SemanticMemory[] = [];
	const episodeSemanticMap = new Map<string, string[]>();

	for (const episode of episodes) {
		if (episode.derivedSemanticIds?.length) continue;
		const episodeFacets = facets.filter((facet) => facet.episodeId === episode.id);
		const producedIds: string[] = [];
		const project = episode.scope?.project || "unknown";

		if (episode.importance >= 8 || episode.salience >= 8) {
			const content = [episode.summary, episode.userGoal ? `Goal: ${episode.userGoal}` : "", episode.outcome ? `Outcome: ${episode.outcome}` : ""]
				.filter(Boolean)
				.join("\n");
			const entry = toMemoryEntry("event", project, content, Math.max(8, episode.importance), cfg);
			const sem = toSemanticMemory("event", project, content, Math.max(8, episode.importance), [episode.id]);
			entries.push(entry);
			semantic.push(sem);
			producedIds.push(sem.id);
		}

		for (const facet of episodeFacets) {
			if (facet.facetType === "error") {
				const content = `Recurring failure mode: ${facet.searchText}${facet.anchorText ? `\nContext: ${facet.anchorText}` : ""}`;
				const entry = toMemoryEntry("lesson", project, content, Math.max(7, facet.importance), cfg);
				const sem = toSemanticMemory("lesson", project, content, Math.max(7, facet.importance), [episode.id]);
				entries.push(entry);
				semantic.push(sem);
				producedIds.push(sem.id);
			}
			if (facet.facetType === "insight") {
				const content = `Useful insight: ${facet.searchText}${facet.anchorText ? `\nFrom: ${facet.anchorText}` : ""}`;
				const entry = toMemoryEntry("fact", project, content, Math.max(6, facet.importance), cfg);
				const sem = toSemanticMemory("fact", project, content, Math.max(6, facet.importance), [episode.id]);
				entries.push(entry);
				semantic.push(sem);
				producedIds.push(sem.id);
			}
			if (facet.facetType === "goal" && facet.searchText) {
				const content = `Goal pattern: ${facet.searchText}`;
				const sem = toSemanticMemory("decision", project, content, Math.max(5, facet.importance), [episode.id]);
				semantic.push(sem);
				producedIds.push(sem.id);
			}
		}

		for (const proc of procedural.filter((item) => item.sourceEpisodeIds?.includes(episode.id))) {
			const content = [proc.name, proc.summary, proc.boundaries ? `Boundaries: ${proc.boundaries}` : "", proc.steps.slice(0, 4).map((step) => step.text).join("\n")]
				.filter(Boolean)
				.join("\n");
			const entry = toMemoryEntry("decision", project, content, Math.max(7, proc.importance), cfg);
			const sem = toSemanticMemory("decision", project, content, Math.max(7, proc.importance), [episode.id]);
			entries.push(entry);
			semantic.push(sem);
			producedIds.push(sem.id);
		}

		if (producedIds.length) {
			episodeSemanticMap.set(episode.id, producedIds);
		}
	}

	return { entries, semantic, episodeSemanticMap };
}
