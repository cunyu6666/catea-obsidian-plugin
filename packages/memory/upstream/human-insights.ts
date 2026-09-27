/**
 * [WHO]: DeveloperPersona, HumanInsightsReport, generateHumanInsights
 * [FROM]: Depends on ./llm-json.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/human-insights.ts - LLM-powered usage review generation with developer persona analysis
 */


import type {
	DeveloperPersona,
	EnhancedInsightsReport,
	HumanInsight,
	LlmFn,
	MemoryEntry,
	Episode,
	RootCauseInsight,
	WorkEntry,
} from "./types.js";
import { parseLlmJson } from "./llm-json.js";

interface ExportAllResult {
	knowledge: MemoryEntry[];
	lessons: MemoryEntry[];
	preferences: MemoryEntry[];
	facets: MemoryEntry[];
	work: WorkEntry[];
	episodes: Episode[];
	meta: { totalSessions: number; lastConsolidation?: string; version: number };
}

const HUMAN_INSIGHTS_SYSTEM_PROMPT = `You are an elite AI product analyst and developer workflow coach.

You are reviewing one specific user's real usage history over time.
Write like a warm, observant expert who deeply understands how experienced AI users actually work.

Goals:
- Sound human, perceptive, and respectful rather than robotic or generic
- Give clear corrections when the user's habits are inefficient
- Back every major conclusion with concrete evidence from the supplied data
- Prefer precise language, plain English, and practical recommendations
- Explain what the user is doing well, where they are losing time, and what they should change next

Output requirements:
- Output ONLY valid JSON
- Do not use markdown or code fences
- Use the supplied data only
- Be specific, not motivational fluff
- Each insight should feel like part of a thoughtful performance review
- Recommendations should be direct, concrete, and easy to act on
- Evidence should reference counts, repeated behaviors, or recurring issues when possible
- If locale is "zh", write the JSON string values in Simplified Chinese; otherwise write in English

Return JSON matching this schema:
{
  "persona": {
    "whatTheyDo": "1-2 sentences",
    "experienceLevel": "1 sentence",
    "superpowers": ["...", "..."],
    "painPoints": ["...", "..."],
    "workStyle": "1-2 sentences",
    "summary": "1 sentence"
  },
  "insights": [
    {
      "title": "short title",
      "content": "3-5 sentences combining observation, evidence, correction, and advice",
      "icon": "emoji",
      "utility": "high|medium|low",
      "tags": ["tag1", "tag2"]
    }
  ],
  "rootCauses": [
    {
      "symptom": "what keeps happening",
      "rootCause": "why it likely happens",
      "evidence": ["fact 1", "fact 2"],
      "suggestion": "what to change next"
    }
  ]
}`.trim();

function summarizeCounts(rows: Array<[string, number]>, formatter: (label: string, value: number) => string): string[] {
	return rows.map(([label, value]) => formatter(label, value));
}

function buildHumanInsightsData(all: ExportAllResult) {
	const totalToolUses = all.episodes.reduce(
		(total, episode) =>
			total +
			Object.values(episode.toolsUsed ?? {}).reduce<number>((sum, count) => sum + count, 0),
		0,
	);

	const toolCounts = all.episodes.reduce(
		(acc, episode) => {
			for (const [tool, count] of Object.entries(episode.toolsUsed ?? {})) {
				acc[tool] = (acc[tool] ?? 0) + count;
			}
			return acc;
		},
		{} as Record<string, number>,
	);

	const languageCounts = all.episodes.reduce(
		(acc, episode) => {
			for (const file of episode.filesModified ?? []) {
				const ext = file.includes(".") ? file.split(".").pop()?.toLowerCase() ?? "other" : "other";
				acc[ext] = (acc[ext] ?? 0) + 1;
			}
			return acc;
		},
		{} as Record<string, number>,
	);

	const errorCounts = all.episodes.reduce(
		(acc, episode) => {
			for (const error of episode.errors ?? []) {
				const key = error.replace(/\s+/g, " ").trim().slice(0, 120);
				if (!key) continue;
				acc[key] = (acc[key] ?? 0) + 1;
			}
			return acc;
		},
		{} as Record<string, number>,
	);

	const resolvedStruggles = all.facets.filter(
		(entry) => entry.type === "struggle" && entry.facetData?.kind === "struggle" && !!entry.facetData.solution,
	);
	const unresolvedStruggles = all.facets.filter(
		(entry) => entry.type === "struggle" && entry.facetData?.kind === "struggle" && !entry.facetData.solution,
	);
	const patternEntries = all.facets.filter(
		(entry) => entry.type === "pattern" && entry.facetData?.kind === "pattern",
	);

	const topTools = Object.entries(toolCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8);
	const topLanguages = Object.entries(languageCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8);
	const topErrors = Object.entries(errorCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8);
	const topPatterns = patternEntries
		.slice()
		.sort((a, b) => (b.accessCount + 1) * b.importance - (a.accessCount + 1) * a.importance)
		.slice(0, 6)
		.map((entry) => ({
			trigger: entry.facetData?.kind === "pattern" ? entry.facetData.trigger : "",
			behavior: entry.facetData?.kind === "pattern" ? entry.facetData.behavior : "",
			importance: entry.importance,
			accessCount: entry.accessCount,
		}));

	const notableWins = resolvedStruggles.slice(0, 6).map((entry) => ({
		problem: entry.facetData?.kind === "struggle" ? entry.facetData.problem : entry.summary || "",
		solution: entry.facetData?.kind === "struggle" ? entry.facetData.solution : "",
		importance: entry.importance,
	}));

	const notableFrictions = unresolvedStruggles.slice(0, 6).map((entry) => ({
		problem: entry.facetData?.kind === "struggle" ? entry.facetData.problem : entry.summary || "",
		attempts: entry.facetData?.kind === "struggle" ? entry.facetData.attempts : [],
		importance: entry.importance,
	}));

	const topLessons = all.lessons
		.slice()
		.sort((a, b) => (b.accessCount + 1) * b.importance - (a.accessCount + 1) * a.importance)
		.slice(0, 8)
		.map((entry) => entry.summary || entry.detail || entry.content || "")
		.filter(Boolean);

	const projectCounts = all.episodes.reduce(
		(acc, episode) => {
			const key = episode.project || "default";
			acc[key] = (acc[key] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	return {
		overview: {
			totalSessions: all.meta.totalSessions,
			episodes: all.episodes.length,
			workEntries: all.work.length,
			knowledgeEntries: all.knowledge.length,
			lessonEntries: all.lessons.length,
			preferenceEntries: all.preferences.length,
			facetEntries: all.facets.length,
			totalToolUses,
			resolvedStruggleCount: resolvedStruggles.length,
			unresolvedStruggleCount: unresolvedStruggles.length,
		},
		topTools: topTools.map(([tool, count]) => ({
			tool,
			count,
			share: totalToolUses > 0 ? Number(((count / totalToolUses) * 100).toFixed(1)) : 0,
		})),
		topLanguages: topLanguages.map(([language, fileCount]) => ({ language, fileCount })),
		topErrors: topErrors.map(([error, count]) => ({ error, count })),
		topPatterns,
		notableWins,
		notableFrictions,
		topLessons,
		projectDistribution: Object.entries(projectCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6)
			.map(([project, sessions]) => ({ project, sessions })),
		evidenceDigest: {
			tools: summarizeCounts(topTools, (tool, count) => `${tool}: ${count} uses`),
			languages: summarizeCounts(topLanguages, (language, count) => `${language}: ${count} files`),
			errors: summarizeCounts(topErrors, (error, count) => `${error}: ${count} times`),
		},
	};
}

function parseHumanInsightsResponse(raw: string): {
	persona?: DeveloperPersona;
	insights: HumanInsight[];
	rootCauses: RootCauseInsight[];
} | null {
	try {
		const parsed = parseLlmJson<{
			persona?: Record<string, unknown>;
			insights?: Array<Record<string, unknown>>;
			rootCauses?: Array<Record<string, unknown>>;
		}>(raw);

		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}

		const persona = parsed.persona
			? {
					whatTheyDo: String(parsed.persona.whatTheyDo || ""),
					experienceLevel: String(parsed.persona.experienceLevel || ""),
					superpowers: Array.isArray(parsed.persona.superpowers) ? parsed.persona.superpowers.map(String) : [],
					painPoints: Array.isArray(parsed.persona.painPoints) ? parsed.persona.painPoints.map(String) : [],
					workStyle: String(parsed.persona.workStyle || ""),
					summary: String(parsed.persona.summary || ""),
				}
			: undefined;

		const insights: HumanInsight[] = Array.isArray(parsed.insights)
			? parsed.insights
					.map((item) => ({
						title: String(item.title || "").trim(),
						content: String(item.content || "").trim(),
						icon: String(item.icon || "Insight").trim(),
						utility: ["high", "medium", "low"].includes(String(item.utility))
							? (String(item.utility) as "high" | "medium" | "low")
							: "medium",
						tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
					}))
					.filter((item) => item.title && item.content)
			: [];

		const rootCauses: RootCauseInsight[] = Array.isArray(parsed.rootCauses)
			? parsed.rootCauses
					.map((item) => ({
						symptom: String(item.symptom || "").trim(),
						rootCause: String(item.rootCause || "").trim(),
						evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
						suggestion: String(item.suggestion || "").trim(),
					}))
					.filter((item) => item.symptom && item.rootCause)
			: [];

		return { persona, insights, rootCauses };
	} catch {
		return null;
	}
}

export async function generateHumanInsights(
	all: ExportAllResult,
	llmFn: LlmFn | undefined,
	locale: string,
): Promise<{
	persona?: DeveloperPersona;
	humanInsights: HumanInsight[];
	rootCauses: RootCauseInsight[];
}> {
	if (!llmFn) {
		return { humanInsights: [], rootCauses: [] };
	}

	const data = buildHumanInsightsData(all);
	const userPrompt = JSON.stringify({ locale, reviewData: data });

	try {
		const raw = await llmFn(HUMAN_INSIGHTS_SYSTEM_PROMPT, userPrompt);
		const parsed = parseHumanInsightsResponse(raw);
		if (parsed) {
			return {
				persona: parsed.persona,
				humanInsights: parsed.insights,
				rootCauses: parsed.rootCauses,
			};
		}
	} catch {
		// Fall back to empty enhanced insights when the LLM path is unavailable.
	}

	return { humanInsights: [], rootCauses: [] };
}

export async function buildEnhancedInsightsReport(
	all: ExportAllResult,
	llmFn: LlmFn | undefined,
	locale: string,
): Promise<EnhancedInsightsReport> {
	const humanData = await generateHumanInsights(all, llmFn, locale);

	return {
		stats: {
			knowledge: all.knowledge.length,
			lessons: all.lessons.length,
			preferences: all.preferences.length,
			facets: all.facets.length,
			episodes: all.episodes.length,
			work: all.work.length,
			totalSessions: all.meta.totalSessions,
		},
		atAGlance: { working: "", hindering: "", quickWins: "", ambitious: "" },
		projectAreas: [],
		charts: [],
		wins: [],
		frictions: [],
		patterns: [],
		recommendations: [],
		featuresToTry: [],
		usagePatterns: [],
		generatedAt: new Date().toISOString(),
		locale,
		persona: humanData.persona,
		humanInsights: humanData.humanInsights,
		rootCauses: humanData.rootCauses,
		comparisons: [],
	};
}
