/**
 * [WHO]: DreamLock, tryAcquireDreamLock, releaseDreamLock, isDreamLocked, waitForDreamLock
 * [FROM]: Depends on node:fs, node:fs/promises
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/dream-lock.ts - file-based mutex for background consolidation (dream) process
 */

import { existsSync } from "node:fs";
import { readFile, rm, stat, utimes, writeFile } from "node:fs/promises";

function isPidAlive(pid: number): boolean {
	if (!Number.isFinite(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function readDreamLockMtimeMs(lockPath: string): Promise<number> {
	try {
		if (!existsSync(lockPath)) return 0;
		const s = await stat(lockPath);
		return s.mtimeMs || 0;
	} catch {
		return 0;
	}
}

export async function tryAcquireDreamLock(lockPath: string, holderStaleMs: number): Promise<number | null> {
	const now = Date.now();
	let priorMtimeMs = 0;

	try {
		if (existsSync(lockPath)) {
			const s = await stat(lockPath);
			priorMtimeMs = s.mtimeMs || 0;
			const body = await readFile(lockPath, "utf-8").catch(() => "");
			const holderPid = Number.parseInt(body.trim(), 10);
			const isFresh = now - priorMtimeMs < holderStaleMs;
			if (isFresh && isPidAlive(holderPid)) return null;
		}
	} catch {
		// treat as missing/claimable
	}

	try {
		await writeFile(lockPath, String(process.pid), "utf-8");
		await utimes(lockPath, new Date(now), new Date(now));
		const verify = await readFile(lockPath, "utf-8").catch(() => "");
		if (verify.trim() !== String(process.pid)) return null;
		return priorMtimeMs;
	} catch {
		return null;
	}
}

export async function rollbackDreamLock(lockPath: string, priorMtimeMs: number): Promise<void> {
	try {
		if (priorMtimeMs === 0) {
			await rm(lockPath, { force: true });
			return;
		}
		await writeFile(lockPath, "", "utf-8");
		const prior = new Date(priorMtimeMs);
		await utimes(lockPath, prior, prior);
	} catch {
		// best-effort rollback
	}
}

export async function stampDreamLock(lockPath: string): Promise<void> {
	const now = Date.now();
	try {
		await writeFile(lockPath, String(process.pid), "utf-8");
		await utimes(lockPath, new Date(now), new Date(now));
	} catch {
		// best-effort stamp
	}
}

