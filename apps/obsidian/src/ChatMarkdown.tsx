/**
 * [WHO]: Provides ChatMarkdown
 * [FROM]: Depends on react-markdown, remark-gfm, catea-components, ./MermaidDiagram, ./locale
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/ChatMarkdown.tsx - renders assistant Markdown and converts [[wikilinks]] into internal-link clicks; code fences delegate to MermaidDiagram
 */
import {Children,isValidElement,memo,useMemo,type ReactNode} from 'react'
import ReactMarkdown,{type Components} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {CodeBlock} from 'catea-components'
import {MermaidDiagram} from './MermaidDiagram'
import {contentLabel,type Language} from './locale'

/** ANNO's fenced-code rendering, with Obsidian internal-link navigation. */
export const ChatMarkdown=memo(function ChatMarkdown({content,streaming=false,language,onOpenNote}:{content:string;streaming?:boolean;language:Language;onOpenNote:(path:string)=>void}){
  const components=useMemo<Components>(()=>{
    const t=(key:string)=>contentLabel(language,key)
    return {
      table:({children})=><div className="chat-markdown-table-wrap anno-auto-scrollbar"><table>{children}</table></div>,
      a:({href,children})=><a href={href} onClick={event=>{if(href&&!/^https?:/i.test(href)){event.preventDefault();onOpenNote(decodeURIComponent(href))}}}>{children}</a>,
      pre:({children})=>{
        const child=Children.toArray(children)[0]
        if(isValidElement<{className?:string;children?:ReactNode}>(child)){
          const lang=child.props.className?.match(/language-([\w-]+)/)?.[1]?.toLowerCase()
          const code=String(child.props.children||'').replace(/\n$/,'')
          if(lang==='mermaid')return <MermaidDiagram code={code} t={t}/>
          return <CodeBlock code={code} language={lang} streaming={streaming} labels={{copy:t('copyCode'),copied:t('copiedResponse'),plainText:t('plainText'),writing:t('writingCode')}}/>
        }
        return <pre>{children}</pre>
      },
    }
  },[language,streaming,onOpenNote])
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,path,label)=>`[${label||path}](${encodeURI(path)})`)}</ReactMarkdown>
})
