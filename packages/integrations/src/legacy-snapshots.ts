/**
 * [WHO]: Provides cleanupLegacySnapshots
 * [FROM]: Depends on ./data-dir, ./storage, node:fs/promises
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: packages/integrations/src/legacy-snapshots.ts - one-way migration that removes obsolete full-vault snapshots created by releases before tool-scoped file review
 */
import { lstat, rm } from 'node:fs/promises'
import { dataPath } from './data-dir'
import { errnoCode, within } from './storage'

export async function cleanupLegacySnapshots(vault: string): Promise<boolean> {
  const directory = await within(vault, dataPath('snapshots'))
  try {
    await lstat(directory)
  } catch (error: unknown) {
    if (errnoCode(error) === 'ENOENT') return false
    throw error
  }
  await rm(directory, { recursive: true })
  return true
}
