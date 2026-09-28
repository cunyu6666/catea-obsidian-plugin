import {build} from 'esbuild'
import {resolve} from 'node:path'

const root=resolve(import.meta.dirname,'..')
await build({
  absWorkingDir:root,
  entryPoints:['preview-ui/app.tsx'],
  outfile:'preview-ui/app.js',
  bundle:true,
  platform:'browser',
  format:'iife',
  target:'es2022',
  jsx:'automatic',
  loader:{'.png':'dataurl','.md':'text'},
  define:{'process.env.NODE_ENV':'"development"'},
  alias:{
    obsidian:resolve(root,'preview-ui/obsidian.ts'),
    react:resolve(root,'node_modules/react'),
    'react-dom':resolve(root,'node_modules/react-dom'),
    'catea-components':resolve(root,'packages/design-system/components/src/index.ts'),
  },
})
