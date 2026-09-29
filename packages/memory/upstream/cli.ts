#!/usr/bin/env node
import { format } from "node:util";
import { readLegacyContent } from "./compat.js";
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
		writeOutput(`nanomem — NanoMem memory CLI

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
		writeOutput(`Sessions: ${s.totalSessions}`);
		writeOutput(`Knowledge: ${s.knowledge}`);
		writeOutput(`Lessons: ${s.lessons}`);
		writeOutput(`Preferences: ${s.preferences}`);
		writeOutput(`Work: ${s.work}`);
		writeOutput(`Archived Knowledge: ${s.archivedKnowledge}`);
		writeOutput(`Archived Lessons: ${s.archivedLessons}`);
		writeOutput(`Archived Events: ${s.archivedEvents}`);
		writeOutput(`Archived Preferences: ${s.archivedPreferences}`);
		writeOutput(`Archived Facets: ${s.archivedFacets}`);
		writeOutput(`Archived Work: ${s.archivedWork}`);
		writeOutput(`Episodes: ${s.episodes}`);
		writeOutput(`V2 Episodes: ${v2.episodes}`);
		writeOutput(`V2 Episode Facets: ${v2.facets}`);
		writeOutput(`V2 Semantic: ${v2.semantic}`);
		writeOutput(`V2 Procedures: ${v2.procedural}`);
		writeOutput(`Archived V2 Semantic: ${v2.archivedSemantic}`);
		writeOutput(`Archived V2 Procedures: ${v2.archivedProcedural}`);
		writeOutput(`V2 Links: ${v2.links}`);
		writeOutput(`V2 Embeddings: ${v2.embeddings}`);
		if (v2.lastEmbeddingSyncAt) writeOutput(`V2 Last Embedding Sync: ${v2.lastEmbeddingSyncAt}`);
		if (v2.lastReconsolidationAt) writeOutput(`V2 Last Reconsolidation: ${v2.lastReconsolidationAt}`);
		return;
	}

	if (sub === "search") {
		const query = args.slice(1).join(" ").trim() || " ";
		const results = await engine.searchEntries(query);
		if (!results.length) {
			writeOutput("No matching memories.");
			return;
		}
		for (const e of results) {
			writeOutput(`[${e.type}] ${e.id} — ${(e.summary || e.detail || readLegacyContent(e) || "").slice(0, 100)}`);
		}
		return;
	}

	if (sub === "search-v2") {
		const query = args.slice(1).join(" ").trim();
		if (!query) {
			writeError("Usage: nanomem search-v2 <query>");
			process.exit(1);
		}
		const results = await engine.searchV2Memories(query);
		if (!results.length) {
			writeOutput("No matching V2 memories.");
			return;
		}
		for (const item of results) {
			writeOutput(`[${item.kind}] ${item.id} (${item.score.toFixed(3)}) — ${item.title}: ${item.summary.slice(0, 120)}`);
		}
		return;
	}

	if (sub === "forget") {
		const id = args[1];
		if (!id) {
			writeError("Usage: nanomem forget <id>");
			process.exit(1);
		}
		const ok = await engine.forgetEntry(id);
		writeOutput(ok ? `Removed entry ${id}` : `Entry ${id} not found`);
		return;
	}

	if (sub === "dedup") {
		const result = await engine.deduplicateAll();
		if (result.total === 0) {
			writeOutput("No duplicates found. Memory is already deduplicated.");
		} else {
			writeOutput(`Deduplication complete. Removed ${result.total} duplicate(s):`);
			if (result.knowledge) writeOutput(`  knowledge: ${result.knowledge}`);
			if (result.lessons) writeOutput(`  lessons: ${result.lessons}`);
			if (result.preferences) writeOutput(`  preferences: ${result.preferences}`);
			if (result.facets) writeOutput(`  facets: ${result.facets}`);
			if (result.work) writeOutput(`  work: ${result.work}`);
		}
		return;
	}

	if (sub === "archive") {
		const result = await engine.archiveStaleMemories();
		if (result.total === 0) {
			writeOutput("No stale memories were archived.");
			return;
		}
		writeOutput(`Archived ${result.total} stale memory item(s):`);
		if (result.knowledge) writeOutput(`  knowledge: ${result.knowledge}`);
		if (result.lessons) writeOutput(`  lessons: ${result.lessons}`);
		if (result.events) writeOutput(`  events: ${result.events}`);
		if (result.preferences) writeOutput(`  preferences: ${result.preferences}`);
		if (result.facets) writeOutput(`  facets: ${result.facets}`);
		if (result.work) writeOutput(`  work: ${result.work}`);
		if (result.semantic) writeOutput(`  semantic: ${result.semantic}`);
		if (result.procedural) writeOutput(`  procedural: ${result.procedural}`);
		return;
	}

	if (sub === "restore") {
		const id = args[1];
		if (!id) {
			writeError("Usage: nanomem restore <id>");
			process.exit(1);
		}
		const result = await engine.restoreArchivedEntry(id);
		writeOutput(result.ok ? `Restored archived ${result.location} entry ${id}` : `Archived entry ${id} not found`);
		return;
	}

	if (sub === "export") {
		const data = await engine.exportAll();
		writeOutput(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "export-archive") {
		const data = await engine.exportArchive();
		writeOutput(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "export-v2") {
		const data = await engine.exportAllV2();
		writeOutput(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "inspect-v2") {
		const data = await engine.inspectV2Memory();
		writeOutput(`Episodes: ${data.counts.episodes}`);
		writeOutput(`Facets: ${data.counts.facets}`);
		writeOutput(`Semantic: ${data.counts.semantic}`);
		writeOutput(`Procedural: ${data.counts.procedural}`);
		writeOutput(`Active Procedural: ${data.counts.activeProcedural}`);
		writeOutput(`Superseded Procedural: ${data.counts.supersededProcedural}`);
		writeOutput(`Procedure Chains: ${data.counts.procedureChains}`);
		writeOutput(`Procedural Conflicts: ${data.counts.proceduralConflicts}`);
		writeOutput(`Semantic Conflicts: ${data.counts.semanticConflicts}`);

		if (data.procedureChains.length) {
			writeOutput("\nProcedure Version Chains:");
			for (const chain of data.procedureChains) {
				writeOutput(`- ${chain.name} [${chain.status}] depth=${chain.versionDepth} root=${chain.rootId}`);
				writeOutput(`  ${chain.ids.join(" -> ")}`);
			}
		}

		if (data.proceduralConflicts.length) {
			writeOutput("\nProcedural Conflict Signals:");
			for (const conflict of data.proceduralConflicts.slice(0, 20)) {
				writeOutput(
					`- ${conflict.aName} (${conflict.aId}) <-> ${conflict.bName} (${conflict.bId}) score=${conflict.score} — ${conflict.reason}`,
				);
			}
		}

		if (data.semanticConflicts.length) {
			writeOutput("\nSemantic Conflict Signals:");
			for (const conflict of data.semanticConflicts.slice(0, 20)) {
				writeOutput(`- ${conflict.aName} (${conflict.aId}) <-> ${conflict.bName} (${conflict.bId}) — ${conflict.reason}`);
			}
		}
		return;
	}

	if (sub === "sync-v2-embeddings") {
		const count = await engine.syncV2Embeddings();
		if (count === 0) {
			writeOutput("No embeddings synced. Embeddings are currently disabled.");
			return;
		}
		writeOutput(`Synced V2 embeddings for ${count} items.`);
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
		writeOutput(`Insights report written to: ${outputPath}`);
		return;
	}

	writeError(`Unknown command: ${sub}. Run 'nanomem help' for usage.`);
	process.exit(1);
}

main().catch((err) => {
	writeError(err);
	process.exit(1);
});

// CLI output is part of the command interface, not plugin console diagnostics.
function writeOutput(...values: unknown[]): void { process.stdout.write(format(...values) + "\n"); }
function writeError(...values: unknown[]): void { process.stderr.write(format(...values) + "\n"); }
