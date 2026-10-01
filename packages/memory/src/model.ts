/**
 * [WHO]: Provides memoryTypes, MemoryType, MemorySource, MemoryRecord, MemorySummary, MemoryDocument, MemoryInput, memoryInputSchema, validateMemoryInput, validateMemoryPatch, validateMemoryDocument
 * [FROM]: Depends on @sinclair/typebox, @sinclair/typebox/value
 * [TO]: Consumed by packages/memory/src/index.ts, packages/memory/src/store.ts, packages/memory/src/migration.ts, packages/memory/src/engine.ts, packages/memory/src/extraction.ts, packages/memory/src/tools.ts
 * [HERE]: packages/memory/src/model.ts - single writing and knowledge memory schema, shared by extraction, tools and persistence
 */
import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const memoryTypes = [
  'fact',
  'preference',
  'lesson',
  'decision',
  'pattern',
  'struggle',
  'event',
  'entity',
  'work',
  'episode',
  'facet',
  'procedural',
  'state',
  'writing-preference',
  'writing-project',
  'concept',
  'material',
  'knowledge-method',
  'editorial-decision',
] as const
export type MemoryType = (typeof memoryTypes)[number]
const text = Type.String({ maxLength: 16000 })
const strings = Type.Array(text, { maxItems: 100 })
const sourceSchema = Type.Object(
  {
    kind: Type.Union(
      (['user', 'document', 'assistant', 'inferred', 'legacy'] as const).map((value) =>
        Type.Literal(value),
      ),
    ),
    stance: Type.Union(
      (['endorsed', 'quoted', 'proposed', 'uncertain'] as const).map((value) =>
        Type.Literal(value),
      ),
    ),
    sessionId: Type.Optional(text),
    turnId: Type.Optional(text),
    path: Type.Optional(text),
    heading: Type.Optional(text),
    blockId: Type.Optional(text),
    excerpt: Type.Optional(text),
  },
  { additionalProperties: false },
)
export type MemorySource = Static<typeof sourceSchema>
export const memoryInputSchema = Type.Object(
  {
    type: Type.Union(memoryTypes.map((value) => Type.Literal(value))),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    detail: text,
    project: Type.Optional(text),
    note: Type.Optional(text),
    tags: Type.Optional(strings),
    sources: Type.Optional(Type.Array(sourceSchema, { maxItems: 100 })),
    retention: Type.Optional(
      Type.Union((['core', 'key-event', 'ambient'] as const).map((value) => Type.Literal(value))),
    ),
    stability: Type.Optional(
      Type.Union(
        (['stable', 'situational', 'volatile'] as const).map((value) => Type.Literal(value)),
      ),
    ),
    importance: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
    confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    ttlDays: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    attributes: Type.Optional(
      Type.Object(
        {
          audience: Type.Optional(text),
          goal: Type.Optional(text),
          stage: Type.Optional(text),
          rationale: Type.Optional(text),
          applicability: Type.Optional(text),
          positiveExamples: Type.Optional(strings),
          negativeExamples: Type.Optional(strings),
          steps: Type.Optional(strings),
          openQuestions: Type.Optional(strings),
          evidence: Type.Optional(strings),
          counterarguments: Type.Optional(strings),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)
export type MemoryInput = Static<typeof memoryInputSchema>
export interface MemoryRecord extends MemoryInput {
  id: string
  aliases: string[]
  tags: string[]
  sources: MemorySource[]
  links: Array<{ id: string; relation: string }>
  retention: 'core' | 'key-event' | 'ambient'
  stability: 'stable' | 'situational' | 'volatile'
  importance: number
  confidence: number
  createdAt: string
  updatedAt: string
  lastAccessedAt?: string
  accessCount: number
  archivedAt?: string
  archiveReason?: string
}
/**
 * Bounded projection for list views. A full MemoryRecord carries a detail of up to
 * 16000 characters plus sources and links, so a folder of records must never be
 * serialized whole; the detail view recalls one record by id instead.
 */
export interface MemorySummary {
  id: string
  type: MemoryType
  name: string
  summary: string
  project?: string
  tags: string[]
  importance: number
  updatedAt: string
  archivedAt?: string
}
export interface MemoryDocument {
  schemaVersion: 1
  records: MemoryRecord[]
  processedTurns: string[]
  lastConsolidationAt?: string
  migration?: { completedAt: string; backup: string; files: string[] }
}

export function validateMemoryInput(value: unknown): MemoryInput {
  if (!Value.Check(memoryInputSchema, value)) throw new Error('Invalid memory input')
  if (!value.name.trim() || !value.summary.trim()) throw new Error('Empty memory content')
  return value
}

export function validateMemoryPatch(value: unknown): Partial<MemoryInput> {
  if (!Value.Check(Type.Partial(memoryInputSchema), value)) throw new Error('Invalid memory update')
  if (
    (value.name !== undefined && !value.name.trim()) ||
    (value.summary !== undefined && !value.summary.trim())
  )
    throw new Error('Empty memory content')
  return value
}

export function validateMemoryDocument(value: unknown): asserts value is MemoryDocument {
  const record = Type.Object(
    {
      ...memoryInputSchema.properties,
      // Imported history and explicit merges can exceed the new-input budget.
      name: Type.String({ minLength: 1 }),
      summary: Type.String({ minLength: 1 }),
      detail: Type.String(),
      id: Type.String({ minLength: 1 }),
      aliases: Type.Array(Type.String()),
      tags: Type.Array(Type.String()),
      sources: Type.Array(sourceSchema),
      links: Type.Array(Type.Object({ id: Type.String(), relation: Type.String() })),
      retention: Type.Union(
        (['core', 'key-event', 'ambient'] as const).map((value) => Type.Literal(value)),
      ),
      stability: Type.Union(
        (['stable', 'situational', 'volatile'] as const).map((value) => Type.Literal(value)),
      ),
      importance: Type.Number({ minimum: 0, maximum: 10 }),
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
      createdAt: Type.String(),
      updatedAt: Type.String(),
      lastAccessedAt: Type.Optional(Type.String()),
      accessCount: Type.Integer({ minimum: 0 }),
      archivedAt: Type.Optional(Type.String()),
      archiveReason: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  )
  const schema = Type.Object(
    {
      schemaVersion: Type.Literal(1),
      records: Type.Array(record),
      processedTurns: Type.Array(Type.String()),
      lastConsolidationAt: Type.Optional(Type.String()),
      migration: Type.Optional(
        Type.Object({
          completedAt: Type.String(),
          backup: Type.String(),
          files: Type.Array(Type.String()),
        }),
      ),
    },
    { additionalProperties: false },
  )
  if (!Value.Check(schema, value))
    throw new Error('Invalid or unsupported memory store; original data was not changed')
  const ids = new Set<string>()
  for (const entry of value.records) {
    for (const id of [entry.id, ...entry.aliases]) {
      if (ids.has(id)) throw new Error('Duplicate memory ID')
      ids.add(id)
    }
    for (const date of [entry.createdAt, entry.updatedAt, entry.lastAccessedAt, entry.archivedAt]) {
      if (date !== undefined && !Number.isFinite(Date.parse(date)))
        throw new Error('Invalid memory date')
    }
  }
}
