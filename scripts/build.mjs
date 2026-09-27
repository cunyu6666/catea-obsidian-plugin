import {build} from 'esbuild'
import {buildStyles} from '../../catea-design-system/scripts/build.mjs'
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'dist/catea-paper')
await mkdir(out,{recursive:true})
await build({absWorkingDir:root,entryPoints:['apps/obsidian/src/main.tsx'],outfile:resolve(out,'main.js'),bundle:true,nodePaths:[resolve(root,'node_modules'),resolve(root,'../catea-design-system/node_modules')],platform:'node',format:'cjs',target:'es2022',jsx:'automatic',loader:{'.md':'text'},external:['obsidian','electron','@electron/remote'],define:{'process.env.NODE_ENV':'"production"'},alias:{'@catui/ai/stream':resolve(root,'packages/agent-core/src/upstream-stream.ts'),'@catui/ai':resolve(root,'packages/agent-core/upstream/ai'),'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom'),'catea-components':resolve(root,'../catea-design-system/packages/components/src/index.ts')}})
await writeFile(resolve(out,'styles.css'),await readFile(resolve(root,'apps/obsidian/paper.css'),'utf8')+'\n'+await buildStyles())
await writeFile(resolve(out,'manifest.json'),JSON.stringify({id:'catea-paper',name:'Catea Paper',version:'0.3.0',minAppVersion:'1.8.0',description:'Paper workspace with a native Catea Agent.',author:'Cunyu',isDesktopOnly:true},null,2))
await copyFile(resolve(root,'packages/memory/LICENSE'),resolve(out,'LICENSE'))
await copyFile(resolve(root,'THIRD_PARTY_NOTICES.md'),resolve(out,'THIRD_PARTY_NOTICES.md'))
await copyFile(resolve(root,'TABLER-LICENSE.txt'),resolve(out,'TABLER-LICENSE.txt'))

for (const name of ["CRAFT-AGENTS-LICENSE","CRAFT-AGENTS-NOTICE"]) await copyFile(resolve(root,"../catea-design-system",name),resolve(out,name))
