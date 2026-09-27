/**
 * [WHO]: Provides Panel
 * [FROM]: Depends on ../../../packages/agent-core/src, ../../../packages/agent-core/src/attachments,
 *   ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/types,
 *   ../../../packages/personas/src, ./ChatMarkdown, ./StreamingChatResponse, ./main,
 *   catea-components, react
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/panel.tsx - React sidebar root composing header, history, message list and composer; maps persona and model pickers, approvals, quotes and attachments
 */
import {attachmentIsText,readDroppedAttachments,readPickedAttachments} from '../../../packages/agent-core/src/attachments'
import type {ChatAttachment} from '../../../packages/agent-core/src/types'
import {StreamingChatResponse} from './StreamingChatResponse'
import {useCallback,useEffect,useRef,useState} from 'react'
import {ChatMarkdown} from './ChatMarkdown'
import {useScrollFade,Composer,ApprovalCard,AgentActivities,Icon,IconButton,SidebarItem,Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from 'catea-components'
import type {Agent} from '../../../packages/agent-core/src'
import {personas} from '../../../packages/personas/src'
import {configuredModels,selectedModel} from '../../../packages/agent-core/src/byok'
import type Catea from './main'

export function Panel({plugin,agent}:{plugin:Catea;agent:Agent}){
  const panelRef=useRef<HTMLDivElement>(null)
  useScrollFade(panelRef,12)
  const openNote=useCallback((path:string)=>{void plugin.app.workspace.openLinkText(path,'')},[plugin])
  const t=plugin.t
  const [,update]=useState(0),[text,setText]=useState(''),[context,setContext]=useState(true),[error,setError]=useState(''),[showHistory,setShowHistory]=useState(false)
  const [files,setFiles]=useState<ChatAttachment[]>([]),[readingFiles,setReadingFiles]=useState(false)
  const filesRef=useRef<ChatAttachment[]>([]),readingRef=useRef(false)
  const readFiles=async(input:FileList|DataTransfer)=>{
    if(readingRef.current)return
    readingRef.current=true;setReadingFiles(true);setError('')
    try{
      const result='items' in input?await readDroppedAttachments(input,filesRef.current):await readPickedAttachments(Array.from(input),filesRef.current)
      filesRef.current=[...filesRef.current,...result.attachments];setFiles(filesRef.current)
      if(result.skipped)setError(`${result.skipped} ${t('个附件未导入：隐藏文件、读取失败或超过限制（单个 10 MB、合计 32 MB、64 个文件）。')}`)
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{readingRef.current=false;setReadingFiles(false)}
  }
  const fileCards=(items:ChatAttachment[],removable=false)=><div className="catea-attachments">{items.map(file=><div className="catea-attachment" key={file.id} title={file.path}>{/^image\/(png|jpeg|gif|webp)$/.test(file.mimeType||'')?<img src={file.dataUrl} alt={file.path}/>:<Icon name="file" size={18}/>}<span><strong>{file.path}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB</small></span>{removable&&<IconButton label={t('移除附件')} onClick={()=>{filesRef.current=filesRef.current.filter(f=>f.id!==file.id);setFiles(filesRef.current)}}><Icon name="close" size={14}/></IconButton>}</div>)}</div>
  const [deleteId,setDeleteId]=useState<string|null>(null)
  const [history,setHistory]=useState<Array<{id:string;title:string}>>([])
  const scroll=useRef<HTMLDivElement>(null),follow=useRef(true)
  useEffect(()=>plugin.subscribe(()=>update(n=>n+1)),[plugin])
  const selectionId=plugin.selections.at(-1)?.id
  useEffect(()=>{if(selectionId)setShowHistory(false)},[selectionId])
  useEffect(()=>{if(follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight})
  useEffect(()=>{void agent.list().then(setHistory).catch(e=>setError(e.message))},[agent,agent.running,agent.session.id,showHistory])
  const config=plugin.agentSettings,models=configuredModels(config.models),model=selectedModel(config.models,config.modelId),empty=!agent.session.messages.length
  const save=()=>void plugin.saveAgentSettings().catch(e=>setError(e.message))
  const send=()=>{const value=text.trim()||t('请查看这些附件'),sendingFiles=[...filesRef.current],quotes=[...plugin.selections];if((!text.trim()&&!sendingFiles.length)||plugin.question||readingFiles)return;if(model&&/^MiniMax-M2/i.test(model.model)&&sendingFiles.some(file=>!attachmentIsText(file))){setError(t('附件已保留：当前 M2 模型不支持图片或二进制文档，请切换支持该附件的模型。'));return}setError('');setText('');filesRef.current=[];setFiles([]);follow.current=true;void plugin.noteContext(context).then(note=>{const attached=JSON.stringify({currentNote:note?JSON.parse(note):undefined,selectedQuotes:quotes.map(({path,text})=>({path,text}))});plugin.selections=plugin.selections.filter(q=>!quotes.some(s=>s.id===q.id));plugin.emit();return agent.running?agent.steer(value,attached,sendingFiles):agent.send(value,attached,sendingFiles)}).catch(e=>{setError(e.message);setText(value);filesRef.current=[...sendingFiles,...filesRef.current];setFiles(filesRef.current);for(const q of quotes)if(!plugin.selections.some(s=>s.id===q.id))plugin.selections.push(q);plugin.emit()})}
  const personaPicker=<Select disabled={agent.running} value={config.personaId} onValueChange={value=>{config.personaId=value;save();update(n=>n+1)}}><SelectTrigger className="persona-trigger" aria-label="Persona"><SelectValue/></SelectTrigger><SelectContent>{personas.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
  const modelPicker=<Select disabled={agent.running} value={model?.id||'none'} onValueChange={value=>{if(value==='none')return;config.modelId=value;save();update(n=>n+1)}}><SelectTrigger className="model-trigger" aria-label={t("模型")}><SelectValue/></SelectTrigger><SelectContent>{models.length?models.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>):<SelectItem value="none">{t("未配置模型")}</SelectItem>}</SelectContent></Select>
  const composer=<><Composer value={text} onChange={setText} onSubmit={send} placeholder={!model?t('先在设置中配置模型'):agent.running?t('补充要求，会在安全边界接入…'):empty?t('想一起做点什么？'):t('继续对话…')} mode="ai" inputLabel={t("消息")} submitLabel={t("发送")} busy={!!plugin.question||readingFiles} hasSubmitContent={files.length>0} onPickFiles={input=>void readFiles(input)} onPickFolder={input=>void readFiles(input)} onDropFiles={input=>void readFiles(input)} attachLabel={t("添加附件")} fileLabel={t("添加文件")} folderLabel={t("添加文件夹")} dropLabel={t("放下以添加文件或文件夹")} disabled={!config.enabled||!model||agent.historyBusy}
    attachments={<>{files.length>0&&fileCards(files,true)}{readingFiles&&<div className="chat-notice">{t("正在读取附件…")}</div>}{plugin.selections.length>0&&<div className="catea-quotes">{plugin.selections.map(q=><div className="catea-quote" key={q.id}><div><strong>{q.path.split('/').pop()}</strong><blockquote>{q.text}</blockquote></div><IconButton label={t('移除引用')} onClick={()=>{plugin.selections=plugin.selections.filter(s=>s.id!==q.id);plugin.emit()}}><Icon name="close" size={14}/></IconButton></div>)}</div>}</>}
    workingDirectory={<button className="catea-note-toggle" type="button" data-active={context} aria-pressed={context} aria-label={context?t('当前笔记已开启：发送时附带笔记内容，点击关闭'):t('当前笔记已关闭：点击附带笔记内容')} title={context?t('当前笔记已开启：发送时附带笔记内容，点击关闭'):t('当前笔记已关闭：点击附带笔记内容')} onClick={()=>setContext(v=>!v)}><Icon name="current-location" size={17}/></button>}

    leading={personaPicker} trailing={<>{modelPicker}{agent.running&&<IconButton label={t("停止生成")} onClick={()=>agent.stop()}><Icon name="stop" size={15}/></IconButton>}</>}/>
    {error&&<div className="chat-notice" role="alert">{error}</div>}{!model&&<div className="chat-notice"><button onClick={()=>plugin.openAgentSettings()}>{t("配置 BYOK 模型 →")}</button></div>}</>
  return <div ref={panelRef} className="catea-ui catea-panel"><main className={empty&&!showHistory?'ai-start-page':'chat-main'}>
    <header className="chat-header"><div className="header-leading"><IconButton label={showHistory?t('返回对话'):t('历史对话')} aria-pressed={showHistory} onClick={()=>setShowHistory(v=>!v)}><Icon name={showHistory?'arrow-left':'history'} size={17}/></IconButton><div className="chat-header-title"><span>{showHistory?t('历史对话'):empty?t('新对话'):agent.session.title}</span>{agent.running&&<span className="running-dot" data-waiting={!!plugin.question} title={t(plugin.question?"等待你的回答":"正在生成")}/>}</div></div><div className="chat-header-actions"><IconButton label={t("新对话")} disabled={agent.running||agent.historyBusy} onClick={()=>{agent.newSession();setShowHistory(false);setText('');setError('')}}><Icon name="add" size={17}/></IconButton><IconButton label={t("设置")} onClick={()=>plugin.openAgentSettings()}><Icon name="settings" size={17}/></IconButton></div></header>
    {showHistory?<div className="catea-history anno-auto-scrollbar"><h2>{t("最近对话")}</h2>{history.map(s=><SidebarItem key={s.id} icon={<Icon name="chat" size={15}/>} title={s.title} active={s.id===agent.session.id} trailing={deleteId===s.id?<span className="catea-history-confirm"><button type="button" disabled={agent.historyBusy||agent.running} onClick={()=>{void agent.deleteSession(s.id).then(()=>agent.list()).then(rows=>{setHistory(rows);setDeleteId(null)}).catch(e=>setError(t(e.message)))}}>{t('删除')}</button><IconButton label={t('取消')} disabled={agent.historyBusy} onClick={()=>setDeleteId(null)}><Icon name="close" size={14}/></IconButton></span>:<IconButton className="catea-history-delete" label={t('删除会话')} disabled={agent.running||agent.historyBusy} onClick={()=>setDeleteId(s.id)}><Icon name="trash" size={14}/></IconButton>} onClick={()=>{if(agent.running){setError(t('请先停止当前回复'));return}void agent.open(s.id).then(()=>{setShowHistory(false);follow.current=true}).catch(e=>setError(e.message))}}/>)}{!history.length&&<p className="sidebar-empty">{t("对话会保存在当前知识库中。")}</p>}{error&&<div className="chat-notice" role="alert">{error}</div>}</div>:
    empty?<div className="ai-start-center"><div className="ai-emblem" aria-hidden="true">✳</div><h1>{t("想一起做点什么？")}</h1><p>{t("读笔记、找线索，把想法慢慢展开。")}</p>{composer}</div>:<>
    <div ref={scroll} className="chat-scroll anno-auto-scrollbar" onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80}}><div className="chat-messages">
      {agent.session.messages.map(m=><div className={`chat-message ${m.role}`} key={m.id}>{m.role==='user'?<div className="chat-user-content">{fileCards((agent.session.attachments||[]).filter(file=>m.attachmentIds?.includes(file.id)))}<div className="chat-message-body">{m.text}</div></div>:<>
        <AgentActivities items={m.tools.filter(tool=>tool.name!=='AskUserQuestion'||tool.result!==undefined||tool.error).map(tool=>({id:tool.id,name:({web_search:t('网络搜索'),web_fetch:t('读取网页'),obsidian_context:t('当前笔记'),obsidian_search:t('搜索笔记'),obsidian_open:t('打开笔记'),obsidian_read:t('阅读笔记'),obsidian_edit:t('修改笔记'),obsidian_manage:t('管理笔记'),obsidian_settings:t('Catea 设置')} as Record<string,string>)[tool.name]||tool.name,summary:tool.error||tool.result?.slice(0,100),status:tool.error?'error':tool.result!==undefined?'completed':'running'}))} preview={`${m.tools.length} ${config.language==='en'?'actions':'个操作'}`} thinking={m.status==='streaming'&&!m.text.trim()&&!plugin.question} labels={{thinking:t('正在思考'),details:t('查看操作')}} onOpenDetails={id=>plugin.showDetail(t('工具详情'),JSON.stringify(m.tools.find(tool=>tool.id===id),null,2))}/>


        {m.error?<div className="message-error">{m.error}</div>:(m.text||m.status!=='streaming')&&<StreamingChatResponse sources={m.sources} content={m.text} interrupted={m.status==='stopped'} streaming={m.status==='streaming'&&!plugin.question} paused={!!plugin.question} onExpand={()=>plugin.showDetail(t('回复'),m.text)} onViewMarkdown={()=>plugin.showDetail('Markdown',m.text)} labels={{copy:t('复制'),copied:t('已复制'),markdown:'Markdown',expand:t('展开'),streaming:t('正在回复'),sources:t('来源')}} render={(displayed,busy)=><ChatMarkdown content={displayed} streaming={busy} language={config.language||'zh'} onOpenNote={openNote}/>}/> }
      </>}</div>)}
        {plugin.question&&<ApprovalCard key={plugin.question.id} questions={plugin.question.questions.map((q,i)=>({id:String(i),title:q.question,options:q.options.map(o=>({value:o.label,...o})),multiple:q.multiSelect,allowCustom:true,customPlaceholder:t('填写其他回答')}))} onSubmit={answers=>{const q=plugin.question;if(q)q.answer(Object.fromEntries(q.questions.map((item,i)=>{const answer=answers[String(i)];return [item.question,[...(answer?.selected||[]),answer?.custom?.trim()].filter(Boolean).join(', ')]})))}} onDismiss={()=>plugin.question?.dismiss()} submitLabel={t("提交回答")} nextLabel={t("下一题")} previousLabel={t("上一题")} dismissLabel={t("取消回答")} previewLabel={t("预览")}/>}
    </div></div><div className="chat-composer-wrap">{composer}</div></>}
  </main></div>
}
