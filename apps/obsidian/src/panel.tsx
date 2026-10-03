/**
 * [WHO]: Provides Panel
 * [FROM]: Depends on ../../../packages/agent-core/src/local-model, ../../../packages/agent-core/src/attachments, ../../../packages/agent-core/src/types, ./StreamingChatResponse, ./MessageQuotes, react, ./ChatMarkdown, catea-components, obsidian, ../../../packages/agent-core/src, ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/model-capabilities, ./session-drafts, ./locale, ./tool-presenters, ./turn-review, ../cat-welcome.png, ./main, ./settings
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/panel.tsx - React sidebar root composing a header session dropdown, history, message list and composer; maps model picker, approvals, quotes and attachments
 */
import {
  readDroppedAttachments,
  readPickedAttachments,
} from '../../../packages/agent-core/src/attachments'
import type { ChatAttachment, ToolEvent } from '../../../packages/agent-core/src/types'
import { MessageQuotes } from './MessageQuotes'
import { StreamingChatResponse } from './StreamingChatResponse'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatMarkdown } from './ChatMarkdown'
import {
  useScrollFade,
  Composer,
  AttachmentCards,
  type AttachmentCardItem,
  ApprovalCard,
  AgentActivities,
  type AgentActivityItem,
  ActionMenu,
  SkillPicker,
  parseSlashQuery,
  filterSkillItems,
  type SkillPickerItem,
  DitherLoader,
  Icon,
  IconButton,
  SidebarItem,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from 'catea-components'
import { FuzzySuggestModal, TFolder } from 'obsidian'
import type { Agent, Message } from '../../../packages/agent-core/src'
import { isLiteModel, LITE_MODEL_ID } from '../../../packages/agent-core/src/local-model'
import { configuredModels, selectedModel } from '../../../packages/agent-core/src/byok'
import { unsupportedAttachment } from '../../../packages/agent-core/src/model-capabilities'
import type { SessionDraft } from './session-drafts'
import { humanizeError, translate, type Language } from './locale'
import { createToolPresenters } from './tool-presenters'
import { collectFileChanges, showStandaloneFileReview } from './turn-review'
import catWelcome from '../cat-welcome.png'
import type Catea from './main'
import { syncSavedBillingStatus } from './settings'

const toolPresenters = createToolPresenters()
const catReplyActions = ['正在踩奶…', '正在舔爪…', '正在甩尾巴…', '正在扒拉键盘…'] as const

function isHostedBillingModel(
  model: { id?: string; baseUrl: string; model?: string } | undefined,
) {
  return (
    model?.id === 'catea-pro-hosted' ||
    model?.model === 'catea/pro' ||
    model?.baseUrl.replace(/\/$/, '').endsWith('/billing/hosted/v1') === true
  )
}

function MessageCopyButton({
  text,
  t,
  onError,
}: {
  text: string
  t: (key: string) => string
  onError: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <IconButton
      className="catea-message-copy"
      label={t(copied ? '已复制' : '复制')}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          (reason: unknown) => onError(reason instanceof Error ? reason.message : String(reason)),
        )
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </IconButton>
  )
}

function MessageError({
  raw,
  language,
  stopped,
  onContinue,
  chatOnly = false,
}: {
  chatOnly?: boolean
  raw: string
  language: Language
  stopped: boolean
  onContinue?: () => void
}) {
  const message =
    chatOnly && stopped
      ? translate(language, '本次生成已停止，回复已保留。')
      : humanizeError(raw, language)
  return (
    <div
      className={`message-error${stopped ? ' is-stopped' : ''}`}
      role={stopped ? 'status' : 'alert'}
    >
      <span>{message}</span>
      {onContinue && (
        <button type="button" onClick={onContinue}>
          {chatOnly
            ? translate(language, '继续对话')
            : language === 'en'
              ? 'Continue task'
              : '继续任务'}
        </button>
      )}
      {message !== raw && !(chatOnly && stopped) && (
        <details>
          <summary>{language === 'en' ? 'Technical details' : '技术详情'}</summary>
          <code>{raw}</code>
        </details>
      )}
    </div>
  )
}

function activityItems(
  message: Message,
  t: (key: string) => string,
  language: Language | undefined,
): AgentActivityItem[] {
  const visible = message.tools.filter(
    (tool) => tool.name !== 'AskUserQuestion' || tool.result !== undefined || tool.error,
  )
  const toolItem = (tool: ToolEvent): AgentActivityItem => ({
    type: 'tool',
    id: tool.id,
    name: toolPresenters.title(tool, t),
    summary: tool.error
      ? humanizeError(tool.error, language || 'zh')
      : toolPresenters.summary(tool),
    status: tool.error ? 'error' : tool.result !== undefined ? 'completed' : 'running',
  })
  if (!message.activities?.length)
    return [
      ...(message.reasoning?.trim()
        ? [
            {
              type: 'thinking' as const,
              id: `legacy:${message.id}`,
              content: message.reasoning,
              active: false,
              startedAt: message.startedAt,
            },
          ]
        : []),
      ...visible.map(toolItem),
    ]
  const byId = new Map(visible.map((tool) => [tool.id, tool]))
  const ordered: AgentActivityItem[] = message.activities.flatMap((item) => {
    if (item.type === 'thinking')
      return [
        {
          type: 'thinking',
          id: item.id,
          content: item.content,
          active: message.status === 'streaming' && !item.completed,
          startedAt: item.startedAt,
        },
      ]
    const tool = byId.get(item.toolId)
    return tool ? [toolItem(tool)] : []
  })
  const listed = new Set(
    message.activities.filter((item) => item.type === 'tool').map((item) => item.toolId),
  )
  return [...ordered, ...visible.filter((tool) => !listed.has(tool.id)).map(toolItem)]
}

function activityPreview(
  status: string,
  tools: ToolEvent[],
  activities: AgentActivityItem[],
  language: string | undefined,
  t: (key: string) => string,
  startedAt?: number,
  completedAt?: number,
) {
  const visible = tools.filter(
    (tool) => tool.name !== 'AskUserQuestion' || tool.result !== undefined || tool.error,
  )
  const running = [...visible].reverse().find((tool) => tool.result === undefined && !tool.error)
  if (running) return `${toolPresenters.title(running, t)}…`
  if (status === 'streaming') {
    if (
      tools.some(
        (tool) => tool.name === 'AskUserQuestion' && tool.result === undefined && !tool.error,
      )
    )
      return t('等待你的回答')
    return t(
      activities.some((item) => item.type === 'thinking' && item.active) ? '正在思考' : '正在生成',
    )
  }
  if (status === 'complete' && startedAt !== undefined && completedAt !== undefined) {
    const seconds = Math.max(0, Math.floor((completedAt - startedAt) / 1000))
    return t('猫咪奔跑了 {elapsed}').replace(
      '{elapsed}',
      `${Math.floor(seconds / 60)}m${seconds % 60}s`,
    )
  }
  const count = activities.length,
    errors = visible.filter((tool) => tool.error).length
  return language === 'en'
    ? `${count} steps completed${errors ? ` · ${errors} failed` : ''}`
    : `已完成 ${count} 个步骤${errors ? ` · ${errors} 个失败` : ''}`
}

function chooseVaultFolder(plugin: Catea, label: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    class FolderPicker extends FuzzySuggestModal<TFolder> {
      getItems() {
        return plugin.app.vault
          .getAllLoadedFiles()
          .filter(
            (item): item is TFolder =>
              item instanceof TFolder &&
              !item.isRoot() &&
              !item.path.split('/').some((part) => part.startsWith('.')),
          )
      }
      getItemText(item: TFolder) {
        return item.path
      }
      onChooseItem(item: TFolder) {
        settled = true
        resolve(item.path)
      }
      onClose() {
        if (!settled) resolve(null)
      }
    }
    const picker = new FolderPicker(plugin.app)
    picker.setPlaceholder(label)
    picker.open()
  })
}

export function Panel({ plugin }: { plugin: Catea }) {
  const agent: Agent = plugin.agent
  const panelRef = useRef<HTMLDivElement>(null)
  useScrollFade(panelRef, 12)
  const openNote = useCallback(
    (path: string) => {
      void plugin.app.workspace.openLinkText(path, '')
    },
    [plugin],
  )
  const t = plugin.t
  const [, update] = useState(0),
    [error, setError] = useState(''),
    [showHistory, setShowHistory] = useState(false)
  const readingSessions = useRef(new Set<string>()),
    preparingSessions = useRef(new Set<string>())
  const sessionId = agent.session.id,
    draft = plugin.drafts.get(sessionId),
    text = draft.text,
    files = draft.attachments,
    readingFiles = readingSessions.current.has(sessionId)
  const changeDraft = (id: string, change: (current: SessionDraft) => SessionDraft) => {
    plugin.drafts.update(id, change)
    plugin.emit()
  }
  const setText = (value: string) => {
    changeDraft(sessionId, (current) => ({ ...current, text: value }))
    evaluateSlash(value)
  }
  // Slash skill picker state: the open token, roving active index, and the
  // lazily loaded installed-skill catalog (background-revalidated per open).
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null)
  const [skillActive, setSkillActive] = useState(0)
  const [skillCatalog, setSkillCatalog] = useState<Array<{
    id: string
    description: string
  }> | null>(null)
  const skillCatalogRef = useRef<Array<{ id: string; description: string }> | null>(null)
  const skillsInflight = useRef<Promise<void> | null>(null)
  const dismissedToken = useRef<string | null>(null)
  const slashOpen = slash !== null
  useEffect(() => {
    setSlash(null)
    setSkillActive(0)
    dismissedToken.current = null
  }, [sessionId])
  useEffect(() => {
    if (!slashOpen || skillsInflight.current) return
    const silent = skillCatalogRef.current !== null
    skillsInflight.current = agent
      .installedSkills()
      .then((items) => {
        skillCatalogRef.current = items
        setSkillCatalog(items)
      })
      .catch((e: unknown) => {
        if (!silent) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        skillsInflight.current = null
      })
  }, [slashOpen, agent])
  const evaluateSlash = (value: string) => {
    const token = parseSlashQuery(value)
    if (!token) {
      setSlash(null)
      return
    }
    // An explicit Esc stays dismissed while the same token keeps growing; it
    // reopens only after the token is erased or a fresh slash starts a new one.
    if (dismissedToken.current && value.slice(token.start).startsWith(dismissedToken.current)) {
      setSlash(null)
      return
    }
    // The tail regex alone goes stale when the caret moves away from the end.
    const input = panelRef.current?.querySelector<HTMLTextAreaElement>('.anno-composer__input')
    if (input && input.selectionEnd !== value.length) {
      setSlash(null)
      return
    }
    if (slash && slash.query === token.query && slash.start === token.start) return
    setSkillActive(0)
    setSlash(token)
  }
  // Read the enabled set from the plugin prop directly: `config` is bound later
  // in the render body, and this mapping runs eagerly.
  const skillItems: SkillPickerItem[] = (skillCatalog || []).map((item) => ({
    ...item,
    enabled: plugin.agentSettings.skills.includes(item.id),
  }))
  const slashItems = slash ? filterSkillItems(skillItems, slash.query) : []
  const slashActive = Math.min(skillActive, Math.max(0, slashItems.length - 1))
  const selectSkill = (item: SkillPickerItem) => {
    if (!slash) return
    const start = slash.start
    dismissedToken.current = null
    changeDraft(sessionId, (current) => ({
      ...current,
      text: current.text.slice(0, Math.min(start, current.text.length)),
      skills: current.skills.includes(item.id) ? current.skills : [...current.skills, item.id],
    }))
    setSlash(null)
    panelRef.current?.querySelector<HTMLTextAreaElement>('.anno-composer__input')?.focus()
  }
  const recheckSlash = () => evaluateSlash(plugin.drafts.get(sessionId).text)
  const readFiles = async (input: FileList | DataTransfer) => {
    const target = agent.session.id
    if (readingSessions.current.has(target)) return
    const existing = plugin.drafts.get(target).attachments
    readingSessions.current.add(target)
    plugin.emit()
    setError('')
    try {
      const result =
        'items' in input
          ? await readDroppedAttachments(input, existing)
          : await readPickedAttachments(Array.from(input), existing)
      changeDraft(target, (current) => ({
        ...current,
        attachments: [...current.attachments, ...result.attachments],
      }))
      if (plugin.agent === agent && result.skipped)
        setError(
          `${result.skipped} ${t('个附件未导入：隐藏文件、读取失败或超过限制（单个 10 MB、合计 32 MB、64 个文件）。')}`,
        )
      if (plugin.agent === agent && 'folders' in result && result.folders)
        setError(t('文件夹不会批量上传，请通过添加菜单选择知识库文件夹。'))
    } catch (e) {
      if (plugin.agent === agent) setError(e instanceof Error ? e.message : String(e))
    } finally {
      readingSessions.current.delete(target)
      plugin.emit()
    }
  }
  const fileCards = (items: ChatAttachment[], removable = false) => {
    const cards: AttachmentCardItem[] = items.map((file) => {
      const name = file.path.split('/').pop() || file.path,
        folder = file.kind === 'folder',
        image = !folder && /^image\/(png|jpeg|gif|webp)$/.test(file.mimeType || '')
      const extension = name.includes('.') ? name.split('.').pop()!.toUpperCase() : t('文件')
      return {
        id: file.id,
        name,
        path: file.path,
        kind: folder ? 'folder' : image ? 'image' : 'file',
        previewUrl: image ? file.dataUrl : undefined,
        detail: folder
          ? t('文件夹')
          : `${extension} · ${Math.max(1, Math.round(file.size / 1024))} KB`,
      }
    })
    return (
      <AttachmentCards
        items={cards}
        mode={removable ? 'composer' : 'message'}
        removeLabel={t('移除附件')}
        onRemove={
          removable
            ? (id) =>
                changeDraft(sessionId, (current) => ({
                  ...current,
                  attachments: current.attachments.filter((file) => file.id !== id),
                }))
            : undefined
        }
      />
    )
  }
  const addFolder = () => {
    const target = agent.session.id
    void chooseVaultFolder(plugin, t('选择知识库文件夹')).then((path) => {
      if (!path) return
      changeDraft(target, (current) =>
        current.attachments.some((file) => file.kind === 'folder' && file.path === path)
          ? current
          : {
              ...current,
              attachments: [
                ...current.attachments,
                {
                  id: crypto.randomUUID(),
                  kind: 'folder',
                  path,
                  size: 0,
                  mimeType: 'inode/directory',
                },
              ],
            },
      )
    })
  }
  const [deleteId, setDeleteId] = useState<string | null>(null),
    [showJump, setShowJump] = useState(false)
  const [annotation, setAnnotation] = useState<{
    messageId: string
    quote: string
    comment: string
  } | null>(null)
  const selectedReply = useRef<{ messageId: string; quote: string } | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; title: string }>>([])
  const scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    lastScrollTop = useRef(0)
  useEffect(() => plugin.subscribe(() => update((n) => n + 1)), [plugin])
  const selectionId = plugin.selections.at(-1)?.id
  const config = plugin.agentSettings,
    models = configuredModels(plugin.chatModels()),
    requestedModelId = agent.session.modelId ?? config.modelId,
    model =
      requestedModelId === LITE_MODEL_ID
        ? models.find(isLiteModel)
        : selectedModel(models, requestedModelId),
    localChat = requestedModelId === LITE_MODEL_ID || isLiteModel(model),
    empty = !agent.session.messages.length
  useEffect(() => {
    setAnnotation(null)
    selectedReply.current = null
  }, [sessionId, config.enableReplyAnnotations])

  useEffect(() => {
    if (selectionId) setShowHistory(false)
  }, [selectionId])
  useEffect(() => {
    const viewport = scroll.current,
      content = viewport?.firstElementChild
    if (!viewport || !content) return
    const pin = () => {
      if (follow.current) {
        viewport.scrollTop = viewport.scrollHeight
        lastScrollTop.current = viewport.scrollTop
        setShowJump(false)
      }
    }
    const resize = new ResizeObserver(pin)
    resize.observe(content)
    pin()
    return () => resize.disconnect()
  }, [empty, showHistory, sessionId])
  useEffect(() => {
    void agent
      .list()
      .then(setHistory)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [agent, agent.running, agent.session.id, showHistory])
  const captureReplySelection = () => {
    if (config.enableReplyAnnotations !== true) return
    const selection = panelRef.current?.ownerDocument.defaultView?.getSelection()
    if (!selection?.rangeCount || !selection.toString().trim()) return
    const ancestor = selection.getRangeAt(0).commonAncestorContainer
    const element = ancestor.nodeType === 1 ? (ancestor as Element) : ancestor.parentElement
    const message = element?.closest<HTMLElement>('.chat-message.assistant[data-message-id]')
    if (message && panelRef.current?.contains(message))
      selectedReply.current = {
        messageId: message.dataset.messageId || '',
        quote: selection.toString().trim().slice(0, 3000),
      }
  }
  const annotate = (messageId: string) => {
    if (config.enableReplyAnnotations !== true) return
    const selection = panelRef.current?.ownerDocument.defaultView?.getSelection(),
      root = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') || [],
      ).find((node) => node.dataset.messageId === messageId)
    const current =
      selection?.rangeCount && root?.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.toString().trim().slice(0, 3000)
        : ''
    const quote =
      current ||
      (selectedReply.current?.messageId === messageId && selectedReply.current.quote) ||
      ''
    if (!quote) {
      setError(t('请先选中回复中的文字'))
      return
    }
    setAnnotation({ messageId, quote, comment: '' })
    selection?.removeAllRanges()
    setError('')
  }
  const addAnnotation = () => {
    if (!annotation?.comment.trim()) return
    changeDraft(sessionId, (current) => ({
      ...current,
      quotes: [
        ...current.quotes,
        {
          id: crypto.randomUUID(),
          path: t('回复批注'),
          text: annotation.quote,
          comment: annotation.comment.trim(),
        },
      ],
    }))
    setAnnotation(null)
    selectedReply.current = null
    panelRef.current?.querySelector<HTMLTextAreaElement>('.anno-composer__input')?.focus()
  }
  const continueTask = () => {
    changeDraft(sessionId, (current) =>
      current.text.trim()
        ? current
        : { ...current, text: t(localChat ? '继续刚才的对话' : '继续刚才的任务') },
    )
    panelRef.current?.querySelector<HTMLTextAreaElement>('.anno-composer__input')?.focus()
  }
  const send = () => {
    const target = sessionId,
      snapshot = plugin.drafts.get(target),
      hasAnnotation = snapshot.quotes.some((quote) => quote.comment?.trim()),
      value = snapshot.text.trim() || (hasAnnotation ? t('请按批注继续') : t('请查看这些附件')),
      sendingFiles = [...snapshot.attachments],
      quotes = [...snapshot.quotes],
      sendingSkills = [...snapshot.skills]
    if (
      (!snapshot.text.trim() && !sendingFiles.length && !hasAnnotation) ||
      plugin.question ||
      readingFiles ||
      preparingSessions.current.has(target)
    )
      return
    if (localChat && agent.running) return
    if (localChat && sendingFiles.length) {
      setError(t('Catea Lite 仅支持文字对话，请先移除附件。'))
      return
    }
    if (model && unsupportedAttachment(model, sendingFiles)) {
      setError(t('附件已保留：当前模型不支持此类图片或二进制文档，请切换支持该附件的模型。'))
      return
    }
    preparingSessions.current.add(target)
    setError('')
    plugin.drafts.clear(target)
    plugin.emit()
    follow.current = true
    const context = async () => {
      const note = await plugin.noteContext(config.includeCurrentNote !== false)
      if (agent.session.id !== target) throw new Error('Session changed before sending')
      return JSON.stringify({
        currentNote: note ? (JSON.parse(note) as unknown) : undefined,
        selectedQuotes: quotes.map(({ path, text, comment }) => ({ path, text, comment })),
      })
    }
    void (async () => {
      if (model) {
        config.modelId = model.id
        await plugin.saveAgentSettings()
      }
      if (isHostedBillingModel(model)) await syncSavedBillingStatus(plugin)
      return agent.running
        ? context().then((attached) =>
            agent.steer(value, attached, sendingFiles, sendingSkills, quotes),
          )
        : agent.send(value, context, sendingFiles, sendingSkills, quotes)
    })()
      .catch((e: unknown) => {
        if (plugin.agent === agent) setError(e instanceof Error ? e.message : String(e))
        plugin.drafts.restore(target, {
          ...snapshot,
          text: value,
          attachments: sendingFiles,
          quotes,
        })
        plugin.emit()
      })
      .finally(() => {
        preparingSessions.current.delete(target)
        plugin.emit()
      })
  }
  const modelPicker = (
    <Select
      disabled={agent.running}
      value={model?.id || 'none'}
      onValueChange={(value) => {
        if (value === 'none') return
        void agent
          .selectModel(value)
          .then(() => plugin.saveAgentSettings())
          .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      }}
    >
      <SelectTrigger className="model-trigger" aria-label={t('模型')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {requestedModelId === LITE_MODEL_ID && !model && (
          <SelectItem value="none" disabled>
            {t('Catea Lite 未就绪')}
          </SelectItem>
        )}
        {models.length ? (
          models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))
        ) : requestedModelId !== LITE_MODEL_ID ? (
          <SelectItem value="none">{t('未配置模型')}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  )
  const composer = (
    <>
      <div
        className="catea-skill-picker"
        onKeyDownCapture={(event) => {
          // Full IME bypass: arrows navigate candidate windows, Enter confirms
          // composition — none of them may reach the picker.
          if (!slash || localChat || event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            event.stopPropagation()
            if (!slashItems.length) return
            const len = slashItems.length
            setSkillActive((n) => (event.key === 'ArrowDown' ? (n + 1) % len : (n - 1 + len) % len))
          } else if (event.key === 'Enter') {
            // Zero matches: fall through so "/whatever" stays sendable as text.
            if (!slashItems.length) return
            event.preventDefault()
            event.stopPropagation()
            selectSkill(slashItems[slashActive])
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            dismissedToken.current = text.slice(slash.start)
            setSlash(null)
          } else if (event.key === 'Tab') {
            // Close without preventDefault so focus traversal stays native.
            dismissedToken.current = text.slice(slash.start)
            setSlash(null)
          }
        }}
        onKeyUpCapture={recheckSlash}
        onClickCapture={recheckSlash}
      >
        {slash && !localChat && (
          <SkillPicker
            items={slashItems}
            activeIndex={slashActive}
            selectedIds={draft.skills}
            onSelect={selectSkill}
            listLabel={t('选择技能')}
            emptyLabel={t('无匹配技能')}
            enabledLabel={t('已启用')}
            addedLabel={t('已添加')}
          />
        )}
        <Composer
          value={text}
          onChange={setText}
          onSubmit={send}
          running={agent.running}
          onStop={() => agent.stop()}
          stopLabel={t('停止生成')}
          placeholder={
            !model
              ? t(
                  requestedModelId === LITE_MODEL_ID
                    ? '在设置中开启 Catea Lite，或选择其他模型'
                    : '先在设置中配置模型',
                )
              : agent.running
                ? t(localChat ? '正在本机回复…' : '补充要求，会在安全边界接入…')
                : empty
                  ? t('搜索或向 AI 提问…')
                  : t('继续对话…')
          }
          mode="ai"
          inputLabel={t('消息')}
          submitLabel={t('发送')}
          busy={!!plugin.question || readingFiles}
          hasSubmitContent={
            files.length > 0 || draft.quotes.some((quote) => !!quote.comment?.trim())
          }
          onPickFiles={localChat ? undefined : (input) => void readFiles(input)}
          onPickFolder={localChat ? undefined : addFolder}
          onDropFiles={localChat ? undefined : (input) => void readFiles(input)}
          attachLabel={t('添加附件')}
          fileLabel={t('添加文件')}
          folderLabel={t('添加文件夹')}
          dropLabel={t('放下以添加文件')}
          disabled={!config.enabled || !model || (agent.historyBusy && !agent.running)}
          attachments={
            <>
              {localChat && (
                <div className="catea-local-model-status">{t('本地 · 32K · 仅对话')}</div>
              )}
              {draft.skills.length > 0 && (
                <div className="catea-skill-tags">
                  {draft.skills.map((id) => (
                    <span className="catea-skill-tag" key={id}>
                      <span className="catea-skill-tag__name">{id}</span>
                      <IconButton
                        label={t('移除技能')}
                        onClick={() =>
                          changeDraft(sessionId, (current) => ({
                            ...current,
                            skills: current.skills.filter((skill) => skill !== id),
                          }))
                        }
                      >
                        <Icon name="close" size={12} />
                      </IconButton>
                    </span>
                  ))}
                </div>
              )}
              {files.length > 0 && fileCards(files, true)}
              {readingFiles && (
                <div className="chat-notice catea-loading-notice">
                  <DitherLoader label={t('正在读取附件…')} />
                  {t('正在读取附件…')}
                </div>
              )}
              {plugin.selections.length > 0 && (
                <div className="catea-quotes">
                  {plugin.selections.map((q) => (
                    <div className="catea-quote" key={q.id}>
                      <div>
                        <strong>{q.path.split('/').pop()}</strong>
                        <blockquote>{q.text}</blockquote>
                        {q.comment && <p>{q.comment}</p>}
                      </div>
                      <IconButton
                        label={t('移除引用')}
                        onClick={() => {
                          plugin.selections = plugin.selections.filter((s) => s.id !== q.id)
                          plugin.emit()
                        }}
                      >
                        <Icon name="close" size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </>
          }
          trailing={modelPicker}
        />
      </div>
      {error && (
        <div className="chat-notice" role="alert">
          {humanizeError(error, config.language || 'zh')}
        </div>
      )}
      {agent.compaction && (
        <div
          className={`chat-notice${agent.compaction.type === 'start' ? ' catea-loading-notice' : ''}`}
          role="status"
        >
          {agent.compaction.type === 'start' && (
            <DitherLoader
              label={config.language === 'en' ? 'Compacting context' : '正在压缩上下文'}
            />
          )}
          {config.language === 'en'
            ? {
                start: 'Compacting context…',
                complete: 'Context compacted',
                failure: humanizeError(
                  `Context compaction failed: ${agent.compaction.error || ''}`,
                  'en',
                ),
              }[agent.compaction.type]
            : {
                start: '正在压缩上下文…',
                complete: '上下文压缩完成',
                failure: humanizeError(`上下文压缩失败：${agent.compaction.error || ''}`, 'zh'),
              }[agent.compaction.type]}
        </div>
      )}
      {!model && (
        <div className="chat-notice">
          <button onClick={() => plugin.openAgentSettings()}>
            {t(localChat ? '开启 Catea Lite →' : '配置 BYOK 模型 →')}
          </button>
        </div>
      )}
    </>
  )
  return (
    <div ref={panelRef} className="catea-ui catea-panel">
      <main className={empty && !showHistory ? 'ai-start-page' : 'chat-main'}>
        {plugin.updates.bannerVersion && (
          <div className="catea-update-banner" role="status">
            <Icon name="arrow-up" size={16} />
            <span>
              {t('Catea 有新版本')}{' '}
              <span className="catea-update-version">{plugin.updates.bannerVersion}</span>
            </span>
            <button
              type="button"
              className="catea-update-action"
              onClick={() => plugin.openPluginUpdates()}
            >
              {t('前往更新')}
            </button>
            <IconButton
              label={t('忽略此版本')}
              onClick={() => {
                void plugin.updates.dismiss().catch(() => setError(t('更新偏好保存失败，请重试')))
              }}
            >
              <Icon name="close" size={14} />
            </IconButton>
          </div>
        )}
        <header className="chat-header">
          <div className="header-leading">
            <ActionMenu
              label={t('切换会话')}
              icon={<Icon name="history" size={17} />}
              className="catea-session-trigger"
              menuClassName="catea-session-menu"
              placement="bottom"
              items={[
                ...plugin.tabs.map((tab) => ({
                  id: tab.session.id,
                  label: tab.session.title === '新对话' ? t('新对话') : tab.session.title,
                  checked: tab === agent,
                  icon: tab.running ? (
                    <DitherLoader label={t('正在生成')} />
                  ) : (
                    <Icon name="chat" size={15} />
                  ),
                  detail: plugin.hasQuestion(tab.session.id) ? t('等待你的回答') : undefined,
                  onSelect: () => {
                    plugin.agent = tab
                    plugin.agentSettings.personaId = tab.session.personaId
                    plugin.emit()
                    setShowHistory(false)
                    setError('')
                    follow.current = true
                  },
                })),
                {
                  id: 'new',
                  label: t('新对话'),
                  icon: <Icon name="add" size={15} />,
                  separatorBefore: true,
                  onSelect: () => {
                    plugin.newTab()
                    setShowHistory(false)
                    setError('')
                    follow.current = true
                  },
                },
                {
                  id: 'history',
                  label: t('历史对话'),
                  icon: <Icon name="history" size={15} />,
                  onSelect: () => setShowHistory(true),
                },
                {
                  id: 'close',
                  label: t('关闭当前会话'),
                  icon: <Icon name="close" size={15} />,
                  onSelect: () => {
                    void plugin
                      .closeTab(sessionId)
                      .then(() => {
                        setShowHistory(false)
                        setError('')
                        follow.current = true
                      })
                      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                  },
                },
              ]}
            />
            <div className="chat-header-title">
              <span>{showHistory ? t('历史对话') : empty ? t('新对话') : agent.session.title}</span>
            </div>
          </div>
          <div className="chat-header-actions">
            <IconButton
              label={t('新对话')}
              onClick={() => {
                plugin.newTab()
                setShowHistory(false)
                setError('')
                follow.current = true
              }}
            >
              <Icon name="add" size={17} />
            </IconButton>
            <IconButton label={t('设置')} onClick={() => plugin.openAgentSettings()}>
              <Icon name="settings" size={17} />
            </IconButton>
          </div>
        </header>
        {showHistory ? (
          <div className="catea-history anno-auto-scrollbar">
            <h2>{t('最近对话')}</h2>
            {history.map((s) => (
              <SidebarItem
                key={s.id}
                icon={<Icon name="chat" size={15} />}
                title={s.title}
                active={s.id === agent.session.id}
                trailingOpen={deleteId === s.id}
                trailing={
                  deleteId === s.id ? (
                    <span className="catea-history-confirm">
                      <button
                        type="button"
                        disabled={plugin.tabs.some((tab) => tab.session.id === s.id && tab.running)}
                        onClick={() => {
                          void plugin
                            .deleteSession(s.id)
                            .then(() => agent.list())
                            .then((rows) => {
                              setHistory(rows)
                              setDeleteId(null)
                            })
                            .catch((e: unknown) =>
                              setError(t(e instanceof Error ? e.message : String(e))),
                            )
                        }}
                      >
                        {t('删除')}
                      </button>
                      <IconButton label={t('取消')} onClick={() => setDeleteId(null)}>
                        <Icon name="close" size={14} />
                      </IconButton>
                    </span>
                  ) : (
                    <IconButton
                      className="catea-history-delete"
                      label={t('删除会话')}
                      disabled={plugin.tabs.some((tab) => tab.session.id === s.id && tab.running)}
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Icon name="trash" size={14} />
                    </IconButton>
                  )
                }
                onClick={() => {
                  void plugin
                    .openTab(s.id)
                    .then(() => {
                      setShowHistory(false)
                      setError('')
                      follow.current = true
                    })
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                }}
              />
            ))}
            {!history.length && <p className="sidebar-empty">{t('对话会保存在当前知识库中。')}</p>}
            {error && (
              <div className="chat-notice" role="alert">
                {humanizeError(error, config.language || 'zh')}
              </div>
            )}
          </div>
        ) : empty ? (
          <>
            <div className="catea-welcome-art" aria-hidden="true">
              <img src={catWelcome} alt="" />
            </div>
            <div className="chat-composer-wrap catea-welcome-composer">{composer}</div>
          </>
        ) : (
          <>
            <div
              ref={scroll}
              className="chat-scroll anno-auto-scrollbar"
              onWheel={(e) => {
                if (e.deltaY < 0) follow.current = false
              }}
              onScroll={(e) => {
                const el = e.currentTarget,
                  nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24,
                  movedUp = el.scrollTop < lastScrollTop.current - 1,
                  movedDown = el.scrollTop > lastScrollTop.current + 1
                if (movedUp) follow.current = false
                else if (movedDown && nearBottom) follow.current = true
                setShowJump(!nearBottom)
                lastScrollTop.current = el.scrollTop
              }}
            >
              <div
                className="chat-messages"
                onMouseUp={captureReplySelection}
                onKeyUp={captureReplySelection}
              >
                {agent.session.messages.map((m) => (
                  <div
                    data-message-id={m.id}
                    className={`chat-message ${m.role} ${m.delivery === 'queued' || m.delivery === 'deferred' ? 'has-queued-message' : ''}`}
                    key={m.id}
                  >
                    {m.role === 'user' ? (
                      <div className="chat-user-content">
                        <MessageQuotes quotes={m.quotes} />
                        {fileCards(
                          (agent.session.attachments || []).filter((file) =>
                            m.attachmentIds?.includes(file.id),
                          ),
                        )}
                        {!!m.skills?.length && (
                          <div className="catea-skill-tags catea-message-skills">
                            {m.skills.map((id) => (
                              <span className="catea-skill-tag" key={id} title={id}>
                                <span className="catea-skill-tag__name">{id}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="chat-message-body">
                          {m.delivery === 'queued' || m.delivery === 'deferred' ? (
                            <div className="catea-queued-message" role="status">
                              <Icon name="history" size={12} />
                              <span>{t(m.delivery === 'queued' ? '排队中' : '下次回复接入')}</span>
                            </div>
                          ) : null}
                          <ChatMarkdown
                            content={m.text}
                            streaming={false}
                            language={config.language || 'zh'}
                            onOpenNote={openNote}
                          />
                        </div>
                        {m.delivery !== 'queued' && m.delivery !== 'deferred' && (
                          <div className="catea-message-actions">
                            <MessageCopyButton text={m.text} t={t} onError={setError} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <AgentActivities
                          items={activityItems(m, t, config.language)}
                          preview={activityPreview(
                            m.status,
                            m.tools,
                            activityItems(m, t, config.language),
                            config.language,
                            t,
                            m.startedAt,
                            m.completedAt,
                          )}
                          autoExpand={
                            m.status === 'streaming' && (!m.text.trim() || !!m.reasoning?.trim())
                          }
                          thinking={m.status === 'streaming' && !plugin.question}
                          startedAt={m.startedAt}
                          labels={{
                            thinking: t('正在思考'),
                            thought: t('思考过程'),
                            details: t('查看操作'),
                          }}
                          onOpenDetails={(id) => {
                            const tool = m.tools.find((item) => item.id === id)
                            if (tool) plugin.showDetail(t('工具详情'), toolPresenters.details(tool))
                          }}
                        />

                        {m.text.trim() && (
                          <StreamingChatResponse
                            footerActions={
                              m.status !== 'streaming' ? (
                                <>
                                  {collectFileChanges(m.tools).length > 0 && (
                                    <button
                                      className="anno-response-card__action"
                                      type="button"
                                      onClick={() =>
                                        plugin.showFileChanges(collectFileChanges(m.tools))
                                      }
                                    >
                                      <Icon name="file-diff" size={12} />
                                      {t('查看文件更改')}
                                    </button>
                                  )}
                                  {config.enableReplyAnnotations === true && (
                                    <button
                                      className="anno-response-card__action"
                                      type="button"
                                      aria-label={t('引用选中内容并批注')}
                                      title={t('引用选中内容并批注')}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => annotate(m.id)}
                                    >
                                      <Icon name="quote" size={12} />
                                      {t('引用批注')}
                                    </button>
                                  )}
                                </>
                              ) : undefined
                            }
                            sources={m.sources}
                            content={m.text}
                            interrupted={m.status === 'stopped' || m.status === 'error'}
                            streaming={m.status === 'streaming' && !plugin.question}
                            startedAt={m.startedAt}
                            paused={!!plugin.question}
                            tokenUsage={
                              config.showTokenUsage && m.usage
                                ? {
                                    input: m.usage.input,
                                    output: m.usage.output,
                                    cacheRead: m.usage.cacheRead,
                                    cacheWrite: m.usage.cacheWrite,
                                    labels: {
                                      input: t('输入'),
                                      output: t('输出'),
                                      cacheRead: t('缓存命中'),
                                    },
                                  }
                                : undefined
                            }
                            onExpand={() => plugin.showDetail(t('回复'), m.text)}
                            labels={{
                              copy: t('复制'),
                              copied: t('已复制'),
                              markdown: 'Markdown',
                              expand: t('展开'),
                              streaming: catReplyActions.map(t),
                              sources: t('来源'),
                            }}
                            render={(displayed, busy) => (
                              <ChatMarkdown
                                content={displayed}
                                streaming={busy}
                                language={config.language || 'zh'}
                                onOpenNote={openNote}
                              />
                            )}
                          />
                        )}
                        {!!(m.generatedImages?.length || m.generatedMedia?.length) && (
                          <div className="catea-generated-files">
                            <AttachmentCards
                              items={[
                                ...(m.generatedImages || []).filter((path) =>
                                  /^Attachments\/Catea\/[a-zA-Z0-9-]+\.(png|jpg|webp)$/.test(path),
                                ),
                                ...(m.generatedMedia || [])
                                  .filter((media) =>
                                    media.kind === 'video'
                                      ? /^Attachments\/Catea\/[a-zA-Z0-9-]+\.mp4$/.test(media.path)
                                      : media.kind === 'audio' &&
                                        /^Attachments\/Catea\/[a-zA-Z0-9-]+\.mp3$/.test(media.path),
                                  )
                                  .map((media) => media.path),
                              ].map((path) => ({
                                id: path,
                                path,
                                name: path.split('/').at(-1) || path,
                                kind: 'file',
                                detail: path.split('.').at(-1)!.toUpperCase(),
                              }))}
                              onOpen={openNote}
                            />
                          </div>
                        )}
                        {showStandaloneFileReview(
                          m.text,
                          m.status,
                          collectFileChanges(m.tools),
                        ) && (
                          <div className="anno-response-card__footer-actions">
                            <button
                              className="anno-response-card__action"
                              type="button"
                              onClick={() => plugin.showFileChanges(collectFileChanges(m.tools))}
                            >
                              <Icon name="file-diff" size={12} />
                              {t('查看文件更改')}
                            </button>
                          </div>
                        )}
                        {m.error && (
                          <MessageError
                            chatOnly={m.model === 'Catea Lite'}
                            raw={m.error}
                            language={config.language || 'zh'}
                            stopped={m.status === 'stopped'}
                            onContinue={
                              m.status === 'stopped' ||
                              /^(?:aborted|Request was aborted|模型连接超时|fetch failed|socket hang up)/i.test(
                                m.error,
                              )
                                ? continueTask
                                : undefined
                            }
                          />
                        )}
                        {config.enableReplyAnnotations === true &&
                          annotation?.messageId === m.id && (
                            <div className="catea-annotation-editor">
                              <div className="catea-annotation-editor__quote">
                                {annotation.quote}
                              </div>
                              <label className="catea-field-label">
                                <span className="catea-sr-only">{t('批注内容')}</span>
                                <textarea
                                  autoFocus
                                  value={annotation.comment}
                                  placeholder={t('针对这段回复写下你的问题或意见…')}
                                  onChange={(event) =>
                                    setAnnotation((current) =>
                                      current ? { ...current, comment: event.target.value } : null,
                                    )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                      event.preventDefault()
                                      addAnnotation()
                                    }
                                    if (event.key === 'Escape') setAnnotation(null)
                                  }}
                                />
                              </label>
                              <div className="catea-annotation-editor__actions">
                                <button type="button" onClick={() => setAnnotation(null)}>
                                  {t('取消')}
                                </button>
                                <button
                                  type="button"
                                  disabled={!annotation.comment.trim()}
                                  onClick={addAnnotation}
                                >
                                  {t('添加批注')}
                                </button>
                              </div>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                ))}
                {plugin.question && (
                  <ApprovalCard
                    key={plugin.question.id}
                    questions={plugin.question.questions.map((q, i) => ({
                      id: String(i),
                      title: q.question,
                      options: q.options.map((o) => ({ value: o.label, ...o })),
                      multiple: q.multiSelect,
                      allowCustom: true,
                      customPlaceholder: t('填写其他回答'),
                    }))}
                    onSubmit={(answers) => {
                      const q = plugin.question
                      if (q)
                        q.answer(
                          Object.fromEntries(
                            q.questions.map((item, i) => {
                              const answer = answers[String(i)]
                              return [
                                item.question,
                                [...(answer?.selected || []), answer?.custom?.trim()]
                                  .filter(Boolean)
                                  .join(', '),
                              ]
                            }),
                          ),
                        )
                    }}
                    onDismiss={() => plugin.question?.dismiss()}
                    submitLabel={t('提交回答')}
                    nextLabel={t('下一题')}
                    previousLabel={t('上一题')}
                    dismissLabel={t('取消回答')}
                    previewLabel={t('预览')}
                  />
                )}
              </div>
            </div>
            <div className="chat-composer-wrap">
              {showJump && (
                <button
                  className="catea-jump-bottom"
                  type="button"
                  onClick={() => {
                    const viewport = scroll.current
                    if (!viewport) return
                    follow.current = true
                    viewport.scrollTo({
                      top: viewport.scrollHeight,
                      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'auto'
                        : 'smooth',
                    })
                    setShowJump(false)
                  }}
                >
                  <span className="catea-sr-only">{t('跳到最新消息')}</span>
                  <Icon name="chevron-down" size={16} />
                </button>
              )}
              {composer}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
