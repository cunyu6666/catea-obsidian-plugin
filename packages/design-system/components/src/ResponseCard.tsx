import { useEffect, useId, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Icon } from './Icon'
import { DitherLoader } from './DitherLoader'

interface ResponseCardProps {
  children: ReactNode
  copyText: string
  streaming?: boolean
  startedAt?: number
  hideExpand?: boolean
  sources?: Array<{ title: string; url: string }>
  footerActions?: ReactNode
  tokenUsage?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite?: number
    labels: { input: string; output: string; cacheRead: string }
  }
  onExpand: () => void
  labels: {
    copy: string
    copied: string
    markdown: string
    expand: string
    streaming: string | readonly string[]
    sources?: string
  }
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

export function ResponseCard({
  children,
  copyText,
  streaming,
  startedAt,
  hideExpand = false,
  sources = [],
  tokenUsage,
  footerActions,
  onExpand,
  labels,
}: ResponseCardProps) {
  const [copied, setCopied] = useState<'copy' | 'markdown' | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [streamingIndex, setStreamingIndex] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const reduceMotion = useReducedMotion()
  const sourcesId = useId()
  const safeSources = sources.filter((source) => /^https?:\/\//i.test(source.url))
  // `input` is the uncached remainder, so the share served from cache divides by the
  // whole input this turn consumed, not by `input` alone.
  const cacheReadBasis = tokenUsage
    ? tokenUsage.input + tokenUsage.cacheRead + (tokenUsage.cacheWrite || 0)
    : 0
  const cacheHitPercent =
    tokenUsage && cacheReadBasis > 0
      ? Math.round(Math.min(1, Math.max(0, tokenUsage.cacheRead / cacheReadBasis)) * 100)
      : 0
  const streamingLabels = labels.streaming
  const streamingLabelCount = typeof streamingLabels === 'string' ? 0 : streamingLabels.length
  useEffect(() => {
    if (!streaming || startedAt === undefined) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [streaming, startedAt])
  useEffect(() => {
    if (!streaming || reduceMotion || streamingLabelCount < 2) return
    const timer = window.setInterval(
      () => setStreamingIndex((index) => (index + 1) % streamingLabelCount),
      2400,
    )
    return () => window.clearInterval(timer)
  }, [streaming, reduceMotion, streamingLabelCount])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy(action: 'copy' | 'markdown') {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(action)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div
      className="anno-response-card"
      data-state={streaming ? 'streaming' : 'complete'}
      aria-busy={streaming}
    >
      {!streaming && !hideExpand && (
        <button className="anno-response-card__expand" type="button" onClick={onExpand}>
          <span className="catea-sr-only">{labels.expand}</span>
          <Icon name="fullscreen" size={14} />
        </button>
      )}
      <div className="anno-response-card__content anno-auto-scrollbar" aria-live="polite">
        {children}
      </div>
      {streaming && (
        <div className="anno-response-card__footer">
          <span className="anno-response-card__stream">
            <DitherLoader
              label={typeof streamingLabels === 'string' ? streamingLabels : 'Loading response'}
            />
            {typeof streamingLabels === 'string'
              ? streamingLabels
              : (streamingLabels[reduceMotion ? 0 : streamingIndex % streamingLabelCount] ?? '')}
            {startedAt !== undefined && (
              <span className="anno-response-card__elapsed">
                · {elapsedLabel(Math.max(0, Math.floor((now - startedAt) / 1000)))}
              </span>
            )}
          </span>
        </div>
      )}
      {!streaming && (
        <div className="anno-response-card__completion">
          <div className="anno-response-card__footer">
            <button
              className="anno-response-card__action"
              type="button"
              onClick={() => void copy('copy')}
            >
              <Icon name={copied === 'copy' ? 'check' : 'copy'} size={12} />
              {copied === 'copy' ? labels.copied : labels.copy}
            </button>
            <button
              className="anno-response-card__action"
              type="button"
              onClick={() => void copy('markdown')}
            >
              <Icon name={copied === 'markdown' ? 'check' : 'markdown'} size={12} />
              {copied === 'markdown' ? labels.copied : labels.markdown}
            </button>
            {safeSources.length > 0 && (
              <button
                className="anno-response-card__action anno-response-card__sources-toggle"
                type="button"
                aria-expanded={sourcesOpen}
                aria-controls={sourcesId}
                onClick={() => setSourcesOpen((open) => !open)}
              >
                <span className="anno-response-card__source-stack" aria-hidden="true">
                  {safeSources.slice(0, 3).map((source) => (
                    <span key={source.url}>{sourceDomain(source.url).charAt(0).toUpperCase()}</span>
                  ))}
                </span>
                <span>
                  {safeSources.length} {labels.sources || 'Sources'}
                </span>
                <Icon
                  name="chevron-down"
                  size={12}
                  className="anno-response-card__chevron"
                  data-open={sourcesOpen}
                />
              </button>
            )}
            {footerActions && (
              <div className="anno-response-card__footer-actions">{footerActions}</div>
            )}
            {tokenUsage && (
              <span className="anno-response-card__token-usage">
                <span>
                  <span aria-hidden="true">↑</span>
                  <span className="catea-sr-only">{tokenUsage.labels.input} </span>
                  {tokenUsage.input.toLocaleString()}
                </span>
                <span>
                  <span aria-hidden="true">↓</span>
                  <span className="catea-sr-only">{tokenUsage.labels.output} </span>
                  {tokenUsage.output.toLocaleString()}
                </span>
                <span>
                  <span aria-hidden="true">· </span>
                  <span className="catea-sr-only">{tokenUsage.labels.cacheRead} </span>
                  {cacheHitPercent}%
                </span>
              </span>
            )}
          </div>
          {safeSources.length > 0 && (
            <div id={sourcesId} className="anno-response-card__sources" hidden={!sourcesOpen}>
              <ol>
                {safeSources.map((source, index) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      <span className="anno-response-card__source-number">{index + 1}</span>
                      <span className="anno-response-card__source-text">
                        <strong>{source.title || sourceDomain(source.url)}</strong>
                        <small>{sourceDomain(source.url)}</small>
                      </span>
                      <Icon name="arrow-right" size={14} />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
