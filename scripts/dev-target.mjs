// Development-build identity.
//
// Obsidian identifies a plugin by manifest.id and requires the installed directory
// name to match it, so a second copy of Catea in one vault needs a second id. The
// data directory follows the id: .catea/memory is migrated in place and one way,
// so a dev build that shared it could leave the released plugin unable to read the
// user's real writing memory.
//
// Pure helpers only. build.mjs, dev-install.mjs and tests/dev-target.test.ts all
// import this module, so it must stay free of filesystem and process side effects.

export const DEV_ID = 'catea-paper-dev'
export const DEV_NAME = 'Catea (Dev)'

// The community plugin `obsidian-hot-reload` (pjeby) reloads any installed plugin
// whose directory contains an empty file with exactly this name. It is written only
// into the vault copy, never into dist/, so it can never reach a release bundle.
export const HOT_RELOAD_MARKER = '.hot-reload'

/** Vault-relative state directory for a plugin id. */
export function devDataDir(id) {
  return id === DEV_ID ? '.catea-dev' : '.catea'
}

/** Copy of a released manifest re-identified as the development build. */
export function devManifest(manifest) {
  return { ...manifest, id: DEV_ID, name: DEV_NAME }
}

/**
 * Rewrite the vault data directory inside bundled prompt text.
 *
 * The `.md` files imported by `skills.ts` and `main.tsx` are injected into the
 * system prompt verbatim, so a dev bundle that left `.catea/skills` in them would
 * direct the model at the released plugin's real data. The slash is what makes the
 * match specific: `.catea-ui` and friends are CSS class names and must survive.
 * Idempotent, because `.catea-dev/` does not contain `.catea/`.
 */
export function relocatePromptPaths(text, dataDir) {
  return text.replaceAll('.catea/', `${dataDir}/`)
}
