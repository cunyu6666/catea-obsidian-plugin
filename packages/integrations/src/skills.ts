/**
 * [WHO]: Provides Skill, SkillResource, SkillInfo, CreateSkillResult, presetSkillIds, loadSkill, loadSkills, listSkills, describeSkills, createSkill, readSkillResource
 * [FROM]: Depends on node:fs/promises, node:path, ./storage, ./skill-creator.md, ./find-skill.md
 * [TO]: Consumed by apps/obsidian/src/settings.ts, packages/agent-core/src/index.ts,
 *   packages/integrations/src/index.ts
 * [HERE]: packages/integrations/src/skills.ts - resolves enabled skills from .catea/skills/<id>/SKILL.md or the read-only bundled presets; validates, lists and writes skill packages; content capped at 48000 chars, traversal rejected
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { errnoCode, within } from './storage'
import skillCreator from './skill-creator.md'
import findSkill from './find-skill.md'

export interface Skill {
  id: string
  description: string
  content: string
}
export interface SkillResource {
  path: string
  content: string
}
export interface SkillInfo {
  id: string
  description: string
  source: 'vault' | 'preset'
  enabled: boolean
}
export interface CreateSkillResult {
  id: string
  path: string
  resources: string[]
  replaced: boolean
}

const MAX_CONTENT = 48000
const SKILL_ID = /^[\w-]+$/

/**
 * Shipped with the plugin and read-only: a preset never touches the vault, so an
 * upgrade cannot rewrite a skill the user is relying on.
 */
const presets: Readonly<Record<string, string>> = {
  'skill-creator': skillCreator,
  'find-skill': findSkill,
}
export const presetSkillIds: readonly string[] = Object.keys(presets).sort()

function descriptionOf(content: string, id: string): string {
  return content.match(/^description:[ \t]*(.+?)[ \t]*$/m)?.[1] || id
}

/** Rejects absolute paths, traversal and hidden segments, in either separator style. */
function safeSegments(path: string): string[] {
  const parts = path.split(/[\\/]/)
  if (
    !path ||
    /[:\0]/.test(path) ||
    path.startsWith('/') ||
    parts.some((p) => !p || p === '..' || p.startsWith('.'))
  )
    throw new Error('无效 Skill 资源路径')
  return parts
}

async function installedDirs(vault: string): Promise<string[]> {
  try {
    return (await readdir(await within(vault, '.catea/skills'), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (e: unknown) {
    if (errnoCode(e) === 'ENOENT') return []
    throw e
  }
}

/** One skill by id. A missing vault directory falls back to the bundled preset. */
export async function loadSkill(vault: string, id: string): Promise<Skill> {
  if (SKILL_ID.test(id)) {
    try {
      const content = await readFile(await within(vault, `.catea/skills/${id}/SKILL.md`), 'utf8')
      if (content.length > MAX_CONTENT) throw new Error(`Skill 过长：${id}`)
      return { id, description: descriptionOf(content, id), content }
    } catch (e: unknown) {
      if (errnoCode(e) !== 'ENOENT') throw e
    }
  }
  const preset = Object.hasOwn(presets, id) ? presets[id] : undefined
  if (preset === undefined) throw new Error(`Skill 未找到：${id}`)
  return { id, description: descriptionOf(preset, id), content: preset }
}

export async function loadSkills(vault: string, enabled: string[]): Promise<Skill[]> {
  await within(vault, '.catea/skills')
  const result: Skill[] = []
  for (const id of enabled) {
    // A malformed id is skipped, as before; an unknown but well-formed id still
    // fails the turn rather than silently dropping a skill the user enabled.
    if (!SKILL_ID.test(id)) continue
    result.push(await loadSkill(vault, id))
  }
  return result
}

export async function listSkills(vault: string) {
  const ids = new Set(presetSkillIds)
  for (const id of await installedDirs(vault)) ids.add(id)
  return [...ids].sort()
}

export async function describeSkills(vault: string, enabled: string[]): Promise<SkillInfo[]> {
  const dirs = new Set(await installedDirs(vault))
  const items: SkillInfo[] = []
  for (const id of await listSkills(vault)) {
    let description = id
    try {
      // Per-id reads: one broken SKILL.md must not hide every later skill.
      description = (await loadSkill(vault, id)).description
    } catch {
      description = Object.hasOwn(presets, id) ? descriptionOf(presets[id], id) : id
    }
    items.push({
      id,
      description,
      source: dirs.has(id) ? 'vault' : 'preset',
      enabled: enabled.includes(id),
    })
  }
  return items
}

/** Writes .catea/skills/<id>/SKILL.md plus optional resources; approval is the caller's job. */
async function writeSkill(
  vault: string,
  args: { id: string; content: string; resources?: SkillResource[]; overwrite?: boolean },
): Promise<CreateSkillResult> {
  const id = args.id
  if (!SKILL_ID.test(id)) throw new Error('Skill id 只能包含字母、数字、下划线和连字符')
  if (Object.hasOwn(presets, id)) throw new Error(`内置 Skill 预设不可覆盖：${id}`)
  const content = args.content ?? ''
  if (!content.trim()) throw new Error('SKILL.md 内容不能为空')
  if (content.length > MAX_CONTENT) throw new Error(`Skill 过长：${id}`)
  const frontmatter = content
    .replace(/\r\n/g, '\n')
    .match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/)
  if (!frontmatter) throw new Error('SKILL.md 必须以 --- 包裹的 frontmatter 开头')
  const name = frontmatter[1].match(/^name:[ \t]*(.+?)[ \t]*$/m)?.[1]
  if (name !== id) throw new Error(`frontmatter 的 name 必须与 id 一致：期望 ${id}`)
  if (!/^description:[ \t]*\S/m.test(frontmatter[1]))
    throw new Error('frontmatter 需要一句非空的 description，说明什么时候使用该技能')

  // Validate every resource before touching the filesystem: a bad path must not
  // leave a half-written skill behind.
  const resources = args.resources ?? []
  if (
    resources.length > 32 ||
    resources.reduce((size, item) => size + item.content.length, content.length) > 512000
  )
    throw new Error('Skill 包最多包含 32 个资源，总大小不得超过 512 KB')
  const seen = new Set<string>()
  for (const resource of resources) {
    const parts = safeSegments(resource.path)
    if (parts.length === 1 && parts[0].toLowerCase() === 'skill.md')
      throw new Error('资源路径不能是 SKILL.md，正文请用 content 提交')
    if (!resource.content) throw new Error(`Skill 资源内容为空：${resource.path}`)
    if (resource.content.length > MAX_CONTENT)
      throw new Error(`Skill 资源超过 48 KB：${resource.path}`)
    const canonical = parts.join('/').toLowerCase()
    if (
      [...seen].some(
        (path) =>
          path === canonical ||
          path.startsWith(`${canonical}/`) ||
          canonical.startsWith(`${path}/`),
      )
    )
      throw new Error(`Skill 资源重复：${resource.path}`)
    seen.add(canonical)
  }

  const dir = await within(vault, `.catea/skills/${id}`)
  const entry = await within(vault, `.catea/skills/${id}/SKILL.md`)
  for (const resource of resources)
    await within(vault, `.catea/skills/${id}/${safeSegments(resource.path).join('/')}`)
  let replaced = false
  try {
    await stat(entry)
    replaced = true
    if (!args.overwrite) throw new Error(`Skill 已存在：${id}（覆盖需要 overwrite）`)
  } catch (e: unknown) {
    if (errnoCode(e) !== 'ENOENT') throw e
  }

  const staging = await within(vault, `.catea/skills/.stage-${id}-${crypto.randomUUID()}`)
  const backup = await within(vault, `.catea/skills/.backup-${id}-${crypto.randomUUID()}`)
  let moved = false
  try {
    await mkdir(staging, { recursive: true })
    await writeFile(`${staging}/SKILL.md`, content, 'utf8')
    for (const resource of resources) {
      const target = `${staging}/${safeSegments(resource.path).join('/')}`
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, resource.content, 'utf8')
    }
    // Replace the complete package only after every file has been staged.
    // An incomplete existing directory is still user data and needs overwrite.
    try {
      await stat(dir)
      if (!args.overwrite) throw new Error(`Skill 已存在：${id}（覆盖需要 overwrite）`)
      await rename(dir, backup)
      moved = true
      replaced = true
    } catch (error: unknown) {
      if (errnoCode(error) !== 'ENOENT') throw error
    }
    try {
      await rename(staging, dir)
    } catch (error) {
      if (moved) await rename(backup, dir)
      throw error
    }
    if (moved) await rm(backup, { recursive: true, force: true }).catch(() => {})
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  return {
    id,
    path: `.catea/skills/${id}/SKILL.md`,
    resources: resources.map((resource) => safeSegments(resource.path).join('/')),
    replaced,
  }
}

const skillWrites = new Map<string, Promise<unknown>>()
export async function createSkill(
  vault: string,
  args: { id: string; content: string; resources?: SkillResource[]; overwrite?: boolean },
): Promise<CreateSkillResult> {
  const key = `${vault}/${args.id.toLowerCase()}`
  const previous = skillWrites.get(key) || Promise.resolve()
  const next = previous.catch(() => {}).then(() => writeSkill(vault, args))
  skillWrites.set(key, next)
  try {
    return await next
  } finally {
    if (skillWrites.get(key) === next) skillWrites.delete(key)
  }
}

export async function readSkillResource(
  vault: string,
  enabled: string[],
  id: string,
  path: string,
) {
  if (!enabled.includes(id) || !SKILL_ID.test(id)) throw new Error('Skill 未启用')
  safeSegments(path)
  const content = await readFile(await within(vault, `.catea/skills/${id}/${path}`), 'utf8')
  if (content.length > MAX_CONTENT) throw new Error('Skill 资源超过 48 KB')
  return content
}
