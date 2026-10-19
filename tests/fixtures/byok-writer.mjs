import fs from 'node:fs'
import promises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'

const [file, id, pause] = process.argv.slice(2)
let observing = false
let resume
const originalMkdir = fs.mkdir
fs.mkdir = function (path, ...args) {
  if (observing && path === `${file}.lock`) process.send({ type: 'lock-attempt' })
  return originalMkdir.call(this, path, ...args)
}
const originalRead = promises.readFile
promises.readFile = async (...args) => {
  const value = await originalRead(...args)
  if (observing && args[0] === file) process.send({ type: 'read' })
  return value
}
const originalWrite = promises.writeFile
promises.writeFile = async (...args) => {
  if (pause === 'pause' && args[0].startsWith(`${file}.`) && args[0].endsWith('.tmp')) {
    await new Promise((resolve) => {
      resume = resolve
      process.send({ type: 'before-write' })
    })
  }
  return originalWrite(...args)
}
syncBuiltinESMExports()

const { GlobalByokStore } = await import('../../apps/obsidian/src/global-byok.ts')
const store = new GlobalByokStore(file, {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value).reverse(),
  decryptString: (value) => Buffer.from(value).reverse().toString(),
})
await store.load()
process.on('message', async ({ type }) => {
  if (type === 'resume') return resume?.()
  if (type !== 'save') return
  observing = true
  try {
    await store.save({
      models: [{ id, apiKey: `fixture-key-${id}` }],
      deletedIds: ['fixture-deleted'],
    })
    process.send({ type: 'result', saved: true })
  } catch (error) {
    process.send({ type: 'result', saved: false, message: error.message })
  }
  process.disconnect()
})
process.send({ type: 'ready' })
