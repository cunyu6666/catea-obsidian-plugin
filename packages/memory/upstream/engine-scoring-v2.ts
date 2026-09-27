/**
 * [WHO]: Provides currentStructuralAnchor, computeStructuralBoost, scoreEpisodeMemory, scoreEpisodeFacet, scoreV2SemanticMemory, scoreProceduralMemory
 * [FROM]: Depends on ./scoring.js for daysSince, extractTags, tagOverlap; ./types-v2.js for V2 memory types; ./turn-context.js for the generic per-turn hint bus
 * [TO]: Consumed by engine.ts, engine-recall-select.ts, engine-episode-sync.ts, engine-v2-mapping.ts
 * [HERE]: packages/mem-core/src/engine-scoring-v2.ts - V2 memory scoring and structural proximity computation; reads structural anchors from any extension that publishes to the turn-context bus
 */

import { daysSince, extractTags, tagOverlap } from "./scoring.js";
import { getTurnContext } from "./turn-context.js";
import type { BaseMemoryV2, EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";

type MemoryWithModifiedFiles = BaseMemoryV2 & { filesModified?: unknown };

/** Read the current structural anchor (or undefined when no producer has published one). */
export function currentStructuralAnchor(): { modulePath?: string; filePath?: string } | undefined {
	const anchor = getTurnContext("structuralAnchor");
	if (!anchor || (!anchor.modulePath && !anchor.filePath)) return undefined;
	return {
		modulePath: anchor.modulePath,
		filePath: anchor.filePath,
	};
}

/** Match two paths that may differ in absolute/relative form. */
function pathsOverlap(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.startsWith(b + "/") || b.startsWith(a + "/")) return true;
	// Suffix alignment: absolute vs relative (e.g. "/root/proj/core/x.ts" vs "core/x.ts")
	if (a.endsWith("/" + b) || b.endsWith("/" + a)) return true;
	return false;
}

/**
 * Compute structural proximity boost from the active turn's structural anchor.
 * Reads from the generic turn-context bus; returns 0 when no anchor has been
 * published or when no overlap with the entry's paths is found. Producer-agnostic.
 */
export function computeStructuralBoost(entry: BaseMemoryV2): number {
	const anchor = getTurnContext("structuralAnchor");
	const anchorPaths = anchor?.candidatePaths;
	if (!anchorPaths || anchorPaths.length === 0) return 0;

	const entryPaths: string[] = [];
	if (entry.structuralAnchor) {
		if (entry.structuralAnchor.modulePath) entryPaths.push(entry.structuralAnchor.modulePath);
		if (entry.structuralAnchor.filePath) entryPaths.push(entry.structuralAnchor.filePath);
	}
	if (entry.evidence) {
		for (const ev of entry.evidence) {
			if (ev.filePath) entryPaths.push(ev.filePath);
		}
	}
	const modifiedFiles = (entry as MemoryWithModifiedFiles).filesModified;
	if (Array.isArray(modifiedFiles)) {
		for (const f of modifiedFiles) {
			if (typeof f === "string") entryPaths.push(f);
		}
	}

	// Fallback: infer module paths from tags when no explicit paths exist.
	// Tags often contain path segments like "core/platform/config" or filenames.
	// Use a weak match (0.5× weight via reduced return) to avoid conflating
	// with the relevance signal which already scores tag overlap.
	if (entryPaths.length === 0) {
		const PATH_LIKE = /^[a-z][\w-]*(?:\/[\w.-]+)+$/;
		const tagPaths = entry.tags.filter((t) => PATH_LIKE.test(t));
		if (tagPaths.length === 0) return 0;
		let tagHits = 0;
		for (const t of tagPaths) {
			for (const a of anchorPaths) {
				if (pathsOverlap(t, a)) { tagHits++; break; }
			}
		}
		// Attenuate: tag-inferred paths are weaker evidence than explicit anchors
		return Math.min(tagHits / tagPaths.length, 1) * 0.5;
	}

	let hits = 0;
	for (const p of entryPaths) {
		for (const a of anchorPaths) {
			if (pathsOverlap(p, a)) { hits++; break; }
		}
	}
	return Math.min(hits / entryPaths.length, 1);
}

/** Score breakdown for eval collection. All fields are the raw component values before final combination. */
export interface V2ScoreBreakdown {
	recency: number;
	importance: number;
	relevance: number;
	structural: number;
	final: number;
}

export function breakdownEpisodeMemory(entry: EpisodeMemory, project: string, contextTags: string[], structuralWeight: number): V2ScoreBreakdown {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.title ?? ""} ${entry.summary} ${entry.userGoal ?? ""} ${entry.outcome ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	const structural = computeStructuralBoost(entry);
	const relevance = projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore));
	const final = relevance + recency * 0.18 + salienceBoost * 0.22 + structural * structuralWeight;
	return { recency, importance: salienceBoost, relevance, structural, final };
}

export function breakdownEpisodeFacet(entry: EpisodeFacet, project: string, contextTags: string[], structuralWeight: number): V2ScoreBreakdown {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.searchText} ${entry.anchorText ?? ""} ${entry.summary ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	const structural = computeStructuralBoost(entry);
	const relevance = projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore));
	const final = relevance + recency * 0.15 + salienceBoost * 0.24 + structural * structuralWeight;
	return { recency, importance: salienceBoost, relevance, structural, final };
}

export function breakdownV2Semantic(entry: SemanticMemory, project: string, contextTags: string[], structuralWeight: number): V2ScoreBreakdown {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.name} ${entry.summary} ${entry.detail ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	const structural = computeStructuralBoost(entry);
	const relevance = projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore));
	const final = relevance + recency * 0.14 + salienceBoost * 0.2 + structural * structuralWeight;
	return { recency, importance: salienceBoost, relevance, structural, final };
}

export function breakdownProcedural(entry: ProceduralMemory, project: string, contextTags: string[], structuralWeight: number): V2ScoreBreakdown {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.searchText} ${entry.summary} ${entry.contextText ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const statusBoost = entry.status === "active" ? 0.2 : entry.status === "draft" ? 0.05 : -0.2;
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	const structural = computeStructuralBoost(entry);
	const relevance = projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore));
	const final = relevance + recency * 0.15 + salienceBoost * 0.2 + statusBoost + structural * structuralWeight;
	return { recency, importance: salienceBoost, relevance, structural, final };
}

export function scoreEpisodeMemory(entry: EpisodeMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.title ?? ""} ${entry.summary} ${entry.userGoal ?? ""} ${entry.outcome ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.18 + salienceBoost * 0.22 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreEpisodeFacet(entry: EpisodeFacet, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.searchText} ${entry.anchorText ?? ""} ${entry.summary ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.15 + salienceBoost * 0.24 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreV2SemanticMemory(entry: SemanticMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.name} ${entry.summary} ${entry.detail ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.14 + salienceBoost * 0.2 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreProceduralMemory(entry: ProceduralMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.searchText} ${entry.summary} ${entry.contextText ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const statusBoost = entry.status === "active" ? 0.2 : entry.status === "draft" ? 0.05 : -0.2;
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.15 + salienceBoost * 0.2 + statusBoost + computeStructuralBoost(entry) * structuralWeight;
}
