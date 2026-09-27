/**
 * [WHO]: generateParallelFullInsightSections(), FullInsightsSectionPayload
 * [FROM]: Depends on ./llm-json and ./types for structured LLM section generation
 * [TO]: Consumed by full-insights.ts to improve /mem-insights narrative quality
 * [HERE]: packages/mem-core/src/full-insights-sections.ts - Claude-style parallel section generation without copying upstream implementation
 */

import { parseLlmJson } from "./llm-json.js";
import type {
	FullInsightsAtAGlance,
	FullInsightsFeatureToTry,
	FullInsightsFriction,
	FullInsightsProjectArea,
	FullInsightsUsagePattern,
	FullInsightsWin,
	LlmFn,
	MemoryEntry,
	PatternInsight,
	StruggleInsight,
} from "./types.js";

export interface FullInsightsSectionPayload {
	atAGlance?: FullInsightsAtAGlance;
	projectAreaDescriptions?: string[];
	wins?: FullInsightsWin[];
	frictions?: FullInsightsFriction[];
	recommendations?: string[];
	featuresToTry?: FullInsightsFeatureToTry[];
	usagePatterns?: FullInsightsUsagePattern[];
}

export interface FullInsightsSectionContext {
	locale: string;
	outputLanguage: string;
	stats: {
		totalSessions: number;
		episodes: number;
		work: number;
		knowledge: number;
		lessons: number;
		facets: number;
		aggregateToolCount: number;
		aggregateFileCount: number;
	};
	patterns: PatternInsight[];
	struggles: StruggleInsight[];
	lessons: MemoryEntry[];
	projectAreas: FullInsightsProjectArea[];
	topTools: Array<{ label: string; value: number }>;
	topLanguages: Array<{ label: string; value: number }>;
	topErrors: Array<{ label: string; value: number }>;
}

type SectionName =
	| "project_areas"
	| "wins"
	| "frictions"
	| "recommendations"
	| "features"
	| "usage_patterns";

interface SectionSpec {
	name: SectionName;
	prompt: string;
}

const OBSERVER_VOICE_RULES = `Voice rules:
- Be a warm but sharp long-term coding partner: kind, direct, observant.
- Write like an observant agent keeping a private work diary and a practical field report for the user.
- Tie every claim to the provided data; if evidence is thin, say the signal is still thin.
- No generic praise, personality diagnosis, therapy language, motivational fluff, or invented emotion.
- Each item should name the observed pattern, explain why it matters, and offer one next move when the schema allows.`;

function compactContext(context: FullInsightsSectionContext): Record<string, unknown> {
	return {
		locale: context.locale,
		outputLanguage: context.outputLanguage,
		stats: context.stats,
		projectAreas: context.projectAreas.slice(0, 8).map((area) => ({
			name: area.name,
			sessionCount: area.sessionCount,
			description: area.description,
		})),
		patterns: context.patterns.slice(0, 8).map((pattern) => ({
			trigger: pattern.trigger,
			behavior: pattern.behavior,
			weight: Number(pattern.weight.toFixed(2)),
		})),
		struggles: context.struggles.slice(0, 8).map((struggle) => ({
			problem: struggle.problem,
			resolved: struggle.resolved,
			attempts: struggle.attempts.slice(0, 3),
			solution: struggle.solution,
			weight: Number(struggle.weight.toFixed(2)),
		})),
		lessons: context.lessons.slice(0, 8).map((lesson) => lesson.summary || lesson.detail || lesson.content || ""),
		topTools: context.topTools.slice(0, 8),
		topLanguages: context.topLanguages.slice(0, 8),
		topErrors: context.topErrors.slice(0, 8),
	};
}

function sectionSpecs(outputLanguage: string): SectionSpec[] {
	const languageRule = `Write the JSON string values in ${outputLanguage}, matching the user's observed language habits.`;
	return [
		{
			name: "project_areas",
			prompt: `${OBSERVER_VOICE_RULES}

Identify the main project/work areas from this developer memory report. Describe each area as something you have been watching the user return to, including what that investment suggests about their current work.
${languageRule}
Return ONLY valid JSON:
{"descriptions":["one description per provided project area, preserving order"]}`,
		},
		{
			name: "wins",
			prompt: `${OBSERVER_VOICE_RULES}

Find concrete workflows that are working well. Make the wins feel seen, not flattered: recognize the user's effective habits with evidence from tools, lessons, resolved struggles, or project areas.
${languageRule}
Return ONLY valid JSON:
{"wins":[{"title":"3-7 word title","description":"2-3 specific sentences"}]}`,
		},
		{
			name: "frictions",
			prompt: `${OBSERVER_VOICE_RULES}

Find recurring friction. Be gentle with the user but incisive about the system of work: prefer root causes over symptoms, avoid blame, and include examples when available.
${languageRule}
Return ONLY valid JSON:
{"frictions":[{"title":"short category","description":"1-2 sentences","examples":["specific example"]}]}`,
		},
		{
			name: "recommendations",
			prompt: `${OBSERVER_VOICE_RULES}

Suggest direct behavior changes. Each recommendation should read like a useful note from a partner who has watched the pattern before: observation, why it matters, next move for the next session.
${languageRule}
Return ONLY valid JSON:
{"recommendations":["recommendation sentence"]}`,
		},
		{
			name: "features",
			prompt: `${OBSERVER_VOICE_RULES}

Suggest Catui features or workflows this user should try based on their actual usage. Prefer skills, MCP, hooks, headless commands, subagents, recap, memory, or token-save only when evidence supports it; explain why it fits this user's observed habits.
${languageRule}
Return ONLY valid JSON:
{"featuresToTry":[{"title":"feature/workflow","oneLiner":"what it does","whyForYou":"why this user should try it","exampleCode":"optional command or config"}]}`,
		},
		{
			name: "usage_patterns",
			prompt: `${OBSERVER_VOICE_RULES}

Suggest reusable prompt/workflow patterns. Make each one copyable and grounded in the reported friction or wins, as if you are leaving the user a practical note for how to begin next time.
${languageRule}
Return ONLY valid JSON:
{"usagePatterns":[{"title":"pattern","summary":"short summary","detail":"how to apply it","pastePrompt":"copyable prompt"}]}`,
		},
	];
}

async function generateSection(
	spec: SectionSpec,
	contextJson: string,
	llmFn: LlmFn,
): Promise<{ name: SectionName; result: Record<string, unknown> | null }> {
	try {
		const raw = await llmFn(
			"You write structured developer usage insights as a warm but sharp long-term coding partner. Output only valid JSON matching the requested schema.",
			`${spec.prompt}\n\nDATA:\n${contextJson}`,
		);
		const parsed = parseLlmJson<Record<string, unknown>>(raw);
		return { name: spec.name, result: parsed && typeof parsed === "object" ? parsed : null };
	} catch {
		return { name: spec.name, result: null };
	}
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return items.length ? items : undefined;
}

function asWins(value: unknown): FullInsightsWin[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const wins = value
		.map((item) => item as Partial<FullInsightsWin>)
		.filter((item) => typeof item.title === "string" && typeof item.description === "string")
		.map((item) => ({ title: item.title!, description: item.description! }));
	return wins.length ? wins : undefined;
}

function asFrictions(value: unknown): FullInsightsFriction[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const frictions = value
		.map((item) => item as Partial<FullInsightsFriction>)
		.filter((item) => typeof item.title === "string" && typeof item.description === "string")
		.map((item) => ({
			title: item.title!,
			description: item.description!,
			examples: Array.isArray(item.examples)
				? item.examples.filter((example): example is string => typeof example === "string")
				: undefined,
		}));
	return frictions.length ? frictions : undefined;
}

function asFeatures(value: unknown): FullInsightsFeatureToTry[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const features = value
		.map((item) => item as Partial<FullInsightsFeatureToTry>)
		.filter((item) => typeof item.title === "string" && typeof item.oneLiner === "string" && typeof item.whyForYou === "string")
		.map((item) => ({
			title: item.title!,
			oneLiner: item.oneLiner!,
			whyForYou: item.whyForYou!,
			exampleCode: typeof item.exampleCode === "string" ? item.exampleCode : undefined,
		}));
	return features.length ? features : undefined;
}

function asUsagePatterns(value: unknown): FullInsightsUsagePattern[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const patterns = value
		.map((item) => item as Partial<FullInsightsUsagePattern>)
		.filter((item) => typeof item.title === "string" && typeof item.summary === "string" && typeof item.detail === "string")
		.map((item) => ({
			title: item.title!,
			summary: item.summary!,
			detail: item.detail!,
			pastePrompt: typeof item.pastePrompt === "string" ? item.pastePrompt : undefined,
		}));
	return patterns.length ? patterns : undefined;
}

function mergeSectionPayload(results: Array<{ name: SectionName; result: Record<string, unknown> | null }>): FullInsightsSectionPayload {
	const payload: FullInsightsSectionPayload = {};
	for (const { name, result } of results) {
		if (!result) continue;
		if (name === "project_areas") payload.projectAreaDescriptions = asStringArray(result.descriptions);
		if (name === "wins") payload.wins = asWins(result.wins);
		if (name === "frictions") payload.frictions = asFrictions(result.frictions);
		if (name === "recommendations") payload.recommendations = asStringArray(result.recommendations);
		if (name === "features") payload.featuresToTry = asFeatures(result.featuresToTry);
		if (name === "usage_patterns") payload.usagePatterns = asUsagePatterns(result.usagePatterns);
	}
	return payload;
}

async function generateAtAGlance(
	contextJson: string,
	sections: FullInsightsSectionPayload,
	llmFn: LlmFn,
	outputLanguage: string,
): Promise<FullInsightsAtAGlance | undefined> {
	const languageRule = `Write concise natural ${outputLanguage}, matching the user's observed language habits.`;
	try {
		const raw = await llmFn(
			"You write executive summaries for developer usage reports. Output only valid JSON.",
			`${OBSERVER_VOICE_RULES}

${languageRule}
Synthesize the section outputs into four short, candid coaching blurbs. Make this read like the opening note of a private diary and field report from a long-term coding partner: intimate enough to feel observed, precise enough to be useful.
Return ONLY valid JSON:
{"working":"what is working","hindering":"what is hindering","quickWins":"quick wins to try","ambitious":"ambitious workflows to prepare for"}

BASE DATA:
${contextJson}

SECTION OUTPUTS:
${JSON.stringify(sections, null, 2)}`,
		);
		const parsed = parseLlmJson<Partial<FullInsightsAtAGlance>>(raw);
		if (
			typeof parsed?.working === "string" &&
			typeof parsed.hindering === "string" &&
			typeof parsed.quickWins === "string" &&
			typeof parsed.ambitious === "string"
		) {
			return {
				working: parsed.working,
				hindering: parsed.hindering,
				quickWins: parsed.quickWins,
				ambitious: parsed.ambitious,
			};
		}
	} catch {
		// Keep caller fallbacks.
	}
	return undefined;
}

export async function generateParallelFullInsightSections(
	context: FullInsightsSectionContext,
	llmFn: LlmFn,
): Promise<FullInsightsSectionPayload> {
	const contextJson = JSON.stringify(compactContext(context), null, 2);
	const results = await Promise.all(sectionSpecs(context.outputLanguage).map((spec) => generateSection(spec, contextJson, llmFn)));
	const payload = mergeSectionPayload(results);
	const atAGlance = await generateAtAGlance(contextJson, payload, llmFn, context.outputLanguage);
	if (atAGlance) payload.atAGlance = atAGlance;
	return payload;
}
