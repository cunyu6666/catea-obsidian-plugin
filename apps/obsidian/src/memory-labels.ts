/**
 * [WHO]: Provides TYPE_LABELS, typeLabel
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/MemoryPanel.tsx, apps/obsidian/src/__tests__/memory-labels.test.ts
 * [HERE]: apps/obsidian/src/memory-labels.ts - display names for the 19 memory types, keyed by the schema slug; a plain .ts module rather than living in MemoryPanel.tsx so the coverage gate can import it without a JSX loader
 */

// Types with no records stay listed and greyed in the panel: hiding them would make
// the "new memory" picker and the type list disagree about what exists.
// __tests__/memory-labels.test.ts fails when memoryTypes gains a type with no label.
export const TYPE_LABELS: Record<string, string> = {
  fact: '事实',
  preference: '偏好',
  lesson: '教训',
  decision: '决策',
  pattern: '模式',
  struggle: '困境',
  event: '事件',
  entity: '实体',
  work: '作品',
  episode: '片段',
  facet: '侧面',
  procedural: '流程',
  state: '状态',
  'writing-preference': '写作偏好',
  'writing-project': '写作项目',
  concept: '概念',
  material: '素材',
  'knowledge-method': '知识方法',
  'editorial-decision': '编辑决策',
}

/** Label for a type slug, falling back to the slug so an unmapped type is still legible. */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}
