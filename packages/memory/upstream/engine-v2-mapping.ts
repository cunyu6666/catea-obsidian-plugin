/**
 * [WHO]: Provides inferSemanticRetention/Stability/Importance, mapExtractedItemToSemanticType, upsertSemanticFromExtractedItem, semanticKindToLegacyType, semanticToRuntimeEntry, proceduralToRuntimeEntry
 * [FROM]: Depends on ./privacy.js for filterPII; ./scoring.js for extractTags, tagOverlap; ./types.js, ./types-v2.js; ./engine-scoring-v2.js for currentStructuralAnchor
 * [TO]: Consumed by engine.ts (extractAndStore, buildRuntimeMemoryView)
 * [HERE]: packages/mem-core/src/engine-v2-mapping.ts - V2 type mapping and extraction-to-semantic conversion
 */

import { currentStructuralAnchor } from "./engine-scoring-v2.js";
import { extractTags, tagOverlap } from "./scoring.js";
import { filterPII } from "./privacy.js";
import type { ExtractedItem, MemoryEntry, MemoryScope } from "./types.js";
import type { ProceduralMemory, SemanticMemory } from "./types-v2.js";

export function inferSemanticRetention(item: ExtractedItem): SemanticMemory["retention"] {
	if (item.retention) return item.retention;
	if (item.stability === "situational" || item.stateData) return "ambient";
	switch (item.type) {
		case "preference":
		case "pattern":
			return "core";
		case "lesson":
		case "decision":
		case "event":
		case "struggle":
			return "key-event";
		default:
			return "ambient";
	}
}

export function inferSemanticStability(item: ExtractedItem): SemanticMemory["stability"] {
	if (item.stability === "situational") return "situational";
	if (item.stateData) return "volatile";
	switch (item.type) {
		case "preference":
		case "pattern":
			return "stable";
		case "event":
		case "struggle":
			return "situational";
		default:
			return "stable";
	}
}

export function inferSemanticImportance(item: ExtractedItem): number {
	switch (item.type) {
		case "struggle":
		case "event":
			return 9;
		case "lesson":
		case "decision":
			return 8;
		case "pattern":
			return 7;
		case "preference":
			return 6;
		default:
			return 5;
	}
}

export function mapExtractedItemToSemanticType(item: ExtractedItem): SemanticMemory["semanticType"] {
	switch (item.type) {
		case "lesson":
			return "lesson";
		case "preference":
			return "preference";
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

export function upsertSemanticFromExtractedItem(
	semantic: SemanticMemory[],
	item: ExtractedItem,
	project: string,
	defaultScope: MemoryScope | undefined,
): void {
	if (item.type === "retract") return;
	const detail = filterPII(item.detail || item.content || "");
	const name = item.name || detail.slice(0, 30) || item.summary || "memory";
	const summary = item.summary || detail.slice(0, 150) || name;
	const semanticType = mapExtractedItemToSemanticType(item);
	const tags = extractTags(`${name} ${summary} ${detail}`);
	const now = new Date().toISOString();
	const existing = semantic.find(
		(entry) =>
			entry.semanticType === semanticType &&
			entry.scope?.project === project &&
			(tagOverlap(entry.tags, tags) >= 0.72 ||
				`${entry.name} ${entry.summary}`.trim().toLowerCase() === `${name} ${summary}`.trim().toLowerCase()),
	);
	if (existing) {
		existing.name = name;
		existing.summary = summary;
		existing.detail = detail || existing.detail;
		existing.tags = [...new Set(tags)];
		existing.updatedAt = now;
		existing.retention = inferSemanticRetention(item);
		existing.stability = inferSemanticStability(item);
		existing.salience = Math.max(existing.salience, inferSemanticImportance(item));
		existing.importance = Math.max(existing.importance, inferSemanticImportance(item));
		return;
	}

	semantic.push({
		id: `semantic:extract:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		kind: "semantic",
		semanticType,
		name,
		summary,
		detail,
		accessCount: 0,
		importance: inferSemanticImportance(item),
		salience: Math.max(4, inferSemanticImportance(item)),
		confidence: 0.8,
		retention: inferSemanticRetention(item),
		stability: inferSemanticStability(item),
		tags,
		evidence: [],
		scope: { ...defaultScope, project },
		createdAt: now,
		updatedAt: now,
		abstractionLevel: semanticType === "event" ? "instance" : "generalization",
		structuralAnchor: currentStructuralAnchor(),
	});
}

export function semanticKindToLegacyType(kind: SemanticMemory["semanticType"]): MemoryEntry["type"] {
	switch (kind) {
		case "lesson":
			return "lesson";
		case "preference":
			return "preference";
		case "decision":
			return "decision";
		case "event":
			return "event";
		case "pattern":
			return "pattern";
		case "struggle":
			return "struggle";
		default:
			return "fact";
	}
}

export function semanticToRuntimeEntry(entry: SemanticMemory): MemoryEntry {
	const type = semanticKindToLegacyType(entry.semanticType);
	return {
		id: entry.id,
		type,
		name: entry.name,
		summary: entry.summary,
		detail: entry.detail,
		content: entry.detail || entry.summary,
		tags: entry.tags,
		project: entry.scope?.project || "default",
		importance: entry.importance,
		strength: undefined,
		created: entry.createdAt,
		eventTime: entry.validFrom ?? entry.createdAt,
		lastAccessed: entry.lastAccessedAt,
		accessCount: entry.accessCount,
		relatedIds: [...new Set([...(entry.supersedesIds ?? []), ...(entry.conflictWithIds ?? [])])],
		scope: entry.scope,
		retention: entry.retention === "ambient" ? "ambient" : entry.retention === "core" ? "core" : "key-event",
		salience: entry.salience,
		stability: entry.stability === "volatile" ? "situational" : entry.stability === "stable" ? "stable" : "situational",
	};
}

export function proceduralToRuntimeEntry(entry: ProceduralMemory): MemoryEntry {
	return {
		id: entry.id,
		type: "decision",
		name: entry.name,
		summary: entry.summary,
		detail: [entry.contextText, entry.boundaries, entry.steps.map((step) => step.text).join("\n")].filter(Boolean).join("\n"),
		content: entry.summary,
		tags: entry.tags,
		project: entry.scope?.project || "default",
		importance: entry.importance,
		strength: undefined,
		created: entry.createdAt,
		eventTime: entry.validFrom ?? entry.createdAt,
		lastAccessed: entry.lastAccessedAt,
		accessCount: entry.accessCount,
		relatedIds: entry.supersedesIds,
		scope: entry.scope,
		retention: entry.retention === "ambient" ? "ambient" : entry.retention === "core" ? "core" : "key-event",
		salience: entry.salience,
		stability: entry.stability === "volatile" ? "situational" : entry.stability === "stable" ? "stable" : "situational",
	};
}
