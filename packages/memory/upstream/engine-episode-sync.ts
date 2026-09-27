/**
 * [WHO]: Provides makeEpisodeMemoryId, mapEpisodeToV2, syncEpisodeToV2
 * [FROM]: Depends on ./store-v2.js for V2 I/O; ./procedural-v2.js for compileProcedureFromEpisode; ./scoring.js for extractTags; ./types.js, ./types-v2.js; ./engine-scoring-v2.js for currentStructuralAnchor
 * [TO]: Consumed by engine.ts (saveEpisode, runStartupMaintenance)
 * [HERE]: packages/mem-core/src/engine-episode-sync.ts - episode-to-V2 sync and mapping
 */

import { currentStructuralAnchor } from "./engine-scoring-v2.js";
import { compileProcedureFromEpisode } from "./procedural-v2.js";
import { extractTags } from "./scoring.js";
import {
	getV2Paths,
	loadV2Episodes,
	loadV2Facets,
	loadV2Links,
	loadV2Meta,
	loadV2Procedural,
	saveV2Episodes,
	saveV2Facets,
	saveV2Links,
	saveV2Meta,
	saveV2Procedural,
	type NanoMemV2Paths,
} from "./store-v2.js";
import type { Episode } from "./types.js";
import type { EpisodeFacet, EpisodeMemory, FacetKind, MemoryLink } from "./types-v2.js";

export function makeEpisodeMemoryId(ep: Episode): string {
	return `episode:${ep.sessionId}`;
}

export function mapEpisodeToV2(
	ep: Episode,
	now: string,
): {
	episode: EpisodeMemory;
	facets: EpisodeFacet[];
	links: MemoryLink[];
} {
	const episodeId = makeEpisodeMemoryId(ep);
	const baseTags = [...new Set([...(ep.tags ?? []), ...extractTags(`${ep.project} ${ep.summary} ${ep.userGoal ?? ""}`)])];
	const facetDefs: Array<{
		facetType: FacetKind;
		searchText: string;
		anchorText?: string;
		summary?: string;
		detail?: string;
		outcomeScore?: number;
		causalRole?: EpisodeFacet["causalRole"];
	}> = [];

	if (ep.userGoal?.trim()) {
		facetDefs.push({
			facetType: "goal",
			searchText: ep.userGoal.trim(),
			anchorText: ep.summary,
			summary: `Goal: ${ep.userGoal.trim()}`,
		});
	}

	for (const error of ep.errors.slice(0, 8)) {
		if (!error.trim()) continue;
		facetDefs.push({
			facetType: "error",
			searchText: error.trim(),
			anchorText: ep.summary,
			summary: `Error: ${error.trim()}`,
			causalRole: "signal",
			outcomeScore: Math.max(1, 6 - ep.errors.length),
		});
	}

	for (const observation of ep.keyObservations.slice(0, 8)) {
		if (!observation.trim()) continue;
		facetDefs.push({
			facetType: "insight",
			searchText: observation.trim(),
			anchorText: ep.summary,
			summary: `Insight: ${observation.trim()}`,
			causalRole: "resolution",
			outcomeScore: Math.min(10, ep.importance),
		});
	}

	if (ep.summary.trim()) {
		facetDefs.push({
			facetType: "outcome",
			searchText: ep.summary.trim().slice(0, 200),
			anchorText: ep.summary.trim(),
			summary: ep.summary.trim(),
			detail: [ep.userGoal ? `Goal: ${ep.userGoal}` : "", ep.errors.length ? `Errors: ${ep.errors.join("; ")}` : ""]
				.filter(Boolean)
				.join("\n"),
			causalRole: ep.errors.length > 0 ? "effect" : "signal",
			outcomeScore: ep.errors.length > 0 ? Math.max(3, ep.importance - 1) : ep.importance,
		});
	}

	const facets: EpisodeFacet[] = facetDefs.map((facet, index) => {
		const facetId = `${episodeId}:facet:${index + 1}`;
		const facetTags = [
			...new Set([
				...baseTags,
				facet.facetType,
				...extractTags(`${facet.searchText} ${facet.summary ?? ""} ${facet.anchorText ?? ""}`),
			]),
		].slice(0, 40);
		return {
			id: facetId,
			kind: "facet" as const,
			episodeId,
			facetType: facet.facetType,
			searchText: facet.searchText,
			anchorText: facet.anchorText,
			summary: facet.summary,
			detail: facet.detail,
			accessCount: 0,
			importance: Math.max(1, Math.min(10, ep.importance)),
			salience: Math.max(1, Math.min(10, facet.outcomeScore ?? ep.importance)),
			confidence: 0.7,
			retention: ep.importance >= 8 ? ("key-event" as const) : ("ambient" as const),
			stability: ep.errors.length > 0 ? ("situational" as const) : ("stable" as const),
			tags: facetTags,
			sourceEpisodeIds: [episodeId],
			evidence: [],
			scope: { ...ep.scope, project: ep.project },
			createdAt: ep.startedAt ?? `${ep.date}T00:00:00.000Z`,
			updatedAt: now,
			entityRefs: [],
			aliases: [],
			causalRole: facet.causalRole,
			outcomeScore: facet.outcomeScore,
			structuralAnchor: currentStructuralAnchor(),
		};
	});

	const links = facets.map((facet) => ({
		id: `${episodeId}->${facet.id}`,
		fromId: episodeId,
		toId: facet.id,
		type: "has-facet" as const,
		weight: 1,
		explicit: true,
		createdAt: now,
		updatedAt: now,
		evidence: [],
	}));

	const episode: EpisodeMemory = {
		id: episodeId,
		kind: "episode",
		sessionId: ep.sessionId,
		title: ep.userGoal || ep.summary.slice(0, 80),
		summary: ep.summary,
		startedAt: ep.startedAt,
		endedAt: ep.endedAt,
		timeZone: ep.timeZone,
		userGoal: ep.userGoal,
		outcome: ep.errors.length ? "high-friction" : "completed",
		accessCount: 0,
		importance: Math.max(1, Math.min(10, ep.importance)),
		salience: Math.max(1, Math.min(10, ep.importance + Math.min(ep.errors.length, 2))),
		confidence: 0.85,
		retention: ep.importance >= 8 ? ("key-event" as const) : ("ambient" as const),
		stability: ep.errors.length > 0 ? ("situational" as const) : ("stable" as const),
		tags: baseTags.slice(0, 40),
		sourceEpisodeIds: [episodeId],
		evidence: [],
		scope: { ...ep.scope, project: ep.project },
		createdAt: ep.startedAt ?? `${ep.date}T00:00:00.000Z`,
		updatedAt: now,
		filesModified: ep.filesModified,
		toolsUsed: ep.toolsUsed,
		entities: [],
		facetIds: facets.map((facet) => facet.id),
		derivedSemanticIds: [],
		derivedProcedureIds: [],
		consolidatedAt: ep.consolidated ? now : undefined,
		structuralAnchor: currentStructuralAnchor(),
	};

	return { episode, facets, links };
}

export async function syncEpisodeToV2(
	ep: Episode,
	v2Paths: NanoMemV2Paths,
): Promise<{ needsEmbeddingSync: boolean }> {
	const [episodes, facets, links, procedural, meta] = await Promise.all([
		loadV2Episodes(v2Paths),
		loadV2Facets(v2Paths),
		loadV2Links(v2Paths),
		loadV2Procedural(v2Paths),
		loadV2Meta(v2Paths),
	]);

	const now = new Date().toISOString();
	const episodeId = makeEpisodeMemoryId(ep);
	const mapped = mapEpisodeToV2(ep, now);
	const nextEpisodes = episodes.filter((existing) => existing.id !== episodeId);
	nextEpisodes.push(mapped.episode);

	const nextFacets = facets.filter((facet) => facet.episodeId !== episodeId);
	nextFacets.push(...mapped.facets);

	const facetIds = new Set(mapped.facets.map((facet) => facet.id));
	const nextLinks = links.filter(
		(link) =>
			link.fromId !== episodeId &&
			link.toId !== episodeId &&
			!facetIds.has(link.fromId) &&
			!facetIds.has(link.toId),
	);
	nextLinks.push(...mapped.links);

	const nextProcedural = procedural.filter((item) => !item.sourceEpisodeIds?.includes(episodeId));
	const compiledProcedure = compileProcedureFromEpisode(mapped.episode, mapped.facets, now);
	if (compiledProcedure) {
		nextProcedural.push(compiledProcedure);
		mapped.episode.derivedProcedureIds = [compiledProcedure.id];
		nextEpisodes[nextEpisodes.length - 1] = mapped.episode;
	}

	await Promise.all([
		saveV2Episodes(v2Paths, nextEpisodes),
		saveV2Facets(v2Paths, nextFacets),
		saveV2Links(v2Paths, nextLinks),
		saveV2Procedural(v2Paths, nextProcedural),
		saveV2Meta(v2Paths, {
			...meta,
			version: 2,
			lastMigrationAt: meta.lastMigrationAt ?? now,
		}),
	]);

	return { needsEmbeddingSync: true };
}
