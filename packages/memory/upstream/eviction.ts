/**
 * [WHO]: EvictionWeights, utilityEntry, utilityWork
 * [FROM]: Depends on ./scoring.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/eviction.ts - utility-weighted memory eviction (Ebbinghaus-aligned decay)
 */


import { daysSince, decay } from "./scoring.js";
import type { MemoryEntry, WorkEntry } from "./types.js";

export interface EvictionWeights {
	accessFrequency: number;
	baseImpact: number;
}

export function utilityEntry(e: MemoryEntry, defaultHalfLife: Record<string, number>, w: EvictionWeights): number {
	const strength = e.strength || defaultHalfLife[e.type] || 30;
	const accessNorm = Math.min(1, (e.accessCount ?? 0) / 10);
	const impactNorm = Math.min(1, e.importance / 10);
	const salienceNorm = Math.min(1, (e.salience ?? e.importance) / 10);
	const retentionMultiplier =
		e.retention === "core" ? 1.25 : e.retention === "key-event" ? 1.35 : 0.9;
	const stabilityMultiplier = e.stability === "stable" ? 1.08 : 0.78;
	return (
		(w.accessFrequency * accessNorm + w.baseImpact * impactNorm + salienceNorm * 0.2) *
		retentionMultiplier *
		stabilityMultiplier *
		decay(daysSince(e.created), strength)
	);
}

export function utilityWork(w: WorkEntry, defaultHalfLife: Record<string, number>, ew: EvictionWeights): number {
	const strength = w.strength || defaultHalfLife.work || 45;
	const accessNorm = Math.min(1, (w.accessCount ?? 0) / 10);
	const impactNorm = Math.min(1, w.importance / 10);
	return (ew.accessFrequency * accessNorm + ew.baseImpact * impactNorm) * decay(daysSince(w.created), strength);
}
