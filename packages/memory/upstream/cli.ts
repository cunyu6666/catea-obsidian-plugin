#!/usr/bin/env node
/**
 * [WHO]: NanoMem CLI - stats, search, forget, export, insights commands
 * [FROM]: Depends on node:fs, engine, insights
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/cli.ts - NanoMem standalone CLI
 */

import { writeFileSync } from "node:fs";
import { NanoMemEngine } from "./engine.js";
import { renderFullInsightsHtml } from "./full-insights-html.js";
import { renderInsightsHtml } from "./insights-html.js";

const args = process.argv.slice(2);
const sub = args[0];
const engine = new NanoMemEngine();

async function main(): Promise<void> {
	if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
		console.log(`nanomem — NanoMem memory CLI

Usage:
  nanomem stats              Show memory counts (sessions, knowledge, lessons, preferences, work, episodes, facets)
  nanomem search <query>     Search memories by query text
  nanomem search-v2 <query>  Semantic search across V2 episode/facet/procedure memory
  nanomem forget <id>        Remove a memory entry by ID
  nanomem dedup              Deduplicate all memories (merge similar entries, keep best)
  nanomem archive            Archive stale low-value memories into _archive/
  nanomem restore <id>       Restore one archived memory item by ID
  nanomem export             Export all memories as JSON to stdout
  nanomem export-v2          Export NanoMem v2 episodic bridge data as JSON to stdout
  nanomem export-archive     Export archived memories as JSON to stdout
  nanomem inspect-v2         Inspect V2 memory chains and conflict signals
  nanomem sync-v2-embeddings Sync the V2 embedding index
  nanomem insights [--output <path>]   Generate full HTML insights report (default: ./nanomem-insights.html)
  nanomem insights --simple [--output <path>]   Generate simple insights report (rules-only, no LLM)
  nanomem help               Show this help
`);
		return;
	}

	if (sub === "stats") {
		const [s, v2] = await Promise.all([engine.getStats(), engine.getV2Stats()]);
		console.log(`Sessions: ${s.totalSessions}`);
		console.log(`Knowledge: ${s.knowledge}`);
		console.log(`Lessons: ${s.lessons}`);
		console.log(`Preferences: ${s.preferences}`);
		console.log(`Work: ${s.work}`);
		console.log(`Archived Knowledge: ${s.archivedKnowledge}`);
		console.log(`Archived Lessons: ${s.archivedLessons}`);
		console.log(`Archived Events: ${s.archivedEvents}`);
		console.log(`Archived Preferences: ${s.archivedPreferences}`);
		console.log(`Archived Facets: ${s.archivedFacets}`);
		console.log(`Archived Work: ${s.archivedWork}`);
		console.log(`Episodes: ${s.episodes}`);
		console.log(`V2 Episodes: ${v2.episodes}`);
		console.log(`V2 Episode Facets: ${v2.facets}`);
		console.log(`V2 Semantic: ${v2.semantic}`);
		console.log(`V2 Procedures: ${v2.procedural}`);
		console.log(`Archived V2 Semantic: ${v2.archivedSemantic}`);
		console.log(`Archived V2 Procedures: ${v2.archivedProcedural}`);
		console.log(`V2 Links: ${v2.links}`);
		console.log(`V2 Embeddings: ${v2.embeddings}`);
		if (v2.lastEmbeddingSyncAt) console.log(`V2 Last Embedding Sync: ${v2.lastEmbeddingSyncAt}`);
		if (v2.lastReconsolidationAt) console.log(`V2 Last Reconsolidation: ${v2.lastReconsolidationAt}`);
		return;
	}

	if (sub === "search") {
		const query = args.slice(1).join(" ").trim() || " ";
		const results = await engine.searchEntries(query);
		if (!results.length) {
			console.log("No matching memories.");
			return;
		}
		for (const e of results) {
			console.log(`[${e.type}] ${e.id} — ${(e.summary || e.detail || e.content || "").slice(0, 100)}`);
		}
		return;
	}

	if (sub === "search-v2") {
		const query = args.slice(1).join(" ").trim();
		if (!query) {
			console.error("Usage: nanomem search-v2 <query>");
			process.exit(1);
		}
		const results = await engine.searchV2Memories(query);
		if (!results.length) {
			console.log("No matching V2 memories.");
			return;
		}
		for (const item of results) {
			console.log(`[${item.kind}] ${item.id} (${item.score.toFixed(3)}) — ${item.title}: ${item.summary.slice(0, 120)}`);
		}
		return;
	}

	if (sub === "forget") {
		const id = args[1];
		if (!id) {
			console.error("Usage: nanomem forget <id>");
			process.exit(1);
		}
		const ok = await engine.forgetEntry(id);
		console.log(ok ? `Removed entry ${id}` : `Entry ${id} not found`);
		return;
	}

	if (sub === "dedup") {
		const result = await engine.deduplicateAll();
		if (result.total === 0) {
			console.log("No duplicates found. Memory is already deduplicated.");
		} else {
			console.log(`Deduplication complete. Removed ${result.total} duplicate(s):`);
			if (result.knowledge) console.log(`  knowledge: ${result.knowledge}`);
			if (result.lessons) console.log(`  lessons: ${result.lessons}`);
			if (result.preferences) console.log(`  preferences: ${result.preferences}`);
			if (result.facets) console.log(`  facets: ${result.facets}`);
			if (result.work) console.log(`  work: ${result.work}`);
		}
		return;
	}

	if (sub === "archive") {
		const result = await engine.archiveStaleMemories();
		if (result.total === 0) {
			console.log("No stale memories were archived.");
			return;
		}
		console.log(`Archived ${result.total} stale memory item(s):`);
		if (result.knowledge) console.log(`  knowledge: ${result.knowledge}`);
		if (result.lessons) console.log(`  lessons: ${result.lessons}`);
		if (result.events) console.log(`  events: ${result.events}`);
		if (result.preferences) console.log(`  preferences: ${result.preferences}`);
		if (result.facets) console.log(`  facets: ${result.facets}`);
		if (result.work) console.log(`  work: ${result.work}`);
		if (result.semantic) console.log(`  semantic: ${result.semantic}`);
		if (result.procedural) console.log(`  procedural: ${result.procedural}`);
		return;
	}

	if (sub === "restore") {
		const id = args[1];
		if (!id) {
			console.error("Usage: nanomem restore <id>");
			process.exit(1);
		}
		const result = await engine.restoreArchivedEntry(id);
		console.log(result.ok ? `Restored archived ${result.location} entry ${id}` : `Archived entry ${id} not found`);
		return;
	}

	if (sub === "export") {
		const data = await engine.exportAll();
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "export-archive") {
		const data = await engine.exportArchive();
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "export-v2") {
		const data = await engine.exportAllV2();
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "inspect-v2") {
		const data = await engine.inspectV2Memory();
		console.log(`Episodes: ${data.counts.episodes}`);
		console.log(`Facets: ${data.counts.facets}`);
		console.log(`Semantic: ${data.counts.semantic}`);
		console.log(`Procedural: ${data.counts.procedural}`);
		console.log(`Active Procedural: ${data.counts.activeProcedural}`);
		console.log(`Superseded Procedural: ${data.counts.supersededProcedural}`);
		console.log(`Procedure Chains: ${data.counts.procedureChains}`);
		console.log(`Procedural Conflicts: ${data.counts.proceduralConflicts}`);
		console.log(`Semantic Conflicts: ${data.counts.semanticConflicts}`);

		if (data.procedureChains.length) {
			console.log("\nProcedure Version Chains:");
			for (const chain of data.procedureChains) {
				console.log(`- ${chain.name} [${chain.status}] depth=${chain.versionDepth} root=${chain.rootId}`);
				console.log(`  ${chain.ids.join(" -> ")}`);
			}
		}

		if (data.proceduralConflicts.length) {
			console.log("\nProcedural Conflict Signals:");
			for (const conflict of data.proceduralConflicts.slice(0, 20)) {
				console.log(
					`- ${conflict.aName} (${conflict.aId}) <-> ${conflict.bName} (${conflict.bId}) score=${conflict.score} — ${conflict.reason}`,
				);
			}
		}

		if (data.semanticConflicts.length) {
			console.log("\nSemantic Conflict Signals:");
			for (const conflict of data.semanticConflicts.slice(0, 20)) {
				console.log(`- ${conflict.aName} (${conflict.aId}) <-> ${conflict.bName} (${conflict.bId}) — ${conflict.reason}`);
			}
		}
		return;
	}

	if (sub === "sync-v2-embeddings") {
		const count = await engine.syncV2Embeddings();
		if (count === 0) {
			console.log("No embeddings synced. Embeddings are currently disabled.");
			return;
		}
		console.log(`Synced V2 embeddings for ${count} items.`);
		return;
	}

	if (sub === "insights") {
		const simple = args.includes("--simple");
		const outputIdx = args.indexOf("--output");
		const outputPath = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : "./nanomem-insights.html";

		if (simple) {
			const report = await engine.generateInsights();
			const html = renderInsightsHtml(report, engine.cfg.locale);
			writeFileSync(outputPath, html, "utf-8");
		} else {
			const enhanced = await engine.generateEnhancedInsights();
			const html = renderFullInsightsHtml(
				({
					...enhanced.report,
					persona: enhanced.persona,
					humanInsights: enhanced.humanInsights,
					rootCauses: enhanced.rootCauses,
				} as typeof enhanced.report & {
					persona?: typeof enhanced.persona;
					humanInsights: typeof enhanced.humanInsights;
					rootCauses: typeof enhanced.rootCauses;
				}),
				engine.cfg.locale,
			);
			writeFileSync(outputPath, html, "utf-8");
		}
		console.log(`Insights report written to: ${outputPath}`);
		return;
	}

	console.error(`Unknown command: ${sub}. Run 'nanomem help' for usage.`);
	process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
