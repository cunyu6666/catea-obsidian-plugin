/**
 * [WHO]: FullInsightsReport, generateFullInsights
 * [FROM]: Depends on ./i18n.js, ./full-insights-sections.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/full-insights.ts - aggregation + optional LLM for comprehensive insights report
 */


import { PROMPTS } from "./i18n.js";
import type {
	Episode,
	FullInsightsAtAGlance,
	FullInsightsChart,
	FullInsightsFriction,
	FullInsightsProjectArea,
	FullInsightsReport,
	FullInsightsFeatureToTry,
	FullInsightsUsagePattern,
	FullInsightsWin,
	LlmFn,
	MemoryEntry,
	PatternInsight,
	StruggleInsight,
	WorkEntry,
} from "./types.js";
import { generateParallelFullInsightSections } from "./full-insights-sections.js";

const EXT_TO_LANG: Record<string, string> = {
	ts: "TypeScript",
	js: "JavaScript",
	jsx: "JSX",
	tsx: "TSX",
	md: "Markdown",
	json: "JSON",
	py: "Python",
	html: "HTML",
	css: "CSS",
	yml: "YAML",
	yaml: "YAML",
	sh: "Shell",
};

export interface ExportAllResult {
	knowledge: MemoryEntry[];
	lessons: MemoryEntry[];
	preferences: MemoryEntry[];
	facets: MemoryEntry[];
	work: WorkEntry[];
	episodes: Episode[];
	meta: { totalSessions: number; lastConsolidation?: string; version: number };
}

function aggregateTools(episodes: Episode[], topN = 10): FullInsightsChart {
	const counts: Record<string, number> = {};
	for (const ep of episodes) {
		for (const [name, n] of Object.entries(ep.toolsUsed ?? {})) {
			counts[name] = (counts[name] ?? 0) + n;
		}
	}
	const rows = Object.entries(counts)
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, topN);
	return { id: "tools", title: "tools", rows };
}

function aggregateLanguages(episodes: Episode[], topN = 8): FullInsightsChart {
	const counts: Record<string, number> = {};
	for (const ep of episodes) {
		for (const path of ep.filesModified ?? []) {
			const ext = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "other" : "other";
			const label = EXT_TO_LANG[ext] ?? ext;
			counts[label] = (counts[label] ?? 0) + 1;
		}
	}
	const rows = Object.entries(counts)
		.filter(([label]) => label !== "other" || (counts[label] ?? 0) > 0)
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, topN);
	return { id: "languages", title: "languages", rows };
}

function aggregateErrors(episodes: Episode[], topN = 8): FullInsightsChart {
	const counts: Record<string, number> = {};
	for (const ep of episodes) {
		for (const err of ep.errors ?? []) {
			const key = err.slice(0, 50).trim();
			counts[key] = (counts[key] ?? 0) + 1;
		}
	}
	const rows = Object.entries(counts)
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, topN);
	return { id: "errors", title: "errors", rows };
}

function buildProjectAreas(episodes: Episode[], work: WorkEntry[]): FullInsightsProjectArea[] {
	const byProject = new Map<string, { count: number; summaries: string[]; goals: string[] }>();
	for (const ep of episodes) {
		const p = ep.project || "default";
		if (!byProject.has(p)) byProject.set(p, { count: 0, summaries: [], goals: [] });
		const entry = byProject.get(p)!;
		entry.count++;
		if (ep.summary) entry.summaries.push(ep.summary);
		if (ep.userGoal) entry.goals.push(ep.userGoal);
	}
	for (const w of work) {
		const p = w.project || "default";
		if (!byProject.has(p)) byProject.set(p, { count: 0, summaries: [], goals: [] });
		const entry = byProject.get(p)!;
		if (w.summary) entry.summaries.push(w.summary);
		if (w.goal) entry.goals.push(w.goal);
	}
	return [...byProject.entries()]
		.filter(([, v]) => v.count >= 1 || v.summaries.length + v.goals.length > 0)
		.map(([name, v]) => ({
			name,
			sessionCount: v.count,
			description: [v.summaries[0], v.goals[0]].filter(Boolean).join(" ").slice(0, 120) || "",
		}))
		.sort((a, b) => b.sessionCount - a.sessionCount)
		.slice(0, 12);
}

function buildPatternsAndStruggles(facets: MemoryEntry[]): { patterns: PatternInsight[]; struggles: StruggleInsight[] } {
	const patternEntries = facets.filter((e) => e.type === "pattern");
	const struggleEntries = facets.filter((e) => e.type === "struggle");
	const calcWeight = (e: MemoryEntry, unresolvedBonus = false): number => {
		const base = (e.accessCount + 1) * (e.importance / 10);
		return unresolvedBonus ? base * 1.5 : base;
	};
	const patterns: PatternInsight[] = patternEntries
		.map((e) => ({
			entry: e,
			weight: calcWeight(e),
			trigger: e.facetData?.kind === "pattern" ? e.facetData.trigger : (e.summary || e.detail || e.content || "").slice(0, 50),
			behavior: e.facetData?.kind === "pattern" ? e.facetData.behavior : (e.summary || e.detail || e.content || ""),
		}))
		.sort((a, b) => b.weight - a.weight);
	const struggles: StruggleInsight[] = struggleEntries
		.map((e) => {
			const isResolved = e.facetData?.kind === "struggle" ? !!e.facetData.solution : false;
			return {
				entry: e,
				weight: calcWeight(e, !isResolved),
				problem: e.facetData?.kind === "struggle" ? e.facetData.problem : (e.summary || e.detail || e.content || ""),
				attempts: e.facetData?.kind === "struggle" ? e.facetData.attempts : [],
				solution: e.facetData?.kind === "struggle" ? e.facetData.solution : "",
				resolved: isResolved,
			};
		})
		.sort((a, b) => (a.resolved !== b.resolved ? (a.resolved ? 1 : -1) : b.weight - a.weight));
	return { patterns, struggles };
}

function fallbackAtAGlance(
	patterns: PatternInsight[],
	struggles: StruggleInsight[],
	lessons: MemoryEntry[],
	locale: string,
): FullInsightsAtAGlance {
	const resolved = struggles.filter((s) => s.resolved);
	const unresolved = struggles.filter((s) => !s.resolved);
	const working =
		resolved.length > 0
			? `${resolved.length} struggles resolved; keep reusing those fixes.`
			: lessons.length > 0
				? `${lessons.length} lessons captured; turn the top ones into checklists.`
				: "No strong signal yet.";
	const hindering =
		unresolved.length > 0
			? `${unresolved.length} open struggles remain. Most frequent: "${unresolved[0]?.problem ?? ""}".`
			: "No unresolved struggles visible.";
	const topPattern = patterns[0];
	const quickWins = topPattern
		? `When ${topPattern.trigger}, you often ${topPattern.behavior}. Consider automating.`
		: "Keep using the system; quick wins will appear as data grows.";
	const ambitious = "Consider turning repeat workflows into skills or scripts and using parallel agents.";
	return { working, hindering, quickWins, ambitious };
}

function fallbackWins(struggles: StruggleInsight[], lessons: MemoryEntry[]): FullInsightsWin[] {
	const wins: FullInsightsWin[] = [];
	for (const s of struggles.filter((x) => x.resolved).slice(0, 5)) {
		wins.push({ title: s.problem.slice(0, 60), description: s.solution || s.problem });
	}
	const sortLessons = [...lessons].sort((a, b) => b.importance * (b.accessCount + 1) - a.importance * (a.accessCount + 1));
	for (const l of sortLessons.slice(0, 3)) {
		const text = l.summary || l.detail || l.content || "";
		wins.push({ title: text.slice(0, 60), description: text });
	}
	return wins.slice(0, 8);
}

function fallbackFrictions(struggles: StruggleInsight[]): FullInsightsFriction[] {
	return struggles
		.filter((s) => !s.resolved)
		.slice(0, 8)
		.map((s) => ({
			title: s.problem.slice(0, 60),
			description: s.problem,
			examples: s.attempts.length ? s.attempts : undefined,
		}));
}

function fallbackRecommendations(
	patterns: PatternInsight[],
	struggles: StruggleInsight[],
	lessons: MemoryEntry[],
	locale: string,
): string[] {
	const recs: string[] = [];
	if (patterns.length > 0) {
		const top = patterns[0]!;
		recs.push(`You consistently ${top.behavior} when ${top.trigger}. Consider automating.`);
	}
	const unresolved = struggles.filter((s) => !s.resolved);
	if (unresolved.length >= 2) {
		recs.push(`You have ${unresolved.length} unresolved issues. Tackle them systematically.`);
	}
	if (lessons.length >= 5) {
		recs.push(`You've accumulated ${lessons.length} lessons. Valuable expertise.`);
	}
	if (recs.length === 0) {
		recs.push("Keep using the system to let it learn your habits.");
	}
	return recs.slice(0, 5);
}

function fallbackFeaturesAndPatterns(
	toolRows: { label: string; value: number }[],
	struggles: StruggleInsight[],
	locale: string,
): { featuresToTry: FullInsightsFeatureToTry[]; usagePatterns: FullInsightsUsagePattern[] } {
	const featuresToTry: FullInsightsFeatureToTry[] = [];
	const usagePatterns: FullInsightsUsagePattern[] = [];
	if (toolRows.length > 0) {
		const topTool = toolRows[0]!.label;
		featuresToTry.push({
			title: "Automate frequent operations",
			oneLiner: "Turn repeat workflows into skills or scripts",
			whyForYou: `You use "${topTool}" often; consider wrapping it in a skill or command.`,
		});
	}
	if (struggles.filter((s) => !s.resolved).length >= 2) {
		usagePatterns.push({
			title: "Batch large tasks",
			summary: "Split large files or batches into smaller chunks",
			detail: "Avoid context overflow by validating each batch before continuing.",
			pastePrompt: "Break this into 3-4 steps; show me the result after each step before continuing.",
		});
	}
	return { featuresToTry, usagePatterns };
}

interface ObservedReportLanguage {
	code: string;
	name: string;
}

function entryText(entry: MemoryEntry): string {
	return [entry.name, entry.summary, entry.detail, entry.content, entry.tags.join(" ")].filter(Boolean).join("\n");
}

function languageFromExplicitPreference(text: string): ObservedReportLanguage | undefined {
	if (/(中文|汉语|Chinese|Mandarin|用中文|中文输出|中文交流)/i.test(text)) return { code: "zh", name: "Chinese" };
	if (/(英文|英语|English|use English|write in English)/i.test(text)) return { code: "en", name: "English" };
	if (/(日文|日语|日本語|Japanese)/i.test(text)) return { code: "ja", name: "Japanese" };
	if (/(韩文|韩语|한국어|Korean)/i.test(text)) return { code: "ko", name: "Korean" };
	if (/(法文|法语|français|French)/i.test(text)) return { code: "fr", name: "French" };
	if (/(西班牙文|西班牙语|español|Spanish)/i.test(text)) return { code: "es", name: "Spanish" };
	if (/(德文|德语|Deutsch|German)/i.test(text)) return { code: "de", name: "German" };
	return undefined;
}

function languageFromScript(text: string): ObservedReportLanguage | undefined {
	const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
	const kana = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
	const hangul = (text.match(/\p{Script=Hangul}/gu) ?? []).length;
	const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
	const arabic = (text.match(/\p{Script=Arabic}/gu) ?? []).length;
	const latinWords = (text.match(/[A-Za-z]{3,}/g) ?? []).length;
	if (kana >= 4) return { code: "ja", name: "Japanese" };
	if (hangul >= 4) return { code: "ko", name: "Korean" };
	if (han >= 8 && han >= latinWords) return { code: "zh", name: "Chinese" };
	if (cyrillic >= 8) return { code: "ru", name: "Russian" };
	if (arabic >= 8) return { code: "ar", name: "Arabic" };
	if (latinWords >= 20 && han + kana + hangul + cyrillic + arabic === 0) return { code: "en", name: "English" };
	return undefined;
}

function fallbackLanguage(locale: string): ObservedReportLanguage {
	if (locale === "zh") return { code: "zh", name: "Chinese" };
	if (locale === "en") return { code: "en", name: "English" };
	return { code: locale, name: locale };
}

function inferObservedReportLanguage(all: ExportAllResult, locale: string): ObservedReportLanguage {
	const preferenceText = all.preferences.map(entryText).join("\n");
	const explicit = languageFromExplicitPreference(preferenceText);
	if (explicit) return explicit;
	const observedText = [
		preferenceText,
		...all.episodes.flatMap((episode) => [
			episode.summary,
			episode.userGoal ?? "",
			...episode.keyObservations,
			...episode.tags,
		]),
		...all.work.flatMap((work) => [work.goal, work.summary, work.detail ?? "", ...work.tags]),
		...all.lessons.map(entryText),
		...all.knowledge.map(entryText),
		...all.facets.map(entryText),
	].join("\n");
	return languageFromScript(observedText) ?? fallbackLanguage(locale);
}

export async function buildFullInsightsReport(
	all: ExportAllResult,
	llmFn: LlmFn | undefined,
	locale: string,
): Promise<FullInsightsReport> {
	const reportLanguage = inferObservedReportLanguage(all, locale);
	const reportLocale = reportLanguage.code;
	const p = PROMPTS[reportLocale] ?? PROMPTS.en;
	const { patterns, struggles } = buildPatternsAndStruggles(all.facets);
	const sortLessons = [...all.lessons].sort(
		(a, b) => b.importance * (b.accessCount + 1) - a.importance * (a.accessCount + 1),
	);
	const topLessons = sortLessons.slice(0, 10);

	const charts: FullInsightsChart[] = [];
	const toolsChart = aggregateTools(all.episodes);
	let aggregateToolCount = 0;
	for (const r of toolsChart.rows) aggregateToolCount += r.value;
	if (toolsChart.rows.length > 0) charts.push({ ...toolsChart, title: p.fullInsightsChartTools });

	const langChart = aggregateLanguages(all.episodes);
	let aggregateFileCount = 0;
	for (const r of langChart.rows) aggregateFileCount += r.value;
	if (langChart.rows.length > 0) charts.push({ ...langChart, title: p.fullInsightsChartLanguages });

	const errChart = aggregateErrors(all.episodes);
	if (errChart.rows.length > 0) charts.push({ ...errChart, title: p.fullInsightsChartErrors });

	const projectAreas = buildProjectAreas(all.episodes, all.work);

	const stats = {
		knowledge: all.knowledge.length,
		lessons: all.lessons.length,
		preferences: all.preferences.length,
		facets: all.facets.length,
		episodes: all.episodes.length,
		work: all.work.length,
		totalSessions: all.meta.totalSessions,
		aggregateToolCount,
		aggregateFileCount,
	};

	let atAGlance = fallbackAtAGlance(patterns, struggles, topLessons, reportLocale);
	let projectAreaDescriptions: string[] = projectAreas.map((a) => a.description);
	let wins = fallbackWins(struggles, topLessons);
	let frictions = fallbackFrictions(struggles);
	let recommendations = fallbackRecommendations(patterns, struggles, topLessons, reportLocale);
	let { featuresToTry, usagePatterns } = fallbackFeaturesAndPatterns(
		toolsChart.rows,
		struggles,
		reportLocale,
	);

	if (llmFn) {
		try {
			const payload = await generateParallelFullInsightSections(
				{
					locale: reportLocale,
					outputLanguage: reportLanguage.name,
					stats,
					patterns,
					struggles,
					lessons: topLessons,
					projectAreas,
					topTools: toolsChart.rows,
					topLanguages: langChart.rows,
					topErrors: errChart.rows,
				},
				llmFn,
			);
			if (payload.atAGlance) atAGlance = payload.atAGlance;
			if (Array.isArray(payload.projectAreaDescriptions) && payload.projectAreaDescriptions.length >= projectAreas.length) {
				projectAreaDescriptions = payload.projectAreaDescriptions.slice(0, projectAreas.length);
			}
			if (Array.isArray(payload.wins) && payload.wins.length > 0) wins = payload.wins.slice(0, 8);
			if (Array.isArray(payload.frictions) && payload.frictions.length > 0) frictions = payload.frictions.slice(0, 8);
			if (Array.isArray(payload.recommendations) && payload.recommendations.length > 0) recommendations = payload.recommendations.slice(0, 5);
			if (Array.isArray(payload.featuresToTry) && payload.featuresToTry.length > 0) featuresToTry = payload.featuresToTry.slice(0, 6);
			if (Array.isArray(payload.usagePatterns) && payload.usagePatterns.length > 0) usagePatterns = payload.usagePatterns.slice(0, 6);
		} catch {
			// keep fallbacks
		}
	}

	const projectAreasWithDesc: FullInsightsProjectArea[] = projectAreas.map((a, i) => ({
		...a,
		description: projectAreaDescriptions[i] ?? a.description,
	}));

	return {
		stats,
		atAGlance,
		projectAreas: projectAreasWithDesc,
		charts,
		wins,
		frictions,
		patterns,
		recommendations,
		featuresToTry,
		usagePatterns,
		generatedAt: new Date().toISOString(),
		locale: reportLocale,
	};
}
