/**
 * [WHO]: Provides MemoryPanel
 * [FROM]: Depends on react, ../../../packages/memory/src/model, ../../../packages/personas/src, ./memory-labels, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/MemoryPanel.tsx - right-sidebar memory browser with three levels: scope and type folders with live counts, the records inside one folder, and a six-field editor for one record; every read and write goes through MemoryService.run so the store files are never touched directly
 */
import { useCallback, useEffect, useState } from 'react'
import { memoryTypes } from '../../../packages/memory/src/model'
import { persona } from '../../../packages/personas/src'
import { TYPE_LABELS, typeLabel } from './memory-labels'
import type Catea from './main'

/** The subset of engine.review() the folder level renders. */
interface Overview {
  total: number
  active: number
  archived: number
  byType: Record<string, number>
}

/** engine.list() projection: bounded, no detail and no sources. */
interface Row {
  id: string
  type: string
  name: string
  summary: string
  project?: string
  tags: string[]
  importance: number
  updatedAt: string
  archivedAt?: string
}

/** One full record, from memory_recall. */
interface Record_ {
  id: string
  type: string
  name: string
  summary: string
  detail: string
  project?: string
  tags: string[]
  updatedAt: string
  archivedAt?: string
}

type View =
  | { kind: 'types' }
  | { kind: 'records'; type: string }
  | { kind: 'archived' }
  | { kind: 'edit'; id: string }
  | { kind: 'new'; type: string }

interface Draft {
  type: string
  name: string
  summary: string
  detail: string
  project: string
  tags: string
}

const EMPTY_DRAFT: Draft = {
  type: 'fact',
  name: '',
  summary: '',
  detail: '',
  project: '',
  tags: '',
}

function when(iso: string, t: (text: string) => string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  const days = Math.floor((Date.now() - time) / 86400000)
  if (days <= 0) return t('今天')
  if (days === 1) return t('昨天')
  if (days < 30) return `${days} ${t('天前')}`
  return new Date(time).toLocaleDateString()
}

export function MemoryPanel({ plugin }: { plugin: Catea }) {
  const [scope, setScope] = useState<'global' | 'persona'>('persona')
  const [view, setView] = useState<View>({ kind: 'types' })
  const [overview, setOverview] = useState<Overview>()
  const [rows, setRows] = useState<Row[]>([])
  const [record, setRecord] = useState<Record_>()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, redraw] = useState(0)
  const t = plugin.t
  const enabled = plugin.agentSettings.memoryPanel === true
  const memoryOn = plugin.agentSettings.enabled && plugin.agentSettings.memory

  useEffect(() => plugin.subscribe(() => redraw((n) => n + 1)), [plugin])

  /** run() routes to the global store when args.scope is 'global', else the persona. */
  const call = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      const agent = plugin.agent
      if (!agent) throw new Error('Agent 尚未就绪')
      const raw = await agent.memory.run(
        name,
        scope === 'global' ? { ...args, scope: 'global' } : args,
        plugin.agentSettings.personaId,
        plugin.agentSettings.modelId,
      )
      return JSON.parse(raw) as unknown
    },
    [plugin, scope],
  )

  const load = useCallback(async () => {
    setBusy(true)
    try {
      if (view.kind === 'types') {
        setOverview((await call('memory_stats')) as Overview)
      } else if (view.kind === 'records') {
        setRows((await call('memory_list', { type: view.type })) as Row[])
      } else if (view.kind === 'archived') {
        setRows((await call('memory_list', { state: 'archived' })) as Row[])
      } else if (view.kind === 'edit') {
        setRecord((await call('memory_recall', { id: view.id })) as Record_)
      }
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [call, view])

  useEffect(() => {
    if (!enabled || !memoryOn || view.kind === 'new') return
    void load()
  }, [enabled, memoryOn, load, view])

  // Leaving a folder must not leave the previous folder's rows on screen.
  useEffect(() => {
    if (view.kind === 'types') setRows([])
    if (view.kind === 'new') {
      setDraft({ ...EMPTY_DRAFT, type: view.type })
      setRecord(undefined)
    }
    if (view.kind === 'edit') setRecord(undefined)
  }, [view])

  // The form binds to draft, so a recalled record has to be copied into it.
  useEffect(() => {
    if (view.kind !== 'edit' || !record) return
    setDraft({
      type: record.type,
      name: record.name,
      summary: record.summary,
      detail: record.detail,
      project: record.project ?? '',
      tags: record.tags.join(', '),
    })
  }, [view, record])

  const openNew = (type: string) => setView({ kind: 'new', type })

  const save = async () => {
    const tags = draft.tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    const payload: Record<string, unknown> = {
      type: draft.type,
      name: draft.name.trim(),
      summary: draft.summary.trim(),
      detail: draft.detail,
      tags,
    }
    if (draft.project.trim()) payload.project = draft.project.trim()
    setBusy(true)
    try {
      if (view.kind === 'new') await call('memory_remember', payload)
      else if (view.kind === 'edit') await call('memory_edit', { id: view.id, ...payload })
      setError('')
      setView({ kind: 'records', type: draft.type })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const act = async (name: string, args: Record<string, unknown>, next: View) => {
    setBusy(true)
    try {
      await call(name, args)
      setError('')
      setView(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled || !memoryOn) {
    return (
      <div className="catea-memory-panel catea-memory-panel--empty">
        <p>{enabled ? t('长期记忆已关闭，开启后才能浏览记忆') : t('记忆面板已在设置中关闭')}</p>
      </div>
    )
  }

  const personaLabel = persona(plugin.agentSettings.personaId).name
  const editing = view.kind === 'edit' ? record : undefined
  const formType = view.kind === 'new' ? view.type : (editing?.type ?? draft.type)
  const inForm = view.kind === 'new' || view.kind === 'edit'
  const title =
    view.kind === 'types'
      ? t('记忆')
      : view.kind === 'archived'
        ? t('已归档')
        : view.kind === 'records'
          ? t(typeLabel(view.type))
          : view.kind === 'new'
            ? t('新建记忆')
            : t('编辑记忆')

  const field = (
    key: keyof Draft,
    label: string,
    kind: 'input' | 'textarea' | 'select',
    rows = 3,
  ) => (
    <label className="catea-memory-field">
      <span className="catea-memory-field__label">{label}</span>
      {kind === 'select' ? (
        <select value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
          {memoryTypes.map((type) => (
            <option key={type} value={type}>
              {t(TYPE_LABELS[type] ?? type)}
            </option>
          ))}
        </select>
      ) : kind === 'textarea' ? (
        <textarea
          rows={rows}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          type="text"
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  )

  return (
    <div className="catea-memory-panel">
      <div className="catea-memory-panel__bar">
        {view.kind === 'types' ? (
          <div className="catea-memory-panel__scopes" role="tablist">
            {(['persona', 'global'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                className="catea-memory-panel__scope"
                onClick={() => setScope(value)}
              >
                {value === 'global' ? t('全局') : personaLabel}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="catea-memory-panel__back"
            onClick={() =>
              setView(
                view.kind === 'records' || view.kind === 'new' || view.kind === 'archived'
                  ? { kind: 'types' }
                  : { kind: 'records', type: formType },
              )
            }
          >
            {t('返回')}
          </button>
        )}
        <span className="catea-memory-panel__title">{title}</span>
        {view.kind === 'records' ? (
          <button
            type="button"
            className="catea-memory-panel__refresh"
            onClick={() => openNew(view.type)}
          >
            {t('新建')}
          </button>
        ) : view.kind === 'types' ? (
          <button
            type="button"
            className="catea-memory-panel__refresh"
            onClick={() => void load()}
            disabled={busy}
          >
            {busy ? t('加载中') : t('刷新')}
          </button>
        ) : null}
      </div>

      {error ? <div className="catea-memory-panel__error">{error}</div> : null}

      {inForm ? (
        <div className="catea-memory-panel__form">
          {view.kind === 'edit' && !record ? (
            <div className="catea-memory-panel__empty">{t('加载中')}</div>
          ) : (
            <>
              {field('type', t('类型'), 'select')}
              {field('name', t('名称'), 'input')}
              {field('summary', t('摘要'), 'textarea', 3)}
              {field('detail', t('详细内容'), 'textarea', 8)}
              {field('project', t('所属项目'), 'input')}
              {field('tags', t('标签（逗号分隔）'), 'input')}
              <div className="catea-memory-panel__actions">
                <button
                  type="button"
                  className="catea-memory-panel__primary"
                  onClick={() => void save()}
                  disabled={busy || !draft.name.trim() || !draft.summary.trim()}
                >
                  {t('保存')}
                </button>
                {view.kind === 'edit' && record ? (
                  record.archivedAt ? (
                    <button
                      type="button"
                      onClick={() =>
                        void act('memory_restore', { id: record.id }, { kind: 'types' })
                      }
                      disabled={busy}
                    >
                      {t('恢复')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void act('memory_forget', { id: record.id }, { kind: 'types' })
                      }
                      disabled={busy}
                    >
                      {t('归档')}
                    </button>
                  )
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : view.kind === 'types' ? (
        <div className="catea-memory-panel__list">
          {memoryTypes.map((type) => {
            const count = overview?.byType?.[type] ?? 0
            return (
              <button
                key={type}
                type="button"
                className="catea-memory-panel__row"
                data-empty={count === 0 ? 'true' : undefined}
                disabled={count === 0}
                onClick={() => setView({ kind: 'records', type })}
              >
                <span className="catea-memory-panel__row-name">{t(typeLabel(type))}</span>
                <span className="catea-memory-panel__row-count">{count}</span>
              </button>
            )
          })}
          <button
            type="button"
            className="catea-memory-panel__row catea-memory-panel__row--archived"
            data-empty={(overview?.archived ?? 0) === 0 ? 'true' : undefined}
            disabled={(overview?.archived ?? 0) === 0}
            onClick={() => setView({ kind: 'archived' })}
          >
            <span className="catea-memory-panel__row-name">{t('已归档')}</span>
            <span className="catea-memory-panel__row-count">{overview?.archived ?? 0}</span>
          </button>
        </div>
      ) : (
        <div className="catea-memory-panel__list">
          {rows.length === 0 ? (
            <div className="catea-memory-panel__empty">
              {busy ? t('加载中') : t('这里还没有记忆')}
            </div>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="catea-memory-panel__card"
                onClick={() => setView({ kind: 'edit', id: row.id })}
              >
                <span className="catea-memory-panel__card-name">{row.name}</span>
                <span className="catea-memory-panel__card-summary">{row.summary}</span>
                <span className="catea-memory-panel__card-meta">
                  {view.kind === 'archived' ? t(typeLabel(row.type)) : null}
                  {row.project ? <em>{row.project}</em> : null}
                  <time>{when(row.updatedAt, t)}</time>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {view.kind === 'types' ? (
        <div className="catea-memory-panel__footer">
          <span>{t('活跃')}</span>
          <span>{overview?.active ?? 0}</span>
          <span>{t('已归档')}</span>
          <span>{overview?.archived ?? 0}</span>
        </div>
      ) : null}
    </div>
  )
}
