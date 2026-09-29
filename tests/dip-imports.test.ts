import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractImports } from './dip-contract.ts'

test('DIP | literal dynamic imports participate in dependency contracts', () => {
  const imports = extractImports(`import {request} from 'node:https'
const loaders=[()=>import('electron'),()=>import('@electron/remote')]`)
  assert.deepEqual([...imports].sort(), ['@electron/remote', 'electron', 'node:https'])
  assert.equal(extractImports('const load=()=>import(variable)').size, 0)
})
