/**
 * [WHO]: Provides TYPE_LABELS, TYPE_DESCRIPTIONS, typeLabel, typeDescription
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/MemoryPanel.tsx, apps/obsidian/src/__tests__/memory-labels.test.ts
 * [HERE]: apps/obsidian/src/memory-labels.ts - display names and one-line descriptions for the 19 memory types, keyed by the schema slug; a plain .ts module rather than living in MemoryPanel.tsx so the coverage gate can import it without a JSX loader
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

// One-line description for each type, shown beneath the icon and name in the
// sidebar card grid so the 19 categories are scannable at a glance.
// The same coverage test that guards TYPE_LABELS also guards this map.
export const TYPE_DESCRIPTIONS: Record<string, string> = {
  fact: '关于你、项目或世界的客观信息',
  preference: '习惯的写作风格与表达偏好',
  lesson: '踩过的坑与总结出的经验',
  decision: '做过的选择与背后的理由',
  pattern: '反复出现的行为或偏好规律',
  struggle: '卡住的难题与解决思路',
  event: '发生过的事件与时间点',
  entity: '人物、项目、概念等具体对象',
  work: '写过、改过、产出过的作品',
  episode: '一次对话或一段时间的摘录',
  facet: '同一对象的多个维度或视角',
  procedural: '做某事的标准步骤与流程',
  state: '当前进行中、需持续跟踪的事项',
  'writing-preference': '文风、语气、措辞偏好',
  'writing-project': '在写的稿件、章节、目标',
  concept: '抽象术语、定义、命名约定',
  material: '引用、参考、待用材料',
  'knowledge-method': '学习方法与研究套路',
  'editorial-decision': '改稿、定稿时的取舍',
}

/** Label for a type slug, falling back to the slug so an unmapped type is still legible. */
export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

/** One-line description for a type slug; empty string when the slug has no entry. */
export function typeDescription(type: string): string {
  return TYPE_DESCRIPTIONS[type] ?? ''
}
