/**
 * [WHO]: Provides reinforceProcedural, reinforceEpisodeMemories, reinforceEpisodeFacets, reinforceV2SemanticMemories, reinforceWork, reconsolidateV2AfterRecall, reconsolidateIfNeeded
 * [FROM]: Depends on ./store.js, ./store-v2.js, ./eviction.js, ./linking.js, ./scoring.js, ./reconsolidate-v2.js, ./i18n.js, ./types.js, ./types-v2.js
 * [TO]: Consumed by engine.ts (getMemoryInjection)
 * [HERE]: packages/mem-core/src/engine-reinforce.ts - memory reinforcement and reconsolidation after recall
 */

import { PROMPTS } from "./i18n.js";
import { reinforceRelations } from "./linking.js";
import { reconsolidateV2Memories } from "./reconsolidate-v2.js";
import { extractTags, tagOverlap } from "./scoring.js";
import { saveEntries, saveWork } from "./store.js";
import {
	loadV2Meta,
	saveV2Episodes,
	saveV2Facets,
	saveV2Meta,
	saveV2Procedural,
	saveV2Semantic,
	type NanoMemV2Paths,
} from "./store-v2.js";
import type { LlmFn, MemoryEntry, WorkEntry } from "./types.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";
import { utilityEntry, utilityWork } from "./eviction.js";
import type { NanomemConfig } from "./config.js";

export async function reinforceProcedural(recalled: ProceduralMemory[], all: ProceduralMemory[], v2Paths: NanoMemV2Paths): Promise<void> {
	if (!recalled.length) return;
	const ids = new Set(recalled.map((entry) => entry.id));
	const now = new Date().toISOString();
	for (const entry of all) {
		if (!ids.has(entry.id)) continue;
		entry.accessCount = (entry.accessCount ?? 0) + 1;
		entry.lastAccessedAt = now;
		entry.updatedAt = entry.updatedAt || now;
	}
	await saveV2Procedural(v2Paths, all);
}

export async function reinforceEpisodeMemories(recalled: EpisodeMemory[], all: EpisodeMemory[], v2Paths: NanoMemV2Paths): Promise<void> {
	if (!recalled.length) return;
	const ids = new Set(recalled.map((entry) => entry.id));
	const now = new Date().toISOString();
	for (const entry of all) {
		if (!ids.has(entry.id)) continue;
		entry.accessCount = (entry.accessCount ?? 0) + 1;
		entry.lastAccessedAt = now;
		entry.updatedAt = entry.updatedAt || now;
	}
	await saveV2Episodes(v2Paths, all);
}

export async function reinforceEpisodeFacets(recalled: EpisodeFacet[], all: EpisodeFacet[], v2Paths: NanoMemV2Paths): Promise<void> {
	if (!recalled.length) return;
	const ids = new Set(recalled.map((entry) => entry.id));
	const now = new Date().toISOString();
	for (const entry of all) {
		if (!ids.has(entry.id)) continue;
		entry.accessCount = (entry.accessCount ?? 0) + 1;
		entry.lastAccessedAt = now;
		entry.updatedAt = entry.updatedAt || now;
	}
	await saveV2Facets(v2Paths, all);
}

export async function reinforceV2SemanticMemories(recalled: SemanticMemory[], all: SemanticMemory[], v2Paths: NanoMemV2Paths): Promise<void> {
	if (!recalled.length) return;
	const ids = new Set(recalled.map((entry) => entry.id));
	const now = new Date().toISOString();
	for (const entry of all) {
		if (!ids.has(entry.id)) continue;
		entry.accessCount = (entry.accessCount ?? 0) + 1;
		entry.lastAccessedAt = now;
		entry.updatedAt = entry.updatedAt || now;
	}
	await saveV2Semantic(v2Paths, all);
}

export async function reinforceWork(
	recalled: WorkEntry[], all: WorkEntry[],
	workPath: string, cfg: NanomemConfig,
): Promise<void> {
	const ids = new Set(recalled.map((w) => w.id));
	const now = new Date().toISOString();
	for (const w of all) {
		if (ids.has(w.id)) {
			w.accessCount = (w.accessCount ?? 0) + 1;
			w.lastAccessed = now;
			w.strength = (w.strength || 45) * cfg.strengthGrowthFactor;
		}
	}
	await saveWork(workPath, all, cfg.maxEntries.work, (w) =>
		utilityWork(w, cfg.halfLife, cfg.evictionWeights),
	);
}

export async function reconsolidateV2AfterRecall(
	episodes: EpisodeMemory[],
	facets: EpisodeFacet[],
	procedural: ProceduralMemory[],
	recalledEpisodes: EpisodeMemory[],
	recalledFacets: EpisodeFacet[],
	recalledProcedural: ProceduralMemory[],
	v2Paths: NanoMemV2Paths,
	rebuildLinksFn: () => Promise<void>,
): Promise<void> {
	const reconsolidated = reconsolidateV2Memories(
		episodes,
		facets,
		procedural,
		recalledEpisodes.map((entry) => entry.id),
		recalledFacets.map((entry) => entry.id),
		recalledProcedural.map((entry) => entry.id),
	);
	await Promise.all([
		saveV2Episodes(v2Paths, reconsolidated.episodes),
		saveV2Facets(v2Paths, reconsolidated.facets),
		saveV2Procedural(v2Paths, reconsolidated.procedural),
		saveV2Meta(v2Paths, {
			...(await loadV2Meta(v2Paths)),
			lastReconsolidationAt: new Date().toISOString(),
		}),
	]);
	await rebuildLinksFn();
}

export async function reconsolidateIfNeeded(
	recalled: MemoryEntry[],
	contextTags: string[],
	locale: string,
	llmFn: LlmFn,
): Promise<void> {
	const p = PROMPTS[locale];
	for (const entry of recalled) {
		const overlap = tagOverlap(entry.tags, contextTags);
		if (overlap >= 0.3) continue;
		try {
			const memText = entry.detail || entry.summary || entry.content || "";
			const updated = await llmFn(
				p.reconsolidationSystem,
				`Original memory: ${memText}\n\nCurrent context tags: ${contextTags.join(", ")}`,
			);
			if (updated && updated.length > 10) {
				const trimmed = updated.trim();
				entry.detail = trimmed;
				entry.content = trimmed;
				entry.summary = trimmed.length <= 150 ? trimmed : `${trimmed.slice(0, 147)}...`;
				entry.tags = extractTags(trimmed);
			}
		} catch {
			/* graceful degradation */
		}
	}
}
