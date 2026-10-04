/**
 * [WHO]: Provides Catea, default
 * [FROM]: Depends on ../../../packages/agent-core/src/local-model, ./DiaryPanel, ./diary, ../../../packages/integrations/src/conversation-store, ../../../packages/agent-core/src/model-client, ../../../packages/agent-core/src/byok, ../../../packages/personas/src, ./sidebar-views, ../../../typings/runtime, ./folder-icons, ./remix-skin, ./GitHistoryPanel, ./MemoryPanel, ./global-byok, ./updates, ./theme, ./note-thumbnails, ./note-previews, ./locale, ./selection, ./session-drafts, ./support-prompt, ../../../packages/agent-core/src/types, obsidian, react-dom/client, ./paper.cjs, ../../../packages/agent-core/src, ../../../packages/integrations/src/data-dir, ../../../packages/integrations/src/storage, ../../../packages/integrations/src/skills, ../../../packages/integrations/src/legacy-snapshots, ../../../packages/integrations/src/mcp-presets, ../../../packages/integrations/src/connectors, ./panel, ./obsidian-tools, ./skills/obsidian.md, catea-components, ./settings, ./composition, node:fs/promises, ./local-model
 * [TO]: Consumed by apps/obsidian/src/folder-icons.ts, apps/obsidian/src/note-previews.ts, apps/obsidian/src/note-thumbnails.ts,
 *   apps/obsidian/src/obsidian-tools.ts, apps/obsidian/src/panel.tsx,
 *   apps/obsidian/src/selection.ts, apps/obsidian/src/settings.ts, apps/obsidian/src/GitHistoryPanel.tsx
 * [HERE]: apps/obsidian/src/main.tsx - plugin entry: class Catea extends Paper, wiring config, secure secrets, ObsidianTools, session tabs, settings and sidebar; 60 s memory interval
 */
import type {} from '../../../typings/runtime'
import { installFolderIcons, type FolderAppearance } from './folder-icons'
import { RemixSkin } from './remix-skin'
import { SidebarViews } from './sidebar-views'
import { GitHistoryPanel } from './GitHistoryPanel'
import { DiaryPanel } from './DiaryPanel'
import { DiaryService } from './diary'
import { LocalModelService } from './local-model'
import { LITE_MODEL_ID } from '../../../packages/agent-core/src/local-model'
import { VaultConversationStore } from '../../../packages/integrations/src/conversation-store'
import { DirectModelClient } from '../../../packages/agent-core/src/model-client'
import { selectedModel } from '../../../packages/agent-core/src/byok'
import { persona } from '../../../packages/personas/src'
import { MemoryPanel } from './MemoryPanel'
import { UpdateChecker, type UpdatePreferences } from './updates'
import { GlobalByokStore, mergeByokProfiles } from './global-byok'
import { ThemeController, type ThemeMode } from './theme'
import { installNoteThumbnails } from './note-thumbnails'
import { registerNotePreviews } from './note-previews'
import { humanizeError, translate } from './locale'
import { installSelectionAction } from './selection'
import { SessionDraftStore, type SelectedQuote } from './session-drafts'
import { supportPromptDue, supportPromptMonth } from './support-prompt'
import type {
  AskUserQuestion,
  AskUserQuestionAnswer,
  FileChange,
} from '../../../packages/agent-core/src/types'
import {
  Plugin,
  ItemView,
  Modal,
  Setting,
  FileSystemAdapter,
  Notice,
  WorkspaceLeaf,
  MarkdownView,
  setIcon,
} from 'obsidian'
import { createRoot, type Root } from 'react-dom/client'
import Paper from './paper.cjs'
import type { Agent, Settings } from '../../../packages/agent-core/src'
import { DATA_DIR, dataPath, withDataDir } from '../../../packages/integrations/src/data-dir'
import { readJson, writeJson, within, Serial } from '../../../packages/integrations/src/storage'
import { presetSkillIds } from '../../../packages/integrations/src/skills'
import { cleanupLegacySnapshots } from '../../../packages/integrations/src/legacy-snapshots'
import { injectSecretEnv } from '../../../packages/integrations/src/mcp-presets'
import { normalizeConnectorConfigs } from '../../../packages/integrations/src/connectors'
import { Panel } from './panel'
import { ObsidianTools, obsidianTools } from './obsidian-tools'
import obsidianSkill from './skills/obsidian.md'
import { ChangePreview } from 'catea-components'
import { CateaSettings, syncSavedBillingStatus } from './settings'
import { createAgentFactory } from './composition'
import { mkdir } from 'node:fs/promises'
const VIEW = 'catea-agent'
const GIT_VIEW = 'catea-git-history'
const MEMORY_VIEW = 'catea-memory'
const DIARY_VIEW = 'catea-diary'
const GITHUB_REPOSITORY = 'https://github.com/cunyu6666/catea-obsidian-plugin'
const DOCK_ICON_MATCHES: [RegExp, string][] = [
  [/catea/i, 'gemini'],
  [/quick switch|快速切换/i, 'search-2'],
  [/graph|关系图谱/i, 'git-fork'],
  [/canvas|白板/i, 'artboard'],
  [/daily note|日记/i, 'calendar'],
  [/template|模板/i, 'file-copy'],
  [/command palette|命令面板/i, 'command'],
  [/database|数据库/i, 'database-2'],
  [/another vault|另一个仓库|管理仓库/i, 'expand-up-down'],
]
interface PaperSurface {
  settings: Record<string, boolean>
  apply(): void
  bars?: Map<MarkdownView, HTMLElement>
  explorerMenus?: Map<string, { button: HTMLElement }>
  sync?(): void
}
const Base = Paper as unknown as {
  new (...args: ConstructorParameters<typeof Plugin>): Plugin & PaperSurface
}
export default class Catea extends Base {
  declare settings: Record<string, boolean>
  agentSettings: Settings &
    UpdatePreferences & {
      includeCurrentNote: boolean
      theme?: ThemeMode
      supportPromptMonth?: string
      supportPrompt?: boolean
      folderIcons?: Record<string, FolderAppearance>
    } = {
    language: 'zh',
    enabled: true,
    web: true,
    models: [],
    modelId: '',
    personaId: 'aria',
    skills: [],
    mcp: [],
    connectors: [],
    memory: true,
    shell: false,
    includeCurrentNote: true,
    gitHistory: false,
    remixIcons: true,
    memoryPanel: false,
    enableReplyAnnotations: false,
    permissionMode: 'assist',
  }
  private editorZoom = new Map<MarkdownView, { scale: number; restore: () => void }>()
  updates!: UpdateChecker
  openPluginUpdates() {
    if (this.tabs.some((agent) => agent.running)) {
      new Notice(this.t('请先停止当前回复再更新插件'))
      return
    }
    const settings = (
      this.app as typeof this.app & { setting?: { open(): void; openTabById(id: string): void } }
    ).setting
    if (!settings) {
      new Notice(this.t('请打开设置 → 第三方插件，检查更新并更新 Catea。'))
      return
    }
    settings.open()
    settings.openTabById('community-plugins')
    new Notice(this.t('在已安装插件中检查更新，然后更新 Catea。'))
  }
  private themeController = new ThemeController()
  applyTheme() {
    this.themeController.setMode(this.agentSettings.theme)
  }
  drafts = new SessionDraftStore()
  globalByok: GlobalByokStore | null = null
  private deletedModelIds: string[] = []
  refreshThumbnails: () => void = () => {}
  obsidian!: ObsidianTools
  diary!: DiaryService
  localModel!: LocalModelService
  agent!: Agent
  tabs: Agent[] = []
  vaultPath = ''
  private createTabAgent!: () => Agent
  private configWrites = new Serial()
  private listeners = new Set<() => void>()
  private dialogs = new Set<Modal>()
  private sidebarViews = new SidebarViews(this.app.workspace)
  private remixSkin: RemixSkin | null = null
  /**
   * Tabler is retired. Paper's own settings tab is never registered —
   * GlassPaperSettings is defined but never instantiated — so no reachable UI
   * depends on `tablerIcons`; it is pinned false so Paper does not start
   * TablerSkin inside its own onload. paper.css keys the whole icon layer on the
   * `gp-tabler-on` body class that Paper's apply() derives from that same flag, so
   * syncRemixIcons re-applies the class under our own setting instead.
   */
  async loadData(): Promise<Record<string, boolean>> {
    const saved = (await super.loadData()) as Record<string, unknown>
    return { ...saved, tablerIcons: false }
  }

  /** Drives the icon layer: the body class paper.css keys on, plus the skin itself. */
  /**
   * Paper's apply() recomputes the `gp-tabler-on` body class from its own
   * `tablerIcons` flag, which loadData() pins to false so TablerSkin never
   * starts. It runs again on layout-ready and from every Paper surface toggle, so
   * it would strip the class this build depends on. paper.css keys the whole
   * explorer icon layer on it — the default folder and document glyphs and the
   * per-folder override that carries the picked colour — so re-asserting the class
   * right after super.apply() is what keeps those icons on screen. Gated on
   * Paper's master switch as well, because the rules require gp-enabled too.
   */
  apply(): void {
    super.apply()
    this.syncRemixIcons(this.settings.enabled && this.agentSettings.remixIcons !== false)
  }

  syncRemixIcons(on: boolean): void {
    document.body.classList.toggle('gp-tabler-on', on)
    if (on) {
      this.remixSkin ??= new RemixSkin(document)
      this.remixSkin.start()
    } else {
      this.remixSkin?.stop()
      this.remixSkin = null
    }
  }

  /**
   * Lucide names Obsidian has rendered that the curated mapping does not cover.
   * They keep their native glyph, and listing them here is how the next mapping
   * pass gets its input without reading the skin's source.
   */
  get uncoveredIcons(): string[] {
    return [...(this.remixSkin?.missing ?? [])].sort()
  }

  async onload() {
    this.register(() => this.sidebarViews.dispose())
    await super.onload()
    this.syncRemixIcons(this.agentSettings.remixIcons !== false)
    this.register(() => {
      this.remixSkin?.stop()
      this.remixSkin = null
      document.body.classList.remove('gp-tabler-on')
    })
    this.register(() => {
      for (const state of this.editorZoom.values()) state.restore()
      this.editorZoom.clear()
    })
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      new Notice(this.t('Catea Agent 需要桌面文件系统'))
      return
    }
    this.vaultPath = this.app.vault.adapter.getBasePath()
    const directory = await within(this.vaultPath, DATA_DIR)
    await mkdir(directory, { recursive: true })
    try {
      if (await cleanupLegacySnapshots(this.vaultPath))
        new Notice(this.t('已清理旧版 Catea 全量快照，释放知识库空间'))
    } catch {
      new Notice(withDataDir(this.t('旧版 Catea 快照清理失败，可手动删除 {dir}/snapshots')))
    }
    for (const part of ['skills', 'memory', 'sessions'])
      await mkdir(await within(this.vaultPath, dataPath(part)), { recursive: true })
    this.agentSettings = {
      ...this.agentSettings,
      ...(await readJson(await within(this.vaultPath, dataPath('config.json')), {})),
    }
    this.agentSettings.connectors = normalizeConnectorConfigs(this.agentSettings.connectors)
    if (this.agentSettings.localAuxiliaryModel !== undefined) {
      this.agentSettings.localTitles ??= this.agentSettings.localAuxiliaryModel === true
      this.agentSettings.localDiary ??= this.agentSettings.localAuxiliaryModel === true
      delete this.agentSettings.localAuxiliaryModel
    }
    this.updates = new UpdateChecker(
      this.agentSettings,
      this.manifest.version,
      this.manifest.id,
      () => this.saveAgentSettings(),
      () => this.emit(),
    )
    this.register(() => this.updates.dispose())
    this.applyTheme()
    const bindTheme = () => {
      this.themeController.attach(document)
      this.app.workspace.iterateAllLeaves((leaf) =>
        this.themeController.attach(leaf.view.containerEl.ownerDocument),
      )
    }
    bindTheme()
    this.registerEvent(this.app.workspace.on('layout-change', bindTheme))
    this.registerEvent(
      this.app.workspace.on('window-open', (_win, win) =>
        this.themeController.attach(win.document),
      ),
    )
    this.register(() => this.themeController.dispose())
    if (!this.agentSettings.permissionDefaultsVersion) {
      this.agentSettings.shell = false
      this.agentSettings.permissionMode = 'assist'
      this.agentSettings.permissionDefaultsVersion = 1
      await this.saveAgentSettings()
    }
    // One-time seed of the bundled presets, mirroring permissionDefaultsVersion:
    // a later disable must survive upgrades, so this never runs twice.
    if (!this.agentSettings.presetSkillsVersion) {
      this.agentSettings.skills = [
        ...new Set([...this.agentSettings.skills, ...presetSkillIds]),
      ].sort()
      this.agentSettings.presetSkillsVersion = 1
      await this.saveAgentSettings()
    }
    const secrets = this.secretStore()
    if (this.agentSettings.imageGeneration)
      this.agentSettings.imageGeneration.apiKey =
        secrets?.getSecret(this.key('image-generation')) || ''
    for (const kind of ['video', 'audio'] as const) {
      const media = this.agentSettings[kind === 'video' ? 'videoGeneration' : 'audioGeneration']
      if (media) media.apiKey = secrets?.getSecret(this.key(`${kind}-generation`)) || ''
    }
    for (const model of this.agentSettings.models)
      model.apiKey = secrets?.getSecret(this.key(model.id)) || ''
    for (const server of this.agentSettings.mcp) {
      server.token = secrets?.getSecret(this.key(`mcp-${server.id}`)) || ''
      // Mirrors the stored token into the stdio child environment; the value is
      // memory-only because saveAgentSettings strips token and env before writing.
      injectSecretEnv(server)
    }
    const global = GlobalByokStore.open()
    if (global) {
      try {
        const profile = await global.load()
        const localModels = this.agentSettings.models
        const merged = mergeByokProfiles(profile, localModels)
        if (!profile || JSON.stringify(merged) !== JSON.stringify(profile))
          await global.save(merged)
        this.agentSettings.models = merged.models
        this.deletedModelIds = merged.deletedIds
        this.globalByok = global
        if (localModels.length) await this.saveAgentSettings()
      } catch {
        this.globalByok = null
        new Notice(this.t('无法读取本机共享 BYOK，继续使用当前知识库配置'))
      }
    }
    this.refreshPaperLanguage()
    try {
      await syncSavedBillingStatus(this, { refresh: false })
    } catch {
      // Billing state should never block plugin startup. Users can refresh the
      // plan explicitly from Settings → Plan, and hosted sends re-check before use.
    }
    await this.addMiniMaxModels()
    this.installRibbonHover()
    this.installScrollbarVisibility()
    installFolderIcons(this)
    installSelectionAction(this)
    registerNotePreviews(this)
    this.refreshThumbnails = installNoteThumbnails(this)
    this.obsidian = new ObsidianTools(this, (title, detail, signal) =>
      this.confirm(title, detail, signal),
    )
    this.localModel = new LocalModelService({
      enabled: () => this.localModelEnabled(),
      chatEnabled: () => this.agentSettings.localChat === true,
      changed: () => this.emit(),
    })
    void this.localModel
      .initialize()
      .then(() => {
        if (this.localModel.state.phase === 'ready' && this.agentSettings.localDiary)
          void this.diary?.process(true).catch(() => {})
      })
      .catch(() => {})
    this.register(() => {
      void this.localModel.close().catch(() => {})
    })
    const auxiliaryModel = (signal: AbortSignal) =>
      this.agentSettings.localTitles ? this.localModel.select(signal) : Promise.resolve(null)
    const create = createAgentFactory(this.vaultPath, () => this.agentSettings, auxiliaryModel, {
      models: () => this.chatModels(),
      client: { stream: (request, signal) => this.localModel.streamChat(request, signal) },
    })
    this.createTabAgent = () => {
      let agent!: Agent
      agent = create({
        host: {
          tools: obsidianTools,
          skill: obsidianSkill,
          configDir: this.app.vault.configDir,
          run: (name, args, signal, changed) => this.obsidian.run(name, args, signal, changed),
        },
        change: () => this.emit(),
        notice: (text) => new Notice(humanizeError(text, this.agentSettings.language)),
        approve: (title, detail, signal) => this.confirm(title, detail, signal),
        ask: (q, signal) => this.ask(agent.session.id, q, signal),
      })
      return agent
    }
    this.agent = this.createTabAgent()
    this.agent.session.personaId = this.agentSettings.personaId
    this.tabs = [this.agent]
    this.agent.memory.setEnabled(this.agentSettings.enabled && this.agentSettings.memory)
    this.diary = new DiaryService(this.vaultPath, {
      auxiliaryModel: (signal) =>
        this.agentSettings.localDiary ? this.localModel.select(signal) : Promise.resolve(null),
      conversations: new VaultConversationStore(this.vaultPath),
      client: new DirectModelClient(),
      model: async () => {
        const model = selectedModel(this.agentSettings.models, this.agentSettings.modelId)
        if (model?.id === 'catea-pro-hosted') await syncSavedBillingStatus(this)
        return selectedModel(this.agentSettings.models, this.agentSettings.modelId)
      },
      persona,
      language: () => (this.agentSettings.language === 'en' ? 'en' : 'zh'),
      idle: () => this.agentSettings.enabled && !this.tabs.some((agent) => agent.running),
      changed: () => this.emit(),
    })
    void this.diary.initialize().catch(() => new Notice(this.t('无法读取日记数据')))
    this.registerView(DIARY_VIEW, (leaf) => new DiaryView(leaf, this))
    this.addCommand({
      id: 'open-diary',
      name: this.t('打开日记'),
      callback: () => void this.openDiary(),
    })
    this.addRibbonIcon('notebook-pen', this.t('日记'), () => void this.openDiary())
    const diaryTick = () => {
      void this.diary
        .process()
        .catch(() => console.warn('[Catea diary] Local diary storage is unavailable.'))
    }
    const diaryTimer = window.setTimeout(diaryTick, 15000)
    this.register(() => {
      window.clearTimeout(diaryTimer)
      this.diary.close()
    })
    this.registerInterval(window.setInterval(diaryTick, 60000))
    this.registerView(GIT_VIEW, (leaf) => new GitHistoryView(leaf, this))
    this.registerView(MEMORY_VIEW, (leaf) => new MemoryView(leaf, this))
    this.app.workspace.onLayoutReady(() => {
      void this.syncGitHistory()
      void this.syncMemoryPanel()
    })
    this.addCommand({
      id: 'open-git-history',
      name: this.t('打开 Git 历史'),
      checkCallback: (checking) => {
        if (!this.agentSettings.gitHistory) return false
        if (!checking) void this.syncGitHistory(true)
        return true
      },
    })
    this.addCommand({
      id: 'open-memory-panel',
      name: this.t('打开记忆面板'),
      checkCallback: (checking) => {
        if (!this.agentSettings.memoryPanel) return false
        if (!checking) void this.syncMemoryPanel(true)
        return true
      },
    })
    this.registerView(VIEW, (leaf) => new AgentView(leaf, this))
    this.addSettingTab(new CateaSettings(this.app, this))
    const agentRibbon = this.addRibbonIcon(
      'messages-square',
      `${this.manifest.name} agent`,
      () => void this.openAgent(),
    )
    agentRibbon.addClass('catea-dock-agent')
    agentRibbon.dataset.cateaDockIcon = 'gemini'
    this.addCommand({
      id: 'open-agent',
      name: this.t('打开 Agent'),
      callback: () => void this.openAgent(),
    })
    this.addCommand({
      id: 'memory-insights',
      name: this.t('查看记忆概览'),
      callback: () =>
        void this.agent.memory
          .run('memory_insights', {}, this.agentSettings.personaId, this.agentSettings.modelId)
          .then((data) => this.showDetail(this.t('记忆概览'), data))
          .catch((e: unknown) => new Notice(e instanceof Error ? e.message : String(e))),
    })
    const updateTimer = window.setTimeout(() => void this.updates.check(), 10000)
    this.register(() => window.clearTimeout(updateTimer))
    this.registerInterval(window.setInterval(() => void this.updates.check(), 60 * 60 * 1000))
    this.registerInterval(
      window.setInterval(() => {
        if (this.agentSettings.enabled && this.agentSettings.memory)
          void this.agent.memory.process()
      }, 60000),
    )
  }
  sync() {
    super.sync?.()
    const views = new Set(this.app.workspace.getLeavesOfType('markdown').map((leaf) => leaf.view))
    for (const [view, state] of this.editorZoom) {
      if (!views.has(view)) {
        state.restore()
        this.editorZoom.delete(view)
      }
    }
    for (const [view, bar] of this.bars || []) {
      if (bar.querySelector('.catea-editor-zoom')) continue
      const group = bar.createDiv({ cls: 'catea-editor-zoom' })
      const button = (label: string, icon: string, action: () => void) => {
        const control = group.createEl('button', { cls: 'gp-tool', attr: { type: 'button' } })
        if (icon) setIcon(control, icon)
        control.createSpan({ cls: 'catea-editor-zoom-label', text: label })
        control.addEventListener('mousedown', (event) => event.preventDefault())
        control.addEventListener('click', action)
        return control
      }
      const update = (scale: number) => {
        let state = this.editorZoom.get(view)
        if (!state) {
          const element = view.contentEl
          const properties = ['--gp-body-font-size', '--gp-body-line-height', '--font-text-size']
          const previous = properties.map((name) => [
            name,
            element.style.getPropertyValue(name),
            element.style.getPropertyPriority(name),
          ])
          state = {
            scale: 1,
            restore: () => {
              for (const [name, value, priority] of previous) {
                if (value) element.style.setProperty(name, value, priority)
                else element.style.removeProperty(name)
              }
            },
          }
          this.editorZoom.set(view, state)
        }
        state.restore()
        state.scale = Math.max(0.5, Math.min(2, Math.round(scale * 10) / 10))
        if (state.scale !== 1) {
          const style = view.contentEl.ownerDocument.defaultView!.getComputedStyle(view.contentEl)
          const font = parseFloat(style.getPropertyValue('--gp-body-font-size')) || 14
          const line = parseFloat(style.getPropertyValue('--gp-body-line-height')) || 24
          view.contentEl.style.setProperty('--gp-body-font-size', `${font * state.scale}px`)
          view.contentEl.style.setProperty('--gp-body-line-height', `${line * state.scale}px`)
          view.contentEl.style.setProperty('--font-text-size', `${font * state.scale}px`)
        }
        render()
        // Font changes affect CodeMirror line wrapping and measured cursor positions.
        view.editor.refresh()
      }
      const smaller = button(this.t('缩小编辑器文字'), 'zoom-out', () =>
        update((this.editorZoom.get(view)?.scale || 1) - 0.1),
      )
      const reset = button(this.t('恢复编辑器文字大小'), '', () => update(1))
      const value = reset.createSpan({ attr: { 'aria-hidden': 'true' } })
      const larger = button(this.t('放大编辑器文字'), 'zoom-in', () =>
        update((this.editorZoom.get(view)?.scale || 1) + 0.1),
      )
      const render = () => {
        const scale = this.editorZoom.get(view)?.scale || 1
        value.textContent = `${Math.round(scale * 100)}%`
        smaller.disabled = scale <= 0.5
        larger.disabled = scale >= 2
      }
      render()
    }
  }
  private installScrollbarVisibility() {
    const documents = new Set<Document>(),
      timers = new Map<HTMLElement, number>()
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (
        !target ||
        typeof target.closest !== 'function' ||
        !target.closest('.catea-ui, .catea-detail-modal, .catea-note-preview, .catea-file-changes')
      )
        return
      target.dataset.cateaScrolling = 'true'
      const previous = timers.get(target)
      if (previous !== undefined) window.clearTimeout(previous)
      timers.set(
        target,
        window.setTimeout(() => {
          delete target.dataset.cateaScrolling
          timers.delete(target)
        }, 900),
      )
    }
    const attach = (doc: Document) => {
      if (documents.has(doc)) return
      documents.add(doc)
      doc.addEventListener('scroll', onScroll, true)
    }
    attach(document)
    this.app.workspace.iterateAllLeaves((leaf) => attach(leaf.view.containerEl.ownerDocument))
    this.registerEvent(this.app.workspace.on('window-open', (_win, win) => attach(win.document)))
    this.register(() => {
      for (const doc of documents) doc.removeEventListener('scroll', onScroll, true)
      for (const [target, timer] of timers) {
        window.clearTimeout(timer)
        delete target.dataset.cateaScrolling
      }
    })
  }
  private installRibbonHover() {
    const documents = new Set<Document>()
    const observers = new Set<MutationObserver>()
    const clear = (doc: Document) =>
      doc
        .querySelectorAll('.catea-dock-near,.catea-dock-far')
        .forEach((el) => el.removeClass('catea-dock-near', 'catea-dock-far'))
    const decorate = (dock: Element) => {
      for (const action of dock.querySelectorAll<HTMLElement>('.side-dock-ribbon-action')) {
        if (action.classList.contains('catea-dock-agent')) continue
        const label = [
          action.getAttribute('aria-label'),
          action.getAttribute('title'),
          action.getAttribute('data-tooltip'),
        ]
          .filter(Boolean)
          .join(' ')
        action.dataset.cateaDockIcon =
          DOCK_ICON_MATCHES.find(([pattern]) => pattern.test(label))?.[1] || 'apps-2'
      }
    }
    const bind = () => {
      const docs = new Set([
        document,
        ...this.app.workspace
          .getLeavesOfType('markdown')
          .map((leaf) => leaf.view.containerEl.ownerDocument),
      ])
      for (const doc of docs) {
        const dock = doc.querySelector('.workspace-ribbon.mod-left .side-dock-actions')
        if (dock) decorate(dock)
        if (documents.has(doc)) continue
        documents.add(doc)
        if (dock) {
          const observer = new MutationObserver(() => decorate(dock))
          observer.observe(dock, { childList: true })
          observers.add(observer)
        }
        this.registerDomEvent(doc, 'mouseover', (event) => {
          if (!doc.defaultView || !(event.target instanceof doc.defaultView.Element)) return
          const action = event.target.closest('.side-dock-actions .side-dock-ribbon-action')
          clear(doc)
          if (!action) return
          const near = action.previousElementSibling
          if (near?.matches('.side-dock-ribbon-action')) {
            near.addClass('catea-dock-near')
            const far = near.previousElementSibling
            if (far?.matches('.side-dock-ribbon-action')) far.addClass('catea-dock-far')
          }
        })
        this.registerDomEvent(doc, 'mouseout', (event) => {
          if (!event.relatedTarget) clear(doc)
        })
      }
    }
    bind()
    this.registerEvent(this.app.workspace.on('layout-change', bind))
    this.register(() => {
      documents.forEach(clear)
      observers.forEach((observer) => observer.disconnect())
    })
  }
  t = (text: string) => translate(this.agentSettings.language || 'zh', text)
  refreshPaperLanguage() {
    for (const bar of this.bars?.values() || []) bar.remove()
    this.bars?.clear()
    this.sync?.()
    let labelIndex = 0
    for (const state of this.explorerMenus?.values() || []) {
      state.button.removeAttribute('aria-label')
      state.button.removeAttribute('title')
      const label =
        state.button.querySelector('.catea-sr-only') ||
        state.button.createSpan({ cls: 'catea-sr-only' })
      label.id = `catea-explorer-actions-${labelIndex++}`
      label.setAttribute('hidden', '')
      state.button.setAttribute('aria-labelledby', label.id)
      label.textContent = this.t('更多文件操作')
    }
  }
  get selections(): SelectedQuote[] {
    return this.drafts.get(this.agent.session.id).quotes
  }
  set selections(quotes: SelectedQuote[]) {
    this.drafts.update(this.agent.session.id, (draft) => ({ ...draft, quotes }))
  }
  newTab() {
    const agent = this.createTabAgent()
    agent.session.personaId = this.agentSettings.personaId
    this.tabs.push(agent)
    this.agent = agent
    this.emit()
  }
  async openTab(id: string) {
    const existing = this.tabs.find((tab) => tab.session.id === id)
    if (existing) {
      this.agent = existing
      this.agentSettings.personaId = existing.session.personaId
      this.emit()
      return
    }
    const agent = this.createTabAgent()
    await agent.open(id)
    this.tabs.push(agent)
    this.agent = agent
    this.emit()
  }
  async closeTab(id: string) {
    const index = this.tabs.findIndex((tab) => tab.session.id === id)
    if (index < 0) return
    const [agent] = this.tabs.splice(index, 1)
    if (this.agent === agent)
      this.agent = this.tabs[Math.min(index, this.tabs.length - 1)] || this.createTabAgent()
    if (!this.tabs.length) this.tabs.push(this.agent)
    this.emit()
    await agent.close(false)
  }
  async deleteSession(id: string) {
    const tab = this.tabs.find((item) => item.session.id === id)
    if (tab?.running) throw new Error(this.t('请先停止当前回复'))
    const worker = this.createTabAgent()
    try {
      await worker.deleteSession(id)
    } finally {
      await worker.close(false)
    }
    if (tab) {
      await this.closeTab(id)
    }
    this.drafts.delete(id)
    this.emit()
  }
  stopAgents() {
    for (const agent of this.tabs) agent.stop()
  }
  async addSelection(path: string, text: string) {
    if (!text.trim()) return
    if (!this.selections.some((s) => s.path === path && s.text === text))
      this.selections.push({ id: crypto.randomUUID(), path, text })
    await this.openAgent()
    this.emit()
    window.setTimeout(
      () => document.querySelector<HTMLTextAreaElement>('.catea-panel textarea')?.focus(),
      50,
    )
  }
  async addMiniMaxModels() {
    if (this.agentSettings.miniMaxPresetsAdded) return
    const source = this.agentSettings.models.find(
      (m) => m.apiKey && /^https:\/\/api\.minimax(?:i)?\.(?:cn|com|io)\//.test(m.baseUrl),
    )
    if (!source) return
    for (const [model, contextWindow] of [
      ['MiniMax-M2.7', 204800],
      ['MiniMax-M3', 1000000],
    ] as const) {
      if (this.agentSettings.models.some((m) => m.model === model && m.baseUrl === source.baseUrl))
        continue
      const id = crypto.randomUUID()
      if (!this.globalByok) this.saveSecret(id, source.apiKey)
      this.agentSettings.models.push({
        ...source,
        id,
        name: model.replace('MiniMax-', 'MiniMax '),
        model,
        contextWindow,
      })
    }
    this.agentSettings.miniMaxPresetsAdded = true
    await this.saveModels()
  }
  key(id: string) {
    return `catea-${id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 64)
  }
  async saveAgentSettings() {
    const clone = structuredClone(this.agentSettings)
    // Billing responses may contain the hosted credential, including legacy config copies.
    // Only the model credential store may persist it; vault settings keep public status.
    const billing = (clone as typeof clone & { billingStatus?: { license_key?: string } })
      .billingStatus
    if (billing) delete billing.license_key
    if (clone.imageGeneration) clone.imageGeneration.apiKey = ''
    if (clone.videoGeneration) clone.videoGeneration.apiKey = ''
    if (clone.audioGeneration) clone.audioGeneration.apiKey = ''
    for (const m of clone.models) m.apiKey = ''
    if (this.globalByok) clone.models = []
    for (const m of clone.mcp) {
      m.token = ''
      delete m.env
    }
    await this.configWrites.run(async () =>
      writeJson(await within(this.vaultPath, dataPath('config.json')), clone),
    )
    this.emit()
  }
  async saveModels(removedId?: string) {
    if (this.globalByok) {
      const deletedIds =
        removedId && !this.deletedModelIds.includes(removedId)
          ? [...this.deletedModelIds, removedId]
          : this.deletedModelIds
      await this.globalByok.save({ models: this.agentSettings.models, deletedIds })
      this.deletedModelIds = deletedIds
    }
    await this.saveAgentSettings()
  }
  private secretStore() {
    // Optional host capability: Obsidian 1.8 lacks secure storage, so keys stay
    // in memory on those versions. Do not raise the minimum version for it.
    return (
      this.app as unknown as {
        secretStorage?: {
          getSecret(key: string): string | null
          setSecret(key: string, value: string): void
        }
      }
    ).secretStorage
  }
  saveSecret(id: string, value: string) {
    const secrets = this.secretStore()
    if (!secrets) {
      new Notice(this.t('当前版本无安全密钥存储；密钥仅保留到本次退出'))
      return
    }
    try {
      secrets.setSecret(this.key(id), value)
    } catch {
      new Notice(this.t('密钥无法持久保存，仅在当前运行期间使用'))
    }
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  emit() {
    for (const fn of this.listeners) fn()
  }
  async syncGitHistory(reveal = false) {
    await this.sidebarViews.sync(GIT_VIEW, () => this.agentSettings.gitHistory === true, reveal)
  }
  async openDiary() {
    await this.sidebarViews.sync(DIARY_VIEW, () => true, true)
  }
  localModelEnabled() {
    return !!(
      this.agentSettings.localChat ||
      this.agentSettings.localTitles ||
      this.agentSettings.localDiary
    )
  }
  chatModels() {
    const models = this.agentSettings.models.filter((model) => model.id !== LITE_MODEL_ID)
    const lite = this.localModel?.chatModel()
    return lite ? [...models, lite] : models
  }
  async setLocalFeature(feature: 'localChat' | 'localTitles' | 'localDiary', enabled: boolean) {
    const previous = this.agentSettings[feature]
    this.agentSettings[feature] = enabled
    try {
      await this.saveAgentSettings()
    } catch (error) {
      this.agentSettings[feature] = previous
      this.emit()
      throw error
    }
    this.emit()
    if (feature === 'localChat' && !enabled)
      for (const agent of this.tabs) if (agent.session.modelId === LITE_MODEL_ID) agent.stop()
    if (!this.localModelEnabled()) await this.localModel.disable()
    else if (enabled) {
      try {
        await this.prepareLocalModel()
      } catch (error) {
        if (this.agentSettings[feature]) throw error
      }
    }
  }
  async prepareLocalModel() {
    await this.localModel.prepare()
    // Apply a switch changed while the shared preparation was pending.
    await this.localModel.prepare()
    if (this.agentSettings.localDiary) void this.diary?.process(true).catch(() => {})
  }
  async removeLocalModel() {
    const previous = {
      localChat: this.agentSettings.localChat,
      localTitles: this.agentSettings.localTitles,
      localDiary: this.agentSettings.localDiary,
    }
    Object.assign(this.agentSettings, { localChat: false, localTitles: false, localDiary: false })
    try {
      await this.saveAgentSettings()
    } catch (error) {
      Object.assign(this.agentSettings, previous)
      this.emit()
      throw error
    }
    for (const agent of this.tabs) if (agent.session.modelId === LITE_MODEL_ID) agent.stop()
    await this.localModel.remove()
    this.emit()
  }
  async syncMemoryPanel(reveal = false) {
    await this.sidebarViews.sync(MEMORY_VIEW, () => this.agentSettings.memoryPanel === true, reveal)
  }
  async openAgent() {
    await this.sidebarViews.sync(VIEW, () => true, true)
  }
  openAgentSettings() {
    const settings = (
      this.app as typeof this.app & { setting?: { open(): void; openTabById(id: string): void } }
    ).setting
    settings?.open()
    settings?.openTabById(this.manifest.id)
  }
  async maybeShowSupportPrompt() {
    if (this.agentSettings.supportPrompt === false) return
    if (!supportPromptDue(this.agentSettings.supportPromptMonth)) return
    this.agentSettings.supportPromptMonth = supportPromptMonth()
    try {
      await this.saveAgentSettings()
    } catch {
      // Do not show a recurring prompt unless its monthly gate can be persisted.
      return
    }
    const modal = new Modal(this.app)
    modal.modalEl.addClass('catea-support-modal')
    modal.titleEl.setText(this.t('如果 Catea 对你有一点帮助'))
    modal.contentEl.createEl('p', {
      text: this.t(
        'Catea 仍在持续打磨。如果它恰好对你的写作或整理有所帮助，愿意的话，可以去 GitHub 点一颗 Star。',
      ),
    })
    modal.contentEl.createEl('p', {
      text: this.t('这会让更多人看到项目，也给维护带来一点鼓励。完全自愿，关闭即可继续使用。'),
      cls: 'catea-support-modal__note',
    })
    modal.onClose = () => this.dialogs.delete(modal)
    new Setting(modal.contentEl)
      .addButton((button) => button.setButtonText(this.t('暂时不用')).onClick(() => modal.close()))
      .addButton((button) =>
        button
          .setButtonText(this.t('前往 GitHub'))
          .setCta()
          .onClick(() => {
            modal.close()
            window.open(GITHUB_REPOSITORY, '_blank', 'noopener,noreferrer')
          }),
      )
    this.dialogs.add(modal)
    modal.open()
  }
  async noteContext(enabled: boolean) {
    if (!enabled) return ''
    return JSON.stringify(await this.obsidian.context())
  }
  showDetail(title: string, detail: string) {
    const modal = new Modal(this.app)
    modal.modalEl.addClass('catea-detail-modal')
    modal.titleEl.setText(title)
    modal.contentEl.createEl('pre', { text: detail })
    modal.open()
  }
  showFileChanges(changes: FileChange[]) {
    const modal = new Modal(this.app)
    let root: Root | undefined
    modal.modalEl.addClass('catea-file-changes-modal')
    modal.titleEl.setText(`${this.t('文件更改')} · ${changes.length}`)
    modal.onClose = () => {
      root?.unmount()
      this.dialogs.delete(modal)
    }
    const container = modal.contentEl.createDiv({ cls: 'catea-file-changes anno-auto-scrollbar' })
    root = createRoot(container)
    root.render(
      <>
        {changes.map((change) => (
          <ChangePreview
            key={change.filePath}
            language={this.agentSettings.language}
            path={change.filePath}
            before={change.original}
            after={change.modified}
          />
        ))}
      </>,
    )
    this.dialogs.add(modal)
    modal.open()
  }
  private confirm(title: string, detail: string, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    if (this.agentSettings.permissionMode === 'full') return Promise.resolve(true)
    return new Promise((resolve) => {
      const modal = new Modal(this.app)
      let settled = false
      let preview: Root | undefined
      const done = (value: boolean) => {
        if (settled) return
        settled = true
        preview?.unmount()
        signal.removeEventListener('abort', abort)
        this.dialogs.delete(modal)
        resolve(value)
        modal.close()
      }
      const abort = () => done(false)
      modal.onClose = () => done(false)
      signal.addEventListener('abort', abort, { once: true })
      modal.titleEl.setText(title)
      let change: Record<string, unknown> | undefined
      try {
        const parsed: unknown = JSON.parse(detail)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          change = parsed as Record<string, unknown>
      } catch {
        /* Non-JSON details use the plain-text preview. */
      }
      if (change && typeof change.after === 'string' && typeof change.path === 'string') {
        preview = createRoot(modal.contentEl.createDiv())
        preview.render(
          <ChangePreview
            language={this.agentSettings.language}
            path={change.path}
            before={typeof change.before === 'string' ? change.before : null}
            after={change.after}
          />,
        )
      } else
        modal.contentEl.createEl('pre', {
          text: detail,
          attr: { style: 'white-space:pre-wrap;max-height:55vh;overflow:auto' },
        })
      new Setting(modal.contentEl)
        .addButton((b) => b.setButtonText(this.t('拒绝')).onClick(() => done(false)))
        .addButton((b) =>
          b
            .setButtonText(this.t('确认这一次'))
            .setCta()
            .onClick(() => done(true)),
        )
      this.dialogs.add(modal)
      if (signal.aborted) done(false)
      else modal.open()
    })
  }
  private questions = new Map<
    string,
    {
      id: string
      questions: AskUserQuestion[]
      answer: (answers: AskUserQuestionAnswer) => void
      dismiss: () => void
    }
  >()
  get question() {
    return this.questions.get(this.agent.session.id)
  }
  hasQuestion(id: string) {
    return this.questions.has(id)
  }
  private ask(
    sessionId: string,
    questions: AskUserQuestion[],
    signal: AbortSignal,
  ): Promise<AskUserQuestionAnswer> {
    return new Promise((resolve, reject) => {
      let settled = false
      const done = (answers?: AskUserQuestionAnswer) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        this.questions.delete(sessionId)
        this.emit()
        if (answers) resolve(answers)
        else reject(new Error(this.t('用户取消回答；不要假定答案或重复询问')))
      }
      const abort = () => done()
      this.questions.set(sessionId, {
        id: crypto.randomUUID(),
        questions,
        answer: (answers) => {
          for (const q of questions)
            if (typeof answers[q.question] !== 'string' || !answers[q.question].trim())
              throw new Error(this.t('请回答所有问题'))
          done(answers)
        },
        dismiss: abort,
      })
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else this.emit()
    })
  }

  onunload() {
    for (const dialog of this.dialogs) dialog.close()
    for (const agent of this.tabs) void agent.close(agent === this.agent)
    super.onunload()
  }
}
class AgentView extends ItemView {
  private root?: Root
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: Catea,
  ) {
    super(leaf)
  }
  getViewType() {
    return VIEW
  }
  getDisplayText() {
    return 'Catea'
  }
  getIcon() {
    return 'messages-square'
  }
  async onOpen() {
    this.root = createRoot(this.contentEl)
    this.root.render(<Panel plugin={this.plugin} />)
    // The support prompt is disclosed in the README, bounded to one local
    // calendar month, off-switchable in settings, and shown only from the
    // plugin's own view rather than at Obsidian startup.
    void this.plugin.maybeShowSupportPrompt()
  }
  async onClose() {
    this.root?.unmount()
  }
}

class GitHistoryView extends ItemView {
  private root?: Root
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: Catea,
  ) {
    super(leaf)
  }
  getViewType() {
    return GIT_VIEW
  }
  getDisplayText() {
    return this.plugin.t('Git 历史')
  }
  getIcon() {
    return 'git-branch'
  }
  async onOpen() {
    this.contentEl.addClass('catea-git-view')
    this.root = createRoot(this.contentEl)
    this.root.render(<GitHistoryPanel plugin={this.plugin} />)
  }
  async onClose() {
    this.root?.unmount()
  }
}

class MemoryView extends ItemView {
  private root?: Root
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: Catea,
  ) {
    super(leaf)
  }
  getViewType() {
    return MEMORY_VIEW
  }
  getDisplayText() {
    return this.plugin.t('记忆')
  }
  // Built-in icon, matching the neighbouring Git tab's `git-branch`. Mixing in a
  // Remix glyph here would put two icon families in one sidebar tab strip.
  getIcon() {
    return 'brain'
  }
  async onOpen() {
    this.contentEl.addClass('catea-memory-view')
    this.root = createRoot(this.contentEl)
    this.root.render(<MemoryPanel plugin={this.plugin} />)
  }
  async onClose() {
    this.root?.unmount()
  }
}

class DiaryView extends ItemView {
  private root?: Root
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: Catea,
  ) {
    super(leaf)
  }
  getViewType() {
    return DIARY_VIEW
  }
  getDisplayText() {
    return this.plugin.t('日记')
  }
  getIcon() {
    return 'notebook-pen'
  }
  async onOpen() {
    this.contentEl.addClass('catea-diary-view')
    this.root = createRoot(this.contentEl)
    this.root.render(<DiaryPanel plugin={this.plugin} />)
  }
  async onClose() {
    this.root?.unmount()
  }
}
