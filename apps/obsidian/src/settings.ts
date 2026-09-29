/**
 * [WHO]: Provides CateaSettings
 * [FROM]: Depends on obsidian, ./main, ../../../packages/agent-core/src/types, ../../../packages/agent-core/src/byok, ../../../packages/integrations/src/skills, ../../../packages/personas/src
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/settings.ts - plugin settings tab for language, paper toggles, Agent persona and capabilities, BYOK models and MCP servers; ModelModal validates through normalizeModel
 */
import { App, PluginSettingTab, Setting, Notice, Modal, type SettingDefinitionItem } from 'obsidian'
import type Catea from './main'
import type { ModelConfig } from '../../../packages/agent-core/src/types'
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_FREE_MODEL,
  createOpenRouterModel,
  defaultBaseUrl,
  isOpenRouterModel,
  normalizeModel,
  selectedModel,
} from '../../../packages/agent-core/src/byok'
import { listSkills } from '../../../packages/integrations/src/skills'
import { persona, personas } from '../../../packages/personas/src'
interface SettingsRow {
  name: string
  desc?: string
  render: (setting: Setting) => void
}
interface SettingsSection {
  heading?: string
  rows: SettingsRow[]
}

export class CateaSettings extends PluginSettingTab {
  constructor(
    app: App,
    private owner: Catea,
  ) {
    super(app, owner)
  }

  // Use the same definitions for 1.13+ search and the 1.8+ imperative fallback.
  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map((section) => ({
      type: 'group',
      heading: section.heading,
      items: section.rows,
    }))
  }
  display() {
    this.renderLegacy()
  }
  private refresh() {
    const update = (this as unknown as { update?: () => void }).update
    if (update) update.call(this)
    else this.renderLegacy()
  }
  private renderLegacy() {
    this.containerEl.empty()
    this.containerEl.addClass('catea-settings')
    const intro = this.containerEl.createDiv({ cls: 'catea-settings__intro' })
    new Setting(intro).setName(this.owner.t('设置')).setHeading()
    intro.createEl('p', {
      text: this.owner.t(
        '调整纸张界面、Agent 和连接。BYOK 模型可在本机跨知识库共享；其他设置保存在当前知识库中。',
      ),
    })
    for (const section of this.sections()) {
      const group = this.containerEl.createDiv({ cls: 'catea-settings__group' })
      if (section.heading)
        new Setting(group)
          .setName(section.heading)
          .setHeading()
          .settingEl.addClass('catea-settings__section-title')
      const card = group.createDiv({ cls: 'catea-settings__card' })
      for (const row of section.rows) {
        const setting = new Setting(card).setName(row.name)
        if (row.desc) setting.setDesc(row.desc)
        row.render(setting)
      }
    }
  }
  private sections(): SettingsSection[] {
    const p = this.owner,
      tr = p.t,
      c = p.agentSettings
    const appearance: SettingsRow[] = [
      {
        name: tr('语言 / Language'),
        render: (s) => {
          s.addDropdown((d) =>
            d
              .addOption('zh', tr('简体中文'))
              .addOption('en', 'English')
              .setValue(c.language || 'zh')
              .onChange(async (value) => {
                c.language = value === 'en' ? 'en' : 'zh'
                await p.saveAgentSettings()
                p.refreshPaperLanguage()
                this.refresh()
              }),
          )
        },
      },
    ]
    appearance.push({
      name: tr('主题'),
      desc: tr('选择亮色、暗色，或跟随操作系统外观。'),
      render: (s) => {
        s.addDropdown((d) =>
          d
            .addOption('light', tr('亮色'))
            .addOption('dark', tr('暗色'))
            .addOption('system', tr('跟随系统'))
            .setValue(c.theme || 'system')
            .onChange(async (value) => {
              c.theme = value === 'light' || value === 'dark' ? value : 'system'
              p.applyTheme()
              await p.saveAgentSettings()
            }),
        )
      },
    })
    for (const [key, label] of [
      ['enabled', '启用纸张界面'],
      ['toolbar', '格式工具栏'],
      ['tablerIcons', 'Tabler 图标'],
      ['hideProperties', '隐藏正文属性'],
      ['hideRibbon', '隐藏导航栏'],
      ['hideStatus', '隐藏状态栏'],
    ] as const) {
      appearance.push({
        name: tr(label),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(p.settings[key]).onChange(async (value) => {
              p.settings[key] = value
              await p.saveData(p.settings)
              p.apply()
            }),
          )
        },
      })
    }
    appearance.push({
      name: tr('笔记缩略图'),
      desc: tr('文件树显示真实标题、正文和首张本地图片的缩略预览。'),
      render: (s) => {
        s.addToggle((t) =>
          t.setValue(c.noteThumbnails !== false).onChange(async (value) => {
            c.noteThumbnails = value
            await p.saveAgentSettings()
            p.refreshThumbnails()
          }),
        )
      },
    })
    appearance.push({
      name: tr('Git 历史'),
      desc: tr('在右侧栏显示知识库的本地 Git 时间线。默认关闭，不执行提交或同步。'),
      render: (s) => {
        s.addToggle((t) =>
          t.setValue(c.gitHistory === true).onChange(async (value) => {
            c.gitHistory = value
            await p.saveAgentSettings()
            await p.syncGitHistory(value)
          }),
        )
      },
    })
    const agent: SettingsRow[] = [
      {
        name: tr('启用 Agent'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.enabled).onChange(async (value) => {
              c.enabled = value
              if (!value) p.stopAgents()
              p.agent.memory.setEnabled(value && c.memory)
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('人格'),
        desc: tr('选择 Agent 的对话风格；从下一条消息开始使用。'),
        render: (s) => {
          s.addDropdown((d) => {
            for (const item of personas) d.addOption(item.id, item.name)
            d.setValue(persona(c.personaId).id).onChange(async (value) => {
              c.personaId = persona(value).id
              p.agent.session.personaId = c.personaId
              await p.saveAgentSettings()
            })
          })
        },
      },
      {
        name: tr('附带当前笔记'),
        desc: tr('发送消息时将当前笔记内容加入上下文。默认开启。'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.includeCurrentNote !== false).onChange(async (value) => {
              c.includeCurrentNote = value
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('网络搜索与网页读取'),
        desc: tr(
          '网页搜索使用 Exa / Jina / DuckDuckGo；可诊断并经确认调用已安装的 Agent Reach。搜索词和目标 URL 会发送到联网服务。',
        ),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.web).onChange(async (value) => {
              c.web = value
              p.stopAgents()
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('长期记忆'),
        desc: tr('自动提取、召回和巩固；保存在当前知识库 .catea/memory。'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.memory).onChange(async (value) => {
              c.memory = value
              if (!value) p.stopAgents()
              p.agent.memory.setEnabled(value && c.enabled)
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: 'Bash',
        desc: tr('默认开启，命令执行遵循下方权限模式。'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.shell).onChange(async (value) => {
              c.shell = value
              p.stopAgents()
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('引用批注'),
        desc: tr('在回复卡片中显示引用批注按钮，可选中文字后添加批注。默认关闭。'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.enableReplyAnnotations === true).onChange(async (value) => {
              c.enableReplyAnnotations = value
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('显示 Token 用量'),
        desc: tr('在每条回复下显示输入、输出和缓存命中的 Token 数。默认关闭。'),
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(c.showTokenUsage === true).onChange(async (value) => {
              c.showTokenUsage = value
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('权限模式'),
        desc: tr(
          '帮我批准：自动放行 pwd、ls 等简单目录查看，其余操作请求确认。完全访问：跳过 Bash、文件修改、MCP 和记忆更新的审批，命令可访问知识库之外。',
        ),
        render: (s) => {
          s.addDropdown((d) =>
            d
              .addOption('assist', tr('帮我批准'))
              .addOption('full', tr('完全访问'))
              .setValue(c.permissionMode || 'assist')
              .onChange(async (value) => {
                p.stopAgents()
                c.permissionMode = value === 'full' ? 'full' : 'assist'
                await p.saveAgentSettings()
              }),
          )
        },
      },
    ]
    const models: SettingsRow[] = [
      {
        name: tr('本机共享'),
        desc: tr(
          p.globalByok
            ? 'BYOK 模型和密钥已加密保存在本机，切换知识库后可使用。'
            : '本机安全加密不可用；BYOK 模型保存在当前知识库，密钥优先使用 Obsidian 安全存储。',
        ),
        render: () => {},
      },
    ]
    models.push(
      ...c.models.map((model) => ({
        name: model.name,
        desc: `${isOpenRouterModel(model) ? 'OpenRouter' : model.protocol === 'openai' ? tr('OpenAI 兼容') : tr('Anthropic 兼容')} · ${model.model} · ${model.baseUrl}${model.apiKey ? '' : tr(' · 请补充 API Key')}`,
        render: (s: Setting) => {
          s.addButton((b) =>
            b
              .setButtonText(tr('编辑'))
              .onClick(() =>
                (isOpenRouterModel(model)
                  ? new OpenRouterModal(p, model, () => this.refresh())
                  : new ModelModal(p, model, () => this.refresh())
                ).open(),
              ),
          )
          s.addButton((b) =>
            b.setButtonText(tr('移除')).onClick(async () => {
              const previous = c.models,
                previousId = c.modelId
              c.models = c.models.filter((m) => m.id !== model.id)
              c.modelId = selectedModel(c.models, c.modelId)?.id || ''
              try {
                await p.saveModels(model.id)
                if (!p.globalByok) p.saveSecret(model.id, '')
                this.refresh()
              } catch (error) {
                c.models = previous
                c.modelId = previousId
                new Notice(tr(error instanceof Error ? error.message : '模型移除失败，请重试'))
              }
            }),
          )
        },
      })),
    )
    models.push({
      name: tr('添加 OpenRouter'),
      desc: tr('只需 API Key；选择 Free 自动路由，或填写模型 ID。'),
      render: (s) => {
        s.addButton((b) =>
          b
            .setButtonText(tr('添加 OpenRouter'))
            .setCta()
            .onClick(() =>
              new OpenRouterModal(
                p,
                {
                  id: crypto.randomUUID(),
                  name: '',
                  protocol: 'openai',
                  baseUrl: OPENROUTER_BASE_URL,
                  apiKey: '',
                  model: OPENROUTER_FREE_MODEL,
                },
                () => this.refresh(),
              ).open(),
            ),
        )
      },
    })
    models.push({
      name: tr('添加其他模型'),
      desc: tr('使用自己的 API Key，直接连接 OpenAI / Anthropic 兼容服务。仅显示你配置的模型。'),
      render: (s) => {
        s.addButton((b) =>
          b.setButtonText(tr('添加其他模型')).onClick(() =>
            new ModelModal(
              p,
              {
                id: crypto.randomUUID(),
                name: '',
                protocol: 'openai',
                baseUrl: defaultBaseUrl('openai'),
                apiKey: '',
                model: '',
              },
              () => this.refresh(),
            ).open(),
          ),
        )
      },
    })
    const skills: SettingsRow[] = [
      {
        name: tr('Obsidian 操作 · 内置'),
        desc: tr(
          '随 Agent 启用：当前笔记、搜索、内部打开、阅读、编辑与属性管理；写入和设置变更需确认。',
        ),
        render: () => {},
      },
      {
        name: 'Skills',
        desc: tr('将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。'),
        render: (s) => {
          const box = s.settingEl.createDiv()
          void listSkills(p.vaultPath)
            .then((ids) => {
              if (!box.isConnected) return
              for (const id of ids)
                new Setting(box).setName(id).addToggle((t) =>
                  t.setValue(c.skills.includes(id)).onChange(async (value) => {
                    c.skills = value
                      ? [...new Set([...c.skills, id])]
                      : c.skills.filter((item) => item !== id)
                    await p.saveAgentSettings()
                  }),
                )
            })
            .catch(
              (error: unknown) =>
                new Notice(error instanceof Error ? error.message : String(error)),
            )
        },
      },
    ]
    const mcp: SettingsRow[] = []
    for (const server of c.mcp) {
      mcp.push({
        name: server.id,
        render: (s) => {
          s.addToggle((t) =>
            t.setValue(server.enabled).onChange(async (value) => {
              server.enabled = value
              await p.saveAgentSettings()
            }),
          )
        },
      })
      mcp.push({
        name: tr('连接方式'),
        render: (s) => {
          s.addDropdown((d) =>
            d
              .addOption('http', 'HTTP')
              .addOption('stdio', tr('本地 stdio'))
              .setValue(server.transport)
              .onChange(async (value) => {
                server.transport = value === 'stdio' ? 'stdio' : 'http'
                await p.saveAgentSettings()
                this.refresh()
              }),
          )
        },
      })
      const key = server.transport === 'http' ? 'url' : 'command'
      mcp.push({
        name: tr(key === 'url' ? '服务器地址' : '可执行程序'),
        render: (s) => {
          s.addText((t) =>
            t.setValue(server[key] || '').onChange(async (value) => {
              server[key] = value
              await p.saveAgentSettings()
            }),
          )
        },
      })
      if (server.transport === 'stdio')
        mcp.push({
          name: tr('参数（JSON 数组）'),
          render: (s) => {
            s.addTextArea((t) =>
              t.setValue(JSON.stringify(server.args || [])).onChange(async (value) => {
                let parsed: unknown
                try {
                  parsed = JSON.parse(value)
                } catch {
                  return
                }
                if (
                  !Array.isArray(parsed) ||
                  !parsed.every((arg: unknown) => typeof arg === 'string')
                )
                  return
                server.args = parsed
                await p.saveAgentSettings()
              }),
            )
          },
        })
      else
        mcp.push({
          name: 'Bearer token',
          render: (s) => {
            s.addText((t) => {
              t.inputEl.type = 'password'
              t.setValue(server.token || '').onChange((value) => {
                server.token = value
                p.saveSecret(`mcp-${server.id}`, value)
              })
            })
          },
        })
      mcp.push({
        name: tr('移除 MCP'),
        render: (s) => {
          s.addButton((b) =>
            b.setButtonText(tr('移除 MCP')).onClick(async () => {
              c.mcp = c.mcp.filter((item) => item !== server)
              await p.saveAgentSettings()
              this.refresh()
            }),
          )
        },
      })
    }
    mcp.push({
      name: tr('添加 MCP'),
      render: (s) => {
        s.addButton((b) =>
          b.setButtonText(tr('添加 MCP')).onClick(async () => {
            c.mcp.push({ id: crypto.randomUUID(), enabled: false, transport: 'http', url: '' })
            await p.saveAgentSettings()
            this.refresh()
          }),
        )
      },
    })
    const updates: SettingsRow[] = [
      {
        name: tr('自动检查更新'),
        desc: tr('每天从 GitHub 检查一次正式版本，不发送笔记或密钥。'),
        render: (s) => {
          s.addToggle((toggle) =>
            toggle.setValue(c.autoCheckUpdates !== false).onChange(async (value) => {
              await p.updates.setEnabled(value)
              this.refresh()
            }),
          )
        },
      },
      {
        name: tr('插件更新'),
        desc: p.updates?.available
          ? `${tr('Catea 有新版本')} ${p.updates.available}`
          : tr('检查是否有兼容当前 Obsidian 的新版本。'),
        render: (s) => {
          s.addButton((button) =>
            button.setButtonText(tr('检查更新')).onClick(async () => {
              button.setDisabled(true)
              button.setButtonText(tr('正在检查…'))
              try {
                const result = await p.updates.check(true)
                new Notice(
                  tr(
                    result === 'failed'
                      ? '暂时无法检查更新，请稍后重试'
                      : result === 'available'
                        ? 'Catea 有新版本'
                        : '没有可用的兼容更新',
                  ),
                )
              } finally {
                button.setDisabled(false)
                button.setButtonText(tr('检查更新'))
                this.refresh()
              }
            }),
          )
          if (p.updates?.available)
            s.addButton((button) =>
              button.setButtonText(tr('前往更新')).onClick(() => p.openPluginUpdates()),
            )
        },
      },
      {
        name: tr('支持提示'),
        desc: tr('打开 Catea 侧栏时偶尔显示一条项目支持信息，每个本地月最多一次；关闭后不再显示。'),
        render: (s) => {
          s.addToggle((toggle) =>
            toggle.setValue(c.supportPrompt !== false).onChange(async (value) => {
              c.supportPrompt = value
              await p.saveAgentSettings()
            }),
          )
        },
      },
    ]
    return [
      { heading: tr('更新'), rows: updates },
      { heading: tr('外观'), rows: appearance },
      { heading: 'Agent', rows: agent },
      { heading: tr('BYOK 模型'), rows: models },
      { heading: 'Skills', rows: skills },
      { heading: 'MCP', rows: mcp },
    ]
  }
}

async function storeModel(owner: Catea, model: ModelConfig, select = false) {
  const c = owner.agentSettings,
    previous = c.models,
    previousId = c.modelId
  c.models = c.models.filter((m) => m.id !== model.id).concat(model)
  c.modelId = select ? model.id : selectedModel(c.models, c.modelId)?.id || model.id
  try {
    await owner.saveModels()
    if (!owner.globalByok) owner.saveSecret(model.id, model.apiKey)
    await owner.addMiniMaxModels()
  } catch (error) {
    c.models = previous
    c.modelId = previousId
    owner.emit()
    throw error
  }
}

class OpenRouterModal extends Modal {
  private key: string
  private modelId: string
  private free: boolean
  constructor(
    private owner: Catea,
    private draft: ModelConfig,
    private saved: () => void,
  ) {
    super(owner.app)
    this.key = draft.apiKey || owner.agentSettings.models.find(isOpenRouterModel)?.apiKey || ''
    this.modelId = draft.model === OPENROUTER_FREE_MODEL ? '' : draft.model
    this.free = draft.model === OPENROUTER_FREE_MODEL
  }
  onOpen() {
    const tr = this.owner.t,
      el = this.contentEl
    this.titleEl.setText(tr('配置 OpenRouter'))
    el.createEl('a', {
      text: tr('创建 OpenRouter API Key ↗'),
      href: 'https://openrouter.ai/settings/keys',
      attr: { target: '_blank', rel: 'noopener noreferrer' },
    })
    new Setting(el).setName(tr('模型选择')).addDropdown((dropdown) =>
      dropdown
        .addOption('free', tr('Free 自动路由'))
        .addOption('custom', tr('指定模型 ID'))
        .setValue(this.free ? 'free' : 'custom')
        .onChange((value) => {
          this.free = value === 'free'
          modelSetting.settingEl.style.display = this.free ? 'none' : ''
        }),
    )
    const modelSetting = new Setting(el)
      .setName(tr('模型 ID'))
      .setDesc(tr('例如 openai/gpt-oss-120b:free；从 OpenRouter 模型页复制完整 ID。'))
      .addText((input) =>
        input
          .setPlaceholder('Provider/model')
          .setValue(this.modelId)
          .onChange((value) => {
            this.modelId = value
          }),
      )
    modelSetting.settingEl.style.display = this.free ? 'none' : ''
    new Setting(el)
      .setName('API key')
      .setDesc(
        tr(
          this.owner.globalByok
            ? '在 OpenRouter 创建 Key；加密保存在本机，跨知识库共享。'
            : '在 OpenRouter 创建 Key；优先保存到 Obsidian 安全存储，不写入知识库配置。',
        ),
      )
      .addText((input) => {
        input.inputEl.type = 'password'
        input.inputEl.autocomplete = 'off'
        input.setValue(this.key).onChange((value) => {
          this.key = value
        })
      })
    new Setting(el).setDesc(
      tr(
        'Free 会自动选择可用的免费模型；可用性、工具支持和请求限额由 OpenRouter 决定。笔记内容会发送给 OpenRouter 及其选定的模型提供方。',
      ),
    )
    const error = el.createEl('p', { attr: { role: 'alert' } })
    new Setting(el)
      .addButton((button) => button.setButtonText(tr('取消')).onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(tr('保存并使用'))
          .setCta()
          .onClick(async () => {
            let model: ModelConfig
            try {
              model = createOpenRouterModel(
                this.draft.id,
                this.key,
                this.free ? OPENROUTER_FREE_MODEL : this.modelId,
              )
            } catch (reason) {
              error.setText(tr(reason instanceof Error ? reason.message : '请检查配置'))
              return
            }
            button.setDisabled(true)
            try {
              await storeModel(this.owner, model, true)
              this.saved()
              this.close()
            } catch (reason) {
              error.setText(tr(reason instanceof Error ? reason.message : '保存失败，请重试'))
              button.setDisabled(false)
            }
          }),
      )
  }
  onClose() {
    this.contentEl.empty()
    this.key = ''
  }
}

class ModelModal extends Modal {
  private draft: ModelConfig
  constructor(
    private owner: Catea,
    model: ModelConfig,
    private saved: () => void,
  ) {
    super(owner.app)
    this.draft = { ...model }
  }
  onOpen() {
    const tr = this.owner.t,
      d = this.draft,
      el = this.contentEl
    this.titleEl.setText(
      this.owner.agentSettings.models.some((m) => m.id === d.id)
        ? tr('编辑 BYOK 模型')
        : tr('添加 BYOK 模型'),
    )
    new Setting(el).setName(tr('显示名称')).addText((t) =>
      t.setValue(d.name).onChange((v) => {
        d.name = v
      }),
    )
    let address: { setValue: (value: string) => unknown } | undefined
    new Setting(el).setName(tr('协议')).addDropdown((t) =>
      t
        .addOption('openai', tr('OpenAI 兼容'))
        .addOption('anthropic', tr('Anthropic 兼容'))
        .setValue(d.protocol)
        .onChange((v) => {
          d.protocol = v as ModelConfig['protocol']
          d.baseUrl = defaultBaseUrl(d.protocol)
          address?.setValue(d.baseUrl)
        }),
    )
    new Setting(el).setName(tr('API 地址')).addText((t) => {
      address = t
      t.setValue(d.baseUrl).onChange((v) => {
        d.baseUrl = v
      })
    })
    new Setting(el).setName(tr('模型 ID')).addText((t) =>
      t.setValue(d.model).onChange((v) => {
        d.model = v
      }),
    )
    new Setting(el)
      .setName(tr('上下文窗口（tokens）'))
      .setDesc(tr('按模型实际上限填写；用于自动提示交接，默认 128000。'))
      .addText((t) =>
        t.setValue(String(d.contextWindow || 128000)).onChange((v) => {
          d.contextWindow = Number(v)
        }),
      )
    new Setting(el)
      .setName('API key')
      .setDesc(
        tr(
          this.owner.globalByok
            ? '加密保存在本机，跨知识库共享；不写入 .catea。'
            : '优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。',
        ),
      )
      .addText((t) => {
        t.inputEl.type = 'password'
        t.inputEl.autocomplete = 'off'
        t.setValue(d.apiKey).onChange((v) => {
          d.apiKey = v
        })
      })
    const error = el.createEl('p', { attr: { role: 'alert' } })
    new Setting(el)
      .addButton((b) => b.setButtonText(tr('取消')).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(tr('保存模型'))
          .setCta()
          .onClick(async () => {
            let model: ModelConfig
            try {
              model = normalizeModel(d)
            } catch (e) {
              error.setText(e instanceof Error ? tr(e.message) : tr('请检查配置'))
              return
            }
            b.setDisabled(true)
            try {
              await storeModel(this.owner, model)
              this.saved()
              this.close()
            } catch (reason) {
              error.setText(tr(reason instanceof Error ? reason.message : '保存失败，请重试'))
              b.setDisabled(false)
            }
          }),
      )
  }
  onClose() {
    this.contentEl.empty()
    this.draft.apiKey = ''
  }
}
