import {build} from 'esbuild'
import {buildStyles} from '../packages/design-system/scripts/build.mjs'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'dist/catea-paper')
await mkdir(out,{recursive:true})
await build({absWorkingDir:root,entryPoints:['apps/obsidian/src/main.tsx'],outfile:resolve(out,'main.js'),bundle:true,minify:true,legalComments:'none',nodePaths:[resolve(root,'node_modules')],platform:'node',format:'cjs',target:'es2022',jsx:'automatic',loader:{'.md':'text'},external:['obsidian','electron','@electron/remote'],define:{'process.env.NODE_ENV':'"production"'},alias:{'@catui/ai/stream':resolve(root,'packages/agent-core/src/upstream-stream.ts'),'@catui/ai':resolve(root,'packages/agent-core/upstream/ai'),'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom'),'catea-components':resolve(root,'packages/design-system/components/src/index.ts')}})
await writeFile(resolve(out,'styles.css'),await readFile(resolve(root,'apps/obsidian/paper.css'),'utf8')+'\n'+await buildStyles())
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'))
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2))
await copyFile(resolve(root,'LICENSE'),resolve(out,'LICENSE'))
await copyFile(resolve(root,'THIRD_PARTY_NOTICES.md'),resolve(out,'THIRD_PARTY_NOTICES.md'))
await copyFile(resolve(root,'TABLER-LICENSE.txt'),resolve(out,'TABLER-LICENSE.txt'))

for (const name of ["CRAFT-AGENTS-LICENSE","CRAFT-AGENTS-NOTICE"]) await copyFile(resolve(root,"packages/design-system",name),resolve(out,name))
