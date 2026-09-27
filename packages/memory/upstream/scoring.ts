/**
 * [WHO]: daysSince, decay, extractTags, tagOverlap, scoreEntry, scoreWork, ScoreWeights
 * [FROM]: Depends on ./config.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/scoring.ts - core ranking algorithm (Recency + Importance + Relevance), Ebbinghaus spaced repetition
 */


import type { Episode, InjectionLevel, MemoryEntry, WorkEntry } from "./types.js";
import type { ProgressiveRecallConfig } from "./config.js";

export function daysSince(iso: string): number {
	return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Ebbinghaus decay: R = e^(-t * ln2 / S) where S = per-entry strength */
export function decay(ageDays: number, strength: number): number {
	return Math.exp((-ageDays * Math.LN2) / Math.max(1, strength));
}

export function extractTags(text: string): string[] {
	return [...new Set(text.toLowerCase().match(/[a-z0-9\u4e00-\u9fff_.-]{2,}/g) || [])].slice(0, 30);
}

export function tagOverlap(a: string[], b: string[]): number {
	if (!a.length || !b.length) return 0;
	const setB = new Set(b);
	return a.filter((t) => setB.has(t)).length / Math.max(a.length, b.length);
}

export interface ScoreWeights {
	recency: number;
	importance: number;
	relevance: number;
}

export function scoreEntry(
	e: MemoryEntry,
	project: string,
	ctx: string[],
	defaultHalfLife: Record<string, number>,
	weights: ScoreWeights,
): number {
	const strength = e.strength || defaultHalfLife[e.type] || 30;
	const recency = decay(daysSince(e.created), strength);
	const importanceNorm = Math.min(1, e.importance / 10);
	const salienceNorm = Math.min(1, (e.salience ?? e.importance) / 10);
	const projectMatch = e.project === project ? 1 : 0.5;
	const relevance = projectMatch * (0.3 + 0.7 * tagOverlap(e.tags, ctx));
	const retentionBoost =
		e.retention === "core" ? 0.2 : e.retention === "key-event" ? 0.25 : 0;
	const stabilityBoost = e.stability === "stable" ? 0.08 : -0.12;
	const situationalPenalty =
		e.stability === "situational" && daysSince(e.created) > 10 ? 0.18 : 0;
	return (
		weights.recency * recency +
		weights.importance * importanceNorm +
		weights.relevance * relevance +
		salienceNorm * 0.25 +
		retentionBoost +
		stabilityBoost -
		situationalPenalty
	);
}

export function scoreEpisode(
	ep: Episode,
	project: string,
	ctx: string[],
	defaultHalfLife: Record<string, number>,
	weights: ScoreWeights,
): number {
	const strength = defaultHalfLife.episode || 14;
	const recency = decay(daysSince(ep.date), strength);
	const importanceNorm = Math.min(1, ep.importance / 10);
	const projectMatch = ep.project === project ? 1 : 0.5;
	const relevance = projectMatch * (0.3 + 0.7 * tagOverlap(ep.tags, ctx));
	return weights.recency * recency + weights.importance * importanceNorm + weights.relevance * relevance;
}

export function scoreWorkEntry(
	w: WorkEntry,
	project: string,
	ctx: string[],
	defaultHalfLife: Record<string, number>,
	weights: ScoreWeights,
): number {
	const strength = w.strength || defaultHalfLife.work || 45;
	const recency = decay(daysSince(w.created), strength);
	const importanceNorm = Math.min(1, w.importance / 10);
	const projectMatch = w.project === project ? 1 : 0.5;
	const relevance = projectMatch * (0.3 + 0.7 * tagOverlap(w.tags, ctx));
	return weights.recency * recency + weights.importance * importanceNorm + weights.relevance * relevance;
}

/** Budget-constrained top-k selection by score */
export function pickTop<T>(items: T[], scoreFn: (t: T) => number, lenFn: (t: T) => number, budget: number): T[] {
	const scored = items.map((t) => ({ item: t, score: scoreFn(t) })).sort((a, b) => b.score - a.score);
	const result: T[] = [];
	let used = 0;
	for (const { item } of scored) {
		const len = lenFn(item);
		if (used + len > budget) continue;
		used += len;
		result.push(item);
	}
	return result;
}

// ─── Progressive Recall ─────────────────────────────────────

/** Determine the injection tier for a single entry based on its score and config */
export function getInjectionLevel(
	entry: MemoryEntry,
	score: number,
	cfg: ProgressiveRecallConfig,
): InjectionLevel {
	const hoursSinceCreation = (Date.now() - new Date(entry.created).getTime()) / 3_600_000;

	// Force Active for very recent or critical entries
	if (hoursSinceCreation <= cfg.forceRecentHours) return "active";
	if (entry.importance >= cfg.forceImportanceMin) return "active";
	if (entry.retention === "key-event" && (entry.salience ?? entry.importance) >= 7) return "active";
	if (entry.retention === "core" && score >= cfg.thresholdCue) return "active";
	if (score >= cfg.thresholdActive) return "active";
	if (score >= cfg.thresholdCue) return "cue";
	return "dormant";
}

/** Classify entries into Active / Cue / Dormant tiers, each sorted by score descending */
export function tierEntries(
	entries: MemoryEntry[],
	project: string,
	contextTags: string[],
	halfLife: Record<string, number>,
	weights: ScoreWeights,
	prCfg: ProgressiveRecallConfig,
): { active: MemoryEntry[]; cue: MemoryEntry[]; dormant: MemoryEntry[] } {
	const active: Array<{ entry: MemoryEntry; score: number }> = [];
	const cue: Array<{ entry: MemoryEntry; score: number }> = [];
	const dormant: Array<{ entry: MemoryEntry; score: number }> = [];

	for (const entry of entries) {
		const score = scoreEntry(entry, project, contextTags, halfLife, weights);
		const level = getInjectionLevel(entry, score, prCfg);

		if (level === "active") active.push({ entry, score });
		else if (level === "cue") cue.push({ entry, score });
		else dormant.push({ entry, score });
	}

	const sortDesc = (arr: Array<{ entry: MemoryEntry; score: number }>) =>
		arr.sort((a, b) => b.score - a.score).map((x) => x.entry);

	return { active: sortDesc(active), cue: sortDesc(cue), dormant: sortDesc(dormant) };
}
