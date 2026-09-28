import {build} from 'esbuild'
import {agentLoopPatchPlugin} from './agent-loop-patch.mjs'
import {buildStyles} from '../packages/design-system/scripts/build.mjs'
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'dist/catea-paper')
await mkdir(out,{recursive:true})
await build({absWorkingDir:root,entryPoints:['apps/obsidian/src/main.tsx'],outfile:resolve(out,'main.js'),bundle:true,minify:true,legalComments:'none',nodePaths:[resolve(root,'node_modules')],platform:'node',format:'cjs',target:'es2022',jsx:'automatic',loader:{'.md':'text','.png':'dataurl'},external:['obsidian','electron','@electron/remote'],define:{'process.env.NODE_ENV':'"production"'},alias:{'@catui/ai/stream':resolve(root,'packages/agent-core/src/upstream-stream.ts'),'@catui/ai':resolve(root,'packages/agent-core/upstream/ai'),'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom'),'catea-components':resolve(root,'packages/design-system/components/src/index.ts')},plugins:[agentLoopPatchPlugin(root)]})
const dockIcons=['apps-2','artboard','calendar','command','database-2','file-copy','gemini','git-fork','search-2']
const dockCss=(await Promise.all(dockIcons.map(async name=>{
  const paths=await Promise.all(['line','fill'].map(async style=>{
    const svg=await readFile(resolve(root,`apps/obsidian/remix-dock/${name}-${style}.svg`),'utf8')
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }))
  return `body.gp-enabled .side-dock-actions [data-catea-dock-icon="${name}"]{--catea-dock-line:${paths[0]};--catea-dock-fill:${paths[1]}}`
}))).join('\n')
await writeFile(resolve(out,'styles.css'),await readFile(resolve(root,'apps/obsidian/paper.css'),'utf8')+'\n'+dockCss+'\n'+await buildStyles())
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'))
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2))
await copyFile(resolve(root,'LICENSE'),resolve(out,'LICENSE'))
await copyFile(resolve(root,'THIRD_PARTY_NOTICES.md'),resolve(out,'THIRD_PARTY_NOTICES.md'))
await copyFile(resolve(root,'TABLER-LICENSE.txt'),resolve(out,'TABLER-LICENSE.txt'))
await copyFile(resolve(root,'REMIX-LICENSE.txt'),resolve(out,'REMIX-LICENSE.txt'))

for (const name of ["CRAFT-AGENTS-LICENSE","CRAFT-AGENTS-NOTICE","BEUI-LICENSE.txt"]) await copyFile(resolve(root,"packages/design-system",name),resolve(out,name))

const bundleBytes=(await stat(resolve(out,'main.js'))).size
if(bundleBytes>=5_000_000)throw new Error(`main.js is ${bundleBytes} bytes; Obsidian Sync requires less than 5 MB`)
console.log(`main.js: ${bundleBytes} bytes (under 5 MB)`)
