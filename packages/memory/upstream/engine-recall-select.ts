/**
 * [WHO]: Provides selectRecallEntries — budget/tier/pick logic for progressive recall
 * [FROM]: Depends on ./scoring.js for pickTop, scoreEntry, scoreEpisode, scoreWorkEntry, tierEntries; ./linking.js for getGraphNeighborhoodBySeeds; ./engine-scoring-v2.js for V2 scoring; ./engine-injection-text.js for conversation prefs
 * [TO]: Consumed by engine.ts (getMemoryInjection)
 * [HERE]: packages/mem-core/src/engine-recall-select.ts - recall entry selection and budget allocation
 */

import { selectConversationPreferences, mergeUniqueEntries } from "./engine-injection-text.js";
import {
	scoreEpisodeMemory,
	scoreEpisodeFacet,
	scoreV2SemanticMemory,
	scoreProceduralMemory,
} from "./engine-scoring-v2.js";
import { getGraphNeighborhoodBySeeds, type GraphNeighbor } from "./linking.js";
import {
	pickTop,
	scoreEntry,
	scoreEpisode,
	scoreWorkEntry,
	tierEntries,
} from "./scoring.js";
import type { ProgressiveRecallConfig } from "./config.js";
import type { MemoryEntry, MemoryScope, WorkEntry, Episode } from "./types.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";

export interface RecallSelectionResult {
	active: {
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		events: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
		episodeMemories: EpisodeMemory[];
		episodeFacets: EpisodeFacet[];
		semanticMemories: SemanticMemory[];
		procedural: ProceduralMemory[];
	};
	cue: {
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
	};
	allEntries: MemoryEntry[];
	graphContext: GraphNeighbor[];
	// For reinforcement
	injectedActiveKnowledge: MemoryEntry[];
	injectedActiveLessons: MemoryEntry[];
	injectedActiveEvents: MemoryEntry[];
	injectedActivePrefs: MemoryEntry[];
	injectedCueKnowledge: MemoryEntry[];
	injectedCueLessons: MemoryEntry[];
	injectedCueEvents: MemoryEntry[];
	injectedCuePrefs: MemoryEntry[];
	injectedCueEpisodes: Episode[];
	legacyFacetBridgeActive: MemoryEntry[];
	legacyFacetBridgeCue: MemoryEntry[];
}

export function selectRecallEntries(params: {
	// Legacy entries (filtered)
	knowledge: MemoryEntry[]; lessons: MemoryEntry[]; events: MemoryEntry[];
	prefs: MemoryEntry[]; facets: MemoryEntry[]; work: WorkEntry[]; episodes: Episode[];
	// V2 entries (filtered)
	v2Episodes: EpisodeMemory[]; v2EpisodeFacets: EpisodeFacet[];
	v2Semantic: SemanticMemory[]; procedural: ProceduralMemory[];
	// Raw entries for graph context
	allKnowledge: MemoryEntry[]; allLessons: MemoryEntry[]; allEvents: MemoryEntry[];
	allPrefs: MemoryEntry[]; allFacets: MemoryEntry[];
	// Semantic candidates from embedding search
	semanticCandidates: Array<{ memoryId: string; memoryKind: string; score: number }>;
	// Config
	halfLife: Record<string, number>;
	scoreWeights: { recency: number; importance: number; relevance: number };
	progressiveRecall: ProgressiveRecallConfig;
	tokenBudget: number;
	structuralWeight: number;
	project: string;
	contextTags: string[];
}): RecallSelectionResult {
	const {
		knowledge, lessons, events, prefs, facets, work, episodes,
		v2Episodes, v2EpisodeFacets, v2Semantic, procedural,
		allKnowledge, allLessons, allEvents, allPrefs, allFacets,
		semanticCandidates, halfLife: hl, scoreWeights: sw, progressiveRecall: pr,
		tokenBudget, structuralWeight, project, contextTags,
	} = params;

	const semanticEpisodeIds = new Set(
		semanticCandidates.filter((item) => item.memoryKind === "episode").map((item) => item.memoryId),
	);
	const semanticFacetIds = new Set(
		semanticCandidates.filter((item) => item.memoryKind === "facet").map((item) => item.memoryId),
	);
	const semanticProcedureIds = new Set(
		semanticCandidates.filter((item) => item.memoryKind === "procedural").map((item) => item.memoryId),
	);
	const semanticV2SemanticIds = new Set(
		semanticCandidates.filter((item) => item.memoryKind === "semantic").map((item) => item.memoryId),
	);

	// Tier all MemoryEntry categories
	const tieredKnowledge = tierEntries(knowledge, project, contextTags, hl, sw, pr);
	const tieredLessons = tierEntries(lessons, project, contextTags, hl, sw, pr);
	const tieredEvents = tierEntries(events, project, contextTags, hl, sw, pr);
	const tieredPrefs = tierEntries(prefs, project, contextTags, hl, sw, pr);
	const tieredFacets = tierEntries(facets, project, contextTags, hl, sw, pr);
	const forcedConversationPrefs = selectConversationPreferences(prefs);

	// Budget calculation
	const totalChars = tokenBudget * 4;
	const activeChars = Math.floor(totalChars * pr.budgetActive);
	const cueChars = Math.floor(totalChars * pr.budgetCue);
	const proceduralChars = Math.floor(totalChars * 0.18);

	// Entry length helpers
	const activeLen = (e: MemoryEntry) =>
		(e.name?.length || 0) + (e.summary?.length || 0) + (e.detail?.length || 0) + 30;
	const cueLen = (e: MemoryEntry) => (e.name?.length || 0) + (e.summary?.length || 0) + 30;
	const scoreFn = (e: MemoryEntry) => scoreEntry(e, project, contextTags, hl, sw);
	const proceduralLen = (pItem: ProceduralMemory) =>
		(pItem.name?.length || 0) + (pItem.summary?.length || 0) + pItem.steps.reduce((sum, step) => sum + step.text.length, 0) + 60;
	const proceduralCueLen = (pItem: ProceduralMemory) =>
		(pItem.name?.length || 0) + (pItem.summary?.length || 0) + 40;
	const proceduralScoreFn = (pItem: ProceduralMemory) => scoreProceduralMemory(pItem, project, contextTags, structuralWeight);
	const episodeMemoryLen = (item: EpisodeMemory) => (item.title?.length || 0) + item.summary.length + 40;
	const episodeFacetLen = (item: EpisodeFacet) =>
		item.searchText.length + (item.anchorText?.length || 0) + (item.summary?.length || 0) + 40;
	const episodeCueLen = (item: EpisodeMemory) => (item.title?.length || 0) + item.summary.length + 36;
	const episodeFacetCueLen = (item: EpisodeFacet) =>
		item.searchText.length + (item.summary?.length || 0) + (item.anchorText?.length || 0) + 36;
	const semanticMemoryLen = (item: SemanticMemory) =>
		(item.name?.length || 0) + item.summary.length + (item.detail?.length || 0) + 40;
	const semanticMemoryCueLen = (item: SemanticMemory) => (item.name?.length || 0) + item.summary.length + 36;
	const episodeScoreFn = (item: EpisodeMemory) => scoreEpisodeMemory(item, project, contextTags, structuralWeight);
	const episodeFacetScoreFn = (item: EpisodeFacet) => scoreEpisodeFacet(item, project, contextTags, structuralWeight);
	const semanticMemoryScoreFn = (item: SemanticMemory) => scoreV2SemanticMemory(item, project, contextTags, structuralWeight);

	// Active tier
	const activeBudgetPer = Math.floor(activeChars / 5);
	const activeKnowledge = pickTop(tieredKnowledge.active, scoreFn, activeLen, activeBudgetPer);
	const activeLessons = pickTop(tieredLessons.active, scoreFn, activeLen, activeBudgetPer);
	const activeEvents = pickTop(tieredEvents.active, scoreFn, activeLen, activeBudgetPer);
	const activePrefs = mergeUniqueEntries(
		forcedConversationPrefs,
		pickTop(tieredPrefs.active, scoreFn, activeLen, activeBudgetPer),
	);
	const activeFacets = pickTop(tieredFacets.active, scoreFn, activeLen, activeBudgetPer);
	const activeProcedural = pickTop(
		procedural.filter((item) => semanticProcedureIds.has(item.id) || proceduralScoreFn(item) >= 0.45),
		proceduralScoreFn,
		proceduralLen,
		Math.max(400, Math.floor(proceduralChars * 0.55)),
	);
	const activeEpisodeMemories = pickTop(
		v2Episodes.filter((item) => semanticEpisodeIds.has(item.id) || episodeScoreFn(item) >= 0.45),
		episodeScoreFn,
		episodeMemoryLen,
		Math.max(320, Math.floor(activeChars * 0.18)),
	);
	const activeEpisodeFacets = pickTop(
		v2EpisodeFacets.filter((item) => semanticFacetIds.has(item.id) || episodeFacetScoreFn(item) >= 0.42),
		episodeFacetScoreFn,
		episodeFacetLen,
		Math.max(320, Math.floor(activeChars * 0.18)),
	);
	const activeSemanticMemories = pickTop(
		v2Semantic.filter((item) => semanticV2SemanticIds.has(item.id) || semanticMemoryScoreFn(item) >= 0.42),
		semanticMemoryScoreFn,
		semanticMemoryLen,
		Math.max(280, Math.floor(activeChars * 0.16)),
	);

	const activeSeeds = [...activeKnowledge, ...activeLessons, ...activeEvents, ...activePrefs, ...activeFacets];
	const allEntries = [...allKnowledge, ...allLessons, ...allEvents, ...allPrefs, ...allFacets];
	const activeIds = new Set(activeSeeds.map((entry) => entry.id));
	const graphContext = getGraphNeighborhoodBySeeds(activeSeeds, allEntries, 8).filter(
		(neighbor) => !activeIds.has(neighbor.entry.id),
	);

	// Cue tier
	const cueBudgetPer = Math.floor(cueChars / 7);
	const cueKnowledge = pickTop(tieredKnowledge.cue, scoreFn, cueLen, cueBudgetPer);
	const cueLessons = pickTop(tieredLessons.cue, scoreFn, cueLen, cueBudgetPer);
	const cueEvents = pickTop(tieredEvents.cue, scoreFn, cueLen, cueBudgetPer);
	const forcedConversationPrefIds = new Set(forcedConversationPrefs.map((entry) => entry.id));
	const cuePrefs = pickTop(
		tieredPrefs.cue.filter((entry) => !forcedConversationPrefIds.has(entry.id)),
		scoreFn,
		cueLen,
		cueBudgetPer,
	);
	const cueFacets = pickTop(tieredFacets.cue, scoreFn, cueLen, cueBudgetPer);
	const graphContextIds = new Set(graphContext.map((neighbor) => neighbor.entry.id));
	const dedupeCue = (entries: MemoryEntry[]) => entries.filter((entry) => !graphContextIds.has(entry.id));
	const dedupedCueKnowledge = dedupeCue(cueKnowledge);
	const dedupedCueLessons = dedupeCue(cueLessons);
	const dedupedCueEvents = dedupeCue(cueEvents);
	const dedupedCuePrefs = dedupeCue(cuePrefs);
	const dedupedCueFacets = dedupeCue(cueFacets);

	const topEpisodes = pickTop(
		episodes,
		(ep) => scoreEpisode(ep, project, contextTags, hl, sw),
		(ep) => ep.summary.length + 30,
		cueBudgetPer,
	);
	const topWork = pickTop(
		work,
		(w) => scoreWorkEntry(w, project, contextTags, hl, sw),
		(w) => w.goal.length + w.summary.length + 30,
		cueBudgetPer,
	);
	const cueProcedural = pickTop(
		procedural.filter((item) => !activeProcedural.some((activeItem) => activeItem.id === item.id)),
		proceduralScoreFn,
		proceduralCueLen,
		Math.max(280, Math.floor(proceduralChars * 0.45)),
	);
	const cueEpisodeMemories = pickTop(
		v2Episodes.filter((item) => !activeEpisodeMemories.some((activeItem) => activeItem.id === item.id)),
		episodeScoreFn,
		episodeCueLen,
		Math.max(220, Math.floor(cueChars * 0.12)),
	);
	const cueEpisodeFacets = pickTop(
		v2EpisodeFacets.filter((item) => !activeEpisodeFacets.some((activeItem) => activeItem.id === item.id)),
		episodeFacetScoreFn,
		episodeFacetCueLen,
		Math.max(220, Math.floor(cueChars * 0.12)),
	);
	const cueSemanticMemories = pickTop(
		v2Semantic.filter((item) => !activeSemanticMemories.some((activeItem) => activeItem.id === item.id)),
		semanticMemoryScoreFn,
		semanticMemoryCueLen,
		Math.max(220, Math.floor(cueChars * 0.12)),
	);

	const legacyFacetBridgeActive = activeFacets.filter(
		(entry) => entry.facetData?.kind === "pattern" || entry.facetData?.kind === "struggle",
	);
	const legacyFacetBridgeCue = dedupedCueFacets.filter(
		(entry) => entry.facetData?.kind === "pattern" || entry.facetData?.kind === "struggle",
	);
	const v2SignalCount =
		activeEpisodeMemories.length + activeEpisodeFacets.length + activeSemanticMemories.length + activeProcedural.length +
		cueEpisodeMemories.length + cueEpisodeFacets.length + cueSemanticMemories.length + cueProcedural.length;
	const useLegacyFallback = v2SignalCount === 0;
	const injectedActiveKnowledge = useLegacyFallback ? activeKnowledge : [];
	const injectedActiveLessons = useLegacyFallback ? activeLessons : [];
	const injectedActiveEvents = useLegacyFallback ? activeEvents : [];
	const injectedActivePrefs = useLegacyFallback ? activePrefs : [];
	const injectedCueKnowledge = useLegacyFallback ? dedupedCueKnowledge : [];
	const injectedCueLessons = useLegacyFallback ? dedupedCueLessons : [];
	const injectedCueEvents = useLegacyFallback ? dedupedCueEvents : [];
	const injectedCuePrefs = useLegacyFallback ? dedupedCuePrefs : [];
	const injectedCueEpisodes = useLegacyFallback ? topEpisodes : [];

	return {
		active: {
			knowledge: injectedActiveKnowledge,
			lessons: injectedActiveLessons,
			events: injectedActiveEvents,
			preferences: injectedActivePrefs,
			facets: legacyFacetBridgeActive,
			episodeMemories: activeEpisodeMemories,
			episodeFacets: activeEpisodeFacets,
			semanticMemories: activeSemanticMemories,
			procedural: activeProcedural,
		},
		cue: {
			knowledge: injectedCueKnowledge,
			lessons: injectedCueLessons,
			events: injectedCueEvents,
			preferences: injectedCuePrefs,
			facets: legacyFacetBridgeCue,
			episodes: injectedCueEpisodes,
			work: topWork,
			episodeMemories: cueEpisodeMemories,
			episodeFacets: cueEpisodeFacets,
			semanticMemories: cueSemanticMemories,
			procedural: cueProcedural,
		},
		allEntries,
		graphContext,
		injectedActiveKnowledge, injectedActiveLessons, injectedActiveEvents, injectedActivePrefs,
		injectedCueKnowledge, injectedCueLessons, injectedCueEvents, injectedCuePrefs, injectedCueEpisodes,
		legacyFacetBridgeActive, legacyFacetBridgeCue,
	};
}
