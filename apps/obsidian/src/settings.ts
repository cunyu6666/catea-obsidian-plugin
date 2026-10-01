/**
 * [WHO]: Provides CateaSettings, syncSavedBillingStatus
 * [FROM]: Depends on obsidian, ./main, ../../../packages/agent-core/src/types, ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/vendor-presets, ../../../packages/integrations/src/skills, ../../../packages/integrations/src/mcp-presets, ../../../packages/personas/src, ./vendor-icons
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/settings.ts - plugin settings tab for language, paper toggles, Agent persona and capabilities, subscription status, BYOK models with a vendor-preset grid, one-click MCP presets and MCP servers; ModelModal validates through normalizeModel
 */
import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  requestUrl,
  type SettingDefinitionItem,
} from 'obsidian'
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
import {
  createVendorModel,
  matchVendorPreset,
  vendorPresets,
  type VendorPreset,
} from '../../../packages/agent-core/src/vendor-presets'
import { describeSkills } from '../../../packages/integrations/src/skills'
import {
  createPresetServer,
  injectSecretEnv,
  matchPreset,
  mcpPresets,
} from '../../../packages/integrations/src/mcp-presets'
import { vendorIconDataUrl, vendorIcons, vendorMonogram } from './vendor-icons'
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
type BillingPlan = 'monthly'
type BillingCurrency = 'USD' | 'CNY'
interface PlanPrice {
  original: string
  sale: string
  suffix: string
}
interface BillingStatus {
  pro: boolean
  email?: string
  license_key?: string
  plan?: string
  status?: string
  current_period_end?: string | null
  display_name?: string
  quota?: {
    monthly?: {
      used_percent?: number
      remaining_percent?: number
      reset_at?: string | null
      included_credits?: number
      used_credits?: number
    }
    window?: {
      used_percent?: number
      remaining_percent?: number
      reset_at?: string | null
      included_credits?: number
      used_credits?: number
    }
  }
  features?: { hosted_model?: boolean; byok?: boolean }
}
interface BillingPreferences {
  billingEmail?: string
  billingStatus?: BillingStatus
  billingLastChecked?: number
}
const BILLING_APIS = [
  'https://api.pencil.chat/billing',
  'https://asgard-api-utj6.onrender.com/billing',
] as const
const BILLING_API = BILLING_APIS[0]
const HOSTED_BILLING_API = BILLING_APIS[1]
const HOSTED_MODEL_ID = 'catea-pro-hosted'
const PRO_PRICES: Record<BillingCurrency, PlanPrice> = {
  USD: { original: '$10', sale: '$3', suffix: '/ month' },
  CNY: { original: '¥60', sale: '¥18', suffix: '/ 月' },
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function quotaStatus(value: unknown) {
  const body = record(value),
    monthly = record(body.monthly),
    window = record(body.window)
  const monthlyReset =
    typeof monthly.reset_at === 'string' || monthly.reset_at === null ? monthly.reset_at : undefined
  const windowReset =
    typeof window.reset_at === 'string' || window.reset_at === null ? window.reset_at : undefined
  return {
    monthly: {
      used_percent: typeof monthly.used_percent === 'number' ? monthly.used_percent : undefined,
      remaining_percent:
        typeof monthly.remaining_percent === 'number' ? monthly.remaining_percent : undefined,
      reset_at: monthlyReset,
      included_credits:
        typeof monthly.included_credits === 'number' ? monthly.included_credits : undefined,
      used_credits: typeof monthly.used_credits === 'number' ? monthly.used_credits : undefined,
    },
    window: {
      used_percent: typeof window.used_percent === 'number' ? window.used_percent : undefined,
      remaining_percent:
        typeof window.remaining_percent === 'number' ? window.remaining_percent : undefined,
      reset_at: windowReset,
      included_credits:
        typeof window.included_credits === 'number' ? window.included_credits : undefined,
      used_credits: typeof window.used_credits === 'number' ? window.used_credits : undefined,
    },
  }
}

function billingStatus(value: unknown): BillingStatus {
  const body = record(value),
    features = record(body.features)
  return {
    pro: body.pro === true || body.plan === 'pro_monthly',
    email: typeof body.email === 'string' ? body.email : undefined,
    license_key: typeof body.license_key === 'string' ? body.license_key : undefined,
    plan: typeof body.plan === 'string' ? body.plan : undefined,
    display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
    status: typeof body.status === 'string' ? body.status : undefined,
    current_period_end:
      typeof body.current_period_end === 'string' || body.current_period_end === null
        ? body.current_period_end
        : undefined,
    quota: quotaStatus(body.quota),
    features: {
      hosted_model: features.hosted_model === true,
      byok: features.byok !== false,
    },
  }
}

function checkoutUrl(value: unknown): string {
  const body = record(value)
  const url = body.checkout_url
  if (typeof url === 'string') return url
  throw new Error('支付链接创建失败，请稍后重试')
}

async function billingJson(
  path: string,
  options: { method?: string; body?: string; error: string },
): Promise<unknown> {
  let lastError: unknown
  for (const base of BILLING_APIS) {
    const response = await requestUrl({
      url: `${base}${path}`,
      method: options.method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body,
      throw: false,
    })
    if (response.status !== 200) {
      lastError = new Error(`${options.error} (${response.status})`)
      continue
    }
    try {
      return JSON.parse(response.text) as unknown
    } catch (error) {
      lastError = error
    }
  }
  if (lastError instanceof Error) throw new Error(options.error)
  throw new Error(options.error)
}

async function fetchBillingStatus(email: string): Promise<BillingStatus> {
  return billingStatus(
    await billingJson(`/me?email=${encodeURIComponent(email)}`, {
      error: '无法读取 Pro 状态，请稍后重试',
    }),
  )
}

async function createCheckout(
  email: string,
  plan: BillingPlan,
  currency: BillingCurrency,
): Promise<string> {
  return checkoutUrl(
    await billingJson('/checkout', {
      method: 'POST',
      body: JSON.stringify({ email, plan, currency }),
      error: '支付链接创建失败，请稍后重试',
    }),
  )
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

function formatDurationUntil(value?: string | null) {
  if (!value) return ''
  const reset = new Date(value).getTime()
  if (Number.isNaN(reset)) return ''
  const ms = reset - Date.now()
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60000),
    days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  return `${mins}m`
}

function billingSummary(tr: (text: string) => string, status?: BillingStatus) {
  if (status?.pro) {
    const expires = formatDate(status.current_period_end)
    return [
      tr('PRO · 开箱即用，无需配置 API Key。'),
      expires ? `${tr('有效期至')}：${expires}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }
  return tr('Free · 需要配置自己的模型 API Key。')
}

function renderQuotaProgress(parent: HTMLElement, tr: (text: string) => string, status?: BillingStatus) {
  const monthly = status?.quota?.monthly,
    percent = monthly?.remaining_percent
  if (!status?.pro || typeof percent !== 'number') return
  parent.addClass('catea-quota-setting')
  const remaining = Math.max(0, Math.min(100, Math.round(percent))),
    resetsIn = formatDurationUntil(monthly?.reset_at)
  const box = parent.createDiv({ cls: 'catea-quota-progress' })
  const meta = box.createDiv({ cls: 'catea-quota-progress__meta' })
  meta.createSpan({
    text: resetsIn ? `${tr('距离重置')} ${resetsIn}` : tr('重置时间待同步'),
  })
  meta.createSpan({ text: `${tr('剩余')} ${remaining}%` })
  box.createEl('progress', { attr: { max: '100', value: String(remaining) } })
}

function defaultCurrency(language?: string): BillingCurrency {
  void language
  return 'USD'
}

function renderPrice(parent: HTMLElement, currency: BillingCurrency) {
  const price = PRO_PRICES[currency],
    box = parent.createDiv({ cls: 'catea-plan-card__price' })
  box.createEl('del', { text: price.original })
  box.createSpan({ cls: 'catea-plan-card__sale', text: price.sale })
  box.createSpan({ cls: 'catea-plan-card__suffix', text: price.suffix })
}

function priceText(currency: BillingCurrency) {
  const price = PRO_PRICES[currency]
  return `${price.sale}${price.suffix}`
}

async function syncHostedBillingModel(owner: Catea, status?: BillingStatus) {
  const c = owner.agentSettings,
    license = status?.license_key?.trim()
  if (status?.pro && license) {
    c.models = c.models.filter(
      (model) =>
        model.id === HOSTED_MODEL_ID ||
        (!BILLING_APIS.some((base) => model.baseUrl.replace(/\/$/, '') === `${base}/hosted/v1`) &&
          model.model !== 'catea/pro'),
    )
    await storeModel(
      owner,
      {
        id: HOSTED_MODEL_ID,
        name: 'Catea',
        protocol: 'openai',
        baseUrl: `${HOSTED_BILLING_API}/hosted/v1`,
        apiKey: license,
        model: 'catea/pro',
        contextWindow: 1000000,
        capabilities: {
          tools: true,
          streaming: true,
          parallelTools: true,
          structuredOutput: true,
        },
      },
      true,
    )
    return
  }
  if (!c.models.some((model) => model.id === HOSTED_MODEL_ID)) return
  const previous = c.models,
    previousId = c.modelId
  c.models = c.models.filter((model) => model.id !== HOSTED_MODEL_ID)
  c.modelId = selectedModel(c.models, c.modelId)?.id || ''
  try {
    await owner.saveModels(HOSTED_MODEL_ID)
    if (!owner.globalByok) owner.saveSecret(HOSTED_MODEL_ID, '')
  } catch (error) {
    c.models = previous
    c.modelId = previousId
    owner.emit()
    throw error
  }
}

export async function syncSavedBillingStatus(owner: Catea, options: { refresh?: boolean } = {}) {
  const prefs = owner.agentSettings as typeof owner.agentSettings & BillingPreferences,
    email = prefs.billingEmail || prefs.billingStatus?.email || ''
  if (prefs.billingStatus?.pro) await syncHostedBillingModel(owner, prefs.billingStatus)
  if (options.refresh === false) return
  if (!isEmail(email)) return
  const status = await fetchBillingStatus(email)
  prefs.billingStatus = status
  prefs.billingLastChecked = Date.now()
  await syncHostedBillingModel(owner, status)
  await owner.saveAgentSettings()
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
    const billingPrefs = c as typeof c & BillingPreferences
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
      ...c.models.filter((model) => model.id !== HOSTED_MODEL_ID).map((model) => ({
        name: model.name,
        desc: `${matchVendorPreset(model)?.label ?? (isOpenRouterModel(model) ? 'OpenRouter' : model.protocol === 'openai' ? tr('OpenAI 兼容') : tr('Anthropic 兼容'))} · ${model.model} · ${model.baseUrl}${model.apiKey ? '' : tr(' · 请补充 API Key')}`,
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
      name: tr('添加厂商（预设）'),
      desc: tr('从常用官方厂商中选择；协议、地址和默认模型已自动填好，只需填写 API Key。'),
      render: (s) => {
        s.addButton((b) =>
          b
            .setButtonText(tr('添加厂商（预设）'))
            .setCta()
            .onClick(() => new VendorGridModal(p, () => this.refresh()).open()),
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
    const imageConfig = (c.imageGeneration ??= {
      enabled: false,
      protocol: 'dashscope',
      baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
      model: 'qwen-image-3.0-pro',
      apiKey: '',
    })
    const imageGeneration: SettingsRow[] = [
      {
        name: tr('启用生图工具'),
        desc: tr('使用独立模型生成图片，保存到 Attachments/Catea，并在对话中预览。'),
        render: (s) => {
          s.addToggle((toggle) =>
            toggle.setValue(imageConfig.enabled).onChange(async (value) => {
              imageConfig.enabled = value
              await p.saveAgentSettings()
            }),
          )
        },
      },
      {
        name: tr('生图协议'),
        render: (s) => {
          s.addDropdown((dropdown) =>
            dropdown
              .addOption('dashscope', tr('阿里云 DashScope'))
              .addOption('openai', tr('OpenAI 兼容'))
              .setValue(imageConfig.protocol || 'openai')
              .onChange(async (value) => {
                imageConfig.protocol = value === 'dashscope' ? 'dashscope' : 'openai'
                await p.saveAgentSettings()
              }),
          )
        },
      },
      ...(['baseUrl', 'model', 'apiKey'] as const).map((key) => ({
        name: tr({ baseUrl: '生图 API 地址', model: '生图模型名', apiKey: '生图 API Key' }[key]),
        desc:
          key === 'apiKey'
            ? tr('密钥保存在 Obsidian 安全存储；不支持时仅在本次会话内使用。')
            : undefined,
        render: (s: Setting) => {
          s.addText((input) => {
            if (key === 'apiKey') input.inputEl.type = 'password'
            input.setValue(imageConfig[key]).onChange(async (value) => {
              imageConfig[key] = value.trim()
              if (key === 'apiKey') p.saveSecret('image-generation', imageConfig.apiKey)
              await p.saveAgentSettings()
            })
          })
        },
      })),
    ]
    const mediaSections: SettingsSection[] = []
    for (const kind of ['video', 'audio'] as const) {
      const configKey = kind === 'video' ? 'videoGeneration' : 'audioGeneration'
      const media = (c[configKey] ??= {
        enabled: false,
        baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
        model: kind === 'video' ? 'happyhorse-1.1-t2v' : 'qwen-audio-3.0-tts-plus',
        apiKey: '',
        ...(kind === 'audio' ? { voice: 'longanhuan_v3.6' } : {}),
      })
      const labels =
        kind === 'video'
          ? {
              enabled: '启用视频生成',
              baseUrl: '视频 API 地址',
              model: '视频模型名',
              apiKey: '视频 API Key',
              voice: '语音音色',
            }
          : {
              enabled: '启用语音合成',
              baseUrl: '音频 API 地址',
              model: '音频模型名',
              apiKey: '音频 API Key',
              voice: '语音音色',
            }
      const fields =
        kind === 'video'
          ? (['baseUrl', 'model', 'apiKey'] as const)
          : (['baseUrl', 'model', 'apiKey', 'voice'] as const)
      mediaSections.push({
        heading: tr(kind === 'video' ? '视频生成' : '语音合成'),
        rows: [
          {
            name: tr(labels.enabled),
            desc: tr(
              kind === 'video'
                ? '使用 DashScope 异步视频接口，保存 MP4 并在对话中播放。停止等待不会取消云端任务。'
                : '使用 DashScope 语音合成接口，保存 MP3 并在对话中播放。',
            ),
            render: (s) => {
              s.addToggle((toggle) =>
                toggle.setValue(media.enabled).onChange(async (value) => {
                  media.enabled = value
                  await p.saveAgentSettings()
                }),
              )
            },
          },
          ...fields.map((key) => ({
            name: tr(labels[key]),
            desc:
              key === 'apiKey'
                ? tr('密钥保存在 Obsidian 安全存储；不支持时仅在本次会话内使用。')
                : undefined,
            render: (s: Setting) => {
              s.addText((input) => {
                if (key === 'apiKey') input.inputEl.type = 'password'
                input.setValue(media[key] || '').onChange(async (value) => {
                  media[key] = value.trim()
                  if (key === 'apiKey') p.saveSecret(`${kind}-generation`, media.apiKey)
                  await p.saveAgentSettings()
                })
              })
            },
          })),
        ],
      })
    }
    const billing: SettingsRow[] = [
      {
        name: tr('当前套餐'),
        desc: billingSummary(tr, billingPrefs.billingStatus),
        render: (s) => {
          s.addButton((button) =>
            button.setButtonText(tr('订阅套餐')).setCta().onClick(() =>
              new SubscriptionModal(
                p,
                billingPrefs,
                () => this.refresh(),
                async (status) => {
                  billingPrefs.billingStatus = status
                  billingPrefs.billingLastChecked = Date.now()
                  await syncHostedBillingModel(p, status)
                },
              ).open(),
            ),
          )
          s.addButton((button) =>
            button.setButtonText(tr('一键订阅')).onClick(() =>
              new QuickSubscribeModal(
                p,
                billingPrefs,
                () => this.refresh(),
                async (status) => {
                  billingPrefs.billingStatus = status
                  billingPrefs.billingLastChecked = Date.now()
                  await syncHostedBillingModel(p, status)
                },
              ).open(),
            ),
          )
        },
      },
      ...(billingPrefs.billingStatus?.pro
        ? [
            {
              name: tr('套餐额度'),
              render: (s: Setting) => renderQuotaProgress(s.settingEl, tr, billingPrefs.billingStatus),
            },
          ]
        : []),
      {
        name: tr('同步套餐状态'),
        desc: tr('支付完成后回到这里刷新状态。'),
        render: (s) => {
          s.addButton((button) =>
            button.setButtonText(tr('刷新套餐状态')).onClick(async () => {
              const email = billingPrefs.billingEmail || ''
              if (!isEmail(email)) {
                new Notice(tr('请先填写有效邮箱'))
                return
              }
              button.setDisabled(true)
              button.setButtonText(tr('正在检查…'))
              try {
                billingPrefs.billingStatus = await fetchBillingStatus(email)
                billingPrefs.billingLastChecked = Date.now()
                await syncHostedBillingModel(p, billingPrefs.billingStatus)
                await p.saveAgentSettings()
                new Notice(
                  billingPrefs.billingStatus.pro
                    ? tr('已切换到 PRO 套餐')
                    : tr('当前为 Free 套餐'),
                )
                this.refresh()
              } catch (error) {
                new Notice(tr(error instanceof Error ? error.message : '无法读取 Pro 状态，请稍后重试'))
              } finally {
                button.setDisabled(false)
                button.setButtonText(tr('刷新套餐状态'))
              }
            }),
          )
        },
      },
    ]
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
        desc:
          tr('将 Skill 文件夹放到 .catea/skills/<名称>/SKILL.md，再启用。') +
          ' ' +
          tr('随插件分发的 Skill 预设已列在这里；同名知识库目录优先于预设。'),
        render: (s) => {
          const box = s.settingEl.createDiv()
          void describeSkills(p.vaultPath, c.skills)
            .then((items) => {
              if (!box.isConnected) return
              for (const item of items)
                new Setting(box)
                  .setName(item.source === 'preset' ? `${item.id}${tr(' · 内置预设')}` : item.id)
                  .setDesc(item.description)
                  .addToggle((t) =>
                    t.setValue(c.skills.includes(item.id)).onChange(async (value) => {
                      c.skills = value
                        ? [...new Set([...c.skills, item.id])]
                        : c.skills.filter((id) => id !== item.id)
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
      const preset = matchPreset(server)
      mcp.push({
        name: preset ? tr(preset.label) : server.id,
        desc: preset?.needsNode ? tr('需要本机已安装 Node.js / npx。') : undefined,
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
                injectSecretEnv(server)
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
      if (server.transport === 'http' || server.envSecret)
        mcp.push({
          name: server.transport === 'stdio' ? server.envSecret! : 'Bearer token',
          desc:
            server.transport === 'stdio'
              ? tr('保存在 Obsidian 密钥存储，连接时作为环境变量注入；不写入知识库配置。')
              : undefined,
          render: (s) => {
            s.addText((t) => {
              t.inputEl.type = 'password'
              t.setValue(server.token || '').onChange((value) => {
                server.token = value
                injectSecretEnv(server)
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
              p.saveSecret(`mcp-${server.id}`, '')
              await p.saveAgentSettings()
              this.refresh()
            }),
          )
        },
      })
    }
    for (const preset of mcpPresets) {
      const added = c.mcp.some((s) => matchPreset(s)?.id === preset.id)
      mcp.push({
        name: tr(preset.label),
        desc: preset.needsNode
          ? `${tr(preset.desc)}${tr('需要本机已安装 Node.js / npx。')}`
          : tr(preset.desc),
        render: (s) => {
          s.addButton((b) => {
            b.setButtonText(added ? tr('已添加') : tr('添加')).setCta()
            if (added) b.setDisabled(true)
            else
              b.onClick(async () => {
                c.mcp.push(createPresetServer(preset))
                await p.saveAgentSettings()
                this.refresh()
              })
          })
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
      { heading: tr('套餐'), rows: billing },
      { heading: tr('外观'), rows: appearance },
      { heading: 'Agent', rows: agent },
      { heading: tr('BYOK 模型'), rows: models },
      { heading: tr('图像生成'), rows: imageGeneration },
      ...mediaSections,
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

function hostedModel(model: ModelConfig) {
  return (
    model.id === HOSTED_MODEL_ID ||
    BILLING_APIS.some((base) => model.baseUrl.replace(/\/$/, '') === `${base}/hosted/v1`) ||
    model.model === 'catea/pro'
  )
}

class SubscriptionModal extends Modal {
  private currency: BillingCurrency
  constructor(
    private owner: Catea,
    private billing: BillingPreferences,
    private saved: () => void,
    private updateStatus: (status: BillingStatus) => void | Promise<void>,
  ) {
    super(owner.app)
    this.currency = defaultCurrency(owner.agentSettings.language)
  }
  onOpen() {
    const tr = this.owner.t,
      el = this.contentEl,
      pro = this.billing.billingStatus?.pro === true
    this.titleEl.setText(tr('订阅 Catea 套餐'))
    el.addClass('catea-plan-modal')
    el.createEl('p', {
      cls: 'catea-plan-modal__lede',
      text: tr('Free 自备 API Key；Pro 订阅后无需 API Key，即可使用 Catea 托管 AI 额度。'),
    })
    new Setting(el)
      .setName(tr('订阅邮箱'))
      .addText((input) =>
        input
          .setPlaceholder('you@example.com')
          .setValue(this.billing.billingEmail || '')
          .onChange((value) => {
            this.billing.billingEmail = value.trim()
          }),
      )
    new Setting(el).setName(tr('支付币种')).addDropdown((dropdown) => {
      dropdown
        .addOption('USD', 'USD')
        .addOption('CNY', 'CNY')
        .setValue(this.currency)
        .onChange((value) => {
          this.currency = value === 'CNY' ? 'CNY' : 'USD'
          this.contentEl.empty()
          this.onOpen()
        })
    })
    const grid = el.createDiv({ cls: 'catea-plan-grid' })
    this.card(grid, {
      title: 'Free',
      eyebrow: tr('自备 API Key'),
      price: '$0',
      subtitle: tr('适合已有模型服务的用户。'),
      features: [
        tr('使用你自己的 API Key'),
        tr('模型和密钥仍保存在本机'),
        tr('基础 Agent 和笔记工作流'),
      ],
      action: pro ? 'Free' : tr('当前套餐'),
      disabled: true,
      current: !pro,
    })
    this.card(grid, {
      title: 'Pro',
      eyebrow: tr('限时折扣'),
      price: this.currency,
      subtitle: tr('开箱即用，无需配置 API Key。'),
      features: [
        tr('包含 Catea 托管 AI 额度'),
        tr('更多用量，适合长文档和 Agent 工作流'),
        tr('额度自动恢复，月度周期重置'),
        tr('高级功能优先开放：连接器、自定义 Persona、媒体生成'),
      ],
      action: pro ? tr('当前套餐') : tr('订阅 Pro'),
      cta: true,
      disabled: pro,
      current: pro,
      onClick: pro ? undefined : (button) => void this.subscribe(button),
    })
  }
  private card(
    parent: HTMLElement,
    options: {
      title: string
      eyebrow: string
      price: string | BillingCurrency
      subtitle: string
      features: string[]
      action: string
      cta?: boolean
      disabled?: boolean
      current?: boolean
      onClick?: (button: import('obsidian').ButtonComponent) => void
    },
  ) {
    const tr = this.owner.t,
      card = parent.createDiv({ cls: 'catea-plan-card' })
    if (options.cta) card.addClass('is-pro')
    if (options.current) card.addClass('is-current')
    card.createDiv({ cls: 'catea-plan-card__eyebrow', text: options.eyebrow })
    card.createEl('h3', { text: options.title })
    if (options.price === 'USD' || options.price === 'CNY') renderPrice(card, options.price)
    else card.createDiv({ cls: 'catea-plan-card__price', text: options.price })
    card.createEl('p', { text: options.subtitle })
    const list = card.createEl('ul')
    for (const feature of options.features) list.createEl('li', { text: feature })
    new Setting(card).addButton((button) => {
      button.setButtonText(options.action)
      if (options.cta) button.setCta()
      if (options.disabled) button.setDisabled(true)
      if (options.onClick) button.onClick(() => options.onClick?.(button))
      if (!options.cta && !options.disabled) button.onClick(() => new Notice(tr('当前默认套餐')))
    })
  }
  private async subscribe(button: import('obsidian').ButtonComponent) {
    const tr = this.owner.t,
      email = this.billing.billingEmail || ''
    if (!isEmail(email)) {
      new Notice(tr('请先填写有效邮箱'))
      return
    }
    button.setDisabled(true)
    try {
      await this.owner.saveAgentSettings()
      const url = await createCheckout(email, 'monthly', this.currency)
      window.open(url, '_blank', 'noopener,noreferrer')
      new Notice(tr('支付页已打开，完成后回到这里刷新套餐状态'))
      try {
        await this.updateStatus(await fetchBillingStatus(email))
        await this.owner.saveAgentSettings()
        this.saved()
      } catch {
        // Checkout completion is asynchronous; status refresh can be retried from Settings.
      }
    } catch (error) {
      new Notice(tr(error instanceof Error ? error.message : '支付链接创建失败，请稍后重试'))
    } finally {
      button.setDisabled(false)
    }
  }
  onClose() {
    this.contentEl.empty()
  }
}

class QuickSubscribeModal extends Modal {
  private currency: BillingCurrency
  constructor(
    private owner: Catea,
    private billing: BillingPreferences,
    private saved: () => void,
    private updateStatus: (status: BillingStatus) => void | Promise<void>,
  ) {
    super(owner.app)
    this.currency = defaultCurrency(owner.agentSettings.language)
  }
  onOpen() {
    const tr = this.owner.t,
      el = this.contentEl
    this.titleEl.setText(tr('一键订阅'))
    el.addClass('catea-plan-modal')
    el.createEl('p', {
      cls: 'catea-plan-modal__lede',
      text: tr('输入邮箱即可开通 Pro，立即使用 Catea 托管 AI 额度。'),
    })
    const price = el.createDiv({ cls: 'catea-quick-price' })
    renderPrice(price, this.currency)
    new Setting(el).setName(tr('支付币种')).addDropdown((dropdown) => {
      dropdown
        .addOption('USD', 'USD')
        .addOption('CNY', 'CNY')
        .setValue(this.currency)
        .onChange((value) => {
          this.currency = value === 'CNY' ? 'CNY' : 'USD'
          this.contentEl.empty()
          this.onOpen()
        })
    })
    new Setting(el).setName(tr('订阅邮箱')).addText((input) =>
      input
        .setPlaceholder('you@example.com')
        .setValue(this.billing.billingEmail || '')
        .onChange((value) => {
          this.billing.billingEmail = value.trim()
        }),
    )
    new Setting(el)
      .addButton((button) => button.setButtonText(tr('取消')).onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(`${tr('订阅 Pro')} · ${priceText(this.currency)}`)
          .setCta()
          .onClick(() => void this.subscribe(button)),
      )
  }
  private async subscribe(button: import('obsidian').ButtonComponent) {
    const tr = this.owner.t,
      email = this.billing.billingEmail || ''
    if (!isEmail(email)) {
      new Notice(tr('请先填写有效邮箱'))
      return
    }
    button.setDisabled(true)
    try {
      await this.owner.saveAgentSettings()
      const url = await createCheckout(email, 'monthly', this.currency)
      window.open(url, '_blank', 'noopener,noreferrer')
      new Notice(tr('支付页已打开，完成后回到这里刷新套餐状态'))
      try {
        await this.updateStatus(await fetchBillingStatus(email))
        await this.owner.saveAgentSettings()
        this.saved()
      } catch {
        // Checkout completion is asynchronous; status refresh can be retried from Settings.
      }
    } catch (error) {
      new Notice(tr(error instanceof Error ? error.message : '支付链接创建失败，请稍后重试'))
    } finally {
      button.setDisabled(false)
    }
  }
  onClose() {
    this.contentEl.empty()
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

class VendorGridModal extends Modal {
  private key = ''
  constructor(
    private owner: Catea,
    private saved: () => void,
  ) {
    super(owner.app)
  }
  private iconUrl(preset: VendorPreset): string {
    const themeColor =
      getComputedStyle(document.body).getPropertyValue('--text-normal').trim() || '#888888'
    const color = preset.iconColor || themeColor
    const svg = vendorIcons[preset.id]
    if (svg) return vendorIconDataUrl(svg, color)
    const letter = (
      preset.label.replace(/[^A-Za-z]/g, '').slice(0, 1) || preset.id.slice(0, 1)
    ).toUpperCase()
    return vendorIconDataUrl(vendorMonogram(letter, color), '')
  }
  onOpen() {
    this.renderGrid()
  }
  private renderGrid() {
    const tr = this.owner.t,
      el = this.contentEl
    el.empty()
    this.titleEl.setText(tr('添加厂商（预设）'))
    el.createEl('p', {
      text: tr('从常用官方厂商中选择；协议、地址和默认模型已自动填好，只需填写 API Key。'),
      cls: 'catea-vendor-intro',
    })
    const search = el.createEl('input', {
      type: 'text',
      placeholder: tr('搜索厂商'),
      cls: 'catea-vendor-search',
    })
    const list = el.createDiv({ cls: 'catea-vendor-grid' })
    const paint = () => {
      list.empty()
      const query = search.value.trim().toLowerCase()
      const matches = vendorPresets.filter(
        (preset) =>
          !query ||
          preset.label.toLowerCase().includes(query) ||
          preset.id.includes(query) ||
          (preset.aliases || []).some((alias) => alias.toLowerCase().includes(query)),
      )
      if (!matches.length) {
        list.createEl('p', { text: tr('没有找到匹配的厂商'), cls: 'catea-vendor-empty' })
        return
      }
      for (const preset of matches) {
        const tile = list.createEl('button', {
          cls: 'catea-vendor-tile',
          attr: { type: 'button', 'aria-label': preset.label },
        })
        tile.createEl('img', {
          cls: 'catea-vendor-icon',
          attr: { src: this.iconUrl(preset), alt: '' },
        })
        tile.createDiv({ cls: 'catea-vendor-name', text: preset.label })
        tile.addEventListener('click', () => this.renderForm(preset))
      }
    }
    search.addEventListener('input', paint)
    paint()
    search.focus()
  }
  private renderForm(preset: VendorPreset) {
    const tr = this.owner.t,
      el = this.contentEl
    // Reuse a key already stored for this vendor in any vault on this machine.
    this.key =
      this.owner.agentSettings.models.find((model) => matchVendorPreset(model)?.id === preset.id)
        ?.apiKey || ''
    el.empty()
    this.titleEl.setText(preset.label)
    new Setting(el).addButton((button) =>
      button.setButtonText(tr('返回厂商列表')).onClick(() => this.renderGrid()),
    )
    new Setting(el)
      .setName(tr('协议'))
      .setDesc(preset.protocol === 'openai' ? tr('OpenAI 兼容') : tr('Anthropic 兼容'))
    new Setting(el).setName(tr('API 地址')).setDesc(preset.baseUrl)
    let modelId = preset.model
    let displayName = ''
    new Setting(el)
      .setName(tr('模型 ID'))
      .setDesc(tr('模型 ID 已按厂商默认预填，可修改；请求直连该厂商，笔记内容会发送给它。'))
      .addText((input) =>
        input.setValue(modelId).onChange((value) => {
          modelId = value
        }),
      )
    new Setting(el).setName(tr('显示名称')).addText((input) => {
      input.setPlaceholder(`${preset.label} · ${preset.model}`)
      input.onChange((value) => {
        displayName = value
      })
    })
    new Setting(el)
      .setName('API key')
      .setDesc(
        tr(
          this.owner.globalByok
            ? '加密保存在本机，跨知识库共享；不写入 .catea。'
            : '优先保存到 Obsidian 安全存储；不可用时仅本次运行有效，不写入 .catea。',
        ),
      )
      .addText((input) => {
        input.inputEl.type = 'password'
        input.inputEl.autocomplete = 'off'
        input.setValue(this.key).onChange((value) => {
          this.key = value
        })
      })
    el.createEl('a', {
      text: tr('获取 API Key ↗'),
      href: preset.keyUrl,
      attr: { target: '_blank', rel: 'noopener noreferrer' },
      cls: 'catea-vendor-keylink',
    })
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
              model = createVendorModel(preset, {
                id: crypto.randomUUID(),
                apiKey: this.key,
                model: modelId,
                name: displayName || undefined,
              })
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
