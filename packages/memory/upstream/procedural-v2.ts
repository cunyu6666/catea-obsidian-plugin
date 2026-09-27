/**
 * [WHO]: compileProceduralFromEpisode, extractProceduresFromEpisodes
 * [FROM]: Depends on ./scoring.js, ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/procedural-v2.ts - procedural bridge, turns lived episodes into reusable how-to memory
 */

import { extractTags } from "./scoring.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory, ProceduralStep } from "./types-v2.js";

function normalizeLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function uniqueLines(lines: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const line of lines) {
		const normalized = normalizeLine(line ?? "");
		if (!normalized || seen.has(normalized.toLowerCase())) continue;
		seen.add(normalized.toLowerCase());
		result.push(normalized);
	}
	return result;
}

function makeProcedureId(episode: EpisodeMemory): string {
	return `procedure:${episode.sessionId}`;
}

function classifyProcedureStatus(episode: EpisodeMemory, hasErrors: boolean): ProceduralMemory["status"] {
	if (hasErrors) return "draft";
	if (episode.importance >= 7) return "active";
	return "draft";
}

export function compileProcedureFromEpisode(
	episode: EpisodeMemory,
	facets: EpisodeFacet[],
	now = new Date().toISOString(),
): ProceduralMemory | null {
	const goalFacet = facets.find((facet) => facet.facetType === "goal");
	const insightFacets = facets.filter((facet) => facet.facetType === "insight");
	const errorFacets = facets.filter((facet) => facet.facetType === "error");
	const outcomeFacet = facets.find((facet) => facet.facetType === "outcome");

	const goalText = normalizeLine(goalFacet?.searchText || episode.userGoal || "");
	const insightTexts = uniqueLines(insightFacets.map((facet) => facet.searchText));
	const errorTexts = uniqueLines(errorFacets.map((facet) => facet.searchText));
	const outcomeText = normalizeLine(outcomeFacet?.anchorText || episode.summary);

	const shouldCompile =
		Boolean(goalText && insightTexts.length > 0) ||
		Boolean(goalText && errorTexts.length > 0) ||
		Boolean(episode.importance >= 8 && outcomeText);

	if (!shouldCompile) return null;

	const name =
		goalText ||
		normalizeLine(outcomeText.split(/[.!?。！？\n]/)[0] || "") ||
		`Procedure from ${episode.sessionId.slice(0, 8)}`;
	const summary = uniqueLines([
		goalText ? `When working on ${goalText}` : undefined,
		insightTexts[0] ? `remember ${insightTexts[0]}` : undefined,
		errorTexts[0] ? `watch for ${errorTexts[0]}` : undefined,
	]).join("; ");

	const steps: ProceduralStep[] = [];
	let stepIndex = 0;

	if (goalText) {
		stepIndex += 1;
		steps.push({
			id: `${makeProcedureId(episode)}:step:${stepIndex}`,
			text: `Start from the concrete goal: ${goalText}`,
			kind: "precondition",
		});
	}

	for (const insight of insightTexts.slice(0, 4)) {
		stepIndex += 1;
		steps.push({
			id: `${makeProcedureId(episode)}:step:${stepIndex}`,
			text: insight,
			kind: "step",
		});
	}

	for (const error of errorTexts.slice(0, 3)) {
		stepIndex += 1;
		steps.push({
			id: `${makeProcedureId(episode)}:step:${stepIndex}`,
			text: `Validate against failure mode: ${error}`,
			kind: "warning",
		});
	}

	if (outcomeText) {
		stepIndex += 1;
		steps.push({
			id: `${makeProcedureId(episode)}:step:${stepIndex}`,
			text: `Use this success signal as the expected outcome: ${outcomeText}`,
			kind: "validation",
		});
	}

	if (steps.length === 0) return null;

	const tags = extractTags(`${episode.summary} ${goalText} ${insightTexts.join(" ")} ${errorTexts.join(" ")}`);

	return {
		id: makeProcedureId(episode),
		kind: "procedural",
		name,
		summary: summary || outcomeText || name,
		searchText: goalText || name,
		applicability: goalText || undefined,
		boundaries: errorTexts.length > 0 ? errorTexts.join("; ") : undefined,
		contextText: outcomeText || episode.summary,
		steps,
		status: classifyProcedureStatus(episode, errorTexts.length > 0),
		version: 1,
		sourceFacetIds: facets.map((facet) => facet.id),
		sourceSemanticIds: [],
		supersedesIds: [],
		supersededById: undefined,
		accessCount: 0,
		importance: Math.max(1, Math.min(10, episode.importance)),
		salience: Math.max(1, Math.min(10, episode.salience)),
		confidence: insightTexts.length > 0 ? 0.8 : 0.65,
		retention: episode.importance >= 8 ? "key-event" : "ambient",
		stability: errorTexts.length > 0 ? "situational" : "stable",
		tags,
		sourceEpisodeIds: [episode.id],
		evidence: episode.evidence ?? [],
		scope: episode.scope,
		createdAt: now,
		updatedAt: now,
		structuralAnchor: episode.structuralAnchor,
	};
}
