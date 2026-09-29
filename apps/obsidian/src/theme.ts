/**
 * [WHO]: ThemeMode, ThemeController
 * [FROM]: (none)
 * [TO]: apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/theme.ts - reversible per-window theme selection and live system appearance tracking
 */
export type ThemeMode = 'light' | 'dark' | 'system'

export class ThemeController {
  private mode: ThemeMode = 'system'
  private documents = new Map<
    Document,
    { media: MediaQueryList; update: () => void; previous?: string }
  >()

  attach(doc: Document) {
    if (this.documents.has(doc) || !doc.defaultView) return
    const media = doc.defaultView.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      doc.body.dataset.cateaTheme =
        this.mode === 'system' ? (media.matches ? 'dark' : 'light') : this.mode
    }
    this.documents.set(doc, { media, update, previous: doc.body.dataset.cateaTheme })
    media.addEventListener('change', update)
    update()
  }

  setMode(mode: unknown) {
    this.mode = mode === 'light' || mode === 'dark' ? mode : 'system'
    for (const { update } of this.documents.values()) update()
  }

  dispose() {
    for (const [doc, { media, update, previous }] of this.documents) {
      media.removeEventListener('change', update)
      if (previous === undefined) delete doc.body.dataset.cateaTheme
      else doc.body.dataset.cateaTheme = previous
    }
    this.documents.clear()
  }
}
