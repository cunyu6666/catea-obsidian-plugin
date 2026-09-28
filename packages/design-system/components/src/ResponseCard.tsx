import { useEffect, useId, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Icon } from './Icon'

interface ResponseCardProps {
  children: ReactNode
  copyText: string
  streaming?: boolean
  startedAt?: number
  hideExpand?: boolean
  sources?: Array<{ title: string; url: string }>
  tokenUsage?: { label: string; title: string }
  onExpand: () => void
  onViewMarkdown: () => void
  labels: { copy: string; copied: string; markdown: string; expand: string; streaming: string | readonly string[]; sources?: string }
}

function sourceDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

export function ResponseCard({ children, copyText, streaming, startedAt, hideExpand = false, sources = [], tokenUsage, onExpand, onViewMarkdown, labels }: ResponseCardProps) {
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [streamingIndex, setStreamingIndex] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const reduceMotion = useReducedMotion()
  const sourcesId = useId()
  const safeSources = sources.filter(source => /^https?:\/\//i.test(source.url))
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
    const timer = window.setInterval(() => setStreamingIndex(index => (index + 1) % streamingLabelCount), 2400)
    return () => window.clearInterval(timer)
  }, [streaming, reduceMotion, streamingLabelCount])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
    } catch { setCopied(false) }
  }

  return <div className="anno-response-card" data-state={streaming ? 'streaming' : 'complete'} aria-busy={streaming}>
    {!streaming && !hideExpand && <button className="anno-response-card__expand" type="button" aria-label={labels.expand} title={labels.expand} onClick={onExpand}><Icon name="fullscreen" size={14} /></button>}
    <div className="anno-response-card__content anno-auto-scrollbar" aria-live="polite">{children}</div>
    {streaming && <div className="anno-response-card__footer"><span className="anno-response-card__stream"><Icon name="loading" size={14} className="anno-spin" />{typeof streamingLabels === 'string' ? streamingLabels : streamingLabels[reduceMotion ? 0 : streamingIndex % streamingLabelCount] ?? ''}{startedAt !== undefined && <span className="anno-response-card__elapsed">· {elapsedLabel(Math.max(0, Math.floor((now - startedAt) / 1000)))}</span>}</span></div>}
    {!streaming && <div className="anno-response-card__completion">
      <div className="anno-response-card__footer">
        <button className="anno-response-card__action" type="button" aria-label={copied ? labels.copied : labels.copy} title={copied ? labels.copied : labels.copy} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={12} />{copied ? labels.copied : labels.copy}</button>
        <button className="anno-response-card__action" type="button" aria-label={labels.markdown} title={labels.markdown} onClick={onViewMarkdown}><Icon name="markdown" size={12} />{labels.markdown}</button>
        {safeSources.length > 0 && <button className="anno-response-card__action anno-response-card__sources-toggle" type="button" aria-expanded={sourcesOpen} aria-controls={sourcesId} onClick={() => setSourcesOpen(open => !open)}>
          <span className="anno-response-card__source-stack" aria-hidden="true">{safeSources.slice(0, 3).map(source => <span key={source.url}>{sourceDomain(source.url).charAt(0).toUpperCase()}</span>)}</span>
          <span>{safeSources.length} {labels.sources || 'Sources'}</span>
          <Icon name="chevron-down" size={12} className="anno-response-card__chevron" data-open={sourcesOpen} />
        </button>}
        {tokenUsage && <span className="anno-response-card__token-usage" title={tokenUsage.title}>{tokenUsage.label}</span>}
      </div>
      {safeSources.length > 0 && <div id={sourcesId} className="anno-response-card__sources" hidden={!sourcesOpen}>
        <ol>{safeSources.map((source, index) => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            <span className="anno-response-card__source-number">{index + 1}</span>
            <span className="anno-response-card__source-text"><strong>{source.title || sourceDomain(source.url)}</strong><small>{sourceDomain(source.url)}</small></span>
            <Icon name="arrow-right" size={14} />
          </a>
        </li>)}</ol>
      </div>}
    </div>}
  </div>
}
