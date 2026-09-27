/**
 * [WHO]: Provides StreamingChatResponse
 * [FROM]: Depends on react, motion/react, catea-components
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/StreamingChatResponse.tsx - rAF typewriter reveal for streamed text that never splits surrogate pairs; auto-follows scroll within 40 px in a card and 80 px in chat
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { useReducedMotion } from 'motion/react'
import { ResponseCard } from 'catea-components'
import type {ReactNode} from 'react'

// Smooth network chunks without replaying completed history or delaying stop/error states.
export function StreamingChatResponse({ content, streaming = false, paused = false, interrupted = false, render, ...props }: Omit<ComponentProps<typeof ResponseCard>, 'children' | 'copyText'> & { content: string; paused?:boolean; interrupted?: boolean;render:(content:string,streaming:boolean)=>ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const lastScrollHeight = useRef(0)
  const lastContentHeight = useRef(0)
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(streaming && !reduceMotion ? '' : content)
  const revealed = useRef(visible)
  const animating = !paused && !reduceMotion && !interrupted && content.startsWith(visible) && visible !== content
  const displayed = animating ? visible : content
  const busy = streaming || animating

  useLayoutEffect(() => {
    const contentViewport = container.current?.closest<HTMLElement>('.anno-response-card__content')
    if (contentViewport) {
      const previousHeight = lastContentHeight.current || contentViewport.scrollHeight
      if (contentViewport.scrollTop + contentViewport.clientHeight >= previousHeight - 40) contentViewport.scrollTop = contentViewport.scrollHeight
      lastContentHeight.current = contentViewport.scrollHeight
    }
    const scroll = container.current?.closest<HTMLElement>('.chat-scroll')
    if (!scroll) return
    const previousHeight = lastScrollHeight.current || scroll.scrollHeight
    if (scroll.scrollTop + scroll.clientHeight >= previousHeight - 80) scroll.scrollTop = scroll.scrollHeight
    lastScrollHeight.current = scroll.scrollHeight
  }, [displayed, busy])

  useEffect(() => {
    if (paused || reduceMotion || interrupted || !content.startsWith(revealed.current)) {
      revealed.current = content
      setVisible(content)
      return
    }
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
      if (cursor < content.length) frame = requestAnimationFrame(reveal)
    }
    if (cursor < content.length) frame = requestAnimationFrame(reveal)
    return () => cancelAnimationFrame(frame)
  }, [content, reduceMotion, interrupted, paused])

  return <ResponseCard {...props} copyText={content} streaming={busy}>
    <div ref={container} className="chat-message-body">{render(displayed,busy)}</div>
  </ResponseCard>
}
