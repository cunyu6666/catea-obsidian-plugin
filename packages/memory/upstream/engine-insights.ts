/**
 * [WHO]: Provides generateInsightsReport, generateRecommendations, generateRulesBasedRecommendations
 * [FROM]: Depends on ./i18n.js for PROMPTS; ./llm-json.js for tolerant structured parsing; ./types.js for memory types and insights
 * [TO]: Consumed by engine.ts (generateInsights)
 * [HERE]: packages/mem-core/src/engine-insights.ts - insights report generation (LLM + rules-based)
 */

import { PROMPTS } from "./i18n.js";
import { parseLlmJson } from "./llm-json.js";
import type { InsightsReport, LlmFn, MemoryEntry, PatternInsight, StruggleInsight, Meta, WorkEntry, Episode } from "./types.js";

export interface RuntimeMemoryView {
	knowledge: MemoryEntry[];
	lessons: MemoryEntry[];
	events: MemoryEntry[];
	preferences: MemoryEntry[];
	facets: MemoryEntry[];
	work: WorkEntry[];
	episodes: Episode[];
	meta: Meta;
	v2SearchEntries: MemoryEntry[];
}

export async function generateInsightsReport(
	all: RuntimeMemoryView,
	locale: string,
	llmFn?: LlmFn,
): Promise<InsightsReport> {
	const stats = {
		knowledge: all.knowledge.length,
		lessons: all.lessons.length,
		preferences: all.preferences.length,
		facets: all.facets.length,
		episodes: all.episodes.length,
		work: all.work.length,
		totalSessions: all.meta.totalSessions,
	};

	// Separate patterns and struggles from facets
	const patternEntries = all.facets.filter((e) => e.type === "pattern");
	const struggleEntries = all.facets.filter((e) => e.type === "struggle");

	// Weight calculation: (accessCount + 1) × (importance / 10)
	const calcWeight = (e: MemoryEntry, unresolvedBonus = false): number => {
		const base = (e.accessCount + 1) * (e.importance / 10);
		return unresolvedBonus ? base * 1.5 : base;
	};

	// Build PatternInsight[]
	const patterns: PatternInsight[] = patternEntries
		.map((e) => ({
			entry: e,
			weight: calcWeight(e),
			trigger: e.facetData?.kind === "pattern" ? e.facetData.trigger : (e.summary || e.detail || "").slice(0, 50),
			behavior: e.facetData?.kind === "pattern" ? e.facetData.behavior : (e.summary || e.detail || ""),
		}))
		.sort((a, b) => b.weight - a.weight);

	// Build StruggleInsight[]
	const struggles: StruggleInsight[] = struggleEntries
		.map((e) => {
			const isResolved = e.facetData?.kind === "struggle" ? !!e.facetData.solution : false;
			return {
				entry: e,
				weight: calcWeight(e, !isResolved),
				problem: e.facetData?.kind === "struggle" ? e.facetData.problem : (e.summary || e.detail || ""),
				attempts: e.facetData?.kind === "struggle" ? e.facetData.attempts : [],
				solution: e.facetData?.kind === "struggle" ? e.facetData.solution : "",
				resolved: isResolved,
			};
		})
		.sort((a, b) => {
			// Unresolved first, then by weight
			if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
			return b.weight - a.weight;
		});

	// Top lessons and knowledge by importance × accessCount
	const sortByRelevance = (arr: MemoryEntry[]) =>
		[...arr].sort((a, b) => b.importance * (b.accessCount + 1) - a.importance * (a.accessCount + 1));

	const topLessons = sortByRelevance(all.lessons).slice(0, 10);
	const topKnowledge = sortByRelevance(all.knowledge).slice(0, 10);

	// Generate recommendations (LLM or rules-based fallback)
	const recommendations = await generateRecommendations(patterns, struggles, topLessons, locale, llmFn);

	return {
		patterns,
		struggles,
		topLessons,
		topKnowledge,
		preferences: all.preferences,
		stats,
		recommendations,
		generatedAt: new Date().toISOString(),
	};
}

export async function generateRecommendations(
	patterns: PatternInsight[],
	struggles: StruggleInsight[],
	lessons: MemoryEntry[],
	locale: string,
	llmFn?: LlmFn,
): Promise<string[]> {
	// Try LLM-based recommendations if available
	if (llmFn) {
		try {
			const p = PROMPTS[locale] ?? PROMPTS.en;
			const input = JSON.stringify({
				patterns: patterns.slice(0, 5).map((pa) => ({ trigger: pa.trigger, behavior: pa.behavior })),
				struggles: struggles.slice(0, 5).map((s) => ({ problem: s.problem, resolved: s.resolved })),
				lessons: lessons.slice(0, 5).map((l) => l.summary || l.detail || l.content || ""),
			});
			const raw = await llmFn(p.insightsRecommendationSystem, input);
			const result = parseLlmJson<string[]>(raw);
			if (Array.isArray(result) && result.length > 0) {
				return result.slice(0, 5);
			}
		} catch {
			// Fall through to rules-based
		}
	}

	// Rules-based fallback recommendations
	return generateRulesBasedRecommendations(patterns, struggles, lessons);
}

export function generateRulesBasedRecommendations(
	patterns: PatternInsight[],
	struggles: StruggleInsight[],
	lessons: MemoryEntry[],
): string[] {
	const recommendations: string[] = [];

	// High-weight patterns → automation suggestion
	if (patterns.length > 0) {
		const top = patterns[0]!;
		recommendations.push(
			`You consistently ${top.behavior} when ${top.trigger}. Consider automating this behavior.`,
		);
	}

	// Unresolved struggles → systematic review suggestion
	const unresolved = struggles.filter((s) => !s.resolved);
	if (unresolved.length >= 2) {
		recommendations.push(
			`You have ${unresolved.length} unresolved issues. Consider tackling them systematically.`,
		);
	}

	// Recurring tag patterns in struggles → domain-specific review
	const struggleTags = struggles.flatMap((s) => s.entry.tags);
	const tagCounts = struggleTags.reduce(
		(acc, tag) => {
			acc[tag] = (acc[tag] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);
	const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
	if (topTag && topTag[1] >= 3) {
		recommendations.push(
			`Issues related to "${topTag[0]}" appear frequently. Consider deeper learning in this area.`,
		);
	}

	// Lessons accumulation → expertise recognition
	if (lessons.length >= 5) {
		recommendations.push(
			`You've accumulated ${lessons.length} lessons. This is valuable expertise.`,
		);
	}

	// No data → encouragement
	if (patterns.length === 0 && struggles.length === 0 && lessons.length === 0) {
		recommendations.push(`Keep using the system to let it learn your work habits.`);
	}

	return recommendations.slice(0, 5);
}
