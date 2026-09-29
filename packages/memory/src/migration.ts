/**
 * [WHO]: Provides migrateMemory
 * [FROM]: Depends on node:fs/promises, node:crypto, ../../integrations/src/storage, ./model
 * [TO]: Consumed by packages/memory/src/store.ts
 * [HERE]: packages/memory/src/migration.ts - one-time import of both NanoMem formats and archives, with exact-byte backup and ID preservation
 */
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { within, writeJson } from '../../integrations/src/storage'
import {
  validateMemoryDocument,
  memoryTypes,
  type MemoryDocument,
  type MemoryRecord,
  type MemoryType,
} from './model'

type Row = Record<string, unknown>
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
const number = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid legacy memory record')
  return value as Row
}
function date(value: unknown, fallback: string): string {
  const s = text(value)
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : fallback
}
function category(value: string, file: string): MemoryType {
  if (file.endsWith('work.json')) return 'work'
  if (file.endsWith('procedural.json')) return 'procedural'
  if (memoryTypes.includes(value as MemoryType)) return value as MemoryType
  if (/(^|\/)episodes\//.test(file) || file.endsWith('episodes.json')) return 'episode'
  if (file.endsWith('state.json')) return 'state'
  if (file.endsWith('preferences.json')) return 'preference'
  if (file.endsWith('lessons.json')) return 'lesson'
  if (file.endsWith('events.json')) return 'event'
  return 'fact'
}

function convert(old: Row, file: string, index: number, now: string): MemoryRecord {
  const kind = text(old.semanticType) || text(old.type) || text(old.kind)
  const type = category(kind, file)
  const detail =
    text(old.detail) ||
    text(old.content) ||
    text(old.searchText) ||
    text(old.summary) ||
    text(old.goal)
  const summary = text(old.summary) || text(old.searchText) || text(old.goal) || detail
  const name = text(old.name) || text(old.title) || text(old.goal) || summary.slice(0, 100)
  if (!name.trim() || !summary.trim())
    throw new Error(`Legacy memory has no readable content: ${file}[${index}]`)
  const scope = old.scope && typeof old.scope === 'object' ? row(old.scope) : {}
  const createdAt = date(old.createdAt ?? old.created ?? old.date, now)
  const archivedAt =
    old.archivedAt ||
    file.startsWith('_archive/') ||
    old.supersededById ||
    ['deprecated', 'superseded'].includes(text(old.status))
      ? date(old.archivedAt, now)
      : undefined
  const id =
    text(old.id) ||
    `import:${createHash('sha256')
      .update(`${file}:${text(old.sessionId)}:${index}`)
      .digest('hex')
      .slice(0, 24)}`
  const links: MemoryRecord['links'] = []
  for (const [key, relation] of [
    ['relatedIds', 'related'],
    ['sourceEpisodeIds', 'derived-from'],
    ['sourceFacetIds', 'derived-from'],
    ['sourceSemanticIds', 'derived-from'],
    ['conflictWithIds', 'conflicts-with'],
    ['supersedesIds', 'supersedes'],
    ['facetIds', 'has-facet'],
  ] as const) {
    for (const target of list(old[key])) links.push({ id: target, relation })
  }
  if (text(old.episodeId)) links.push({ id: text(old.episodeId), relation: 'derived-from' })
  if (text(old.supersededById))
    links.push({ id: text(old.supersededById), relation: 'superseded-by' })
  const extras: string[] = []
  for (const key of [
    'facetData',
    'eventData',
    'stateData',
    'keyObservations',
    'errors',
    'filesModified',
    'toolsUsed',
    'outcome',
    'horizon',
    'stateType',
    'facetType',
    'boundaries',
    'contextText',
    'evidence',
  ]) {
    if (old[key] !== undefined) extras.push(`${key}: ${JSON.stringify(old[key])}`)
  }
  const steps = Array.isArray(old.steps)
    ? old.steps.map((s) => (typeof s === 'string' ? s : text(row(s).text))).filter(Boolean)
    : []
  const sources: MemoryRecord['sources'] = [
    {
      kind: 'legacy',
      stance: 'uncertain',
      path: file,
      ...(text(old.sessionId) ? { sessionId: text(old.sessionId) } : {}),
    },
  ]
  if (Array.isArray(old.evidence)) {
    for (const value of old.evidence) {
      const evidence = row(value)
      sources.push({
        kind: text(evidence.filePath) ? 'document' : 'legacy',
        stance: 'uncertain',
        ...(text(evidence.filePath) ? { path: text(evidence.filePath) } : {}),
        ...(text(evidence.excerpt) ? { excerpt: text(evidence.excerpt).slice(0, 16000) } : {}),
      })
    }
  }
  return {
    id,
    aliases: [],
    type,
    name,
    summary,
    detail: [detail, ...extras].filter(Boolean).join('\n\n'),
    project: text(scope.project) || text(old.project) || undefined,
    tags: [...new Set([...list(old.tags), `imported:${kind || 'work'}`])],
    sources,
    links,
    createdAt,
    updatedAt: date(old.updatedAt, createdAt),
    lastAccessedAt:
      old.lastAccessedAt || old.lastAccessed
        ? date(old.lastAccessedAt ?? old.lastAccessed, createdAt)
        : undefined,
    accessCount: Math.max(0, Math.floor(number(old.accessCount, 0))),
    importance: Math.max(0, Math.min(10, number(old.importance, 5))),
    confidence: Math.max(0, Math.min(1, number(old.confidence, 0.5))),
    retention:
      old.retention === 'core' || old.retention === 'key-event' ? old.retention : 'ambient',
    stability:
      old.stability === 'situational' || old.stability === 'volatile' ? old.stability : 'stable',
    ...(number(old.ttlDays ?? old.ttl, 0) > 0
      ? { ttlDays: number(old.ttlDays ?? old.ttl, 0) }
      : {}),
    archivedAt,
    archiveReason: archivedAt ? text(old.archiveReason) || 'imported-archive' : undefined,
    attributes: {
      ...(steps.length ? { steps: steps.slice(0, 100) } : {}),
      ...(text(old.applicability)
        ? { applicability: text(old.applicability).slice(0, 16000) }
        : {}),
      ...(text(old.userGoal) ? { goal: text(old.userGoal).slice(0, 16000) } : {}),
    },
  }
}

export async function migrateMemory(vault: string, directory: string): Promise<MemoryDocument> {
  const files: Record<string, string> = {}
  const read = async (relative: string): Promise<unknown> => {
    const path = await within(vault, `${directory}/${relative}`)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    // Parsing errors abort before publishing the canonical store or touching source files.
    const value: unknown = JSON.parse(raw)
    files[relative] = raw
    return value
  }
  const now = new Date().toISOString()
  const records: MemoryRecord[] = []
  const refs = new Map<string, string>()
  const identities = new Map<string, MemoryRecord>()
  const add = (old: Row, file: string, index: number) => {
    const entry = convert(old, file, index, now)
    // Collapse identical mirrors; an archived mirror wins to avoid resurrecting forgotten data.
    const key = JSON.stringify([
      entry.type,
      entry.project,
      entry.name,
      entry.summary,
      text(old.detail) || text(old.content) || '',
    ])
    const mirror = identities.get(key)
    const previous = records.find((r) => r.id === entry.id || r.aliases.includes(entry.id))
    if (previous && previous !== mirror) {
      // V2 is scanned first. Keep the conflicting older copy under a qualified ID.
      entry.id = `import:${file}:${index}:${entry.id}`
    }
    if (mirror) {
      if (entry.id !== mirror.id && !mirror.aliases.includes(entry.id))
        mirror.aliases.push(entry.id)
      mirror.sources.push(...entry.sources)
      mirror.links.push(...entry.links)
      if (entry.archivedAt) {
        mirror.archivedAt = entry.archivedAt
        mirror.archiveReason = entry.archiveReason
      }
      mirror.accessCount = Math.max(mirror.accessCount, entry.accessCount)
      mirror.tags = [...new Set([...mirror.tags, ...entry.tags])]
      if (entry.detail !== mirror.detail && !mirror.detail.includes(entry.detail))
        mirror.detail = `${mirror.detail}\n\n${entry.detail}`
      refs.set(entry.id, mirror.id)
    } else {
      records.push(entry)
      identities.set(key, entry)
      refs.set(entry.id, entry.id)
    }
  }
  for (const prefix of ['', '_archive/']) {
    for (const name of [
      'v2/semantic.json',
      'v2/procedural.json',
      'v2/episodes.json',
      'v2/facets.json',
      'v2/state.json',
      'knowledge.json',
      'lessons.json',
      'events.json',
      'preferences.json',
      'facets.json',
      'work.json',
    ]) {
      const value = await read(prefix + name)
      if (value === undefined) continue
      if (!Array.isArray(value)) throw new Error(`Invalid legacy memory array: ${prefix + name}`)
      value.forEach((v, i) => add(row(v), prefix + name, i))
    }
    const episodesPath = await within(vault, `${directory}/${prefix}episodes`)
    let names: string[] = []
    try {
      names = await readdir(episodesPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
      const file = `${prefix}episodes/${name}`
      const value = await read(file)
      add(row(value), file, 0)
    }
    for (const name of ['meta.json', 'v2/meta.json', 'v2/links.json']) await read(prefix + name)
  }
  for (const name of ['v2/links.json', '_archive/v2/links.json']) {
    if (!files[name]) continue
    const links: unknown = JSON.parse(files[name])
    if (!Array.isArray(links)) throw new Error(`Invalid legacy links: ${name}`)
    for (const value of links) {
      const link = row(value)
      const from = records.find((r) => r.id === refs.get(text(link.fromId)))
      if (from)
        from.links.push({
          id: refs.get(text(link.toId)) || text(link.toId),
          relation: text(link.type) || 'related',
        })
    }
  }
  for (const entry of records) {
    entry.links = [
      ...new Map(
        entry.links.map((link) => {
          const mapped = { ...link, id: refs.get(link.id) || link.id }
          return [`${mapped.relation}:${mapped.id}`, mapped] as const
        }),
      ).values(),
    ].filter((link) => link.id && link.id !== entry.id)
  }
  const data: MemoryDocument = { schemaVersion: 1, records, processedTurns: [] }
  const fileNames = Object.keys(files).sort()
  if (fileNames.length) {
    const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16)
    const backup = `migration-backup-${digest}.json`
    const backupPath = await within(vault, `${directory}/${backup}`)
    const content = JSON.stringify({ files }, null, 2)
    let existing: string | undefined
    try {
      existing = await readFile(backupPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (existing !== undefined && existing !== content)
      throw new Error('Memory migration backup does not match source data')
    if (existing === undefined) await writeJson(backupPath, { files })
    data.migration = { completedAt: now, backup, files: fileNames }
  }
  validateMemoryDocument(data)
  return data
}
