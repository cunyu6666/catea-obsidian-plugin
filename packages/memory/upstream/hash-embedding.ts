/**
 * [WHO]: createHashedEmbeddingFn
 * [FROM]: Depends on ./types-v2.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/hash-embedding.ts - built-in local hashing embedding for zero-dependency semantic recall
 */

import type { EmbeddingFn } from "./types-v2.js";

function hashToken(token: string): number {
	let h = 2166136261;
	for (let i = 0; i < token.length; i++) {
		h ^= token.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.match(/[a-z0-9\u4e00-\u9fff_.-]{2,}/g)
		?.slice(0, 512) ?? [];
}

function normalize(vec: number[]): number[] {
	let mag = 0;
	for (const value of vec) mag += value * value;
	if (!mag) return vec;
	const denom = Math.sqrt(mag);
	return vec.map((value) => value / denom);
}

export function createHashedEmbeddingFn(dim = 256): EmbeddingFn {
	return async (texts: string[]) =>
		texts.map((text) => {
			const vec = new Array<number>(dim).fill(0);
			const tokens = tokenize(text);
			for (const token of tokens) {
				const h = hashToken(token);
				const idx = h % dim;
				const sign = (h & 1) === 0 ? 1 : -1;
				const weight = token.length > 6 ? 1.25 : 1;
				vec[idx] += sign * weight;
			}
			return normalize(vec);
		});
}
