/**
 * [WHO]: Provides memoryReadOnly, memoryTools
 * [FROM]: Depends on @sinclair/typebox, ../../agent-core/src/providers, ./model
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/memory/src/tools.ts - one memory tool surface with writing categories, source attribution and scope filters
 */
import { Type, type TProperties } from '@sinclair/typebox'
import type { ToolDefinition } from '../../agent-core/src/providers'
import { memoryInputSchema } from './model'
const string = Type.String()
const scope = Type.Optional(Type.Union([Type.Literal('persona'), Type.Literal('global')]))
function tool(name: string, description: string, properties: TProperties): ToolDefinition {
  return {
    name,
    description,
    parameters: Type.Object({ ...properties, scope }, { additionalProperties: false }),
  }
}
export const memoryTools: ToolDefinition[] = [
  tool(
    'memory_search',
    'Search general, writing and knowledge memories; filter by type, project or note. Include archived records to find memories for restoration.',
    {
      query: string,
      type: Type.Optional(memoryInputSchema.properties.type),
      project: Type.Optional(string),
      note: Type.Optional(string),
      includeArchived: Type.Optional(Type.Boolean()),
    },
  ),
  tool('memory_recall', 'Read a full memory with its attribution and reinforce it', { id: string }),
  tool(
    'memory_remember',
    'Store an explicit user-requested general, writing or knowledge memory. Preserve sources and stance; quoted material and assistant suggestions are not user beliefs. Use project/note for contextual instructions.',
    memoryInputSchema.properties,
  ),
  tool('memory_edit', 'Update one memory after approval; omitted fields are preserved', {
    id: string,
    ...Type.Partial(memoryInputSchema).properties,
  }),
  tool('memory_forget', 'Archive a memory after approval; exclude it from recall until restored', {
    id: string,
  }),
  tool('memory_restore', 'Restore an archived memory after approval', { id: string }),
  tool(
    'memory_resolve',
    'Resolve a conflict after approval; merge only memories of the same type and scope',
    {
      aId: string,
      bId: string,
      action: Type.Union(
        ['merge', 'demote', 'forget', 'mark-situational'].map((value) => Type.Literal(value)),
      ),
    },
  ),
  tool(
    'memory_dream',
    'Consolidate exact duplicates and archive stale or expired memories without inventing new beliefs',
    {},
  ),
  tool('memory_stats', 'Count active and archived memories by category', {}),
  tool('memory_review', 'Review projects, uncertain memories and recorded conflicts', {}),
  tool(
    'memory_insights',
    'Inspect general and writing-memory categories, projects, attribution uncertainty and conflicts',
    {},
  ),
]
export const memoryReadOnly = new Set([
  'memory_search',
  'memory_recall',
  'memory_stats',
  'memory_review',
  'memory_insights',
])
