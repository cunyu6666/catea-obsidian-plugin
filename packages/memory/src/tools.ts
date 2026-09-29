/**
 * [WHO]: Provides memoryReadOnly, memoryTools
 * [FROM]: Depends on ../../agent-core/src/providers
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/memory/src/tools.ts - declares the memory_* tool schemas, each with a persona or global scope, and the memoryReadOnly allowlist that skips write approval
 */
import type { ToolDefinition } from '../../agent-core/src/providers'
const string = { type: 'string' }
export const memoryTools: ToolDefinition[] = [
  ['memory_search', 'Search layered memories', { query: string }],
  ['memory_recall', 'Recall and reinforce a memory', { id: string }],
  [
    'memory_remember',
    'Store an explicit user-requested memory',
    {
      type: {
        type: 'string',
        enum: ['fact', 'preference', 'lesson', 'decision', 'pattern', 'struggle', 'event'],
      },
      name: string,
      summary: string,
      detail: string,
    },
  ],
  ['memory_edit', 'Edit a memory after approval', { id: string, summary: string, detail: string }],
  ['memory_forget', 'Forget a memory after approval', { id: string }],
  ['memory_restore', 'Restore archived memory', { id: string }],
  [
    'memory_resolve',
    'Resolve conflicting memories',
    {
      aId: string,
      bId: string,
      action: { type: 'string', enum: ['merge', 'demote', 'forget', 'mark-situational'] },
    },
  ],
  ['memory_dream', 'Consolidate episodic and long-term memories', {}],
  ['memory_stats', 'Memory statistics', {}],
  ['memory_review', 'Review memory alignment and conflicts', {}],
  ['memory_insights', 'Memory insights', {}],
].map(([name, description, properties]) => ({
  name: name as string,
  description: description as string,
  parameters: {
    type: 'object',
    properties: {
      ...(properties as object),
      scope: { type: 'string', enum: ['persona', 'global'] },
    },
    required: Object.keys(properties as object),
    additionalProperties: false,
  },
}))
export const memoryReadOnly = new Set([
  'memory_search',
  'memory_recall',
  'memory_stats',
  'memory_review',
  'memory_insights',
])
