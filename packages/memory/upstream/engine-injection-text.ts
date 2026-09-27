/**
 * [WHO]: Provides buildProgressiveInjectionText, CONVERSATION_PREFERENCE_PATTERNS, isConversationPreference, selectConversationPreferences, rankConversationPreference, mergeUniqueEntries
 * [FROM]: Depends on ./i18n.js for PromptSet; ./linking.js for getGraphContextSummaries, GraphNeighbor; ./scoring.js for daysSince; ./types.js, ./types-v2.js for memory types
 * [TO]: Consumed by engine.ts (getMemoryInjection)
 * [HERE]: packages/mem-core/src/engine-injection-text.ts - injection text formatting and conversation preference detection
 */

import type { PromptSet } from "./i18n.js";
import { getGraphContextSummaries, type GraphNeighbor } from "./linking.js";
import { daysSince } from "./scoring.js";
import type { Episode, MemoryEntry, WorkEntry } from "./types.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";

export const CONVERSATION_PREFERENCE_PATTERNS = [
	/\bcall me\b/i,
	/\baddress me\b/i,
	/\bmy name is\b/i,
	/\bi am called\b/i,
	/\bspeak (?:to me )?(?:like|in)\b/i,
	/\btalk (?:to me )?(?:like|in)\b/i,
	/\buse (?:a |the )?(?:tone|style|voice)\b/i,
	/\b(?:tone|style|voice|persona)\b/i,
	/call me/,
	/address me as/,
	/address user/,
	/tone/,
	/style of speaking/,
	/speaking style/,
	/communication style/,
];

export function isConversationPreference(entry: MemoryEntry): boolean {
	if (entry.type !== "preference") return false;
	const text = `${entry.name || ""}\n${entry.summary || ""}\n${entry.detail || ""}\n${entry.content || ""}`;
	return CONVERSATION_PREFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

export function rankConversationPreference(entry: MemoryEntry): number {
	return (entry.salience ?? entry.importance ?? 0) * 10 + (entry.accessCount ?? 0) * 2 - daysSince(entry.created);
}

export function selectConversationPreferences(entries: MemoryEntry[]): MemoryEntry[] {
	return entries
		.filter((entry) => isConversationPreference(entry))
		.filter((entry) => entry.stability !== "situational")
		.sort((a, b) => rankConversationPreference(b) - rankConversationPreference(a))
		.slice(0, 3);
}

export function mergeUniqueEntries(preferred: MemoryEntry[], fallback: MemoryEntry[]): MemoryEntry[] {
	const merged: MemoryEntry[] = [];
	const seen = new Set<string>();
	for (const entry of [...preferred, ...fallback]) {
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		merged.push(entry);
	}
	return merged;
}

export interface ActiveInjectionData {
	knowledge: MemoryEntry[];
	lessons: MemoryEntry[];
	events: MemoryEntry[];
	preferences: MemoryEntry[];
	facets: MemoryEntry[];
	episodeMemories: EpisodeMemory[];
	episodeFacets: EpisodeFacet[];
	semanticMemories: SemanticMemory[];
	procedural: ProceduralMemory[];
}

export interface CueInjectionData {
	knowledge: MemoryEntry[];
	lessons: MemoryEntry[];
	events: MemoryEntry[];
	preferences: MemoryEntry[];
	facets: MemoryEntry[];
	episodes: Episode[];
	work: WorkEntry[];
	episodeMemories: EpisodeMemory[];
	episodeFacets: EpisodeFacet[];
	semanticMemories: SemanticMemory[];
	procedural: ProceduralMemory[];
}

export interface InjectedMemoryOrderRecord {
	memoryId: string;
	memoryKind: string;
}

function toLegacyMemoryKind(entry: MemoryEntry): string {
	switch (entry.type) {
		case "fact":
		case "decision":
		case "entity":
			return "knowledge";
		case "lesson":
		case "preference":
		case "event":
			return entry.type;
		case "pattern":
		case "struggle":
			return "facet";
		default:
			return "memory";
	}
}

export function buildInjectedMemoryOrder(
	active: ActiveInjectionData,
	cue: CueInjectionData,
): InjectedMemoryOrderRecord[] {
	const conversationPreferenceEntries: InjectedMemoryOrderRecord[] = [];
	const activeEntries: InjectedMemoryOrderRecord[] = [];
	const keyEventEntries: InjectedMemoryOrderRecord[] = [];
	const stateEntries: InjectedMemoryOrderRecord[] = [];

	const pushActiveLegacyEntry = (entry: MemoryEntry) => {
		const record = {
			memoryId: entry.id,
			memoryKind: toLegacyMemoryKind(entry),
		};
		if (isConversationPreference(entry)) {
			conversationPreferenceEntries.push(record);
			return;
		}
		if (entry.stability === "situational" || entry.stateData) {
			stateEntries.push(record);
			return;
		}
		activeEntries.push(record);
	};

	for (const entry of active.lessons) pushActiveLegacyEntry(entry);
	for (const entry of active.knowledge) pushActiveLegacyEntry(entry);
	for (const entry of active.preferences) pushActiveLegacyEntry(entry);
	for (const entry of active.facets) {
		activeEntries.push({ memoryId: entry.id, memoryKind: "facet" });
	}
	for (const entry of active.events) {
		keyEventEntries.push({ memoryId: entry.id, memoryKind: "event" });
	}

	return [
		...conversationPreferenceEntries,
		...activeEntries,
		...active.episodeMemories.map((entry) => ({ memoryId: entry.id, memoryKind: "episode" })),
		...active.episodeFacets.map((entry) => ({ memoryId: entry.id, memoryKind: "episodeFacet" })),
		...active.semanticMemories.map((entry) => ({ memoryId: entry.id, memoryKind: "semantic" })),
		...active.procedural.map((entry) => ({ memoryId: entry.id, memoryKind: "procedural" })),
		...keyEventEntries,
		...stateEntries,
		...cue.lessons.map((entry) => ({ memoryId: entry.id, memoryKind: "lesson" })),
		...cue.knowledge.map((entry) => ({ memoryId: entry.id, memoryKind: "knowledge" })),
		...cue.events.map((entry) => ({ memoryId: entry.id, memoryKind: "event" })),
		...cue.preferences.map((entry) => ({ memoryId: entry.id, memoryKind: "preference" })),
		...cue.facets.map((entry) => ({ memoryId: entry.id, memoryKind: "facet" })),
		...cue.episodeMemories.map((entry) => ({ memoryId: entry.id, memoryKind: "episode" })),
		...cue.episodeFacets.map((entry) => ({ memoryId: entry.id, memoryKind: "episodeFacet" })),
		...cue.semanticMemories.map((entry) => ({ memoryId: entry.id, memoryKind: "semantic" })),
		...cue.procedural.map((entry) => ({ memoryId: entry.id, memoryKind: "procedural" })),
	];
}

export function buildProgressiveInjectionText(
	active: ActiveInjectionData,
	cue: CueInjectionData,
	allEntries: MemoryEntry[],
	graphContext: GraphNeighbor[],
	p: PromptSet,
): string {
	const sections: string[] = [];
	const proceduralSectionTitle = "Procedures";
	const episodicSectionTitle = "Episode Threads";
	const semanticSectionTitle = "Semantic Abstractions";

	// ── Active tier: full detail ──
	const activeLines: string[] = [];
	const conversationPreferenceLines: string[] = [];
	const keyEventLines: string[] = [];
	const stateLines: string[] = [];

	const formatActiveEntry = (e: MemoryEntry): string => {
		const related = getGraphContextSummaries(e, allEntries, 3);
		const suffix = related.length ? ` [→ ${related.join("; ")}]` : "";
		return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.summary || ""}\n  ${e.detail || ""}${suffix}`;
	};

	const formatActiveEvent = (e: MemoryEntry): string => {
		const related = getGraphContextSummaries(e, allEntries, 4);
		const outcome = e.eventData?.outcome ? `\n  Outcome: ${e.eventData.outcome}` : "";
		const suffix = related.length ? ` [→ ${related.join("; ")}]` : "";
		return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.summary || ""}\n  ${e.detail || ""}${outcome}${suffix}`;
	};

	const formatActiveFacet = (e: MemoryEntry): string => {
		if (e.facetData?.kind === "pattern") {
			return `- [ID: ${e.id}] **${e.name || "—"}**: When ${e.facetData.trigger} → ${e.facetData.behavior}\n  ${e.detail || ""}`;
		}
		if (e.facetData?.kind === "struggle") {
			return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.facetData.problem}\n  Tried: ${e.facetData.attempts.join(", ")} | Solved: ${e.facetData.solution}\n  ${e.detail || ""}`;
		}
		return formatActiveEntry(e);
	};

	const pushActiveEntry = (entry: MemoryEntry) => {
		if (isConversationPreference(entry)) {
			conversationPreferenceLines.push(formatActiveEntry(entry));
			return;
		}
		if (entry.stability === "situational" || entry.stateData) {
			const mood = entry.stateData?.mood ? ` (${entry.stateData.mood})` : "";
			stateLines.push(`- [ID: ${entry.id}] **${entry.name || "Unknown"}**${mood}: ${entry.summary || ""}`);
			return;
		}
		activeLines.push(formatActiveEntry(entry));
	};

	for (const e of active.lessons) pushActiveEntry(e);
	for (const e of active.knowledge) pushActiveEntry(e);
	for (const e of active.preferences) pushActiveEntry(e);
	for (const e of active.facets) activeLines.push(formatActiveFacet(e));
	for (const e of active.events) keyEventLines.push(formatActiveEvent(e));
	const episodicLines = active.episodeMemories.map((entry) => {
		const goal = entry.userGoal ? ` | Goal: ${entry.userGoal}` : "";
		const outcome = entry.outcome ? ` | Outcome: ${entry.outcome}` : "";
		return `- [ID: ${entry.id}] **${entry.title || "Episode"}**: ${entry.summary}${goal}${outcome}`;
	});
	const episodicFacetLines = active.episodeFacets.map((entry) => {
		const detail = entry.anchorText ? `\n  ${entry.anchorText}` : "";
		return `- [ID: ${entry.id}] [${entry.facetType}] **${entry.searchText}**${detail}`;
	});
	const semanticLines = active.semanticMemories.map((entry) => {
		const detail = entry.detail ? `\n  ${entry.detail}` : "";
		return `- [ID: ${entry.id}] [${entry.semanticType}] **${entry.name}**: ${entry.summary}${detail}`;
	});
	const proceduralLines = active.procedural.map((entry) => {
		const steps = entry.steps.slice(0, 4).map((step, index) => `${index + 1}. ${step.text}`).join("\n  ");
		const boundaries = entry.boundaries ? `\n  Boundaries: ${entry.boundaries}` : "";
		return `- [ID: ${entry.id}] **${entry.name}**: ${entry.summary}\n  ${steps}${boundaries}`;
	});

	if (conversationPreferenceLines.length) {
		sections.push(`### ${p.sectionConversationPreferences}\n${conversationPreferenceLines.join("\n")}`);
	}
	if (activeLines.length) {
		sections.push(`### ${p.sectionActiveMemories}\n${activeLines.join("\n")}`);
	}
	if (episodicLines.length || episodicFacetLines.length) {
		sections.push(`### ${episodicSectionTitle}\n${[...episodicLines, ...episodicFacetLines].join("\n")}`);
	}
	if (semanticLines.length) {
		sections.push(`### ${semanticSectionTitle}\n${semanticLines.join("\n")}`);
	}
	if (proceduralLines.length) {
		sections.push(`### ${proceduralSectionTitle}\n${proceduralLines.join("\n")}`);
	}
	if (keyEventLines.length) {
		sections.push(`### ${p.sectionKeyEvents ?? "Key Events"}\n${keyEventLines.join("\n")}`);
	}
	if (stateLines.length) {
		sections.push(`### ${p.sectionCurrentState ?? "Current State Signals"}\n${stateLines.join("\n")}`);
	}

	const relatedLines = graphContext.map(
		(neighbor) =>
			`- [${neighbor.relation}] [ID: ${neighbor.entry.id}] [${neighbor.entry.type}] **${
				neighbor.entry.name || "Unknown"
			}**: ${neighbor.entry.summary || ""}`,
	);
	if (relatedLines.length) {
		sections.push(`### ${p.sectionRelatedContext ?? "Related Context"}\n${relatedLines.join("\n")}`);
	}

	// ── Cue tier: name + summary + id ──
	const cueLines: string[] = [];

	const formatCueEntry = (e: MemoryEntry): string =>
		`- [ID: ${e.id}] [${e.type}] **${e.name || "—"}**: ${e.summary || ""}`;

	const formatCueFacet = (e: MemoryEntry): string => {
		if (e.facetData?.kind === "pattern") {
			return `- [ID: ${e.id}] [pattern] **${e.name || "—"}**: When ${e.facetData.trigger} → ${e.facetData.behavior}`;
		}
		if (e.facetData?.kind === "struggle") {
			return `- [ID: ${e.id}] [struggle] **${e.name || "—"}**: ${e.facetData.problem}`;
		}
		return formatCueEntry(e);
	};

	const formatCueEvent = (e: MemoryEntry): string =>
		`- [ID: ${e.id}] [event] **${e.name || "—"}**: ${e.summary || ""}`;

	for (const e of cue.lessons) cueLines.push(formatCueEntry(e));
	for (const e of cue.knowledge) cueLines.push(formatCueEntry(e));
	for (const e of cue.events) cueLines.push(formatCueEvent(e));
	for (const e of cue.preferences) cueLines.push(formatCueEntry(e));
	for (const e of cue.facets) cueLines.push(formatCueFacet(e));
	for (const episode of cue.episodeMemories) {
		cueLines.push(`- [ID: ${episode.id}] [episode] **${episode.title || "Episode"}**: ${episode.summary}`);
	}
	for (const facet of cue.episodeFacets) {
		cueLines.push(`- [ID: ${facet.id}] [episode-${facet.facetType}] **${facet.searchText}**: ${facet.summary || facet.anchorText || ""}`);
	}
	for (const semantic of cue.semanticMemories) {
		cueLines.push(`- [ID: ${semantic.id}] [semantic-${semantic.semanticType}] **${semantic.name}**: ${semantic.summary}`);
	}
	for (const procedure of cue.procedural) {
		cueLines.push(`- [ID: ${procedure.id}] [procedural] **${procedure.name}**: ${procedure.summary}`);
	}

	// Episodes in cue layer (no ID-based recall)
	for (const ep of cue.episodes) {
		cueLines.push(
			`- [${ep.date}] ${ep.project}: ${ep.summary}${ep.userGoal ? ` (Goal: ${ep.userGoal})` : ""}`,
		);
	}
	// Work in cue layer
	for (const w of cue.work) {
		cueLines.push(`- [${w.created.slice(0, 10)}] ${w.goal}: ${w.summary}`);
	}

	if (cueLines.length) {
		sections.push(`### ${p.sectionMemoryCues}\n*${p.memoryCueHint}*\n${cueLines.join("\n")}`);
	}

	if (!sections.length) return "";
	const soulStyle = process.env.NANOSOUL_MEMORY_STYLE;
	const behaviorBlock = soulStyle
		? `${p.memoryBehavior}\n\n${soulStyle}`
		: p.memoryBehavior;
	return `## ${p.injectionHeader}\n\n${sections.join("\n\n")}\n\n---\n${behaviorBlock}`;
}
