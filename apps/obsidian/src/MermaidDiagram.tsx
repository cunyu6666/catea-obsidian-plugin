/**
 * [WHO]: Provides MermaidDiagram
 * [FROM]: Depends on beautiful-mermaid, obsidian, catea-components, react, ./DiagramDialog
 * [TO]: Consumed by apps/obsidian/src/ChatMarkdown.tsx
 * [HERE]: apps/obsidian/src/MermaidDiagram.tsx - renders Mermaid through beautiful-mermaid with an Obsidian loadMermaid fallback after a 180 ms debounce; zoom clamped to 0.25-4x
 */
import {loadMermaid} from 'obsidian'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { renderMermaidSVG } from 'beautiful-mermaid'
import { CodeBlock, Icon as RemixIcon } from 'catea-components'
import { DiagramDialog } from './DiagramDialog'


function normalizeSource(source: string): string {
  const lines = source.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end > 0) lines.splice(0, end + 1)
  }
  while (lines.length && (!lines[0].trim() || lines[0].trim().startsWith('%%'))) lines.shift()
  return lines.join('\n')
}

function dimensions(svg: string): { width: number; height: number } | null {
  const viewBox=svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/[ ,]+/).map(Number)
  const width = Number(svg.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1])
  const height = Number(svg.match(/<svg[^>]*\bheight="([\d.]+)"/)?.[1])
  return width > 0 && height > 0 ? { width, height } : viewBox?.length===4&&viewBox[2]>0&&viewBox[3]>0?{width:viewBox[2],height:viewBox[3]}:null
}

export function MermaidDiagram({ code, showExpandButton = true, t }: { code: string; showExpandButton?: boolean; t:(key:string)=>string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragOrigin = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [scroll, setScroll] = useState({ left: false, right: false })
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)

  const primary = useMemo(() => {
    try {
      return { svg: renderMermaidSVG(normalizeSource(code), {
        bg: 'var(--background)', fg: 'var(--foreground)', accent: 'var(--accent)',
        line: 'var(--foreground-30)', muted: 'var(--foreground-soft)',
        surface: 'var(--surface-muted)', border: 'var(--border)',
        transparent: true, interactive: true,
      }), error: false }
    } catch { return { svg: '', error: true } }
  }, [code])


  const [fallback,setFallback]=useState<{code:string;svg:string}>()
  useEffect(()=>{
    if(!primary.error)return
    let cancelled=false
    // Debounce incomplete streaming fences; ignore stale async results.
    const timer=window.setTimeout(()=>{
      void loadMermaid().then(async mermaid=>{
        if(cancelled)return
        const id=`catea-mermaid-${crypto.randomUUID()}`
        try{
          const result=await mermaid.render(id,normalizeSource(code))
          if(!cancelled)setFallback({code,svg:result.svg})
        }catch{if(!cancelled)setFallback({code,svg:''})}
        finally{document.getElementById(id)?.remove();document.getElementById(`d${id}`)?.remove()}
      }).catch(()=>{if(!cancelled)setFallback({code,svg:''})})
    },180)
    return()=>{cancelled=true;window.clearTimeout(timer)}
  },[code,primary.error])
  const svg=primary.svg||(fallback?.code===code?fallback.svg:'')
  const error=primary.error&&fallback?.code===code&&!fallback.svg

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [svg])

  const updateFade = () => {
    const element = scrollRef.current
    if (!element) return
    setScroll({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 })
  }
  useEffect(updateFade, [svg, width])

  if (error || !svg) return <CodeBlock code={code} language="mermaid" labels={{copy:t('copyCode'),copied:t('copiedResponse'),plainText:t('plainText'),writing:t('writingCode')}}/>

  const natural = dimensions(svg)
  const projectedHeight = natural && width ? natural.height * Math.min(width / natural.width, 1) : 0
  const scaleForReadability = natural && width && projectedHeight < 280 ? Math.min(1, 280 / natural.height) : 1
  const fitSmallOverflow = natural && width && natural.width * scaleForReadability > width && natural.width * scaleForReadability - width < 200
  const inlineScale = fitSmallOverflow && natural ? width / natural.width : scaleForReadability
  const scaledWidth = natural ? natural.width * inlineScale : undefined
  const scaledHeight = natural ? natural.height * inlineScale : undefined
  const zoomToFit = () => {
    if (!natural) return
    setScale(Math.max(.25, Math.min(4, (window.innerWidth - 80) / natural.width, (window.innerHeight - 130) / natural.height)))
    setPosition({ x: 0, y: 0 })
    setPresetsOpen(false)
  }

  return <>
    <div className="chat-mermaid">
      {showExpandButton && <button type="button" className="chat-mermaid__expand" aria-label={t('viewDiagramFullscreen')} title={t('viewDiagramFullscreen')} onClick={() => setOpen(true)}><RemixIcon name="fullscreen" size={14} /></button>}
      <div ref={scrollRef} className="chat-mermaid__scroller anno-auto-scrollbar" onScroll={updateFade} style={{
        maskImage: `linear-gradient(to right, ${scroll.left ? 'transparent 0, #000 32px' : '#000 0'}, #000 ${scroll.right ? 'calc(100% - 32px), transparent 100%' : '100%'})`,
      }}>
        <div className="chat-mermaid__sizing" style={{ width: scaledWidth, height: scaledHeight, marginInline: scaledWidth && scaledWidth < width ? 'auto' : undefined }} onClick={() => setOpen(true)} role="button" aria-label={t('viewDiagramFullscreen')} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true) } }}>
          <div dangerouslySetInnerHTML={{ __html: svg }} style={{ transform: inlineScale !== 1 ? `scale(${inlineScale})` : undefined, transformOrigin: 'top left' }} />
        </div>
      </div>
    </div>
    <DiagramDialog title={t('mermaidDiagram')} open={open} onOpenChange={value => { setOpen(value); if (!value) { setScale(1); setPosition({ x: 0, y: 0 }); setPresetsOpen(false) } }}>


        <header className="chat-mermaid-preview__header">
          <span className="chat-mermaid-preview__title">{t('mermaidDiagram')}</span>
          <div className="chat-mermaid-preview__actions">
            <div className="chat-mermaid-preview__zoom">
              <button type="button" aria-label={t('zoomOut')} title={t('zoomOut')} disabled={scale <= .25} onClick={() => setScale(current => Math.max(.25, current / 1.25))}>−</button>
              <div className="chat-mermaid-preview__zoom-menu">
                <button type="button" aria-label={t('zoomPresets')} title={t('zoomPresets')} aria-expanded={presetsOpen} onClick={() => setPresetsOpen(value => !value)}>{Math.round(scale * 100)}%</button>
                {presetsOpen && <div className="chat-mermaid-preview__presets">
                  <button type="button" onClick={zoomToFit}>{t('zoomToFit')}</button>
                  <div className="chat-mermaid-preview__divider" />
                  {[25, 50, 75, 100, 150, 200, 400].map(percent => <button type="button" key={percent} onClick={() => { setScale(percent / 100); setPresetsOpen(false) }}><span>{Math.round(scale * 100) === percent ? '✓' : ''}</span>{percent}%</button>)}
                </div>}
              </div>
              <button type="button" aria-label={t('zoomIn')} title={t('zoomIn')} disabled={scale >= 4} onClick={() => setScale(current => Math.min(4, current * 1.25))}>+</button>
            </div>
            <button type="button" aria-label={t('resetZoom')} title={t('resetZoom')} disabled={scale === 1 && position.x === 0 && position.y === 0} onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }) }}><RemixIcon name="loading" size={15} /></button>
            <button type="button" aria-label={t('copyDiagramSource')} title={t('copyDiagramSource')} onClick={() => void navigator.clipboard.writeText(code)}><RemixIcon name="copy" size={15} /></button>
            <button type="button" aria-label={t('closeDialog')} title={t('closeDialog')} onClick={() => setOpen(false)}><RemixIcon name="close" size={16} /></button>
          </div>
        </header>
        <div className={`chat-mermaid-preview__stage ${dragging ? 'is-dragging' : ''}`} onWheel={event => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          setScale(current => Math.min(4, Math.max(.25, current * (event.deltaY > 0 ? .9 : 1.1))))
        }} onPointerDown={event => {
          if (event.button !== 0) return
          dragOrigin.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y }
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
        }} onPointerMove={event => {
          if (!dragOrigin.current) return
          setPosition({ x: dragOrigin.current.left + event.clientX - dragOrigin.current.x, y: dragOrigin.current.top + event.clientY - dragOrigin.current.y })
        }} onPointerUp={() => { dragOrigin.current = null; setDragging(false) }} onPointerCancel={() => { dragOrigin.current = null; setDragging(false) }} onDoubleClick={() => { setScale(1); setPosition({ x: 0, y: 0 }) }}>
          <div className="chat-mermaid-preview__drawing" dangerouslySetInnerHTML={{ __html: svg }} style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }} />
        </div>

    </DiagramDialog>
  </>
}
