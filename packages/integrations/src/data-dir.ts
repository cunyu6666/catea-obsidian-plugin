/**
 * [WHO]: Provides DATA_DIR, dataPath, withDataDir
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/main.tsx, apps/obsidian/src/settings.ts,
 *   packages/agent-core/src/index.ts, packages/integrations/src/conversation-store.ts,
 *   packages/integrations/src/legacy-snapshots.ts, packages/integrations/src/skills.ts,
 *   packages/memory/src/index.ts, packages/memory/src/store.ts, tests/data-dir.test.ts
 * [HERE]: packages/integrations/src/data-dir.ts - the single compile-time root for all vault-local plugin state; scripts/build.mjs injects CATEA_DATA_DIR so a development bundle writes .catea-dev instead of the released plugin's .catea
 */

// CATEA_DATA_DIR is substituted by the esbuild `define` map in scripts/build.mjs.
// The typeof guard is what lets this module run unbundled: `npm test` executes it
// through Node's type stripping with no define present, and a build that forgets
// the define must degrade to the released directory rather than throw a
// ReferenceError inside Obsidian.
declare const CATEA_DATA_DIR: string | undefined

export const DATA_DIR: string =
  typeof CATEA_DATA_DIR === 'string' && CATEA_DATA_DIR ? CATEA_DATA_DIR : '.catea'

/** Vault-relative path under the data root, for `within()`. */
export function dataPath(...parts: string[]): string {
  return [DATA_DIR, ...parts].join('/')
}

/**
 * Substitute the real data root into a translated `{dir}` placeholder.
 *
 * locale.ts is a flat dictionary with no interpolation, so user-facing strings keep
 * a static translation key and are resolved here after lookup.
 */
export function withDataDir(text: string): string {
  return text.replaceAll('{dir}', DATA_DIR)
}
