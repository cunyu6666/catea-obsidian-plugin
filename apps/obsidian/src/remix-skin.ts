/**
 * [WHO]: Provides RemixSkin
 * [FROM]: Depends on ../remix-skin/generated
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/remix-skin.ts - replaces Obsidian's native Lucide glyphs with the vendored Remix line set so the whole workspace reads as one icon family; unmapped names keep their native glyph and are collected in `missing` for the next curation pass
 */
import { LUCIDE_TO_REMIX, REMIX_ICON_BODIES } from '../remix-skin/generated'

// Note content and Catea chat render their own inline SVG, so the walk skips the
// same regions TablerSkin did.
const EXCLUDE =
  '.markdown-preview-view,.markdown-source-view,.cm-editor,.catui-response-content,.catui-user-bubble,.catui-markdown,.mermaid,.excalidraw'

interface Original {
  children: Node[]
  fill: string | null
  stroke: string | null
  strokeWidth: string | null
  rendered: string
}

export class RemixSkin {
  /** Lucide names Obsidian rendered that no curated mapping covers. */
  readonly missing = new Set<string>()
  private readonly doc: Document
  private readonly originals = new Map<SVGElement, Original>()
  private readonly pending = new Set<Element>()
  private observer?: MutationObserver
  private active = false
  private frame = 0

  constructor(doc: Document) {
    this.doc = doc
  }

  start(): void {
    if (this.active) return
    this.active = true
    const view = this.doc.defaultView
    if (!view) return
    this.observer = new view.MutationObserver((records) => {
      for (const record of records) {
        if (record.target.nodeType === 1 && !(record.target as Element).closest(EXCLUDE))
          this.pending.add(record.target as Element)
        for (const node of record.addedNodes)
          if (node.nodeType === 1 && !(node as Element).closest(EXCLUDE))
            this.pending.add(node as Element)
      }
      if (this.pending.size && !this.frame)
        this.frame = view.requestAnimationFrame(() => this.flush())
    })
    this.observer.observe(this.doc.body, { childList: true, subtree: true })
    this.pending.add(this.doc.body)
    this.flush()
  }

  /** Restores every icon this skin touched, leaving the workspace as it was. */
  stop(): void {
    this.active = false
    this.observer?.disconnect()
    this.observer = undefined
    if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame)
    this.frame = 0
    this.pending.clear()
    for (const [svg, entry] of this.originals) {
      if (svg.innerHTML === entry.rendered) {
        svg.replaceChildren(...entry.children)
        for (const [key, value] of [
          ['fill', entry.fill],
          ['stroke', entry.stroke],
          ['stroke-width', entry.strokeWidth],
        ] as const)
          value === null ? svg.removeAttribute(key) : svg.setAttribute(key, value)
      }
      svg.classList.remove('catea-remix-icon')
    }
    this.originals.clear()
  }

  private flush(): void {
    this.frame = 0
    if (!this.active) return
    const batch = [...this.pending]
    this.pending.clear()
    try {
      for (const root of batch) {
        if (!root.isConnected) continue
        if (root.matches('svg')) this.replace(root as SVGElement)
        for (const svg of root.querySelectorAll('svg')) this.replace(svg)
      }
      for (const svg of this.originals.keys()) if (!svg.isConnected) this.originals.delete(svg)
    } finally {
      if (this.active) this.observer?.observe(this.doc.body, { childList: true, subtree: true })
    }
  }

  private replace(svg: SVGElement): void {
    if (svg.closest(EXCLUDE) || svg.classList.contains('gp-file-icon')) return
    const name = [...svg.classList].find((c) => c.startsWith('lucide-'))?.slice(7)
    if (!name) return
    const body = LUCIDE_TO_REMIX[name] && REMIX_ICON_BODIES[LUCIDE_TO_REMIX[name]]
    if (!body) {
      this.missing.add(name)
      return
    }
    const prior = this.originals.get(svg)
    if (prior && svg.innerHTML === prior.rendered) return
    // An external rerender means Obsidian produced a fresh native shape, so that
    // becomes the state `stop()` has to put back.
    this.originals.set(svg, {
      children: [...svg.childNodes].map((n) => n.cloneNode(true)),
      fill: svg.getAttribute('fill'),
      stroke: svg.getAttribute('stroke'),
      strokeWidth: svg.getAttribute('stroke-width'),
      rendered: '',
    })
    const parsed = new this.doc.defaultView!.DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor">${body}</svg>`,
      'image/svg+xml',
    )
    svg.replaceChildren(
      ...[...parsed.documentElement.childNodes].map((n) => this.doc.importNode(n, true)),
    )
    // Remix line icons are filled outlines, so the Lucide stroke attributes that
    // would otherwise apply have to be cleared.
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'currentColor')
    svg.setAttribute('stroke', 'none')
    svg.removeAttribute('stroke-width')
    svg.classList.add('catea-remix-icon')
    this.originals.get(svg)!.rendered = svg.innerHTML
  }
}
