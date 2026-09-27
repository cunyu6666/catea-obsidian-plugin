/**
 * [WHO]: LlmFn, MemoryScope, MemoryRetention, MemoryStability, FacetData, MemoryEntry, MemoryRelation, Episode, WorkEntry, EventData, StateData
 * [FROM]: No external dependencies
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/types.ts - foundation layer type definitions for all memory data structures
 */


/** Pluggable LLM function: system prompt + user message → raw text response */
export type LlmFn = (systemPrompt: string, userMessage: string) => Promise<string>;

export interface MemoryScope {
	userId?: string;
	agentId?: string;
}

export type MemoryRetention = "core" | "key-event" | "ambient";
export type MemoryStability = "stable" | "situational";

/** Structured data for Facets (Pattern/Struggle) memory types */
export type FacetData =
	| { kind: "pattern"; trigger: string; behavior: string }
	| { kind: "struggle"; problem: string; attempts: string[]; solution: string };

export interface EventData {
	kind: string;
	outcome?: string;
	emotionalWeight?: number;
}

export interface StateData {
	mood: string;
	intensity?: number;
	horizon?: "momentary" | "short-term";
}

export interface MemoryRelation {
	id: string;
	kind: "same-project" | "tag-overlap" | "cause-of" | "caused-by" | "preference-shapes" | "repeated-pattern";
	weight: number;
}

export interface MemoryEntry {
	id: string;
	type: "fact" | "lesson" | "preference" | "decision" | "entity" | "pattern" | "struggle" | "event";
	/** @deprecated Use name/summary/detail instead. Kept for backward compatibility reads. */
	content?: string;
	/** Short title (≤30 chars) for quick identification */
	name?: string;
	/** One-liner cue (≤150 chars) for Memory Cue injection */
	summary?: string;
	/** Full content body — only injected in Active tier or via recall_memory tool */
	detail?: string;
	tags: string[];
	project: string;
	importance: number;
	/** Adaptive memory strength (days). Grows with each successful recall — Ebbinghaus spaced repetition. */
	strength?: number;
	/** Ingestion time: when the system recorded this entry */
	created: string;
	/** Event time: when the fact actually occurred (bi-temporal, defaults to created) */
	eventTime?: string;
	lastAccessed?: string;
	accessCount: number;
	/** A-MEM style links to related memory entries */
	relatedIds?: string[];
	/** TTL in days — auto-evicted after expiry. undefined = permanent */
	ttl?: number;
	scope?: MemoryScope;
	retention?: MemoryRetention;
	salience?: number;
	stability?: MemoryStability;
	archivedAt?: string;
	archiveReason?: string;
	revivedAt?: string;
	stateData?: StateData;
	relations?: MemoryRelation[];
	/** Structured data for pattern/struggle types (Facets) */
	facetData?: FacetData;
	eventData?: EventData;
}

export interface Episode {
	sessionId: string;
	project: string;
	date: string;
	startedAt?: string;
	endedAt?: string;
	timeZone?: string;
	summary: string;
	userGoal?: string;
	filesModified: string[];
	toolsUsed: Record<string, number>;
	keyObservations: string[];
	errors: string[];
	tags: string[];
	importance: number;
	consolidated: boolean;
	scope?: MemoryScope;
}

export interface WorkEntry {
	id: string;
	goal: string;
	summary: string;
	/** Full work detail — only injected in Active tier or via recall_memory tool */
	detail?: string;
	project: string;
	tags: string[];
	importance: number;
	strength?: number;
	created: string;
	eventTime?: string;
	lastAccessed?: string;
	accessCount: number;
	relatedIds?: string[];
	ttl?: number;
	archivedAt?: string;
	archiveReason?: string;
	revivedAt?: string;
	scope?: MemoryScope;
}

export interface Meta {
	totalSessions: number;
	lastConsolidation?: string;
	version: number;
	lastMaintenanceAt?: string;
	lastMaintenanceVersion?: number;
	lastBackupAt?: string;
	lastBackupVersion?: number;
}

/** Mem0-style update operations */
export type UpdateAction = "add" | "update" | "delete" | "noop";

export interface ExtractedItem {
	type: "preference" | "fact" | "lesson" | "decision" | "retract" | "pattern" | "struggle" | "event";
	/** @deprecated Use name/summary/detail instead. */
	content?: string;
	/** Short title (≤30 chars) */
	name?: string;
	/** One-liner summary (≤150 chars) */
	summary?: string;
	/** Full content body */
	detail?: string;
	/** Structured data for pattern/struggle types (populated by LLM extraction) */
	facetData?: FacetData;
	eventData?: EventData;
	retention?: MemoryRetention;
	salience?: number;
	stability?: MemoryStability;
	stateData?: StateData;
}

export interface ExtractedWork {
	goal: string;
	summary: string;
	/** Full detail of work accomplished */
	detail?: string;
}

// ─── Insights Types ──────────────────────────────────────

export interface PatternInsight {
	entry: MemoryEntry;
	weight: number;
	trigger: string;
	behavior: string;
}

export interface StruggleInsight {
	entry: MemoryEntry;
	weight: number;
	problem: string;
	attempts: string[];
	solution: string;
	resolved: boolean;
}

export interface InsightsReport {
	patterns: PatternInsight[];
	struggles: StruggleInsight[];
	topLessons: MemoryEntry[];
	topKnowledge: MemoryEntry[];
	preferences: MemoryEntry[];
	stats: {
		knowledge: number;
		lessons: number;
		preferences: number;
		facets: number;
		episodes: number;
		work: number;
		totalSessions: number;
	};
	recommendations: string[];
	generatedAt: string;
}

export interface AlignmentSnapshot {
	identityCore: MemoryEntry[];
	keyEvents: MemoryEntry[];
	behaviorDrivers: MemoryEntry[];
	currentState: MemoryEntry[];
	relationshipEdges: Array<{
		fromId: string;
		toId: string;
		kind: MemoryRelation["kind"];
		weight: number;
	}>;
	conflicts: Array<{
		aId: string;
		bId: string;
		reason: string;
		severity: number;
		recommendation: "merge" | "demote" | "forget" | "mark-situational";
		rationale: string;
	}>;
	generatedAt: string;
}

// ─── Full Insights Report (rich narrative + charts) ──────────────────────

export interface FullInsightsAtAGlance {
	working: string;
	hindering: string;
	quickWins: string;
	ambitious: string;
}

export interface FullInsightsProjectArea {
	name: string;
	sessionCount: number;
	description: string;
}

export interface FullInsightsChartRow {
	label: string;
	value: number;
}

export interface FullInsightsChart {
	id: string;
	title: string;
	rows: FullInsightsChartRow[];
}

export interface FullInsightsWin {
	title: string;
	description: string;
}

export interface FullInsightsFriction {
	title: string;
	description: string;
	examples?: string[];
}

export interface FullInsightsFeatureToTry {
	title: string;
	oneLiner: string;
	whyForYou: string;
	exampleCode?: string;
}

export interface FullInsightsUsagePattern {
	title: string;
	summary: string;
	detail: string;
	pastePrompt?: string;
}

export interface FullInsightsReport {
	stats: {
		knowledge: number;
		lessons: number;
		preferences: number;
		facets: number;
		episodes: number;
		work: number;
		totalSessions: number;
		aggregateToolCount?: number;
		aggregateFileCount?: number;
	};
	atAGlance: FullInsightsAtAGlance;
	projectAreas: FullInsightsProjectArea[];
	charts: FullInsightsChart[];
	wins: FullInsightsWin[];
	frictions: FullInsightsFriction[];
	patterns: PatternInsight[];
	recommendations: string[];
	featuresToTry: FullInsightsFeatureToTry[];
	usagePatterns: FullInsightsUsagePattern[];
	generatedAt: string;
	locale: string;
}

// ─── Developer Persona (Human-Readable) ──────────────────────────────

export interface DeveloperPersona {
	/** Plain language description of what this person does */
	whatTheyDo: string;
	/** Experience level description */
	experienceLevel: string;
	/** Areas of strength */
	superpowers: string[];
	/** Frequent blockers */
	painPoints: string[];
	/** Work style description */
	workStyle: string;
	/** One-sentence summary */
	summary: string;
}

// ─── Human-Readable Insights ──────────────────────────────

export interface HumanInsight {
	/** Insight title - grabs attention */
	title: string;
	/** Insight content - like chatting with a friend */
	content: string;
	/** Emoji icon */
	icon: string;
	/** Utility level */
	utility: "high" | "medium" | "low";
	/** Category tags */
	tags: string[];
}

// ─── Root Cause Analysis Insights ──────────────────────────────

export interface RootCauseInsight {
	/** Surface symptom */
	symptom: string;
	/** Root cause (in plain language) */
	rootCause: string;
	/** Evidence */
	evidence: string[];
	/** Suggestion */
	suggestion: string;
}

// ─── Comparative Insights ──────────────────────────────

export interface ComparativeInsight {
	/** Comparison dimension */
	dimension: string;
	/** User's actual situation */
	youAre: string;
	/** How typical users are */
	typical: string;
	/** Conclusion */
	verdict: string;
}

// ─── Enhanced Full Insights Report ──────────────────────────────────────

export interface EnhancedInsightsReport extends FullInsightsReport {
	/** Developer persona */
	persona?: DeveloperPersona;
	/** Human-readable insights */
	humanInsights: HumanInsight[];
	/** Root cause analysis */
	rootCauses: RootCauseInsight[];
	/** Comparative insights */
	comparisons: ComparativeInsight[];
}

// ─── Progressive Recall Types ────────────────────────────

/** Injection tier for progressive recall */
export type InjectionLevel = "active" | "cue" | "dormant";
