/**
 * [WHO]: Provides vaultPath, writableVaultPath, isOperationLog
 * [FROM]: Depends on (none)
 * [TO]: Consumed by packages/integrations/src/tools.ts, apps/obsidian/src/obsidian-tools.ts
 * [HERE]: packages/integrations/src/vault-path.ts - shared canonical relative paths and protected-file rules for both vault tool surfaces
 */
export function vaultPath(input: string, allowRoot = false): string {
  const path = input.replace(/\\/g, '/')
  const parts = path.split('/').filter(Boolean)
  if (
    (!parts.length && !allowRoot) ||
    path.startsWith('/') ||
    /[:\0]/.test(path) ||
    parts.some((part) => part.startsWith('.') || /[. ]$/.test(part))
  )
    throw new Error('请使用知识库内的完整相对路径，不访问隐藏目录')
  return parts.join('/')
}

export function writableVaultPath(input: string): string {
  const path = vaultPath(input)
  if (/^raw(?:\/|$)/i.test(path)) throw new Error('raw 原始资料不可修改')
  return path
}

export function isOperationLog(input: string): boolean {
  return vaultPath(input).toLowerCase() === 'wiki/log.md'
}
