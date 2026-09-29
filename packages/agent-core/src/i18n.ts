/**
 * [WHO]: Provides textValue, t
 * [FROM]: Depends on (none)
 * [TO]: Consumed by packages/agent-core/src/providers.ts, packages/agent-core/src/index.ts,
 *   packages/integrations/src/tools.ts, packages/integrations/src/web.ts,
 *   apps/obsidian/src/obsidian-tools.ts
 * [HERE]: packages/agent-core/src/i18n.ts - flat error-label map plus t() with {name} interpolation; returns the key when a label is unknown
 */
const labels: Record<string, string> = {
  attachmentUnavailable: '附件无法读取',
  modelStreamFailed: '模型响应失败',
  modelRequestFailed: '模型请求失败（{status}）',
  modelErrorDetailHidden: '请检查接口、模型与密钥',
  modelStreamMissing: '接口未返回响应流',
  modelInvalidArguments: '模型返回的工具参数不是有效 JSON',
}
export function textValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  if (value instanceof Error) return value.message
  return JSON.stringify(value) ?? ''
}
export function t(key: string, values: Record<string, unknown> = {}) {
  return (labels[key] || key).replace(/\{(\w+)\}/g, (_match: string, k: string) =>
    textValue(values[k]),
  )
}
