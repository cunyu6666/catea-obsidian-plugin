/**
 * [WHO]: EpisodeMemory, EpisodeFacet, ProceduralMemory, ProceduralStep, SemanticCluster, StateMemory, MemoryLink, MemoryScopeV2
 * [FROM]: Depends on ./types.js (MemoryScope)
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/types-v2.ts - foundation layer for NanoMem v2 layered-memory data model (episodic/semantic/procedural/state)
 */

import type { MemoryScope } from "./types.js";

export interface MemoryScopeV2 extends MemoryScope {
	project?: string;
	workspaceId?: string;
	branch?: string;
}

export type MemoryKind = "episode" | "facet" | "semantic" | "procedural" | "state";

export type SemanticKind =
	| "fact"
	| "lesson"
	| "preference"
	| "decision"
	| "entity"
	| "pattern"
	| "struggle"
	| "event";

export type FacetKind =
	| "goal"
	| "decision"
	| "constraint"
	| "error"
	| "fix"
	| "insight"
	| "outcome"
	| "pattern"
	| "preference"
	| "entity"
	| "context";

export type ProcedureStatus = "active" | "draft" | "deprecated" | "superseded";

export type MemoryStabilityV2 = "stable" | "situational" | "volatile";

export type MemoryRetentionV2 = "core" | "key-event" | "ambient";

export type AbstractionLevel = "instance" | "generalization" | "principle";

export type EvidenceSourceType = "conversation" | "file" | "tool-output" | "session-summary";

export type StateType = "mood" | "pressure" | "focus" | "preference-shift" | "working-style";

export type StateHorizon = "momentary" | "short-term" | "medium-term";

export type MemoryLinkType =
	| "has-facet"
	| "mentions-entity"
	| "supports"
	| "derived-from"
	| "generalizes"
	| "specializes"
	| "causes"
	| "caused-by"
	| "similar-to"
	| "conflicts-with"
	| "supersedes"
	| "retrieved-with";

export interface EmbeddingRef {
	model: string;
	dim: number;
	updatedAt: string;
	checksum: string;
	vectorId: string;
}

export type EmbeddingFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingIndexRecord {
	id: string;
	memoryId: string;
	memoryKind: "episode" | "facet" | "semantic" | "procedural";
	model: string;
	dim: number;
	checksum: string;
	text: string;
	vector: number[];
	updatedAt: string;
}

export interface EvidenceRef {
	id: string;
	sourceType: EvidenceSourceType;
	sourceId?: string;
	excerpt?: string;
	startOffset?: number;
	endOffset?: number;
	filePath?: string;
	createdAt: string;
}

export interface BaseMemoryV2 {
	id: string;
	kind: MemoryKind;
	scope?: MemoryScopeV2;
	createdAt: string;
	updatedAt: string;
	lastAccessedAt?: string;
	accessCount: number;
	importance: number;
	salience: number;
	confidence: number;
	retention: MemoryRetentionV2;
	stability: MemoryStabilityV2;
	archivedAt?: string;
	archiveReason?: string;
	revivedAt?: string;
	validFrom?: string;
	validTo?: string;
	ttlDays?: number;
	tags: string[];
	embedding?: EmbeddingRef;
	sourceEpisodeIds?: string[];
	evidence?: EvidenceRef[];
	/** SAL structural anchor — module/file path where this memory is located in the project terrain. Written by SAL extension at agent_end; undefined when SAL is disabled. */
	structuralAnchor?: { modulePath?: string; filePath?: string };
}

export interface EpisodeMemory extends BaseMemoryV2 {
	kind: "episode";
	sessionId: string;
	title?: string;
	summary: string;
	startedAt?: string;
	endedAt?: string;
	timeZone?: string;
	userGoal?: string;
	outcome?: string;
	affect?: {
		valence?: number;
		intensity?: number;
		label?: string;
	};
	filesModified: string[];
	toolsUsed: Record<string, number>;
	entities: string[];
	facetIds: string[];
	derivedSemanticIds: string[];
	derivedProcedureIds: string[];
	consolidatedAt?: string;
	reconsolidatedAt?: string;
}

export interface EpisodeFacet extends BaseMemoryV2 {
	kind: "facet";
	episodeId: string;
	facetType: FacetKind;
	searchText: string;
	anchorText?: string;
	summary?: string;
	detail?: string;
	entityRefs?: string[];
	aliases?: string[];
	causalRole?: "cause" | "effect" | "constraint" | "resolution" | "signal";
	outcomeScore?: number;
}

export interface SemanticMemory extends BaseMemoryV2 {
	kind: "semantic";
	semanticType: SemanticKind;
	name: string;
	summary: string;
	detail?: string;
	supersedesIds?: string[];
	supersededById?: string;
	abstractionLevel?: AbstractionLevel;
	conflictWithIds?: string[];
}

export interface ProceduralStep {
	id: string;
	text: string;
	kind?: "step" | "warning" | "precondition" | "heuristic" | "validation";
}

export interface ProceduralMemory extends BaseMemoryV2 {
	kind: "procedural";
	name: string;
	summary: string;
	searchText: string;
	applicability?: string;
	boundaries?: string;
	contextText?: string;
	steps: ProceduralStep[];
	status: ProcedureStatus;
	version: number;
	sourceFacetIds?: string[];
	sourceSemanticIds?: string[];
	supersedesIds?: string[];
	supersededById?: string;
}

export interface StateMemory extends BaseMemoryV2 {
	kind: "state";
	stateType: StateType;
	summary: string;
	detail?: string;
	horizon: StateHorizon;
}

export interface MemoryLink {
	id: string;
	fromId: string;
	toId: string;
	type: MemoryLinkType;
	weight: number;
	explicit: boolean;
	createdAt: string;
	updatedAt: string;
	evidence?: EvidenceRef[];
}

export interface V2Meta {
	version: number;
	lastMigrationAt?: string;
	lastEmbeddingSyncAt?: string;
	lastReconsolidationAt?: string;
	lastMaintenanceAt?: string;
	lastMaintenanceVersion?: number;
	lastBackupAt?: string;
	lastBackupVersion?: number;
}

export interface NanoMemV2Snapshot {
	episodes: EpisodeMemory[];
	facets: EpisodeFacet[];
	semantic: SemanticMemory[];
	procedural: ProceduralMemory[];
	state: StateMemory[];
	links: MemoryLink[];
	meta: V2Meta;
}
