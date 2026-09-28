import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from '@shikijs/langs/bash'
import css from '@shikijs/langs/css'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import jsx from '@shikijs/langs/jsx'
import markdown from '@shikijs/langs/markdown'
import python from '@shikijs/langs/python'
import rust from '@shikijs/langs/rust'
import toml from '@shikijs/langs/toml'
import tsx from '@shikijs/langs/tsx'
import typescript from '@shikijs/langs/typescript'
import yaml from '@shikijs/langs/yaml'
import githubDark from '@shikijs/themes/github-dark'
import githubLight from '@shikijs/themes/github-light'
import { Icon } from './Icon'

// A curated grammar set. Shiki's full registry is roughly 220 grammars plus an
// inlined Oniguruma WASM, which added about 10 MB to every consumer bundle and
// pushed the Obsidian plugin past the 5 MB Obsidian Sync limit. A fence whose
// language is not listed here renders as plain text, so adding one is a
// deliberate size decision rather than an oversight.
const languages = {
  bash, css, html, javascript, json, jsx, markdown, python, rust, toml, tsx, typescript, yaml,
}
const grammars = Object.values(languages)

const aliases: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', zsh: 'bash',
  yml: 'yaml', rb: 'ruby', rs: 'rust', kt: 'kotlin', objc: 'objc',
  'objective-c': 'objc',
}

type CodeToken = { content: string; offset: number; light?: string; dark?: string }
type TokenResult = { key: string; code: string; language: string; lines: CodeToken[][] }
const tokenCache = new Map<string, CodeToken[][]>()
const maxCacheEntries = 200

let highlighter: Promise<HighlighterCore> | undefined

// The JavaScript regex engine keeps the bundle free of the Oniguruma binary; the
// highlighter is created once and reused by every CodeBlock.
function highlight(code: string, language: string) {
  highlighter ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: grammars,
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter.then(instance => instance.codeToTokensWithThemes(code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
  }))
}

// Adapted from beui's AgentCode: keep finished lines stable while the last line grows.
function useCodeTokens(code: string, language: string, streaming: boolean): CodeToken[][] | null {
  const key = `${language}\0${code}`
  const [result, setResult] = useState<TokenResult | null>(null)
  const lastHighlightAt = useRef(0)

  useEffect(() => {
    let cancelled = false
    const cached = tokenCache.get(key)
    if (cached) { setResult({ key, code, language, lines: cached }); return }

    const wait = streaming ? Math.max(0, 90 - (performance.now() - lastHighlightAt.current)) : 0
    const timer = window.setTimeout(() => {
      lastHighlightAt.current = performance.now()
      void highlight(code, language).then(lines => {
        if (cancelled) return
        const tokens = lines.map(line => line.map(token => ({
          content: token.content,
          offset: token.offset,
          light: token.variants.light?.color,
          dark: token.variants.dark?.color,
        })))
        if (tokenCache.size >= maxCacheEntries) tokenCache.delete(tokenCache.keys().next().value || '')
        tokenCache.set(key, tokens)
        setResult({ key, code, language, lines: tokens })
      }).catch(() => { if (!cancelled) setResult(null) })
    }, wait)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [code, key, language, streaming])

  const cached = tokenCache.get(key)
  if (cached) return cached
  if (result?.key === key) return result.lines
  if (streaming && result?.language === language && code.startsWith(result.code)) {
    return result.lines.slice(0, Math.max(0, result.code.split('\n').length - 1))
  }
  return null
}

export interface CodeBlockProps {
  code: string
  language?: string
  showHeader?: boolean
  streaming?: boolean
  maxHeight?: number
  labels: { copy: string; copied: string; plainText: string; writing: string }
}

// Craft Agents' code surface, with beui's stable line updates and scroll following.
export function CodeBlock({ code, language = 'text', showHeader = true, streaming = false, maxHeight = 280, labels }: CodeBlockProps) {
  const resolvedLanguage = aliases[language.toLowerCase()] || language.toLowerCase()
  const shikiLanguage = resolvedLanguage in languages ? resolvedLanguage : 'text'
  const tokens = useCodeTokens(code, shikiLanguage, streaming)
  const viewportRef = useRef<HTMLDivElement>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  let offset = 0
  const lines = code.split('\n').map(content => {
    const line = { content, offset }
    offset += content.length + 1
    return line
  })

  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current) }, [])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !streaming) return
    const win=viewport.ownerDocument.defaultView??window
    const frame = win.requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
    return () => win.cancelAnimationFrame(frame)
  }, [code, streaming])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch { setCopied(false) }
  }, [code])

  return <div className="anno-code-block" data-state={streaming ? 'streaming' : 'complete'} aria-busy={streaming}>
    {showHeader && <div className="anno-code-block__header">
      <span className="anno-code-block__identity"><Icon name="code" size={16} /><span>{resolvedLanguage === 'text' ? labels.plainText : resolvedLanguage}</span></span>
      <span className="anno-code-block__actions">
        {streaming && <span className="anno-code-block__writing" role="status"><Icon name="loading" size={12} className="anno-spin" />{labels.writing}</span>}
        <button type="button" aria-label={copied ? labels.copied : labels.copy} title={copied ? labels.copied : labels.copy} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} /></button>
      </span>
    </div>}
    <div ref={viewportRef} className="anno-code-block__content anno-auto-scrollbar" style={{ maxHeight }} role={streaming ? 'log' : undefined} aria-live={streaming ? 'polite' : undefined}>
      <pre><code>{lines.map((line, index) => <span className="anno-code-block__line" key={line.offset}>
        <span className="anno-code-block__line-number" aria-hidden="true">{index + 1}</span>
        <span className="anno-code-block__line-content">{tokens?.[index]?.map(token => <span key={`${token.offset}-${token.content}`} className="anno-code-block__token" style={{ '--anno-code-light': token.light || 'currentColor', '--anno-code-dark': token.dark || token.light || 'currentColor' } as CSSProperties}>{token.content}</span>) || line.content || '\u00a0'}</span>
      </span>)}</code></pre>
    </div>
  </div>
}
