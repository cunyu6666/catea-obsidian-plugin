/**
 * [WHO]: Provides GitHistoryPanel
 * [FROM]: Depends on react, @tomplum/react-git-log, ./git-history, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/GitHistoryPanel.tsx - opt-in local Git sidebar with branching timeline, bounded history loading and commit details
 */
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { GitLog } from '@tomplum/react-git-log'
import { readGitHistory, readGitCommit, type GitHistory, type GitCommit } from './git-history'
import type Catea from './main'

class GraphBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function GitHistoryPanel({ plugin }: { plugin: Catea }) {
  const surface = useRef<HTMLElement>(null)
  const [, redraw] = useState(0)
  const [history, setHistory] = useState<GitHistory>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(100)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const enabled = plugin.agentSettings.gitHistory === true,
    t = plugin.t
  useEffect(() => plugin.subscribe(() => redraw((n) => n + 1)), [plugin])
  useEffect(() => {
    if (!enabled) return
    const root = surface.current,
      doc = root?.ownerDocument,
      win = doc?.defaultView
    if (!root || !doc || !win) return
    let stopped = false,
      inFlight = false,
      pending = false,
      timer: number | undefined
    let controller: AbortController | undefined
    const schedule = (delay: number) => {
      win.clearTimeout(timer)
      timer = win.setTimeout(() => {
        void refresh()
      }, delay)
    }
    const refresh = async () => {
      if (stopped) return
      if (inFlight) {
        pending = true
        return
      }
      if (doc.hidden || !root.getClientRects().length) {
        schedule(5000)
        return
      }
      inFlight = true
      controller = new AbortController()
      setBusy(true)
      try {
        const result = await readGitHistory(plugin.vaultPath, limit, controller.signal)
        if (stopped) return
        setHistory((current) =>
          JSON.stringify(current) === JSON.stringify(result) ? current : result,
        )
        setError('')
        setSelected((current) =>
          result.entries.some((entry) => entry.hash === current) ? current : '',
        )
      } catch (error) {
        if (!stopped) setError(error instanceof Error ? error.message : 'git-failed')
      } finally {
        inFlight = false
        if (!stopped) {
          setBusy(false)
          schedule(pending ? 300 : 5000)
          pending = false
        }
      }
    }
    const wake = () => schedule(300)
    win.addEventListener('focus', wake)
    doc.addEventListener('visibilitychange', wake)
    const workspaceEvent = plugin.app.workspace.on('active-leaf-change', wake)
    schedule(0)
    return () => {
      stopped = true
      win.clearTimeout(timer)
      controller?.abort()
      win.removeEventListener('focus', wake)
      doc.removeEventListener('visibilitychange', wake)
      plugin.app.workspace.offref(workspaceEvent)
    }
  }, [plugin, enabled, limit])
  useEffect(() => {
    setDetail('')
    if (!selected || !enabled) {
      setDetailBusy(false)
      return
    }
    const controller = new AbortController()
    setDetailBusy(true)
    void readGitCommit(plugin.vaultPath, selected, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetail(t('无法读取提交详情，请稍后重新选择。'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailBusy(false)
      })
    return () => controller.abort()
  }, [plugin, selected, enabled, t])
  // The pinned graph component sorts commits by commit date; keep timeline rows aligned.
  const entries = useMemo(
    () =>
      [...(history?.entries || [])].sort(
        (a, b) => Date.parse(b.committerDate) - Date.parse(a.committerDate),
      ),
    [history],
  )
  useLayoutEffect(() => {
    const root = surface.current
    if (!root) return
    // The graph has equivalent, named commit buttons in the timeline. Its internal
    // test labels otherwise become automatic Obsidian hover tooltips.
    const clean = () => {
      const graph = root.querySelector('.catea-git-graph > :first-child')
      if (!graph) return
      graph.setAttribute('aria-hidden', 'true')
      for (const element of graph.querySelectorAll('[aria-label],[tabindex]')) {
        element.removeAttribute('aria-label')
        if (element.getAttribute('tabindex') !== '-1') element.setAttribute('tabindex', '-1')
      }
    }
    clean()
    const observer = new MutationObserver(clean)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    })
    return () => observer.disconnect()
  }, [entries])
  const row = (entry: GitCommit) => (
    <button
      type="button"
      className="catea-git-row"
      data-selected={selected === entry.hash}
      key={entry.hash}
      onClick={() => setSelected((current) => (current === entry.hash ? '' : entry.hash))}
    >
      <span className="catea-git-subject">{entry.message || t('无提交说明')}</span>
      <span className="catea-git-meta">
        <span>{entry.author?.name}</span>
        <time dateTime={entry.committerDate}>
          {new Date(entry.committerDate).toLocaleDateString(
            plugin.agentSettings.language === 'en' ? 'en-US' : 'zh-CN',
          )}
        </time>
        <code>{entry.hash.slice(0, 7)}</code>
      </span>
    </button>
  )
  const rows = <div className="catea-git-rows">{entries.map(row)}</div>
  const errors: Record<string, string> = {
    'git-missing': '未找到 Git，请安装 Git 后重启 Obsidian。',
    'not-repository': '当前知识库不在 Git 仓库中。',
    'git-failed': '无法读取 Git 历史，请检查仓库权限或稍后重试。',
  }
  return (
    <section ref={surface} className="catea-git-panel">
      <header className="catea-git-header">
        <div>
          <h2>{t('知识库历史')}</h2>
          <p>{history?.branch || t('本地 Git 时间线')}</p>
        </div>
      </header>
      {!enabled ? (
        <p className="catea-git-empty">{t('在设置中开启 Git 历史以查看时间线。')}</p>
      ) : (
        <>
          {error ? (
            <p className="catea-git-empty" role="status">
              {t(errors[error] || errors['git-failed'])}
            </p>
          ) : !history && busy ? (
            <p className="catea-git-empty" role="status">
              {t('正在读取 Git 历史…')}
            </p>
          ) : history && !entries.length ? (
            <p className="catea-git-empty">{t('知识库还没有提交记录。')}</p>
          ) : null}
          {selected && (
            <section className="catea-git-detail">
              <div>
                <code>{selected.slice(0, 12)}</code>
                <button type="button" onClick={() => setSelected('')}>
                  {t('关闭')}
                </button>
              </div>
              <pre>{detailBusy ? t('正在读取提交详情…') : detail}</pre>
            </section>
          )}
          {!error && !!entries.length && (
            <div className="catea-git-scroll">
              <GraphBoundary
                key={`${history?.branch}:${entries[0]?.hash}:${entries.length}`}
                fallback={
                  <>
                    <p role="status">{t('分支图暂不可用，以下为提交列表。')}</p>
                    {rows}
                  </>
                }
              >
                <GitLog
                  entries={entries}
                  currentBranch={history?.branch || 'HEAD'}
                  showHeaders={false}
                  showGitIndex={false}
                  rowSpacing={8}
                  defaultGraphWidth={48}
                  colours={['#5b806d', '#ad9273', '#7e92a4', '#9a8399', '#91a077']}
                  classes={{ containerClass: 'catea-git-graph' }}
                  onSelectCommit={(commit) => setSelected(commit?.hash || '')}
                >
                  <GitLog.GraphHTMLGrid
                    nodeSize={7}
                    node={({ colour }: { colour: string }) => (
                      <span className="catea-git-node" style={{ backgroundColor: colour }} />
                    )}
                    nodeTheme="plain"
                    showCommitNodeHashes={false}
                    showCommitNodeTooltips={false}
                  />
                  <GitLog.Table
                    className="catea-git-table"
                    row={({ commit }) =>
                      row({ ...commit, author: { name: commit.author?.name || '' } })
                    }
                  />
                </GitLog>
              </GraphBoundary>
              {history?.hasMore && limit < 1000 && (
                <button
                  className="catea-git-more"
                  type="button"
                  disabled={busy}
                  onClick={() => setLimit((n) => n + 100)}
                >
                  {t(busy ? '正在读取 Git 历史…' : '加载更早的提交')}
                </button>
              )}
              {history?.hasMore && limit >= 1000 && (
                <p className="catea-git-empty">{t('已显示最近 1000 条提交。')}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
