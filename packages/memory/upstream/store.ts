/**
 * [WHO]: readJson, writeJson, deriveNameFromContent, deriveSummaryFromContent, ensureDir
 * [FROM]: Depends on node:fs, node:fs/promises, node:path, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/store.ts - persistence layer for JSON storage, all other modules go through here
 */


import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Episode, MemoryEntry, Meta, WorkEntry } from "./types.js";

async function ensureDir(dir: string): Promise<void> {
	if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		if (!existsSync(path)) return fallback;
		const raw = await readFile(path, "utf-8");
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export async function writeJson(path: string, data: unknown): Promise<void> {
	await ensureDir(dirname(path));
	await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Migration helpers ──────────────────────────────────────

/** Derive a short name (≤30 chars) from content text */
function deriveNameFromContent(content: string): string {
	if (!content) return "untitled";
	const words = content.split(/\s+/).filter((w) => w.length > 0);
	const name = words.slice(0, 5).join(" ");
	return name.length > 30 ? `${name.slice(0, 27)}...` : name || "untitled";
}

/** Derive a summary (≤150 chars) from content text, breaking at sentence boundary */
function deriveSummaryFromContent(content: string): string {
	if (!content) return "";
	if (content.length <= 150) return content;
	// Try to break at a sentence boundary
	const cut = content.slice(0, 160).search(/[。.!！?？]\s*/);
	if (cut > 50) return content.slice(0, cut + 1);
	return `${content.slice(0, 147)}...`;
}

/** Auto-migrate old-format entry (content only) to name/summary/detail */
function migrateEntry(entry: MemoryEntry): MemoryEntry {
	if (entry.name && entry.summary) return entry;
	const content = entry.content || entry.detail || "";
	return {
		...entry,
		name: entry.name || deriveNameFromContent(content),
		summary: entry.summary || deriveSummaryFromContent(content),
		detail: entry.detail || content,
	};
}

// ─── MemoryEntry CRUD ───────────────────────────────────────

export async function loadEntries(path: string): Promise<MemoryEntry[]> {
	const entries = await readJson<unknown>(path, []);
	if (!Array.isArray(entries)) return [];
	return entries.filter(isMemoryEntryLike).map(migrateEntry);
}

function isMemoryEntryLike(value: unknown): value is MemoryEntry {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as Partial<MemoryEntry>;
	return (
		typeof entry.id === "string" &&
		typeof entry.type === "string" &&
		Array.isArray(entry.tags) &&
		typeof entry.project === "string" &&
		typeof entry.importance === "number" &&
		typeof entry.created === "string" &&
		typeof entry.accessCount === "number"
	);
}

export async function saveEntries(
	path: string,
	entries: MemoryEntry[],
	max: number,
	utilityFn: (e: MemoryEntry) => number,
): Promise<void> {
	if (entries.length > max) {
		entries.sort((a, b) => utilityFn(b) - utilityFn(a));
		entries.length = max;
	}
	// Keep content as alias of detail for backward compat with older NanoMem versions
	const persisted = entries.map((e) => ({ ...e, content: e.detail || e.content || e.summary || "" }));
	await writeJson(path, persisted);
}

export async function loadEpisodes(episodesDir: string): Promise<Episode[]> {
	await ensureDir(episodesDir);
	const files = await readdir(episodesDir);
	const results: Episode[] = [];
	for (const f of files) {
		if (!f.endsWith(".json")) continue;
		const ep = await readJson<Episode | null>(join(episodesDir, f), null);
		if (ep) results.push(ep);
	}
	return results;
}

export async function saveEpisode(episodesDir: string, ep: Episode): Promise<void> {
	await ensureDir(episodesDir);
	await writeJson(join(episodesDir, `${ep.date}-${ep.sessionId.slice(0, 8)}.json`), ep);
}

export async function loadWork(path: string): Promise<WorkEntry[]> {
	return readJson<WorkEntry[]>(path, []);
}

export async function saveWork(
	path: string,
	entries: WorkEntry[],
	max: number,
	utilityFn: (w: WorkEntry) => number,
): Promise<void> {
	if (entries.length > max) {
		entries.sort((a, b) => utilityFn(b) - utilityFn(a));
		entries.length = max;
	}
	await writeJson(path, entries);
}

export async function loadMeta(path: string): Promise<Meta> {
	return readJson<Meta>(path, { totalSessions: 0, version: 1 });
}

export { deriveNameFromContent, deriveSummaryFromContent };
