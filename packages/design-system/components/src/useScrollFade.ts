import {useEffect,type RefObject} from 'react'

/** Fade only edges with more content; observes streaming text and resizing. */
export function useScrollFade(root:RefObject<HTMLElement | null>,height=12){
  useEffect(()=>{
    const container=root.current;if(!container)return
    const win=container.ownerDocument.defaultView??window
    const selector='.chat-scroll, .catea-history, .anno-code-block__content, .anno-response-card__content'
    let frame=0
    const tracked=new Set<HTMLElement>()
    const paint=()=>{
      frame=0
      for(const el of tracked){
        const max=el.scrollHeight-el.clientHeight
        el.style.setProperty('--scroll-fade-top',max>1&&el.scrollTop>1?`${height}px`:'0px')
        el.style.setProperty('--scroll-fade-bottom',max>1&&el.scrollTop<max-1?`${height}px`:'0px')
      }
    }
    const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(paint)}
    const resize=new ResizeObserver(schedule)
    const refresh=()=>{
      resize.disconnect();tracked.clear()
      for(const el of container.querySelectorAll<HTMLElement>(selector)){
        tracked.add(el);resize.observe(el)
        for(const child of el.children)resize.observe(child)
      }
      schedule()
    }
    const mutation=new MutationObserver(refresh)
    mutation.observe(container,{subtree:true,childList:true,characterData:true})
    container.addEventListener('scroll',schedule,true)
    refresh()
    return()=>{
      mutation.disconnect();resize.disconnect();win.cancelAnimationFrame(frame)
      container.removeEventListener('scroll',schedule,true)
      for(const el of tracked){el.style.removeProperty('--scroll-fade-top');el.style.removeProperty('--scroll-fade-bottom')}
    }
  },[root,height])
}
