/**
 * [WHO]: Provides Serial, errnoCode, readJson, within, writeJson
 * [FROM]: Depends on node:fs/promises, node:path
 * [TO]: Consumed by packages/integrations/src/media-generation.ts, packages/integrations/src/image-generation.ts, apps/obsidian/src/main.tsx,
 *   packages/integrations/src/conversation-store.ts,
 *   packages/integrations/src/legacy-snapshots.ts,
 *   packages/integrations/src/index.ts, packages/integrations/src/skills.ts,
 *   packages/integrations/src/tools.ts, packages/integrations/src/web.ts,
 *   packages/memory/src/index.ts
 * [HERE]: packages/integrations/src/storage.ts - vault confinement via within() with realpath checks and explicit symlink rejection, atomic temp+rename JSON writes, and the Serial promise queue
 */
import { mkdir, readFile, writeFile, rename, realpath, lstat } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'

// Structural narrowing instead of an ErrnoException cast: an unknown thrown value
// is only treated as a filesystem error when it really carries a string code.
export function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export async function within(root: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\0'))
    throw new Error('路径必须位于当前知识库')
  const base = await realpath(root),
    target = resolve(base, path)
  let check = target
  while (true) {
    try {
      const actual = await realpath(check)
      const rel = relative(base, actual)
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('路径越过知识库边界')
      break
    } catch (e: unknown) {
      if (errnoCode(e) !== 'ENOENT') throw e
      const parent = dirname(check)
      if (parent === check) throw e
      check = parent
    }
  }
  // Reject links even when they point back inside the vault: avoid ambiguous writes.
  let cursor = base
  for (const part of relative(base, target).split(/[\\/]/).filter(Boolean)) {
    cursor = resolve(cursor, part)
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('不操作符号链接')
    } catch (e: unknown) {
      if (errnoCode(e) !== 'ENOENT') throw e
    }
  }
  return target
}
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return parsed as T
  } catch (e: unknown) {
    if (errnoCode(e) === 'ENOENT') return fallback
    throw new Error(`无法读取本地数据：${path}`)
  }
}
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
  await rename(temp, path)
}
export class Serial {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn)
    this.tail = next.catch(() => {})
    return next
  }
}
