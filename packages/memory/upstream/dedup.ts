/**
 * [WHO]: dedupeMemoryEntries, dedupeWorkEntries, mergeRelatedIds
 * [FROM]: Depends on ./scoring.js, ./types.js, ./update.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/dedup.ts - batch deduplication and cross-entry merge logic
 */


import { tagOverlap } from "./scoring.js";
import type { MemoryEntry, WorkEntry } from "./types.js";
import { contentSimilarity } from "./update.js";

const NOOP_TAG_THRESHOLD = 0.75;
const NOOP_CONTENT_THRESHOLD = 0.8;

function isMemoryDuplicate(a: MemoryEntry, b: MemoryEntry): boolean {
	if (a.type !== b.type) return false;
	const aText = `${a.name || ""} ${a.summary || ""} ${a.content || ""}`.trim();
	const bText = `${b.name || ""} ${b.summary || ""} ${b.content || ""}`.trim();
	const tagMatch = tagOverlap(a.tags, b.tags) >= NOOP_TAG_THRESHOLD;
	const contentMatch = contentSimilarity(aText, bText) >= NOOP_CONTENT_THRESHOLD;
	return tagMatch || contentMatch;
}

function isWorkDuplicate(a: WorkEntry, b: WorkEntry): boolean {
	const aText = `${a.goal} ${a.summary}`.trim();
	const bText = `${b.goal} ${b.summary}`.trim();
	const tagMatch = tagOverlap(a.tags, b.tags) >= NOOP_TAG_THRESHOLD;
	const contentMatch = contentSimilarity(aText, bText) >= NOOP_CONTENT_THRESHOLD;
	return tagMatch || contentMatch;
}

/** Merge duplicate into keeper: relatedIds union, max importance/accessCount, latest lastAccessed */
function mergeMemoryInto(keeper: MemoryEntry, duplicate: MemoryEntry): void {
	const ids = new Set([...(keeper.relatedIds || []), ...(duplicate.relatedIds || []), duplicate.id]);
	keeper.relatedIds = [...ids];
	keeper.importance = Math.max(keeper.importance, duplicate.importance);
	keeper.accessCount = Math.max(keeper.accessCount, duplicate.accessCount);
	if ((duplicate.lastAccessed || "") > (keeper.lastAccessed || "")) keeper.lastAccessed = duplicate.lastAccessed;
}

function mergeWorkInto(keeper: WorkEntry, duplicate: WorkEntry): void {
	const ids = new Set([...(keeper.relatedIds || []), ...(duplicate.relatedIds || []), duplicate.id]);
	keeper.relatedIds = [...ids];
	keeper.importance = Math.max(keeper.importance, duplicate.importance);
	keeper.accessCount = Math.max(keeper.accessCount, duplicate.accessCount);
	if ((duplicate.lastAccessed || "") > (keeper.lastAccessed || "")) keeper.lastAccessed = duplicate.lastAccessed;
}

/** Sort by quality (best first) so we keep the best of each duplicate group */
function memoryQuality(e: MemoryEntry): number {
	return (e.accessCount + 1) * e.importance;
}

function workQuality(w: WorkEntry): number {
	return (w.accessCount + 1) * w.importance;
}

/** Deduplicate MemoryEntry array. Keeps best of each duplicate group, merges relatedIds. */
export function deduplicateMemoryEntries(entries: MemoryEntry[]): { deduped: MemoryEntry[]; removedCount: number } {
	const sorted = [...entries].sort((a, b) => memoryQuality(b) - memoryQuality(a));
	const kept: MemoryEntry[] = [];
	let removedCount = 0;
	for (const e of sorted) {
		const existing = kept.find((k) => isMemoryDuplicate(k, e));
		if (existing) {
			mergeMemoryInto(existing, e);
			removedCount++;
		} else {
			kept.push(e);
		}
	}
	return { deduped: kept, removedCount };
}

/** Deduplicate WorkEntry array. */
export function deduplicateWorkEntries(entries: WorkEntry[]): { deduped: WorkEntry[]; removedCount: number } {
	const sorted = [...entries].sort((a, b) => workQuality(b) - workQuality(a));
	const kept: WorkEntry[] = [];
	let removedCount = 0;
	for (const e of sorted) {
		const existing = kept.find((k) => isWorkDuplicate(k, e));
		if (existing) {
			mergeWorkInto(existing, e);
			removedCount++;
		} else {
			kept.push(e);
		}
	}
	return { deduped: kept, removedCount };
}
