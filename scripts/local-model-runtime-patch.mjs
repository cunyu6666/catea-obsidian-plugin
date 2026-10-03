// In-memory adaptation of the pinned npm dependency, never an edit to installed
// or vendored files. Electron exposes Node globals inside its browser workers;
// Emscripten must still fetch the bundled Blob URL through the browser path.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export function localModelRuntimePlugin() {
  return {
    name: 'catea-local-browser-worker',
    setup(builder) {
      builder.onLoad({ filter: /@wllama[\\/]wllama[\\/]esm[\\/]index\.js$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8')
        if (
          createHash('sha256').update(source).digest('hex') !==
          '08e0fad5c9efdf4414ca2e27d0d8d5bdfa54d91a8054b40d9d9c90c9ce870b9d'
        )
          throw new Error('Local runtime source changed; review the browser-worker adaptation')
        const environment =
          'var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"&&process.type!="renderer"'
        if (source.split(environment).length !== 3)
          throw new Error('Local runtime environment patch no longer matches')
        const exit = `        const result = yield this.pushTask({
          verb: "wllama.exit",
          args: [],
          callbackId: this.taskId++
        });
        this.parseResult(result);
        this.worker.terminate();`
        if (source.split(exit).length !== 2)
          throw new Error('Local runtime worker cleanup patch no longer matches')
        return {
          contents: source.replaceAll(environment, 'var ENVIRONMENT_IS_NODE=false').replace(
            exit,
            `        try {
          const result = yield this.pushTask({
            verb: "wllama.exit", args: [], callbackId: this.taskId++
          });
          this.parseResult(result);
        } finally { this.worker.terminate(); }`,
          ),
          loader: 'js',
        }
      })
    },
  }
}
