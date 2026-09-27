#!/usr/bin/env node
// Typecheck gate scoped to code this repository owns.
//
// `tsc` cannot be used as a gate directly here. Its program necessarily contains
// the vendored CatUI snapshot (own source imports it) and the design system's
// component sources (they ship as .ts, so skipLibCheck does not apply). Together
// those produce roughly 87 diagnostics that cannot be fixed from this repository,
// which buries the handful that can.
//
// This runs the same program, then fails only on diagnostics in owned code:
// apps/*/src, packages/*/src and tests/, excluding vendored upstream. The rest is
// reported as a count so growth stays visible without blocking.
//
// Note: narrowing tsconfig `exclude` does not work — specifying `exclude` replaces
// the built-in node_modules exclusion and pulls more external sources into the
// program (measured: 87 -> 129 diagnostics).

import ts from 'typescript'
import {fileURLToPath} from 'node:url'
import {dirname, resolve, relative, sep} from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function classify(relPath) {
  if (relPath.includes('/upstream/')) return 'vendored'
  if (relPath.startsWith('node_modules/')) return 'external'
  return 'own'
}

function toRel(fileName) {
  return relative(ROOT, fileName).split(sep).join('/')
}

const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json')
if (!configPath) {
  process.stderr.write('typecheck: tsconfig.json not found\n')
  process.exit(2)
}

const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
const program = ts.createProgram(parsed.fileNames, parsed.options)
const diagnostics = [...(config.error ? [config.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)]

const buckets = {own: [], vendored: [], external: []}

for (const d of diagnostics) {
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
  if (!d.file || d.start === undefined) {
    // A configuration-level or program-level diagnostic is always ours to fix.
    buckets.own.push(`error TS${d.code}: ${message}`)
    continue
  }
  const rel = toRel(d.file.fileName)
  const {line, character} = d.file.getLineAndCharacterOfPosition(d.start)
  buckets[classify(rel)].push(`${rel}(${line + 1},${character + 1}): error TS${d.code}: ${message}`)
}

for (const line of buckets.own) process.stdout.write(`  ${line}\n`)

process.stdout.write(`\ntypecheck: ${buckets.own.length} in owned code, `)
process.stdout.write(`${buckets.vendored.length} in vendored upstream (not actionable here), `)
process.stdout.write(`${buckets.external.length} in external packages (not actionable here)\n`)

if (buckets.own.length > 0) {
  process.stderr.write('\ntypecheck FAILED: fix the diagnostics above before merging.\n')
  process.exit(1)
}

process.stdout.write('typecheck: owned source is clean\n')