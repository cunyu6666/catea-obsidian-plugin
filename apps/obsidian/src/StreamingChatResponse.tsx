/**
 * [WHO]: Provides StreamingChatResponse
 * [FROM]: Depends on react, motion/react, catea-components
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/StreamingChatResponse.tsx - rAF typewriter reveal for streamed text that never splits surrogate pairs; card scrolling follows until the user scrolls upward
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { useReducedMotion } from 'motion/react'
import { ResponseCard } from 'catea-components'
import type {ReactNode} from 'react'

// Smooth network chunks without replaying completed history or delaying stop/error states.
export function StreamingChatResponse({ content, streaming = false, paused = false, interrupted = false, render, ...props }: Omit<ComponentProps<typeof ResponseCard>, 'children' | 'copyText'> & { content: string; paused?:boolean; interrupted?: boolean;render:(content:string,streaming:boolean)=>ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const followContent = useRef(true)
  const lastContentTop = useRef(0)
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(streaming && !reduceMotion ? '' : content)
  const revealed = useRef(visible)
  const animating = !paused && !reduceMotion && !interrupted && content.startsWith(visible) && visible !== content
  const displayed = animating ? visible : content
  const busy = streaming || animating

  useEffect(() => {
    const viewport = container.current?.closest<HTMLElement>('.anno-response-card__content')
    if (!viewport) return
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) followContent.current = false }
    const onScroll = () => {
      if (viewport.scrollTop < lastContentTop.current - 1) followContent.current = false
      else if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 16) followContent.current = true
      lastContentTop.current = viewport.scrollTop
    }
    viewport.addEventListener('wheel', onWheel, { passive: true })
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => { viewport.removeEventListener('wheel', onWheel); viewport.removeEventListener('scroll', onScroll) }
  }, [])

  useLayoutEffect(() => {
    const contentViewport = container.current?.closest<HTMLElement>('.anno-response-card__content')
    if (contentViewport && followContent.current) {
      contentViewport.scrollTop = contentViewport.scrollHeight
      lastContentTop.current = contentViewport.scrollTop
    }
  }, [displayed, busy])

  useEffect(() => {
    if (paused || reduceMotion || interrupted || !content.startsWith(revealed.current)) {
      revealed.current = content
      setVisible(content)
      return
    }
    const win = container.current?.ownerDocument.defaultView ?? window
    let frame = 0
    let previous = performance.now()
    let cursor = revealed.current.length
    const reveal = (now: number) => {
      const remaining = content.length - cursor
      cursor = Math.min(content.length, cursor + Math.min(now - previous, 64) / 1000 * Math.max(110, remaining / 0.25))
      previous = now
      let end = Math.floor(cursor)
      // Never split a UTF-16 surrogate pair (for example an emoji).
      if (end < content.length && end > 0 && /[\uD800-\uDBFF]/.test(content[end - 1])) end--
      revealed.current = content.slice(0, end)
      setVisible(revealed.current)
      if (cursor < content.length) frame = win.requestAnimationFrame(reveal)
    }
    if (cursor < content.length) frame = win.requestAnimationFrame(reveal)
    return () => win.cancelAnimationFrame(frame)
  }, [content, reduceMotion, interrupted, paused])

  return <ResponseCard {...props} copyText={content} streaming={busy}>
    <div ref={container} className="chat-message-body">{render(displayed,busy)}</div>
  </ResponseCard>
}
