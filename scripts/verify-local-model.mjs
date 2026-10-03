// Optional browser smoke test against real, checksum-pinned weights. The normal
// test suite never downloads weights or requires a browser automation package.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localModelRuntimePlugin } from './local-model-runtime-patch.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argument = (name) => process.argv[process.argv.indexOf(name) + 1]
if (!process.argv.includes('--model')) throw new Error('Pass --model /absolute/path/to/model.gguf')
const model = resolve(argument('--model'))
if ((await stat(model)).size !== 484220320) throw new Error('Incorrect model size')
const hash = createHash('sha256')
for await (const bytes of createReadStream(model)) hash.update(bytes)
if (hash.digest('hex') !== '9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14')
  throw new Error('Incorrect model checksum')
const wasm = gzipSync(
  await readFile(resolve(root, 'node_modules/@wllama/wllama/esm/single-thread/wllama.wasm')),
  { level: 9 },
).toString('base64')
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['scripts/local-model-smoke.mjs'],
  bundle: true,
  platform: 'browser',
  write: false,
  define: { CATEA_LOCAL_WASM: JSON.stringify(wasm) },
  plugins: [
    localModelRuntimePlugin(),
    {
      name: 'browser-cache-injection',
      setup(builder) {
        const modules = {
          'node:path': 'export const join=(...parts)=>parts.join("/")',
          './local-model-cache':
            'export const LOCAL_MODEL_ASSET={name:"Catea Lite"};export class LocalModelCache{}',
          '../../../packages/integrations/src/storage':
            'export class Serial{tail=Promise.resolve();run(fn){const next=this.tail.then(fn);this.tail=next.catch(()=>{});return next}}',
        }
        builder.onResolve({ filter: /.*/ }, ({ path }) =>
          Object.hasOwn(modules, path) ? { path, namespace: 'injected' } : undefined,
        )
        builder.onLoad({ filter: /.*/, namespace: 'injected' }, ({ path }) => ({
          contents: modules[path],
          loader: 'js',
        }))
      },
    },
  ],
})
const server = createServer((request, response) => {
  if (request.url === '/model.gguf') {
    response.setHeader('Content-Type', 'application/octet-stream')
    createReadStream(model).pipe(response)
  } else if (request.url === '/smoke.js') {
    response.setHeader('Content-Type', 'application/javascript')
    response.end(bundle.outputFiles[0].contents)
  } else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><title>Catea Lite smoke test</title>
      <h1>Catea Lite local inference</h1><button id="start">Run smoke test</button><pre id="output"></pre>
      <script src="/smoke.js"></script><script>
      start.onclick=async()=>{start.disabled=true;try{output.textContent=JSON.stringify(await cateaSmoke(s=>output.textContent=s),null,2)}catch(e){output.textContent=String(e)}finally{start.disabled=false}};
      </script>`)
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
if (!process.argv.includes('--playwright')) {
  console.log(`Open ${url}, then click Run smoke test. Ctrl+C stops the server.`)
} else {
  const { chromium } = await import(pathToFileURL(resolve(argument('--playwright'))).href)
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {}),
    })
    const page = await browser.newPage()
    page.on('pageerror', (error) => console.error(error))
    await page.goto(url)
    console.log(JSON.stringify(await page.evaluate(() => window.cateaSmoke()), null, 2))
  } finally {
    await browser?.close()
    server.close()
  }
}
