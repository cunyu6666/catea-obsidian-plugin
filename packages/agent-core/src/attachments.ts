/**
 * [WHO]: Provides attachmentIsText, attachmentText, readDroppedAttachments, readPickedAttachments
 * [FROM]: Depends on ./types
 * [TO]: Consumed by apps/obsidian/src/panel.tsx, packages/agent-core/src/providers.ts
 * [HERE]: packages/agent-core/src/attachments.ts - converts dropped or picked files into base64 ChatAttachment data URLs; rejects folders, hidden paths and node_modules; 10 MB each, 32 MB total, 64 files
 */
import type { ChatAttachment } from './types'

interface DroppedEntry {
  readonly name: string
  readonly isFile: boolean
  readonly isDirectory: boolean
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void
}

interface FileCandidate {
  file: File
  path: string
}

function readEntryFile(entry: DroppedEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file?.(resolve, reject))
}

function mimeTypeFor(file: File, path: string): string {
  if (file.type) return file.type
  const extension = path.split('.').at(-1)?.toLowerCase()
  const known: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    py: 'text/x-python',
    json: 'application/json',
    jsonl: 'application/json',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    toml: 'application/toml',
    sh: 'text/x-shellscript',
    sql: 'text/x-sql',
    log: 'text/plain',
  }
  return known[extension || ''] || 'application/octet-stream'
}

function readDataUrl(file: File, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const base64 = value.split(',', 2)[1]
      if (!value.includes(',')) reject(new Error(`Could not encode ${file.name}`))
      else resolve(`data:${mimeType};base64,${base64}`)
    }
    reader.readAsDataURL(file)
  })
}

export async function readDroppedAttachments(
  dataTransfer: DataTransfer,
  existing: readonly ChatAttachment[] = [],
): Promise<{ attachments: ChatAttachment[]; skipped: number; folders: number }> {
  const candidates: FileCandidate[] = []
  const items = [...dataTransfer.items].filter((item) => item.kind === 'file')
  // Capture entries before awaiting: browsers may clear DataTransfer after the drop event.
  const roots = items.map((item) => ({
    entry: item.webkitGetAsEntry?.(),
    file: item.getAsFile(),
  }))
  let skipped = 0,
    folders = 0
  if (items.length) {
    for (const { entry, file } of roots) {
      if (entry?.isDirectory) folders++
      else if (entry?.isFile) {
        try {
          candidates.push({ file: await readEntryFile(entry), path: entry.name })
        } catch {
          skipped++
        }
      } else if (file) candidates.push({ file, path: file.webkitRelativePath || file.name })
      else skipped++
    }
  } else
    candidates.push(
      ...[...dataTransfer.files].map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      })),
    )

  const result = await readPickedAttachments(candidates, existing)
  return { attachments: result.attachments, skipped: skipped + result.skipped, folders }
}

export async function readPickedAttachments(
  input: Iterable<File | FileCandidate>,
  existing: readonly ChatAttachment[] = [],
): Promise<{ attachments: ChatAttachment[]; skipped: number }> {
  const attachments: ChatAttachment[] = []
  let skipped = 0,
    total = existing.reduce((n, file) => n + file.size, 0)
  for (const item of input) {
    const file = 'file' in item ? item.file : item
    const path = 'file' in item ? item.path : file.webkitRelativePath || file.name
    if (
      path.split('/').some((part) => part.startsWith('.') || part === 'node_modules') ||
      file.size > 10 * 1024 * 1024 ||
      total + file.size > 32 * 1024 * 1024 ||
      existing.length + attachments.length >= 64
    ) {
      skipped++
      continue
    }
    try {
      const mimeType = mimeTypeFor(file, path)
      attachments.push({
        id: crypto.randomUUID(),
        kind: 'file',
        path,
        size: file.size,
        mimeType,
        dataUrl: await readDataUrl(file, mimeType),
      })
      total += file.size
    } catch {
      skipped++
    }
  }
  return { attachments, skipped }
}

export function attachmentIsText(attachment: ChatAttachment): boolean {
  if (attachment.content !== undefined) return true
  const mime = attachment.mimeType || ''
  return (
    mime.startsWith('text/') ||
    /^(?:application\/(?:json|xml|javascript|x-yaml|yaml|toml|x-www-form-urlencoded))$/.test(mime)
  )
}

export function attachmentText(attachment: ChatAttachment): string {
  if (attachment.content !== undefined) return attachment.content
  const base64 = attachment.dataUrl?.split(',', 2)[1] || ''
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
