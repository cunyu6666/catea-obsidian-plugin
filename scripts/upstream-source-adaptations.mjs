// Verify a maintained source adaptation and reconstruct the exact original bytes.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const digest = (text) => createHash('sha256').update(text).digest('hex')
export function restoreOriginal(source, patch) {
  if (digest(source) !== patch.adaptedSha256) throw new Error('Adapted upstream digest mismatch')
  const lines = source.split('\n')
  for (const edit of [...patch.edits].reverse()) {
    if (
      JSON.stringify(lines.slice(edit.at, edit.at + edit.after.length)) !==
      JSON.stringify(edit.after)
    )
      throw new Error('Upstream source adaptation context mismatch')
    lines.splice(edit.at, edit.after.length, ...edit.before)
  }
  const original = lines.join('\n')
  if (digest(original) !== patch.originalSha256)
    throw new Error('Original upstream digest mismatch')
  return original
}
export async function originalSource(root, path, source) {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'packages/UPSTREAM_ADAPTATIONS.json'), 'utf8'),
  )
  const patch = manifest.files[path]
  return patch ? restoreOriginal(source, patch) : source
}
