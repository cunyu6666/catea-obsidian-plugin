/**
 * [WHO]: Provides ToolPresenterRegistry, createToolPresenters, ToolPresenter
 * [FROM]: Depends on ../../../packages/agent-core/src/types
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/tool-presenters.ts - registry translating tool events into activity card titles, summaries and details
 */
import type { ToolEvent } from '../../../packages/agent-core/src/types'

export interface ToolPresenter {
  match(tool: ToolEvent): boolean
  title(tool: ToolEvent, translate: (text: string) => string): string
  summary(tool: ToolEvent): string | undefined
  details(tool: ToolEvent): string
}

function readableResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2)
  } catch {
    return result
  }
}

const fallback: ToolPresenter = {
  match: () => true,
  title: (tool) => tool.name,
  summary: (tool) => tool.error || tool.result?.slice(0, 100),
  details: (tool) =>
    [
      `name: ${tool.name}`,
      `args:\n${JSON.stringify(tool.args, null, 2)}`,
      tool.mediaTask ? `task:\n${JSON.stringify(tool.mediaTask, null, 2)}` : undefined,
      tool.result !== undefined ? `result:\n${readableResult(tool.result)}` : undefined,
      tool.error && tool.error !== tool.result ? `error:\n${tool.error}` : undefined,
    ]
      .filter(Boolean)
      .join('\n\n'),
}

export class ToolPresenterRegistry {
  private presenters: ToolPresenter[] = []
  register(presenter: ToolPresenter): void {
    this.presenters.unshift(presenter)
  }
  private find(tool: ToolEvent): ToolPresenter {
    return this.presenters.find((presenter) => presenter.match(tool)) || fallback
  }
  title(tool: ToolEvent, translate: (text: string) => string): string {
    return this.find(tool).title(tool, translate)
  }
  summary(tool: ToolEvent): string | undefined {
    return this.find(tool).summary(tool)
  }
  details(tool: ToolEvent): string {
    return this.find(tool).details(tool)
  }
}

export function createToolPresenters(): ToolPresenterRegistry {
  const registry = new ToolPresenterRegistry()
  const titles: Record<string, string> = {
    generate_image: '生成图片',
    generate_video: '生成视频',
    generate_audio: '合成语音',
    web_search: '网络搜索',
    web_fetch: '读取网页',
    link_world_admin: '联网诊断',
    link_world_exec: 'Agent Reach 命令',
    obsidian_context: '当前笔记',
    obsidian_search: '搜索笔记',
    obsidian_open: '打开笔记',
    obsidian_read: '阅读笔记',
    obsidian_edit: '修改笔记',
    obsidian_properties: '笔记属性',
    obsidian_manage: '管理笔记',
    obsidian_settings: 'Catea 设置',
    skill_list: '查看技能',
    skill_create: '创建技能',
    skill_read: '读取技能资源',
  }
  registry.register({
    match: (tool) => Object.hasOwn(titles, tool.name),
    title: (tool, translate) => translate(titles[tool.name]),
    summary: (tool) => fallback.summary(tool),
    details: (tool) => fallback.details(tool),
  })
  return registry
}
