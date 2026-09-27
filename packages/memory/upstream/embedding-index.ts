/**
 * [WHO]: loadEmbeddingIndex, saveEmbeddingIndex, syncEmbeddingIndex, queryEmbeddingIndex, cosineSimilarity
 * [FROM]: Depends on node:path, node:crypto, ./store.js, ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/extension.ts
 * [HERE]: packages/mem-core/src/embedding-index.ts - lightweight JSON embedding index for NanoMem v2 semantic recall
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { readJson, writeJson } from "./store.js";
import type { EmbeddingFn, EmbeddingIndexRecord } from "./types-v2.js";

export interface EmbeddingSourceItem {
	memoryId: string;
	memoryKind: "episode" | "facet" | "semantic" | "procedural";
	text: string;
}

export interface EmbeddingIndexFile {
	model: string;
	updatedAt: string;
	records: EmbeddingIndexRecord[];
}

export function getEmbeddingIndexPath(memoryDir: string): string {
	return join(memoryDir, "v2", "embeddings.json");
}

export async function loadEmbeddingIndex(memoryDir: string): Promise<EmbeddingIndexFile> {
	return readJson<EmbeddingIndexFile>(getEmbeddingIndexPath(memoryDir), {
		model: "unknown",
		updatedAt: "",
		records: [],
	});
}

export async function saveEmbeddingIndex(memoryDir: string, index: EmbeddingIndexFile): Promise<void> {
	await writeJson(getEmbeddingIndexPath(memoryDir), index);
}

export function checksumText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (!a.length || !b.length || a.length !== b.length) return 0;
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		magA += a[i]! * a[i]!;
		magB += b[i]! * b[i]!;
	}
	if (!magA || !magB) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function syncEmbeddingIndex(
	memoryDir: string,
	model: string,
	items: EmbeddingSourceItem[],
	embedFn: EmbeddingFn,
): Promise<EmbeddingIndexFile> {
	const current = await loadEmbeddingIndex(memoryDir);
	const byKey = new Map(current.records.map((record) => [`${record.memoryKind}:${record.memoryId}`, record]));
	const nextRecords: EmbeddingIndexRecord[] = [];
	const toEmbed: EmbeddingSourceItem[] = [];

	for (const item of items) {
		const text = item.text.trim();
		if (!text) continue;
		const checksum = checksumText(text);
		const key = `${item.memoryKind}:${item.memoryId}`;
		const existing = byKey.get(key);
		if (existing && existing.checksum === checksum && existing.model === model) {
			nextRecords.push(existing);
			continue;
		}
		toEmbed.push({ ...item, text });
	}

	if (toEmbed.length) {
		const vectors = await embedFn(toEmbed.map((item) => item.text));
		const now = new Date().toISOString();
		for (let i = 0; i < toEmbed.length; i++) {
			const item = toEmbed[i]!;
			const vector = vectors[i] ?? [];
			nextRecords.push({
				id: `${item.memoryKind}:${item.memoryId}`,
				memoryId: item.memoryId,
				memoryKind: item.memoryKind,
				model,
				dim: vector.length,
				checksum: checksumText(item.text),
				text: item.text,
				vector,
				updatedAt: now,
			});
		}
	}

	const itemKeys = new Set(items.map((item) => `${item.memoryKind}:${item.memoryId}`));
	for (const record of current.records) {
		const key = `${record.memoryKind}:${record.memoryId}`;
		if (!itemKeys.has(key)) continue;
		if (nextRecords.some((candidate) => candidate.id === record.id)) continue;
		nextRecords.push(record);
	}

	const index: EmbeddingIndexFile = {
		model,
		updatedAt: new Date().toISOString(),
		records: nextRecords.sort((a, b) => a.id.localeCompare(b.id)),
	};
	await saveEmbeddingIndex(memoryDir, index);
	return index;
}

export async function queryEmbeddingIndex(
	memoryDir: string,
	model: string,
	queryText: string,
	embedFn: EmbeddingFn,
	topK = 8,
): Promise<Array<EmbeddingIndexRecord & { score: number }>> {
	const index = await loadEmbeddingIndex(memoryDir);
	if (!index.records.length) return [];
	const compatible = index.records.filter((record) => record.model === model);
	if (!compatible.length) return [];
	const [queryVector] = await embedFn([queryText]);
	if (!queryVector?.length) return [];
	return compatible
		.map((record) => ({ ...record, score: cosineSimilarity(queryVector, record.vector) }))
		.filter((record) => record.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}
