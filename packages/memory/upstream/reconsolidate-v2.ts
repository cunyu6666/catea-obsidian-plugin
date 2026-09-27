/**
 * [WHO]: reconsolidateV2Memories
 * [FROM]: Depends on ./scoring.js, ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/reconsolidate-v2.ts - lightweight reconsolidation rules for NanoMem v2 memories
 */

import { extractTags, tagOverlap } from "./scoring.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory } from "./types-v2.js";

function mergeUnique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function textForProcedure(entry: ProceduralMemory): string {
	return [entry.name, entry.searchText, entry.summary, entry.contextText ?? "", entry.boundaries ?? ""]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function shouldMergeProcedures(a: ProceduralMemory, b: ProceduralMemory): boolean {
	if (a.id === b.id) return false;
	const tagScore = tagOverlap(a.tags, b.tags);
	if (tagScore >= 0.7) return true;
	const aText = textForProcedure(a);
	const bText = textForProcedure(b);
	return aText.includes(b.searchText.toLowerCase()) || bText.includes(a.searchText.toLowerCase());
}

export function reconsolidateV2Memories(
	episodes: EpisodeMemory[],
	facets: EpisodeFacet[],
	procedural: ProceduralMemory[],
	recalledEpisodeIds: string[],
	recalledFacetIds: string[],
	recalledProcedureIds: string[],
	now = new Date().toISOString(),
): {
	episodes: EpisodeMemory[];
	facets: EpisodeFacet[];
	procedural: ProceduralMemory[];
	changes: { promotedProcedures: number; mergedProcedures: number; stabilizedEpisodes: number; stabilizedFacets: number };
} {
	let promotedProcedures = 0;
	let mergedProcedures = 0;
	let stabilizedEpisodes = 0;
	let stabilizedFacets = 0;

	const recalledEpisodeSet = new Set(recalledEpisodeIds);
	const recalledFacetSet = new Set(recalledFacetIds);
	const recalledProcedureSet = new Set(recalledProcedureIds);

	for (const episode of episodes) {
		if (!recalledEpisodeSet.has(episode.id)) continue;
		episode.reconsolidatedAt = now;
		if (episode.accessCount >= 3 && episode.retention !== "key-event") {
			episode.retention = "key-event";
			stabilizedEpisodes++;
		}
		if (episode.accessCount >= 4 && episode.stability !== "stable") {
			episode.stability = "stable";
			stabilizedEpisodes++;
		}
		episode.tags = mergeUnique(extractTags(`${episode.title ?? ""} ${episode.summary} ${episode.userGoal ?? ""} ${episode.outcome ?? ""}`));
	}

	for (const facet of facets) {
		if (!recalledFacetSet.has(facet.id)) continue;
		if (facet.accessCount >= 3 && facet.retention !== "key-event") {
			facet.retention = "key-event";
			stabilizedFacets++;
		}
		if (facet.accessCount >= 4 && facet.stability !== "stable") {
			facet.stability = "stable";
			stabilizedFacets++;
		}
		facet.tags = mergeUnique(extractTags(`${facet.searchText} ${facet.summary ?? ""} ${facet.anchorText ?? ""}`));
	}

	const sortedProcedural = [...procedural].sort((a, b) => (b.accessCount ?? 0) - (a.accessCount ?? 0));
	const keptProcedural: ProceduralMemory[] = [];
	const supersededProcedural: ProceduralMemory[] = [];

	for (const procedure of sortedProcedural) {
		if (recalledProcedureSet.has(procedure.id) && procedure.status === "draft" && procedure.accessCount >= 2) {
			procedure.status = "active";
			procedure.version = Math.max(1, procedure.version);
			procedure.confidence = Math.max(procedure.confidence, 0.82);
			promotedProcedures++;
		}

		procedure.tags = mergeUnique(
			extractTags(
				`${procedure.name} ${procedure.searchText} ${procedure.summary} ${procedure.contextText ?? ""} ${procedure.steps.map((step) => step.text).join(" ")}`,
			),
		);

		const keeper = keptProcedural.find((candidate) => shouldMergeProcedures(candidate, procedure));
		if (!keeper) {
			keptProcedural.push(procedure);
			continue;
		}

		keeper.steps = mergeUnique([...keeper.steps.map((step) => step.text), ...procedure.steps.map((step) => step.text)]).map(
			(text, index) => ({
				id: `${keeper.id}:step:${index + 1}`,
				text,
				kind: keeper.steps[index]?.kind ?? procedure.steps[index]?.kind ?? "step",
			}),
		);
		keeper.tags = mergeUnique([...(keeper.tags ?? []), ...(procedure.tags ?? [])]);
		keeper.sourceEpisodeIds = mergeUnique([...(keeper.sourceEpisodeIds ?? []), ...(procedure.sourceEpisodeIds ?? [])]);
		keeper.sourceFacetIds = mergeUnique([...(keeper.sourceFacetIds ?? []), ...(procedure.sourceFacetIds ?? [])]);
		keeper.supersedesIds = mergeUnique([...(keeper.supersedesIds ?? []), procedure.id]);
		keeper.version = Math.max(keeper.version, procedure.version) + 1;
		keeper.updatedAt = now;
		keeper.confidence = Math.max(keeper.confidence, procedure.confidence);
		keeper.salience = Math.max(keeper.salience, procedure.salience);
		keeper.importance = Math.max(keeper.importance, procedure.importance);
		if (keeper.status === "draft" && procedure.status === "active") {
			keeper.status = "active";
		}

		supersededProcedural.push({
			...procedure,
			status: "superseded",
			supersededById: keeper.id,
			updatedAt: now,
		});
		mergedProcedures++;
	}

	return {
		episodes,
		facets,
		procedural: [...keptProcedural, ...supersededProcedural],
		changes: {
			promotedProcedures,
			mergedProcedures,
			stabilizedEpisodes,
			stabilizedFacets,
		},
	};
}
