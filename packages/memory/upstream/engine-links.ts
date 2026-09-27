/**
 * [WHO]: Provides AUTO_V2_LINK_PREFIX, buildProceduralChains, materializeV2Links, detectProceduralConflicts, detectSemanticConflicts, detectAlignmentConflicts, suggestConflictAction, explainConflictAction
 * [FROM]: Depends on ./scoring.js for daysSince, extractTags, tagOverlap; ./types.js, ./types-v2.js
 * [TO]: Consumed by engine.ts (rebuildV2Links, inspectV2Memory, getAlignmentSnapshot)
 * [HERE]: packages/mem-core/src/engine-links.ts - V2 link materialization, conflict detection, procedural chain building
 */

import { daysSince, extractTags, tagOverlap } from "./scoring.js";
import type { MemoryEntry } from "./types.js";
import type { MemoryLink, ProceduralMemory, SemanticMemory } from "./types-v2.js";

export const AUTO_V2_LINK_PREFIX = "auto:v2:";

// ── Procedural chains ──────────────────────────────────────

export function buildProceduralChains(entries: ProceduralMemory[]): Array<{
	rootId: string;
	name: string;
	status: ProceduralMemory["status"];
	versionDepth: number;
	ids: string[];
}> {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const roots = entries.filter((entry) => !entry.supersededById || !byId.has(entry.supersededById));
	return roots
			.map((root) => {
			const ids = new Set<string>();
			const stack = [root.id];
			while (stack.length) {
				const currentId = stack.pop();
				if (!currentId || ids.has(currentId)) continue;
				ids.add(currentId);
				for (const entry of entries) {
					if (entry.supersededById === currentId) stack.push(entry.id);
					if (entry.supersedesIds?.includes(currentId)) stack.push(entry.id);
				}
			}
			const chainEntries = [...ids].map((id) => byId.get(id)).filter((entry): entry is ProceduralMemory => Boolean(entry));
			return {
				rootId: root.id,
				name: root.name,
				status: root.status,
				versionDepth: chainEntries.length,
				ids: chainEntries
					.sort((a, b) => {
						const aVersion = a.version ?? 0;
						const bVersion = b.version ?? 0;
						if (aVersion !== bVersion) return bVersion - aVersion;
						return a.updatedAt.localeCompare(b.updatedAt);
					})
					.map((entry) => entry.id),
				};
			})
			.filter((chain) => chain.versionDepth > 1)
		.sort((a, b) => b.versionDepth - a.versionDepth || a.name.localeCompare(b.name));
}

// ── V2 link materialization ────────────────────────────────

export function materializeV2Links(
	semantic: SemanticMemory[],
	procedural: ProceduralMemory[],
	existingLinks: MemoryLink[],
	autoLinkPrefix: string,
	now = new Date().toISOString(),
): MemoryLink[] {
	const manualLinks = existingLinks.filter((link) => !link.id.startsWith(autoLinkPrefix));
	const autoLinks = new Map<string, MemoryLink>();
	const proceduralConflicts = detectProceduralConflicts(
		procedural.filter((entry) => entry.status !== "deprecated" && entry.status !== "superseded"),
	);
	const semanticConflicts = detectSemanticConflicts(semantic);

	const addAutoLink = (
		fromId: string,
		toId: string,
		type: MemoryLink["type"],
		weight: number,
		evidence: MemoryLink["evidence"] = [],
	): void => {
		if (!fromId || !toId || fromId === toId) return;
		const directional = type === "supersedes";
		const [normalizedFrom, normalizedTo] = directional || fromId < toId ? [fromId, toId] : [toId, fromId];
		const id = `${autoLinkPrefix}${type}:${normalizedFrom}->${normalizedTo}`;
		autoLinks.set(id, {
			id,
			fromId: normalizedFrom,
			toId: normalizedTo,
			type,
			weight,
			explicit: false,
			createdAt: autoLinks.get(id)?.createdAt ?? now,
			updatedAt: now,
			evidence,
		});
	};

	for (const entry of semantic) {
		for (const supersededId of entry.supersedesIds ?? []) {
			addAutoLink(entry.id, supersededId, "supersedes", 0.92);
		}
		if (entry.supersededById) {
			addAutoLink(entry.supersededById, entry.id, "supersedes", 0.92);
		}
	}

	for (const entry of procedural) {
		for (const supersededId of entry.supersedesIds ?? []) {
			addAutoLink(entry.id, supersededId, "supersedes", 0.94);
		}
		if (entry.supersededById) {
			addAutoLink(entry.supersededById, entry.id, "supersedes", 0.94);
		}
	}

	for (const conflict of semanticConflicts) {
		addAutoLink(conflict.aId, conflict.bId, "conflicts-with", 0.88);
	}

	for (const conflict of proceduralConflicts) {
		addAutoLink(conflict.aId, conflict.bId, "conflicts-with", Math.max(0.72, conflict.score));
	}

	return [...manualLinks, ...autoLinks.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ── Conflict detection ─────────────────────────────────────

export function detectProceduralConflicts(entries: ProceduralMemory[]): Array<{
	aId: string;
	bId: string;
	aName: string;
	bName: string;
	score: number;
	reason: string;
}> {
	const conflicts: Array<{
		aId: string;
		bId: string;
		aName: string;
		bName: string;
		score: number;
		reason: string;
	}> = [];
	for (let i = 0; i < entries.length; i++) {
		for (let j = i + 1; j < entries.length; j++) {
			const a = entries[i];
			const b = entries[j];
			if (!a || !b || a.id === b.id) continue;
			const tagScore = tagOverlap(a.tags ?? [], b.tags ?? []);
			const lexicalScore = tagOverlap(
				extractTags(`${a.name} ${a.searchText} ${a.summary}`),
				extractTags(`${b.name} ${b.searchText} ${b.summary}`),
			);
			const similarity = Math.max(tagScore, lexicalScore);
			const sameIntent =
				a.searchText.trim().toLowerCase() === b.searchText.trim().toLowerCase() ||
				a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
			const boundariesDiffer =
				(a.boundaries ?? "").trim().toLowerCase() !== (b.boundaries ?? "").trim().toLowerCase() ||
				(a.contextText ?? "").trim().toLowerCase() !== (b.contextText ?? "").trim().toLowerCase();
			if ((similarity >= 0.72 || sameIntent) && boundariesDiffer) {
				conflicts.push({
					aId: a.id,
					bId: b.id,
					aName: a.name,
					bName: b.name,
					score: Number(similarity.toFixed(3)),
					reason: "High-overlap active procedures differ in boundaries or context.",
				});
			}
		}
	}
	return conflicts.sort((a, b) => b.score - a.score || a.aName.localeCompare(b.aName));
}

export function detectSemanticConflicts(entries: SemanticMemory[]): Array<{
	aId: string;
	bId: string;
	aName: string;
	bName: string;
	reason: string;
}> {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const seen = new Set<string>();
	const conflicts: Array<{
		aId: string;
		bId: string;
		aName: string;
		bName: string;
		reason: string;
	}> = [];
	for (const entry of entries) {
		for (const conflictId of entry.conflictWithIds ?? []) {
			const other = byId.get(conflictId);
			if (!other) continue;
			const pairKey = [entry.id, other.id].sort().join("::");
			if (seen.has(pairKey)) continue;
			seen.add(pairKey);
			conflicts.push({
				aId: entry.id,
				bId: other.id,
				aName: entry.name,
				bName: other.name,
				reason: "Explicit semantic conflict link.",
			});
		}
	}
	return conflicts.sort((a, b) => a.aName.localeCompare(b.aName) || a.bName.localeCompare(b.bName));
}

// ── Alignment conflict detection ───────────────────────────

export function detectAlignmentConflicts(
	entries: MemoryEntry[],
): Array<{
	aId: string;
	bId: string;
	reason: string;
	severity: number;
	recommendation: "merge" | "demote" | "forget" | "mark-situational";
	rationale: string;
}> {
	const candidates = entries.filter(
		(entry) =>
			entry.stability !== "situational" &&
			(entry.retention === "core" || entry.retention === "key-event") &&
			!!(entry.summary || entry.detail || entry.name),
	);
	const conflicts: Array<{
		aId: string;
		bId: string;
		reason: string;
		severity: number;
		recommendation: "merge" | "demote" | "forget" | "mark-situational";
		rationale: string;
	}> = [];
	const seen = new Set<string>();
	const positiveMarkers = ["prefer", "always", "use", "enable", "include", "like", "keep", "should"];
	const negativeMarkers = ["avoid", "never", "disable", "remove", "dislike", "hate", "stop", "do not", "don't"];
	const getText = (entry: MemoryEntry) =>
		`${entry.name || ""} ${entry.summary || ""} ${entry.detail || ""}`.toLowerCase();
	const polarity = (text: string): "positive" | "negative" | "neutral" => {
		const hasPositive = positiveMarkers.some((marker) => text.includes(marker));
		const hasNegative = negativeMarkers.some((marker) => text.includes(marker));
		if (hasPositive && !hasNegative) return "positive";
		if (hasNegative && !hasPositive) return "negative";
		return "neutral";
	};

	for (let i = 0; i < candidates.length; i++) {
		for (let j = i + 1; j < candidates.length; j++) {
			const a = candidates[i]!;
			const b = candidates[j]!;
			if (a.id === b.id) continue;
			const overlap = tagOverlap(a.tags, b.tags);
			if (overlap < 0.45) continue;
			const aPolarity = polarity(getText(a));
			const bPolarity = polarity(getText(b));
			if (aPolarity === "neutral" || bPolarity === "neutral" || aPolarity === bPolarity) continue;
			const pairKey = [a.id, b.id].sort().join(":");
			if (seen.has(pairKey)) continue;
			seen.add(pairKey);
			const severity = Math.min(
				1,
				overlap * 0.6 + ((a.salience ?? a.importance) + (b.salience ?? b.importance)) / 20 * 0.4,
			);
			const reason = `Potential conflict on shared context: ${aPolarity} vs ${bPolarity}`;
			const recommendation = suggestConflictAction(a, b, severity);
			const rationale = explainConflictAction(a, b, recommendation);
			conflicts.push({ aId: a.id, bId: b.id, reason, severity, recommendation, rationale });
		}
	}

	return conflicts.sort((a, b) => b.severity - a.severity);
}

export function suggestConflictAction(
	a: MemoryEntry,
	b: MemoryEntry,
	severity: number,
): "merge" | "demote" | "forget" | "mark-situational" {
	const aStable = a.stability !== "situational";
	const bStable = b.stability !== "situational";
	const aRecent = daysSince(a.created) <= 14;
	const bRecent = daysSince(b.created) <= 14;
	const aLowSignal = (a.salience ?? a.importance) <= 4;
	const bLowSignal = (b.salience ?? b.importance) <= 4;

	if (aStable !== bStable) return "mark-situational";
	if (severity >= 0.8 && (aLowSignal || bLowSignal)) return "forget";
	if (severity >= 0.65 && (aRecent || bRecent)) return "demote";
	return "merge";
}

export function explainConflictAction(
	a: MemoryEntry,
	b: MemoryEntry,
	action: "merge" | "demote" | "forget" | "mark-situational",
): string {
	switch (action) {
		case "mark-situational":
			return "One side looks more temporary than the other, so this conflict likely comes from short-term context rather than true identity drift.";
		case "forget":
			return "One side has weak signal compared with the conflict risk, so forgetting the weaker memory is safer than keeping both.";
		case "demote":
			return "At least one side is recent enough that it may be an overfit; demoting it reduces the chance of personality drift.";
		default:
			return "Both memories may describe the same preference from different angles, so a merged memory is likely safer than keeping them separate.";
	}
}
