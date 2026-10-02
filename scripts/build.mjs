import { build } from 'esbuild'
import postcss from 'postcss'
import { agentLoopPatchPlugin } from './agent-loop-patch.mjs'
import { paperIconPrunePlugin } from './paper-icon-prune.mjs'
import { buildStyles } from '../packages/design-system/scripts/build.mjs'
import { devDataDir, devManifest, relocatePromptPaths } from './dev-target.mjs'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const devMode = process.argv.includes('--dev')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
// --dev re-identifies the bundle so it can be installed beside the released plugin
// in one vault. The id decides both the output directory and the vault state
// directory, so a dev bundle can never read or write the released plugin's .catea.
const builtManifest = devMode ? devManifest(manifest) : manifest
const out = resolve(root, `dist/${builtManifest.id}`)
const dataDir = devDataDir(builtManifest.id)
// Prompt markdown is bundled as text and injected into the system prompt verbatim,
// so its data paths have to move with the data directory or a dev build would send
// the model to the released plugin's real .catea. Mounted only in dev mode: the
// released bundle stays exactly what it was before this existed.
const promptPathPlugin = {
  name: 'catea-dev-prompt-paths',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /\.md$/ }, async (args) => ({
      contents: relocatePromptPaths(await readFile(args.path, 'utf8'), dataDir),
      loader: 'text',
    }))
  },
}
const dependencyRoot = (name) => {
  const candidates = [
    resolve(root, 'apps/obsidian/node_modules', name),
    resolve(root, 'node_modules', name),
  ]
  const directory = candidates.find((candidate) => existsSync(resolve(candidate, 'package.json')))
  if (!directory) throw new Error(`Cannot locate package root for ${name}`)
  return directory
}
const skillLicenses = await Promise.all(
  ['SKILL-CREATOR-LICENSE.txt', 'FIND-SKILL-LICENSE.txt'].map(
    async (name) => `${name}\n${await readFile(resolve(root, name), 'utf8')}`,
  ),
)
await mkdir(out, { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ['apps/obsidian/src/main.tsx'],
  outfile: resolve(out, 'main.js'),
  bundle: true,
  minify: true,
  legalComments: 'none',
  banner: {
    js: `/*! Bundled skill adaptations — license notices\n${skillLicenses.join('\n\n').replaceAll('*/', '* /')}\n*/`,
  },
  nodePaths: [resolve(root, 'node_modules')],
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.md': 'text', '.png': 'dataurl', '.css': 'empty' },
  external: ['obsidian', 'electron', '@electron/remote'],
  define: { 'process.env.NODE_ENV': '"production"', CATEA_DATA_DIR: JSON.stringify(dataDir) },
  alias: {
    '@catui/ai/stream': resolve(root, 'packages/agent-core/src/upstream-stream.ts'),
    '@catui/ai': resolve(root, 'packages/agent-core/upstream/ai'),
    react: resolve(root, 'node_modules/react'),
    'react-dom': resolve(root, 'node_modules/react-dom'),
    'catea-components': resolve(root, 'packages/design-system/components/src/index.ts'),
  },
  plugins: [
    ...(devMode ? [promptPathPlugin] : []),
    agentLoopPatchPlugin(root),
    paperIconPrunePlugin(root),
  ],
})
const dockIcons = [
  'apps-2',
  'artboard',
  'calendar',
  'command',
  'database-2',
  'file-copy',
  'expand-up-down',
  'gemini',
  'git-fork',
  'search-2',
]
const dockCss = (
  await Promise.all(
    dockIcons.map(async (name) => {
      const paths = await Promise.all(
        ['line', 'fill'].map(async (style) => {
          const svg = await readFile(
            resolve(root, `apps/obsidian/remix-dock/${name}-${style}.svg`),
            'utf8',
          )
          return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
        }),
      )
      return `body.gp-enabled .side-dock-actions [data-catea-dock-icon="${name}"]{--catea-dock-line:${paths[0]};--catea-dock-fill:${paths[1]}}`
    }),
  )
).join('\n')
const folderIcons = [
  'book-open',
  'briefcase',
  'camera',
  'headphone',
  'palette',
  'lightbulb',
  'archive',
  'globe',
  'flask',
  'plant',
]
const folderCss = (
  await Promise.all(
    folderIcons.map(async (name) => {
      const svg = await readFile(
        resolve(root, `apps/obsidian/remix-folders/${name}-line.svg`),
        'utf8',
      )
      return `[data-catea-folder-icon="${name}"]{--catea-folder-mask:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`
    }),
  )
).join('\n')
const explorerCss = `body.gp-enabled{--gp-folder-icon:url("data:image/svg+xml,${encodeURIComponent(
  await readFile(resolve(root, 'apps/obsidian/remix-explorer/folder-line.svg'), 'utf8'),
)}");--gp-document-icon:url("data:image/svg+xml,${encodeURIComponent(
  await readFile(resolve(root, 'apps/obsidian/remix-explorer/file-line.svg'), 'utf8'),
)}");}`
const gitStyles = postcss.parse(
  await readFile(resolve(dependencyRoot('@tomplum/react-git-log'), 'dist/index.css'), 'utf8'),
)
gitStyles.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && rule.parent.name.includes('keyframes')) return
  rule.selectors = rule.selectors.map((selector) => `.catea-git-panel ${selector}`)
})
const gitDependencies = [
  '@tomplum/react-git-log',
  '@uidotdev/usehooks',
  'classnames',
  'dayjs',
  'fastpriorityqueue',
  'react-tiny-popover',
]
await writeFile(
  resolve(out, 'REACT-GIT-LOG-LICENSE.txt'),
  (
    await Promise.all(
      gitDependencies.map(
        async (name) =>
          `${name}\n\n${await readFile(resolve(dependencyRoot(name), 'LICENSE'), 'utf8')}`,
      ),
    )
  ).join('\n\n---\n\n'),
)
await writeFile(
  resolve(out, 'styles.css'),
  gitStyles.toString() +
    '\n' +
    (await readFile(resolve(root, 'apps/obsidian/paper.css'), 'utf8')) +
    '\n' +
    dockCss +
    '\n' +
    folderCss +
    '\n' +
    explorerCss +
    '\n' +
    (await buildStyles()),
)
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(builtManifest, null, 2))
await copyFile(resolve(root, 'LICENSE'), resolve(out, 'LICENSE'))
await copyFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(out, 'THIRD_PARTY_NOTICES.md'))
await copyFile(resolve(root, 'TABLER-LICENSE.txt'), resolve(out, 'TABLER-LICENSE.txt'))
await copyFile(resolve(root, 'REMIX-LICENSE.txt'), resolve(out, 'REMIX-LICENSE.txt'))
for (const name of ['SKILL-CREATOR-LICENSE.txt', 'FIND-SKILL-LICENSE.txt'])
  await copyFile(resolve(root, name), resolve(out, name))

for (const name of ['CRAFT-AGENTS-LICENSE', 'CRAFT-AGENTS-NOTICE', 'BEUI-LICENSE.txt'])
  await copyFile(resolve(root, 'packages/design-system', name), resolve(out, name))

const bundleBytes = (await stat(resolve(out, 'main.js'))).size
if (bundleBytes >= 5_000_000)
  throw new Error(`main.js is ${bundleBytes} bytes; Obsidian Sync requires less than 5 MB`)
console.log(`main.js: ${bundleBytes} bytes (under 5 MB)`)
