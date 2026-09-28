import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ResponseCardProps {
  children: ReactNode
  copyText: string
  streaming?: boolean
  hideExpand?: boolean
  sources?: Array<{ title: string; url: string }>
  tokenUsage?: { label: string; title: string }
  onExpand: () => void
  onViewMarkdown: () => void
  labels: { copy: string; copied: string; markdown: string; expand: string; streaming: string; sources?: string }
}

function sourceDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

export function ResponseCard({ children, copyText, streaming, hideExpand = false, sources = [], tokenUsage, onExpand, onViewMarkdown, labels }: ResponseCardProps) {
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const sourcesId = useId()
  const safeSources = sources.filter(source => /^https?:\/\//i.test(source.url))
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
    {streaming && <div className="anno-response-card__footer"><span className="anno-response-card__stream"><Icon name="loading" size={14} className="anno-spin" />{labels.streaming}</span></div>}
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
