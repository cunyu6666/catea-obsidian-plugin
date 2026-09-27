/**
 * [WHO]: V2_PATHS, loadV2*, saveV2*, appendV2Episode, appendV2Facet
 * [FROM]: Depends on node:path, ./store.js, ./types.js, ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/store-v2.ts - persistence layer for NanoMem v2 layered memory (episode/facet/semantic/procedural/state/link stores)
 */

import { join } from "node:path";
import { readJson, writeJson } from "./store.js";
import type {
	EpisodeFacet,
	EpisodeMemory,
	MemoryLink,
	NanoMemV2Snapshot,
	ProceduralMemory,
	SemanticMemory,
	StateMemory,
	V2Meta,
} from "./types-v2.js";

export interface NanoMemV2Paths {
	rootDir: string;
	episodesPath: string;
	facetsPath: string;
	semanticPath: string;
	proceduralPath: string;
	statePath: string;
	linksPath: string;
	metaPath: string;
}

const DEFAULT_V2_META: V2Meta = {
	version: 2,
};

export function getV2Paths(memoryDir: string): NanoMemV2Paths {
	const rootDir = join(memoryDir, "v2");
	return {
		rootDir,
		episodesPath: join(rootDir, "episodes.json"),
		facetsPath: join(rootDir, "facets.json"),
		semanticPath: join(rootDir, "semantic.json"),
		proceduralPath: join(rootDir, "procedural.json"),
		statePath: join(rootDir, "state.json"),
		linksPath: join(rootDir, "links.json"),
		metaPath: join(rootDir, "meta.json"),
	};
}

export async function loadV2Episodes(paths: NanoMemV2Paths): Promise<EpisodeMemory[]> {
	return readJson<EpisodeMemory[]>(paths.episodesPath, []);
}

export async function saveV2Episodes(paths: NanoMemV2Paths, episodes: EpisodeMemory[]): Promise<void> {
	await writeJson(paths.episodesPath, episodes);
}

export async function loadV2Facets(paths: NanoMemV2Paths): Promise<EpisodeFacet[]> {
	return readJson<EpisodeFacet[]>(paths.facetsPath, []);
}

export async function saveV2Facets(paths: NanoMemV2Paths, facets: EpisodeFacet[]): Promise<void> {
	await writeJson(paths.facetsPath, facets);
}

export async function loadV2Semantic(paths: NanoMemV2Paths): Promise<SemanticMemory[]> {
	return readJson<SemanticMemory[]>(paths.semanticPath, []);
}

export async function saveV2Semantic(paths: NanoMemV2Paths, semantic: SemanticMemory[]): Promise<void> {
	await writeJson(paths.semanticPath, semantic);
}

export async function loadV2Procedural(paths: NanoMemV2Paths): Promise<ProceduralMemory[]> {
	return readJson<ProceduralMemory[]>(paths.proceduralPath, []);
}

export async function saveV2Procedural(paths: NanoMemV2Paths, procedural: ProceduralMemory[]): Promise<void> {
	await writeJson(paths.proceduralPath, procedural);
}

export async function loadV2State(paths: NanoMemV2Paths): Promise<StateMemory[]> {
	return readJson<StateMemory[]>(paths.statePath, []);
}

export async function saveV2State(paths: NanoMemV2Paths, state: StateMemory[]): Promise<void> {
	await writeJson(paths.statePath, state);
}

export async function loadV2Links(paths: NanoMemV2Paths): Promise<MemoryLink[]> {
	return readJson<MemoryLink[]>(paths.linksPath, []);
}

export async function saveV2Links(paths: NanoMemV2Paths, links: MemoryLink[]): Promise<void> {
	await writeJson(paths.linksPath, links);
}

export async function loadV2Meta(paths: NanoMemV2Paths): Promise<V2Meta> {
	return readJson<V2Meta>(paths.metaPath, DEFAULT_V2_META);
}

export async function saveV2Meta(paths: NanoMemV2Paths, meta: V2Meta): Promise<void> {
	await writeJson(paths.metaPath, meta);
}

export async function loadV2Snapshot(paths: NanoMemV2Paths): Promise<NanoMemV2Snapshot> {
	const [episodes, facets, semantic, procedural, state, links, meta] = await Promise.all([
		loadV2Episodes(paths),
		loadV2Facets(paths),
		loadV2Semantic(paths),
		loadV2Procedural(paths),
		loadV2State(paths),
		loadV2Links(paths),
		loadV2Meta(paths),
	]);

	return {
		episodes,
		facets,
		semantic,
		procedural,
		state,
		links,
		meta,
	};
}

export async function saveV2Snapshot(paths: NanoMemV2Paths, snapshot: NanoMemV2Snapshot): Promise<void> {
	await Promise.all([
		saveV2Episodes(paths, snapshot.episodes),
		saveV2Facets(paths, snapshot.facets),
		saveV2Semantic(paths, snapshot.semantic),
		saveV2Procedural(paths, snapshot.procedural),
		saveV2State(paths, snapshot.state),
		saveV2Links(paths, snapshot.links),
		saveV2Meta(paths, snapshot.meta),
	]);
}
