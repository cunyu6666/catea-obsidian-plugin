/**
 * [WHO]: filterPII, filterByScope, evictExpiredEntries, evictExpiredWork
 * [FROM]: Depends on ./scoring.js, ./types.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/privacy.ts - scope isolation, TTL enforcement, PII filtering
 */


import { daysSince } from "./scoring.js";
import type { MemoryEntry, MemoryScope, WorkEntry } from "./types.js";

const PII_PATTERNS = [
	/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
	/\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // US phone
	/\b1[3-9]\d{9}\b/g, // CN mobile
	/\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
	/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, // CN ID
	/\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // credit card
];

export function filterPII(text: string): string {
	let result = text;
	for (const pattern of PII_PATTERNS) {
		result = result.replace(pattern, "[REDACTED]");
	}
	return result;
}

export function matchesScope(entry: { scope?: MemoryScope }, required?: MemoryScope): boolean {
	if (!required) return true;
	if (!entry.scope) return true;
	if (required.userId && entry.scope.userId && entry.scope.userId !== required.userId) return false;
	if (required.agentId && entry.scope.agentId && entry.scope.agentId !== required.agentId) return false;
	return true;
}

export function filterByScope<T extends { scope?: MemoryScope }>(entries: T[], scope?: MemoryScope): T[] {
	if (!scope) return entries;
	return entries.filter((e) => matchesScope(e, scope));
}

export function evictExpiredEntries(entries: MemoryEntry[]): MemoryEntry[] {
	return entries.filter((e) => {
		if (e.ttl === undefined) return true;
		return daysSince(e.created) < e.ttl;
	});
}

export function evictExpiredWork(entries: WorkEntry[]): WorkEntry[] {
	return entries.filter((w) => {
		if (w.ttl === undefined) return true;
		return daysSince(w.created) < w.ttl;
	});
}
