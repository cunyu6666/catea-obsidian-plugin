/**
 * [WHO]: GraphNeighbor, linkNewEntry, getRelatedSummaries, getGraphNeighborhood, getGraphContextSummaries, reinforceRelations
 * [FROM]: Depends on ./scoring.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/linking.ts - A-MEM style Zettelkasten linking, atomic storage + dynamic associations
 */


import { tagOverlap } from "./scoring.js";
import type { MemoryEntry, MemoryRelation } from "./types.js";

const LINK_THRESHOLD = 0.5;
const MAX_LINKS = 5;
const GRAPH_TAG_THRESHOLD = 0.35;
const GRAPH_MAX_HOPS = 2;

export interface GraphNeighbor {
	entry: MemoryEntry;
	score: number;
	relation: MemoryRelation["kind"];
	explicit: boolean;
}

function upsertRelation(
	source: MemoryEntry,
	targetId: string,
	kind: MemoryRelation["kind"],
	weight: number,
): void {
	if (!source.relations) source.relations = [];
	const existing = source.relations.find((relation) => relation.id === targetId && relation.kind === kind);
	if (existing) {
		existing.weight = Math.min(1.5, Math.max(existing.weight, weight));
		return;
	}
	source.relations.push({ id: targetId, kind, weight });
}

/** Find related entries by tag overlap and establish bidirectional links */
export function linkNewEntry(newEntry: MemoryEntry, allEntries: MemoryEntry[]): void {
	if (!newEntry.relatedIds) newEntry.relatedIds = [];
	if (!newEntry.relations) newEntry.relations = [];

	const candidates = allEntries
		.filter((e) => e.id !== newEntry.id)
		.map((e) => ({ entry: e, overlap: tagOverlap(newEntry.tags, e.tags) }))
		.filter((c) => c.overlap >= LINK_THRESHOLD)
		.sort((a, b) => b.overlap - a.overlap)
		.slice(0, MAX_LINKS);

	for (const { entry } of candidates) {
		if (!newEntry.relatedIds.includes(entry.id)) {
			newEntry.relatedIds.push(entry.id);
		}
		const relationKind = inferRelationKind(newEntry, entry, true);
		upsertRelation(newEntry, entry.id, relationKind, 0.7);
		if (!entry.relatedIds) entry.relatedIds = [];
		if (!entry.relations) entry.relations = [];
		if (!entry.relatedIds.includes(newEntry.id)) {
			entry.relatedIds.push(newEntry.id);
		}
		const reverseRelationKind = inferRelationKind(entry, newEntry, true);
		upsertRelation(entry, newEntry.id, reverseRelationKind, 0.7);
	}
}

/** Get content summaries for related entries (for injection enrichment) */
export function getRelatedSummaries(entry: MemoryEntry, allEntries: MemoryEntry[], maxCount = 3): string[] {
	if (!entry.relatedIds?.length) return [];
	const idSet = new Set(entry.relatedIds);
	return allEntries
		.filter((e) => idSet.has(e.id))
		.slice(0, maxCount)
		.map((e) => e.summary || e.content?.slice(0, 80) || e.name || "");
}

function buildGraphScore(seed: MemoryEntry, candidate: MemoryEntry, hop: number, explicit: boolean): number {
	const overlap = tagOverlap(seed.tags, candidate.tags);
	const salience = (candidate.salience ?? candidate.importance ?? 0) / 10;
	const retentionBoost =
		candidate.retention === "core" ? 0.35 : candidate.retention === "key-event" ? 0.45 : 0.1;
	const sameProjectBoost = seed.project === candidate.project ? 0.15 : 0;
	const eventBoost = candidate.type === "event" ? 0.25 : 0;
	const explicitBoost = explicit ? 0.35 : 0;
	return overlap + salience + retentionBoost + sameProjectBoost + eventBoost + explicitBoost - hop * 0.18;
}

function inferRelationKind(
	seed: MemoryEntry,
	candidate: MemoryEntry,
	explicit: boolean,
): MemoryRelation["kind"] {
	if (seed.type === "event" && (candidate.type === "lesson" || candidate.type === "decision")) return "cause-of";
	if ((seed.type === "lesson" || seed.type === "decision") && candidate.type === "event") return "caused-by";
	if (seed.type === "preference" && (candidate.type === "pattern" || candidate.type === "decision")) {
		return "preference-shapes";
	}
	if (seed.project === candidate.project && explicit) return "same-project";
	if (seed.type === candidate.type || seed.retention === candidate.retention) return "repeated-pattern";
	return "tag-overlap";
}

function getImplicitNeighbors(entry: MemoryEntry, allEntries: MemoryEntry[]): MemoryEntry[] {
	return allEntries.filter(
		(candidate) =>
			candidate.id !== entry.id &&
			candidate.project === entry.project &&
			tagOverlap(entry.tags, candidate.tags) >= GRAPH_TAG_THRESHOLD,
	);
}

export function getGraphNeighborhood(entry: MemoryEntry, allEntries: MemoryEntry[], maxCount = 4): GraphNeighbor[] {
	const byId = new Map(allEntries.map((candidate) => [candidate.id, candidate]));
	const visited = new Set<string>([entry.id]);
	const scored = new Map<string, GraphNeighbor>();
	let frontier: Array<{ entry: MemoryEntry; hop: number }> = [{ entry, hop: 0 }];

	for (let hop = 1; hop <= GRAPH_MAX_HOPS; hop++) {
		const nextFrontier: Array<{ entry: MemoryEntry; hop: number }> = [];
		for (const current of frontier) {
			const explicit =
				current.entry.relatedIds
					?.map((id) => byId.get(id))
					.filter((candidate): candidate is MemoryEntry => candidate !== undefined) ?? [];
			const implicit = getImplicitNeighbors(current.entry, allEntries);
			for (const candidate of explicit) {
				if (visited.has(candidate.id)) continue;
				visited.add(candidate.id);
				const score = buildGraphScore(entry, candidate, hop, true);
				scored.set(candidate.id, {
					entry: candidate,
					score,
					relation: inferRelationKind(entry, candidate, true),
					explicit: true,
				});
				nextFrontier.push({ entry: candidate, hop });
			}
			for (const candidate of implicit) {
				if (visited.has(candidate.id)) continue;
				visited.add(candidate.id);
				const score = buildGraphScore(entry, candidate, hop, false);
				scored.set(candidate.id, {
					entry: candidate,
					score,
					relation: inferRelationKind(entry, candidate, false),
					explicit: false,
				});
				nextFrontier.push({ entry: candidate, hop });
			}
		}
		frontier = nextFrontier;
		if (!frontier.length) break;
	}

	return [...scored.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, maxCount);
}

export function getGraphContextSummaries(entry: MemoryEntry, allEntries: MemoryEntry[], maxCount = 4): string[] {
	return getGraphNeighborhood(entry, allEntries, maxCount).map(
		(candidate) =>
			`[${candidate.relation}] [${candidate.entry.type}] ${
				candidate.entry.summary || candidate.entry.name || candidate.entry.content?.slice(0, 80) || ""
			}`,
	);
}

export function getGraphNeighborhoodBySeeds(
	seeds: MemoryEntry[],
	allEntries: MemoryEntry[],
	maxCount = 8,
): GraphNeighbor[] {
	const scored = new Map<string, GraphNeighbor>();
	const seedIds = new Set(seeds.map((seed) => seed.id));

	for (const seed of seeds) {
		for (const candidate of getGraphNeighborhood(seed, allEntries, maxCount * 2)) {
			if (seedIds.has(candidate.entry.id)) continue;
			const overlap = tagOverlap(seed.tags, candidate.entry.tags);
			const existing = scored.get(candidate.entry.id);
			const score =
				overlap +
				(candidate.entry.salience ?? candidate.entry.importance ?? 0) / 10 +
				(candidate.entry.retention === "core" ? 0.25 : candidate.entry.retention === "key-event" ? 0.3 : 0);
			if (!existing || score > existing.score) {
				scored.set(candidate.entry.id, { ...candidate, score });
			}
		}
	}

	return [...scored.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, maxCount);
}

export function reinforceRelations(recalled: MemoryEntry[], allEntries: MemoryEntry[]): void {
	const recalledIds = new Set(recalled.map((entry) => entry.id));
	const byId = new Map(allEntries.map((entry) => [entry.id, entry]));

	for (const entry of recalled) {
		const neighbors = getGraphNeighborhood(entry, allEntries, 6);
		for (const neighbor of neighbors) {
			const sourceKind = neighbor.relation;
			upsertRelation(entry, neighbor.entry.id, sourceKind, Math.min(1.5, 0.75 + neighbor.score * 0.12));
			const reverse = byId.get(neighbor.entry.id);
			if (!reverse) continue;
			const reverseKind = inferRelationKind(reverse, entry, neighbor.explicit);
			upsertRelation(reverse, entry.id, reverseKind, Math.min(1.5, 0.72 + neighbor.score * 0.1));
			if (!entry.relatedIds?.includes(neighbor.entry.id)) {
				entry.relatedIds = [...(entry.relatedIds ?? []), neighbor.entry.id];
			}
			if (!reverse.relatedIds?.includes(entry.id)) {
				reverse.relatedIds = [...(reverse.relatedIds ?? []), entry.id];
			}
		}
	}

	for (const entry of allEntries) {
		if (!entry.relations?.length) continue;
		entry.relations = entry.relations
			.map((relation) => ({
				...relation,
				weight: recalledIds.has(entry.id) || recalledIds.has(relation.id) ? relation.weight : relation.weight * 0.995,
			}))
			.filter((relation) => relation.weight >= 0.2);
	}
}
