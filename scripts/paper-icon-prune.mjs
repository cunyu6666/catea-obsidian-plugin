/**
 * Build-time transform for the vendored Paper base class.
 *
 * `paper.cjs` embeds a 5,166-entry Tabler icon table that accounts for 36% of the
 * shipped bundle. Catea no longer runs that skin: main.tsx forces Paper's
 * `tablerIcons` setting to false and apps/obsidian/src/remix-skin.ts replaces the
 * glyphs with the vendored Remix line set instead.
 *
 * The table is emptied here rather than on disk. paper.cjs is a generated asset
 * with no local regeneration path, pinned by sha256 in VENDOR_MANIFEST.json and
 * asserted by tests/vendor-assets.test.ts, so editing the file in place would
 * break the provenance chain. This mirrors how scripts/agent-loop-patch.mjs keeps
 * the vendored agent loop byte-identical on disk.
 *
 * Emptying the table is safe rather than merely convenient: TablerSkin's replace()
 * returns early on an unknown name (`if(!body){this.missing.add(id);return;}`), so
 * a stray start() degrades to leaving native Lucide glyphs alone instead of
 * throwing. The name-alias table is kept because it is small and is what documents
 * the Lucide vocabulary the mapping was curated against.
 */
import { readFile } from 'node:fs/promises'

const OPEN = 'const icons = {'
const MARKER = '};\n// Obsidian uses Lucide IDs'
const REPLACEMENT = 'const icons = {};'

export function paperIconPrunePlugin(root) {
  return {
    name: 'paper-icon-prune',
    setup(build) {
      build.onLoad({ filter: /paper\.cjs$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const start = source.indexOf(OPEN)
        const marker = source.indexOf(MARKER)
        if (start < 0 || marker < 0 || marker < start)
          throw new Error(
            `paper-icon-prune: could not locate the Tabler table in ${args.path}. ` +
              'The vendored asset changed shape; update this transform instead of shipping a bundle ' +
              'that still carries 1.6 MB of dead glyphs.',
          )
        const end = marker + 2
        const contents = source.slice(0, start) + REPLACEMENT + source.slice(end)
        console.log(
          `paper-icon-prune: dropped ${(end - start).toLocaleString()} bytes of Tabler table`,
        )
        return {
          contents,
          loader: 'js',
          watchFiles: [args.path],
        }
      })
    },
  }
}
