/**
 * [WHO]: NanoMemEngine, getConfig, PROMPTS, PromptSet, renderInsightsHtml, renderFullInsightsHtml, all types
 * [FROM]: Re-exports from ./config.js, ./engine.js, ./i18n.js, ./insights-html.js, ./full-insights-html.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/extension.ts
 * [HERE]: packages/mem-core/src/index.ts - barrel export, public API surface for nanomem package
 */


export type { EmbeddingConfig, NanomemConfig, ProgressiveRecallConfig } from "./config.js";
export { getConfig } from "./config.js";
export { NanoMemEngine } from "./engine.js";
export { createHashedEmbeddingFn } from "./hash-embedding.js";
export type { PromptSet } from "./i18n.js";
export { PROMPTS } from "./i18n.js";
export { renderInsightsHtml } from "./insights-html.js";
export { renderFullInsightsHtml } from "./full-insights-html.js";
export {
	checksumText,
	cosineSimilarity,
	getEmbeddingIndexPath,
	loadEmbeddingIndex,
	queryEmbeddingIndex,
	saveEmbeddingIndex,
	syncEmbeddingIndex,
} from "./embedding-index.js";
export { consolidateV2Memories } from "./consolidate-v2.js";
export { getGraphNeighborhoodBySeeds, getRelatedSummaries, linkNewEntry, reinforceRelations } from "./linking.js";
export { evictExpiredEntries, evictExpiredWork, filterByScope, filterPII, matchesScope } from "./privacy.js";
export { compileProcedureFromEpisode } from "./procedural-v2.js";
export { reconsolidateV2Memories } from "./reconsolidate-v2.js";
export {
	getV2Paths,
	loadV2Episodes,
	loadV2Facets,
	loadV2Links,
	loadV2Meta,
	loadV2Procedural,
	loadV2Semantic,
	loadV2Snapshot,
	loadV2State,
	saveV2Episodes,
	saveV2Facets,
	saveV2Links,
	saveV2Meta,
	saveV2Procedural,
	saveV2Semantic,
	saveV2Snapshot,
	saveV2State,
} from "./store-v2.js";
export type { ScoreWeights } from "./scoring.js";
export {
	daysSince,
	decay,
	extractTags,
	getInjectionLevel,
	pickTop,
	scoreEntry,
	scoreEpisode,
	scoreWorkEntry,
	tagOverlap,
	tierEntries,
} from "./scoring.js";
export type {
	AlignmentSnapshot,
	Episode,
	ExtractedItem,
	ExtractedWork,
	FacetData,
	FullInsightsReport,
	FullInsightsAtAGlance,
	FullInsightsProjectArea,
	FullInsightsChart,
	FullInsightsChartRow,
	FullInsightsWin,
	FullInsightsFriction,
	FullInsightsFeatureToTry,
	FullInsightsUsagePattern,
	InjectionLevel,
	InsightsReport,
	LlmFn,
	MemoryEntry,
	MemoryScope,
	Meta,
	PatternInsight,
	StruggleInsight,
	UpdateAction,
	WorkEntry,
} from "./types.js";
export type {
	AbstractionLevel,
	BaseMemoryV2,
	EmbeddingFn,
	EmbeddingIndexRecord,
	EmbeddingRef,
	EpisodeFacet,
	EpisodeMemory,
	EvidenceRef,
	EvidenceSourceType,
	FacetKind,
	MemoryKind,
	MemoryLink,
	MemoryLinkType,
	MemoryRetentionV2,
	MemoryScopeV2,
	MemoryStabilityV2,
	NanoMemV2Snapshot,
	ProcedureStatus,
	ProceduralMemory,
	ProceduralStep,
	SemanticKind,
	SemanticMemory,
	StateHorizon,
	StateMemory,
	StateType,
	V2Meta,
} from "./types-v2.js";
export type { NanoMemV2Paths } from "./store-v2.js";
