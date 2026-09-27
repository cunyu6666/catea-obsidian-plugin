/**
 * [WHO]: Provides mergeArchivedEntries/Work/V2, partitionArchivedEntries/Work/Semantic/Procedural, get*ArchiveReason helpers
 * [FROM]: Depends on ./scoring.js for daysSince; ./types.js, ./types-v2.js for memory types
 * [TO]: Consumed by engine.ts (archiveStaleMemories, restoreArchivedEntry)
 * [HERE]: packages/mem-core/src/engine-archive.ts - archive partitioning, merging, and staleness detection
 */

import type { MemoryEntry, WorkEntry } from "./types.js";
import type { ProceduralMemory, SemanticMemory } from "./types-v2.js";

export interface ForgettingConfig {
	ambientTtlDays: number;
	workTtlDays: number;
	reviveCooldownDays: number;
}

function daysBetween(iso: string, now: string): number {
	return Math.max(0, (new Date(now).getTime() - new Date(iso).getTime()) / 86_400_000);
}

// ── Merge helpers ──────────────────────────────────────────

export function mergeArchivedEntries(existing: MemoryEntry[], incoming: MemoryEntry[]): MemoryEntry[] {
	const merged = new Map(existing.map((entry) => [entry.id, entry]));
	for (const entry of incoming) merged.set(entry.id, entry);
	return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.created).localeCompare(a.archivedAt ?? a.created));
}

export function mergeArchivedWork(existing: WorkEntry[], incoming: WorkEntry[]): WorkEntry[] {
	const merged = new Map(existing.map((entry) => [entry.id, entry]));
	for (const entry of incoming) merged.set(entry.id, entry);
	return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.created).localeCompare(a.archivedAt ?? a.created));
}

export function mergeArchivedV2<T extends { id: string; createdAt: string; archivedAt?: string }>(existing: T[], incoming: T[]): T[] {
	const merged = new Map(existing.map((entry) => [entry.id, entry]));
	for (const entry of incoming) merged.set(entry.id, entry);
	return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.createdAt).localeCompare(a.archivedAt ?? a.createdAt));
}

// ── Archive reason detection ───────────────────────────────

function getLegacyArchiveReason(entry: MemoryEntry, now: string, forgetting: ForgettingConfig): string | undefined {
	if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
	if (entry.revivedAt && daysBetween(entry.revivedAt, now) <= forgetting.reviveCooldownDays) return undefined;
	const anchor = entry.lastAccessed ?? entry.eventTime ?? entry.created;
	const ageDays = daysBetween(anchor, now);
	const lowSignal = (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && (entry.salience ?? entry.importance) <= 6;
	if (entry.retention === "ambient" && lowSignal && ageDays > forgetting.ambientTtlDays) {
		return "stale-ambient-memory";
	}
	return undefined;
}

function getWorkArchiveReason(entry: WorkEntry, now: string, forgetting: ForgettingConfig): string | undefined {
	if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
	if (entry.revivedAt && daysBetween(entry.revivedAt, now) <= forgetting.reviveCooldownDays) return undefined;
	const anchor = entry.lastAccessed ?? entry.eventTime ?? entry.created;
	const ageDays = daysBetween(anchor, now);
	if ((entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && ageDays > forgetting.workTtlDays) {
		return "stale-work-memory";
	}
	return undefined;
}

function getSemanticArchiveReason(entry: SemanticMemory, now: string, forgetting: ForgettingConfig): string | undefined {
	if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
	if (entry.revivedAt && daysBetween(entry.revivedAt, now) <= forgetting.reviveCooldownDays) return undefined;
	const anchor = entry.lastAccessedAt ?? entry.updatedAt ?? entry.createdAt;
	const ageDays = daysBetween(anchor, now);
	if (entry.supersededById && ageDays > forgetting.ambientTtlDays) {
		return "superseded-semantic-memory";
	}
	const lowSignal = (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && entry.confidence < 0.85;
	if (entry.retention === "ambient" && lowSignal && ageDays > forgetting.ambientTtlDays * 2) {
		return "stale-semantic-memory";
	}
	return undefined;
}

function getProceduralArchiveReason(entry: ProceduralMemory, now: string, forgetting: ForgettingConfig): string | undefined {
	if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
	if (entry.revivedAt && daysBetween(entry.revivedAt, now) <= forgetting.reviveCooldownDays) return undefined;
	const anchor = entry.lastAccessedAt ?? entry.updatedAt ?? entry.createdAt;
	const ageDays = daysBetween(anchor, now);
	if ((entry.status === "superseded" || entry.status === "deprecated") && ageDays > forgetting.ambientTtlDays) {
		return "stale-procedure-version";
	}
	if (entry.status === "draft" && (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && ageDays > forgetting.ambientTtlDays * 2) {
		return "abandoned-draft-procedure";
	}
	return undefined;
}

// ── Partition helpers ──────────────────────────────────────

export function partitionArchivedEntries(entries: MemoryEntry[], now: string, forgetting: ForgettingConfig): { active: MemoryEntry[]; archived: MemoryEntry[] } {
	const active: MemoryEntry[] = [];
	const archived: MemoryEntry[] = [];
	for (const entry of entries) {
		const reason = getLegacyArchiveReason(entry, now, forgetting);
		if (!reason) {
			active.push(entry);
			continue;
		}
		archived.push({
			...entry,
			archivedAt: entry.archivedAt ?? now,
			archiveReason: entry.archiveReason ?? reason,
		});
	}
	return { active, archived };
}

export function partitionArchivedWork(entries: WorkEntry[], now: string, forgetting: ForgettingConfig): { active: WorkEntry[]; archived: WorkEntry[] } {
	const active: WorkEntry[] = [];
	const archived: WorkEntry[] = [];
	for (const entry of entries) {
		const reason = getWorkArchiveReason(entry, now, forgetting);
		if (!reason) {
			active.push(entry);
			continue;
		}
		archived.push({
			...entry,
			archivedAt: entry.archivedAt ?? now,
			archiveReason: entry.archiveReason ?? reason,
		});
	}
	return { active, archived };
}

export function partitionArchivedSemantic(entries: SemanticMemory[], now: string, forgetting: ForgettingConfig): { active: SemanticMemory[]; archived: SemanticMemory[] } {
	const active: SemanticMemory[] = [];
	const archived: SemanticMemory[] = [];
	for (const entry of entries) {
		const reason = getSemanticArchiveReason(entry, now, forgetting);
		if (!reason) {
			active.push(entry);
			continue;
		}
		archived.push({
			...entry,
			archivedAt: entry.archivedAt ?? now,
			archiveReason: entry.archiveReason ?? reason,
		});
	}
	return { active, archived };
}

export function partitionArchivedProcedural(entries: ProceduralMemory[], now: string, forgetting: ForgettingConfig): { active: ProceduralMemory[]; archived: ProceduralMemory[] } {
	const active: ProceduralMemory[] = [];
	const archived: ProceduralMemory[] = [];
	for (const entry of entries) {
		const reason = getProceduralArchiveReason(entry, now, forgetting);
		if (!reason) {
			active.push(entry);
			continue;
		}
		archived.push({
			...entry,
			archivedAt: entry.archivedAt ?? now,
			archiveReason: entry.archiveReason ?? reason,
		});
	}
	return { active, archived };
}
