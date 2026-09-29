import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Icon } from './Icon'
import { DitherLoader } from './DitherLoader'

export interface AgentToolActivityItem {
  type: 'tool'
  id: string
  name: string
  summary?: string
  status: 'running' | 'completed' | 'error'
}
export interface AgentThinkingActivityItem {
  type: 'thinking'
  id: string
  content: string
  active: boolean
  startedAt?: number
}
export type AgentActivityItem = AgentToolActivityItem | AgentThinkingActivityItem

interface AgentActivitiesProps {
  items: AgentActivityItem[]
  preview: string
  autoExpand?: boolean
  thinking: boolean
  startedAt?: number
  labels: { thinking: string; thought: string; details: string }
  onOpenDetails: (id: string) => void
}

// Compact activity header and rows above each response.
export function AgentActivities({
  items,
  preview,
  autoExpand = false,
  thinking,
  startedAt,
  labels,
  onOpenDetails,
}: AgentActivitiesProps) {
  const [manual, setManual] = useState<{ phase: boolean; expanded: boolean } | null>(null)
  const expanded = manual?.phase === autoExpand ? manual.expanded : autoExpand
  if (!items.length)
    return thinking ? <ThinkingIndicator active labels={labels} startedAt={startedAt} /> : null
  const latest = items.at(-1)
  const pendingThinking = thinking && latest?.type === 'tool' && latest.status !== 'running'
  const countSize = Math.max(18, 6 + String(items.length).length * 6)

  return (
    <section className="anno-activities" aria-label={preview || labels.thought}>
      <button
        className="anno-activities__toggle"
        type="button"
        aria-expanded={expanded}
        aria-label={preview || labels.thought}
        onClick={() => setManual({ phase: autoExpand, expanded: !expanded })}
      >
        <span
          className="anno-activities__indicator"
          style={{ width: countSize, height: countSize }}
        >
          <span className="anno-activities__count">{items.length}</span>
          <span
            className={`anno-activities__chevron ${expanded ? 'is-expanded' : ''}`}
            aria-hidden="true"
          >
            <Icon name="chevron-right" size={12} />
          </span>
        </span>
        {preview && <span className="anno-activities__preview">{preview}</span>}
      </button>
      {expanded && (
        <div className="anno-activities__list anno-auto-scrollbar">
          {items.map((item) =>
            item.type === 'thinking' ? (
              <ThinkingIndicator
                key={item.id}
                active={item.active}
                labels={labels}
                content={item.content}
                startedAt={item.startedAt}
              />
            ) : (
              <button
                key={item.id}
                className="anno-activities__row"
                type="button"
                onClick={() => item.status !== 'running' && onOpenDetails(item.id)}
                disabled={item.status === 'running'}
                aria-label={`${labels.details}: ${item.name}`}
              >
                <span className={`anno-activities__status is-${item.status}`}>
                  {item.status === 'running' ? (
                    <DitherLoader label={item.name} />
                  ) : (
                    <Icon name={item.status === 'error' ? 'tool-error' : 'tool-done'} size={12} />
                  )}
                </span>
                <span className="anno-activities__name">{item.name}</span>
                {item.summary && <span className="anno-activities__summary">· {item.summary}</span>}
                {item.status !== 'running' && (
                  <Icon name="arrow-up-right" size={12} className="anno-activities__open" />
                )}
              </button>
            ),
          )}
          {pendingThinking && <ThinkingIndicator active labels={labels} startedAt={startedAt} />}
        </div>
      )}
    </section>
  )
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`
}

export function ThinkingIndicator({
  active,
  labels,
  content,
  startedAt,
}: {
  active: boolean
  labels: { thinking: string; thought: string }
  content?: string
  startedAt?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
  const expanded = manualExpanded ?? active
  const source = content || ''
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(active && !reduceMotion ? '' : source)
  const revealed = useRef(visible)
  const contentRef = useRef<HTMLDivElement>(null)
  const followContent = useRef(true)
  const lastContentTop = useRef(0)
  useEffect(() => {
    if (!active || startedAt === undefined) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, startedAt])
  useEffect(() => {
    if (!active || reduceMotion || !source.startsWith(revealed.current)) {
      revealed.current = source
      setVisible(source)
      return
    }
    const win = contentRef.current?.ownerDocument.defaultView ?? window
    let frame = 0
    let previous = performance.now()
    let cursor = revealed.current.length
    const reveal = (now: number) => {
      const remaining = source.length - cursor
      cursor = Math.min(
        source.length,
        cursor + (Math.min(now - previous, 64) / 1000) * Math.max(110, remaining / 0.25),
      )
      previous = now
      let end = Math.floor(cursor)
      if (end < source.length && end > 0 && /[\uD800-\uDBFF]/.test(source[end - 1])) end--
      revealed.current = source.slice(0, end)
      setVisible(revealed.current)
      if (cursor < source.length) frame = win.requestAnimationFrame(reveal)
    }
    if (cursor < source.length) frame = win.requestAnimationFrame(reveal)
    return () => win.cancelAnimationFrame(frame)
  }, [source, active, reduceMotion])
  const displayed = active && !reduceMotion && source.startsWith(visible) ? visible : source
  useLayoutEffect(() => {
    const viewport = contentRef.current
    if (!expanded || !viewport || !followContent.current) return
    viewport.scrollTop = viewport.scrollHeight
    lastContentTop.current = viewport.scrollTop
  }, [displayed, expanded])
  const elapsed = active && startedAt !== undefined ? formatElapsed(now - startedAt) : ''
  const heading = (
    <>
      <span className="anno-thinking__icon">
        {active ? <DitherLoader label={labels.thinking} /> : <Icon name="chat" size={14} />}
      </span>
      <span>
        {active ? labels.thinking : labels.thought}
        {elapsed && <span className="anno-thinking__elapsed"> · {elapsed}</span>}
      </span>
      {content && (
        <Icon
          name="chevron-right"
          size={12}
          className={`anno-thinking__chevron ${expanded ? 'is-expanded' : ''}`}
        />
      )}
    </>
  )
  return (
    <div className="anno-thinking">
      {content ? (
        <button
          className="anno-thinking__heading"
          type="button"
          aria-expanded={expanded}
          onClick={() => setManualExpanded(!expanded)}
        >
          {heading}
        </button>
      ) : (
        <div className="anno-thinking__heading" role="status">
          {heading}
        </div>
      )}
      {content && expanded && (
        <div
          ref={contentRef}
          className="anno-thinking__content anno-auto-scrollbar"
          onWheel={(event) => {
            if (event.deltaY < 0) followContent.current = false
          }}
          onScroll={(event) => {
            const viewport = event.currentTarget
            if (viewport.scrollTop < lastContentTop.current - 1) followContent.current = false
            else if (
              viewport.scrollTop > lastContentTop.current + 1 &&
              viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 16
            )
              followContent.current = true
            lastContentTop.current = viewport.scrollTop
          }}
        >
          {displayed}
        </div>
      )}
    </div>
  )
}
