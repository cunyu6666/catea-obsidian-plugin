// Check the small scanner contract against the installed official Node types.
// Separate module names prevent ambient declarations from validating themselves.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const path = `${root}typings/node-runtime.d.ts`
const source = await readFile(path, 'utf8')
const modules = [...source.matchAll(/declare module '(node:[^']+)'/g)].map((match) => match[1])
const isolated = source
  .replaceAll('node:', 'catea-node:')
  .replace(/\bBuffer\b/g, 'CateaBuffer')
  .replace(/\bprocess\b/g, 'cateaProcess')
  .replace(/\brequire\b/g, 'cateaRequire')
  .replace(/\bNodeJS\b/g, 'CateaNodeJS')
const fixturePath = `${root}typings/contract-verification.ts`
const fixture =
  modules
    .map((name, index) => {
      // promisify's custom execFile overload is checked by calling the real pair.
      const shape =
        name === 'node:util'
          ? `Pick<typeof import('catea-${name}'), 'format'>`
          : `typeof import('catea-${name}')`
      return `import * as actual${index} from '${name}';\nconst check${index}: ${shape} = actual${index};\nvoid check${index};`
    })
    .join('\n') +
  `
const checkBuffer: typeof CateaBuffer = Buffer;
const checkProcess: typeof cateaProcess = process;
const checkRequire: typeof cateaRequire = require;
const checkErrno: CateaNodeJS.ErrnoException = {} as NodeJS.ErrnoException;
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const checkExec: ReturnType<typeof import('catea-node:util').promisify> = promisify(execFile);
void [checkBuffer, checkProcess, checkRequire, checkErrno, checkExec];
`
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ['node'],
  typeRoots: [`${root}node_modules/@types`],
}
const host = ts.createCompilerHost(options)
const read = host.readFile.bind(host)
host.readFile = (file) => (file === path ? isolated : file === fixturePath ? fixture : read(file))
const program = ts.createProgram([path, fixturePath], options, host)
const standalone = ts.createProgram([path], { ...options, types: [], skipLibCheck: false }, host)
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...ts.getPreEmitDiagnostics(standalone)]
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }),
)
console.log(
  `Node contract compatibility: ${modules.length} modules and runtime globals match official types`,
)
