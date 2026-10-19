import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))

export async function loadSource(entry, mocks = {}, globals = {}) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron', '@electron/remote'],
    plugins: [
      {
        name: 'fixture-modules',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            Object.hasOwn(mocks, path) ? { path, namespace: 'fixture' } : undefined,
          )
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  const module = { exports: {} }
  runInNewContext(
    result.outputFiles[0].text,
    {
      module,
      exports: module.exports,
      require: createRequire(import.meta.url),
      URL,
      URLSearchParams,
      Headers,
      Response,
      Request,
      ReadableStream,
      TransformStream,
      AbortController,
      AbortSignal,
      DOMException,
      Buffer,
      crypto,
      TextDecoder,
      TextEncoder,
      console,
      process,
      setTimeout,
      clearTimeout,
      window: { setTimeout, clearTimeout },
      ...globals,
    },
    { filename: resolve(root, entry) },
  )
  return module.exports
}
