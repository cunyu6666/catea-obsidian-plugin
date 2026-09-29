/**
 * [WHO]: Provides Skill, listSkills, loadSkills, readSkillResource
 * [FROM]: Depends on node:fs/promises, ./storage
 * [TO]: Consumed by apps/obsidian/src/settings.ts, packages/agent-core/src/index.ts,
 *   packages/integrations/src/index.ts
 * [HERE]: packages/integrations/src/skills.ts - loads enabled .catea/skills/<id>/SKILL.md packages and reads path-guarded resources; content capped at 48000 chars, traversal rejected
 */
import { readdir, readFile } from 'node:fs/promises'
import { errnoCode, within } from './storage'
export interface Skill {
  id: string
  description: string
  content: string
}
export async function loadSkills(vault: string, enabled: string[]): Promise<Skill[]> {
  await within(vault, '.catea/skills')
  const result: Skill[] = []
  for (const id of enabled) {
    if (!/^[\w-]+$/.test(id)) continue
    const path = await within(vault, `.catea/skills/${id}/SKILL.md`)
    const content = await readFile(path, 'utf8')
    if (content.length > 48000) throw new Error(`Skill 过长：${id}`)
    result.push({ id, description: content.match(/^description:\s*(.+)$/m)?.[1] || id, content })
  }
  return result
}
export async function listSkills(vault: string) {
  try {
    return (await readdir(await within(vault, '.catea/skills'), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (e: unknown) {
    if (errnoCode(e) === 'ENOENT') return []
    throw e
  }
}
export async function readSkillResource(
  vault: string,
  enabled: string[],
  id: string,
  path: string,
) {
  if (!enabled.includes(id) || !/^[\w-]+$/.test(id)) throw new Error('Skill 未启用')
  if (
    !path ||
    path.split(/[\\/]/).some((p) => p === '..' || p.startsWith('.')) ||
    path.startsWith('/')
  )
    throw new Error('无效 Skill 资源路径')
  const content = await readFile(await within(vault, `.catea/skills/${id}/${path}`), 'utf8')
  if (content.length > 48000) throw new Error('Skill 资源超过 48 KB')
  return content
}
