/**
 * [WHO]: contentSimilarity, applyExtraction, checkConsolidationEntry, checkWorkDuplicate, applyWorkExtraction
 * [FROM]: Depends on ./config.js, ./linking.js, ./privacy.js, ./scoring.js, ./store.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/update.ts - Mem0 four-operation pipeline (ADD/UPDATE/DELETE/NOOP)
 */


import type { NanomemConfig } from "./config.js";
import { linkNewEntry } from "./linking.js";
import { filterPII } from "./privacy.js";
import { extractTags, tagOverlap } from "./scoring.js";
import { deriveNameFromContent, deriveSummaryFromContent } from "./store.js";
import type { ExtractedItem, MemoryEntry, MemoryRetention, MemoryStability, WorkEntry } from "./types.js";

const UPDATE_OVERLAP_THRESHOLD = 0.7;
const NOOP_SIMILARITY_THRESHOLD = 0.8;
const CONTENT_SIMILARITY_THRESHOLD = 0.85;

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Simple content similarity check using character overlap — exported for dedup/consolidation */
export function contentSimilarity(a: string, b: string): number {
	const aLower = a.toLowerCase().trim();
	const bLower = b.toLowerCase().trim();
	if (aLower === bLower) return 1;
	const shorter = aLower.length < bLower.length ? aLower : bLower;
	const longer = aLower.length >= bLower.length ? aLower : bLower;
	if (longer.includes(shorter)) return shorter.length / longer.length;
	// Simple word overlap
	const aWords = new Set(aLower.split(/\s+/).filter((w) => w.length > 2));
	const bWords = new Set(bLower.split(/\s+/).filter((w) => w.length > 2));
	if (aWords.size === 0 || bWords.size === 0) return 0;
	let overlap = 0;
	for (const w of aWords) if (bWords.has(w)) overlap++;
	return (2 * overlap) / (aWords.size + bWords.size);
}

/** Check if new content is too similar to an existing entry of same type */
function isDuplicate(entries: MemoryEntry[], type: string, tags: string[], nameSummary: string): boolean {
	return entries.some((e) => {
		if (e.type !== type) return false;
		const existingNameSummary = `${e.name || ""} ${e.summary || e.content || ""}`.trim();
		// Check both tag overlap and content similarity
		const tagMatch = tagOverlap(e.tags, tags) >= NOOP_SIMILARITY_THRESHOLD;
		const contentMatch = contentSimilarity(existingNameSummary, nameSummary) >= CONTENT_SIMILARITY_THRESHOLD;
		return tagMatch || contentMatch;
	});
}

/** Find existing entry with high tag overlap for UPDATE */
function findUpdateCandidate(entries: MemoryEntry[], type: string, tags: string[]): number {
	return entries.findIndex((e) => e.type === type && tagOverlap(e.tags, tags) >= UPDATE_OVERLAP_THRESHOLD);
}

function inferRetention(item: ExtractedItem): MemoryRetention {
	if (item.retention) return item.retention;
	if (item.stability === "situational" || item.stateData) return "ambient";
	switch (item.type) {
		case "preference":
		case "pattern":
			return "core";
		case "lesson":
		case "struggle":
		case "decision":
		case "event":
			return "key-event";
		default:
			return "ambient";
	}
}

function inferStability(item: ExtractedItem): MemoryStability {
	if (item.stability) return item.stability;
	if (item.stateData) return "situational";
	switch (item.type) {
		case "preference":
		case "pattern":
			return "stable";
		case "event":
			return item.eventData?.kind === "milestone" ? "stable" : "situational";
		default:
			return "stable";
	}
}

function inferSalience(item: ExtractedItem): number {
	if (typeof item.salience === "number") {
		return Math.max(1, Math.min(10, item.salience));
	}
	switch (item.type) {
		case "event":
		case "struggle":
			return 9;
		case "lesson":
		case "decision":
			return 8;
		case "pattern":
			return 7;
		case "preference":
			return 6;
		default:
			return 4;
	}
}

function inferTtl(item: ExtractedItem, cfg: NanomemConfig, retention: MemoryRetention, salience: number): number | undefined {
	if (item.stability === "situational" || item.stateData) return Math.min(14, cfg.forgetting.ambientTtlDays);
	if (retention !== "ambient") return undefined;
	if (item.type === "fact" && salience <= 5) return cfg.forgetting.ambientTtlDays;
	return undefined;
}

/** Process a single extracted item through the Mem0 pipeline */
export function applyExtraction(
	entries: MemoryEntry[],
	item: ExtractedItem,
	project: string,
	cfg: NanomemConfig,
): void {
	if (item.type === "retract") {
		applyDelete(entries, item.detail || item.content || item.summary || "");
		return;
	}

	const memType = mapType(item.type);
	const rawDetail = item.detail || item.content || "";
	const detail = filterPII(rawDetail);
	const name = item.name || deriveNameFromContent(detail);
	const summary = item.summary || deriveSummaryFromContent(detail);
	const tags = extractTags(`${name} ${summary} ${detail}`);
	const nameSummary = `${name} ${summary}`;
	const retention = inferRetention(item);
	const salience = inferSalience(item);
	const stability = inferStability(item);

	if (isDuplicate(entries, memType, tags, nameSummary)) return;

	const updateIdx = findUpdateCandidate(entries, memType, tags);
	if (updateIdx >= 0) {
		const existing = entries[updateIdx]!;
		entries[updateIdx] = {
			...existing,
			name,
			summary,
			detail,
			content: detail,
			tags,
			lastAccessed: new Date().toISOString(),
			retention:
				existing.retention === "core" || retention === "core"
					? "core"
					: existing.retention === "key-event" || retention === "key-event"
						? "key-event"
						: "ambient",
			salience: Math.max(existing.salience ?? existing.importance, salience),
			eventData: item.eventData ?? existing.eventData,
			stateData: item.stateData ?? existing.stateData,
			stability: existing.stability === "stable" || stability === "stable" ? "stable" : "situational",
			ttl: inferTtl(item, cfg, retention, salience) ?? existing.ttl,
		};
		return;
	}

	const now = new Date().toISOString();
	const newEntry: MemoryEntry = {
		id: makeId(),
		type: memType,
		name,
		summary,
		detail,
		content: detail,
		tags,
		project,
		importance:
			item.type === "struggle"
				? 9
				: item.type === "lesson"
					? 8
					: item.type === "pattern"
						? 7
						: item.type === "preference"
							? 6
							: 5,
		strength: cfg.halfLife[memType] ?? 30,
		created: now,
		eventTime: now,
		accessCount: 0,
		relatedIds: [],
		scope: cfg.defaultScope,
		facetData: item.facetData,
		eventData: item.eventData,
		retention,
		salience,
		stability,
		stateData: item.stateData,
		ttl: inferTtl(item, cfg, retention, salience),
	};

	linkNewEntry(newEntry, entries);
	entries.push(newEntry);
}

function applyDelete(entries: MemoryEntry[], text: string): void {
	const tags = extractTags(text);
	const idx = entries.findIndex(
		(e) => (e.type === "fact" || e.type === "preference") && tagOverlap(e.tags, tags) >= UPDATE_OVERLAP_THRESHOLD,
	);
	if (idx >= 0) entries.splice(idx, 1);
}

function mapType(t: ExtractedItem["type"]): MemoryEntry["type"] {
	switch (t) {
		case "preference":
			return "preference";
		case "lesson":
			return "lesson";
		case "decision":
			return "decision";
		case "pattern":
			return "pattern";
		case "struggle":
			return "struggle";
		case "event":
			return "event";
		default:
			return "fact";
	}
}

// ─── Dedup helpers for consolidation & work ────────────────────────────────

const WORK_DEDUP_TAG_THRESHOLD = 0.75;
const WORK_DEDUP_CONTENT_THRESHOLD = 0.8;
const WORK_UPDATE_TAG_THRESHOLD = 0.65;

/** Check if consolidation candidate is duplicate or update of existing. Used before pushing to knowledge/lessons. */
export function checkConsolidationEntry(
	target: MemoryEntry[],
	candidate: MemoryEntry,
	allExisting: MemoryEntry[],
): { action: "skip" } | { action: "update"; index: number } | { action: "add" } {
	const nameSummary = `${candidate.name || ""} ${candidate.summary || ""}`.trim();
	const sameTypeExisting = allExisting.filter((e) => e.type === candidate.type);
	if (isDuplicate(sameTypeExisting, candidate.type, candidate.tags, nameSummary)) return { action: "skip" };
	const updateIdx = findUpdateCandidate(target, candidate.type, candidate.tags);
	if (updateIdx >= 0) return { action: "update", index: updateIdx };
	return { action: "add" };
}

/** Check if work candidate is duplicate or update of existing work entries. */
export function checkWorkDuplicate(
	entries: WorkEntry[],
	candidate: WorkEntry,
): { action: "skip" } | { action: "update"; index: number } | { action: "add" } {
	const candidateText = `${candidate.goal} ${candidate.summary}`.trim();
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i]!;
		const existingText = `${e.goal} ${e.summary}`.trim();
		const tagMatch = tagOverlap(e.tags, candidate.tags) >= WORK_DEDUP_TAG_THRESHOLD;
		const contentMatch = contentSimilarity(existingText, candidateText) >= WORK_DEDUP_CONTENT_THRESHOLD;
		if (tagMatch || contentMatch) return { action: "skip" };
	}
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i]!;
		if (tagOverlap(e.tags, candidate.tags) >= WORK_UPDATE_TAG_THRESHOLD) return { action: "update", index: i };
	}
	return { action: "add" };
}
