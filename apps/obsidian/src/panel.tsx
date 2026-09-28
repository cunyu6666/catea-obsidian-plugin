/**
 * [WHO]: Provides Panel
 * [FROM]: Depends on ../../../packages/agent-core/src/attachments, ../../../packages/agent-core/src/types, ./StreamingChatResponse, react, ./ChatMarkdown, catea-components, obsidian, ../../../packages/agent-core/src, ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/model-capabilities, ./session-drafts, ./tool-presenters, ../cat-welcome.png, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/panel.tsx - React sidebar root composing header, history, message list and composer; maps model picker, approvals, quotes and attachments
 */
import {readDroppedAttachments,readPickedAttachments} from '../../../packages/agent-core/src/attachments'
import type {ChatAttachment} from '../../../packages/agent-core/src/types'
import {StreamingChatResponse} from './StreamingChatResponse'
import {useCallback,useEffect,useRef,useState} from 'react'
import {ChatMarkdown} from './ChatMarkdown'
import {useScrollFade,Composer,AttachmentCards,type AttachmentCardItem,ApprovalCard,AgentActivities,Icon,IconButton,SidebarItem,Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from 'catea-components'
import {FuzzySuggestModal,TFolder} from 'obsidian'
import type {Agent} from '../../../packages/agent-core/src'
import {configuredModels,selectedModel} from '../../../packages/agent-core/src/byok'
import {unsupportedAttachment} from '../../../packages/agent-core/src/model-capabilities'
import type {SessionDraft} from './session-drafts'
import {createToolPresenters} from './tool-presenters'
import catWelcome from '../cat-welcome.png'
import type Catea from './main'

const toolPresenters=createToolPresenters()
const catReplyActions=['正在踩奶…','正在舔爪…','正在甩尾巴…','正在扒拉键盘…'] as const

function activityPreview(status:string,startedAt:number|undefined,completedAt:number|undefined,count:number,language:string|undefined){
  if(status==='complete'&&startedAt!==undefined&&completedAt!==undefined&&completedAt>=startedAt){
    const seconds=Math.floor((completedAt-startedAt)/1000)
    return language==='en'?`Cat ran for ${Math.floor(seconds/60)}m${seconds%60}s`:`猫咪奔跑了 ${Math.floor(seconds/60)}m${seconds%60}s`
  }
  return `${count} ${language==='en'?'actions':'个操作'}`
}

function chooseVaultFolder(plugin:Catea,label:string):Promise<string|null>{
  return new Promise(resolve=>{
    let settled=false
    class FolderPicker extends FuzzySuggestModal<TFolder>{
      getItems(){return plugin.app.vault.getAllLoadedFiles().filter((item):item is TFolder=>item instanceof TFolder&&!item.isRoot()&&!item.path.split('/').some(part=>part.startsWith('.')))}
      getItemText(item:TFolder){return item.path}
      onChooseItem(item:TFolder){settled=true;resolve(item.path)}
      onClose(){if(!settled)resolve(null)}
    }
    const picker=new FolderPicker(plugin.app);picker.setPlaceholder(label);picker.open()
  })
}

export function Panel({plugin,agent}:{plugin:Catea;agent:Agent}){
  const panelRef=useRef<HTMLDivElement>(null)
  useScrollFade(panelRef,12)
  const openNote=useCallback((path:string)=>{void plugin.app.workspace.openLinkText(path,'')},[plugin])
  const t=plugin.t
  const [,update]=useState(0),[error,setError]=useState(''),[showHistory,setShowHistory]=useState(false)
  const readingSessions=useRef(new Set<string>()),preparingRef=useRef(false)
  const sessionId=agent.session.id,draft=plugin.drafts.get(sessionId),text=draft.text,files=draft.attachments,readingFiles=readingSessions.current.has(sessionId)
  const changeDraft=(id:string,change:(current:SessionDraft)=>SessionDraft)=>{plugin.drafts.update(id,change);plugin.emit()}
  const setText=(value:string)=>changeDraft(sessionId,current=>({...current,text:value}))
  const readFiles=async(input:FileList|DataTransfer)=>{
    const target=agent.session.id
    if(readingSessions.current.has(target))return
    const existing=plugin.drafts.get(target).attachments
    readingSessions.current.add(target);plugin.emit();setError('')
    try{
      const result='items' in input?await readDroppedAttachments(input,existing):await readPickedAttachments(Array.from(input),existing)
      changeDraft(target,current=>({...current,attachments:[...current.attachments,...result.attachments]}))
      if(agent.session.id===target&&result.skipped)setError(`${result.skipped} ${t('个附件未导入：隐藏文件、读取失败或超过限制（单个 10 MB、合计 32 MB、64 个文件）。')}`)
      if(agent.session.id===target&&'folders' in result&&result.folders)setError(t('文件夹不会批量上传，请通过添加菜单选择知识库文件夹。'))
    }catch(e){if(agent.session.id===target)setError(e instanceof Error?e.message:String(e))}
    finally{readingSessions.current.delete(target);plugin.emit()}
  }
  const fileCards=(items:ChatAttachment[],removable=false)=>{
    const cards:AttachmentCardItem[]=items.map(file=>{const name=file.path.split('/').pop()||file.path,folder=file.kind==='folder',image=!folder&&/^image\/(png|jpeg|gif|webp)$/.test(file.mimeType||'');const extension=name.includes('.')?name.split('.').pop()!.toUpperCase():t('文件');return {id:file.id,name,path:file.path,kind:folder?'folder':image?'image':'file',previewUrl:image?file.dataUrl:undefined,detail:folder?t('文件夹'):`${extension} · ${Math.max(1,Math.round(file.size/1024))} KB`}})
    return <AttachmentCards items={cards} mode={removable?'composer':'message'} removeLabel={t('移除附件')} onRemove={removable?id=>changeDraft(sessionId,current=>({...current,attachments:current.attachments.filter(file=>file.id!==id)})):undefined}/>
  }
  const addFolder=()=>{const target=agent.session.id;void chooseVaultFolder(plugin,t('选择知识库文件夹')).then(path=>{if(!path)return;changeDraft(target,current=>current.attachments.some(file=>file.kind==='folder'&&file.path===path)?current:{...current,attachments:[...current.attachments,{id:crypto.randomUUID(),kind:'folder',path,size:0,mimeType:'inode/directory'}]})})}
  const [deleteId,setDeleteId]=useState<string|null>(null)
  const [history,setHistory]=useState<Array<{id:string;title:string}>>([])
  const scroll=useRef<HTMLDivElement>(null),follow=useRef(true),lastScrollTop=useRef(0)
  useEffect(()=>plugin.subscribe(()=>update(n=>n+1)),[plugin])
  const selectionId=plugin.selections.at(-1)?.id
  const config=plugin.agentSettings,models=configuredModels(config.models),model=selectedModel(config.models,config.modelId),empty=!agent.session.messages.length
  useEffect(()=>{if(selectionId)setShowHistory(false)},[selectionId])
  useEffect(()=>{
    const viewport=scroll.current,content=viewport?.firstElementChild
    if(!viewport||!content)return
    const pin=()=>{if(follow.current){viewport.scrollTop=viewport.scrollHeight;lastScrollTop.current=viewport.scrollTop}}
    const resize=new ResizeObserver(pin)
    resize.observe(content)
    pin()
    return()=>resize.disconnect()
  },[empty,showHistory,sessionId])
  useEffect(()=>{void agent.list().then(setHistory).catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)))},[agent,agent.running,agent.session.id,showHistory])
  const save=()=>void plugin.saveAgentSettings().catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)))
  const send=()=>{
    const target=sessionId,snapshot=plugin.drafts.get(target),value=snapshot.text.trim()||t('请查看这些附件'),sendingFiles=[...snapshot.attachments],quotes=[...snapshot.quotes]
    if((!snapshot.text.trim()&&!sendingFiles.length)||plugin.question||readingFiles||preparingRef.current)return
    if(model&&unsupportedAttachment(model,sendingFiles)){setError(t('附件已保留：当前模型不支持此类图片或二进制文档，请切换支持该附件的模型。'));return}
    preparingRef.current=true;setError('');plugin.drafts.clear(target);plugin.emit();follow.current=true
    void plugin.noteContext(config.includeCurrentNote!==false).then(note=>{
      if(agent.session.id!==target)throw new Error('Session changed before sending')
      const attached=JSON.stringify({currentNote:note?JSON.parse(note) as unknown:undefined,selectedQuotes:quotes.map(({path,text})=>({path,text}))})
      return agent.running?agent.steer(value,attached,sendingFiles):agent.send(value,attached,sendingFiles)
    }).catch((e:unknown)=>{if(agent.session.id===target)setError(e instanceof Error?e.message:String(e));plugin.drafts.restore(target,{...snapshot,text:value,attachments:sendingFiles,quotes});plugin.emit()}).finally(()=>{preparingRef.current=false})
  }
  const modelPicker=<Select disabled={agent.running} value={model?.id||'none'} onValueChange={value=>{if(value==='none')return;config.modelId=value;save();update(n=>n+1)}}><SelectTrigger className="model-trigger" aria-label={t("模型")}><SelectValue/></SelectTrigger><SelectContent>{models.length?models.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>):<SelectItem value="none">{t("未配置模型")}</SelectItem>}</SelectContent></Select>
  const composer=<><Composer value={text} onChange={setText} onSubmit={send} running={agent.running} onStop={()=>agent.stop()} stopLabel={t("停止生成")} placeholder={!model?t('先在设置中配置模型'):agent.running?t('补充要求，会在安全边界接入…'):empty?t('搜索或向 AI 提问…'):t('继续对话…')} mode="ai" inputLabel={t("消息")} submitLabel={t("发送")} busy={!!plugin.question||readingFiles} hasSubmitContent={files.length>0} onPickFiles={input=>void readFiles(input)} onPickFolder={addFolder} onDropFiles={input=>void readFiles(input)} attachLabel={t("添加附件")} fileLabel={t("添加文件")} folderLabel={t("添加文件夹")} dropLabel={t("放下以添加文件")} disabled={!config.enabled||!model||agent.historyBusy}
    attachments={<>{files.length>0&&fileCards(files,true)}{readingFiles&&<div className="chat-notice">{t("正在读取附件…")}</div>}{plugin.selections.length>0&&<div className="catea-quotes">{plugin.selections.map(q=><div className="catea-quote" key={q.id}><div><strong>{q.path.split('/').pop()}</strong><blockquote>{q.text}</blockquote></div><IconButton label={t('移除引用')} onClick={()=>{plugin.selections=plugin.selections.filter(s=>s.id!==q.id);plugin.emit()}}><Icon name="close" size={14}/></IconButton></div>)}</div>}</>}
    trailing={modelPicker}/>
    {error&&<div className="chat-notice" role="alert">{error}</div>}{agent.compaction&&<div className="chat-notice" role="status">{config.language==='en'?({start:'Compacting context…',complete:'Context compacted',failure:`Context compaction failed: ${agent.compaction.error||''}`})[agent.compaction.type]:({start:'正在压缩上下文…',complete:'上下文压缩完成',failure:`上下文压缩失败：${agent.compaction.error||''}`})[agent.compaction.type]}</div>}{!model&&<div className="chat-notice"><button onClick={()=>plugin.openAgentSettings()}>{t("配置 BYOK 模型 →")}</button></div>}</>
  return <div ref={panelRef} className="catea-ui catea-panel"><main className={empty&&!showHistory?'ai-start-page':'chat-main'}>
    <header className="chat-header"><div className="header-leading"><IconButton label={showHistory?t('返回对话'):t('历史对话')} aria-pressed={showHistory} onClick={()=>setShowHistory(v=>!v)}><Icon name={showHistory?'arrow-left':'history'} size={17}/></IconButton><div className="chat-header-title"><span>{showHistory?t('历史对话'):empty?t('新对话'):agent.session.title}</span></div></div><div className="chat-header-actions"><IconButton label={t("新对话")} disabled={agent.running||agent.historyBusy||preparingRef.current} onClick={()=>{const preserve=!!(draft.text||draft.attachments.length||draft.quotes.length);void agent.newSession(preserve).then(()=>{setShowHistory(false);setError('')}).catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)))}}><Icon name="add" size={17}/></IconButton><IconButton label={t("设置")} onClick={()=>plugin.openAgentSettings()}><Icon name="settings" size={17}/></IconButton></div></header>
    {showHistory?<div className="catea-history anno-auto-scrollbar"><h2>{t("最近对话")}</h2>{history.map(s=><SidebarItem key={s.id} icon={<Icon name="chat" size={15}/>} title={s.title} active={s.id===agent.session.id} trailingOpen={deleteId===s.id} trailing={deleteId===s.id?<span className="catea-history-confirm"><button type="button" disabled={agent.historyBusy||agent.running||preparingRef.current} onClick={()=>{void agent.deleteSession(s.id).then(()=>agent.list()).then(rows=>{plugin.drafts.delete(s.id);setHistory(rows);setDeleteId(null)}).catch((e:unknown)=>setError(t(e instanceof Error?e.message:String(e))))}}>{t('删除')}</button><IconButton label={t('取消')} disabled={agent.historyBusy} onClick={()=>setDeleteId(null)}><Icon name="close" size={14}/></IconButton></span>:<IconButton className="catea-history-delete" label={t('删除会话')} disabled={agent.running||agent.historyBusy||preparingRef.current} onClick={()=>setDeleteId(s.id)}><Icon name="trash" size={14}/></IconButton>} onClick={()=>{if(agent.running||preparingRef.current){setError(t('请先停止当前回复'));return}void agent.open(s.id).then(()=>{setShowHistory(false);setError('');follow.current=true}).catch((e:unknown)=>setError(e instanceof Error?e.message:String(e)))}}/>)}{!history.length&&<p className="sidebar-empty">{t("对话会保存在当前知识库中。")}</p>}{error&&<div className="chat-notice" role="alert">{error}</div>}</div>:
    empty?<><div className="catea-welcome-art" aria-hidden="true"><img src={catWelcome} alt=""/></div><div className="chat-composer-wrap catea-welcome-composer">{composer}</div></>:<>
    <div ref={scroll} className="chat-scroll anno-auto-scrollbar" onWheel={e=>{if(e.deltaY<0)follow.current=false}} onScroll={e=>{const el=e.currentTarget;if(el.scrollTop<lastScrollTop.current-1)follow.current=false;else if(el.scrollHeight-el.scrollTop-el.clientHeight<24)follow.current=true;lastScrollTop.current=el.scrollTop}}><div className="chat-messages">
      {agent.session.messages.map(m=><div className={`chat-message ${m.role}`} key={m.id}>{m.role==='user'?<div className="chat-user-content">{fileCards((agent.session.attachments||[]).filter(file=>m.attachmentIds?.includes(file.id)))}<div className="chat-message-body">{m.text}</div></div>:<>
        <AgentActivities items={m.tools.filter(tool=>tool.name!=='AskUserQuestion'||tool.result!==undefined||tool.error).map(tool=>({id:tool.id,name:toolPresenters.title(tool,t),summary:toolPresenters.summary(tool),status:tool.error?'error':tool.result!==undefined?'completed':'running'}))} preview={activityPreview(m.status,m.startedAt,m.completedAt,m.tools.length,config.language)} autoExpand={m.status==='streaming'&&!m.text.trim()} thinking={m.status==='streaming'&&!m.text.trim()&&!plugin.question} thinkingContent={m.reasoning} startedAt={m.startedAt} labels={{thinking:t('正在思考'),thought:t('思考过程'),details:t('查看操作')}} onOpenDetails={id=>{const tool=m.tools.find(item=>item.id===id);if(tool)plugin.showDetail(t('工具详情'),toolPresenters.details(tool))}}/>


        {m.error?<div className="message-error">{m.error}</div>:(m.text||m.status!=='streaming')&&<StreamingChatResponse sources={m.sources} content={m.text} interrupted={m.status==='stopped'} streaming={m.status==='streaming'&&!plugin.question} startedAt={m.startedAt} paused={!!plugin.question} onExpand={()=>plugin.showDetail(t('回复'),m.text)} onViewMarkdown={()=>plugin.showDetail('Markdown',m.text)} labels={{copy:t('复制'),copied:t('已复制'),markdown:'Markdown',expand:t('展开'),streaming:catReplyActions.map(t),sources:t('来源')}} render={(displayed,busy)=><ChatMarkdown content={displayed} streaming={busy} language={config.language||'zh'} onOpenNote={openNote}/>}/> }
      </>}</div>)}
        {plugin.question&&<ApprovalCard key={plugin.question.id} questions={plugin.question.questions.map((q,i)=>({id:String(i),title:q.question,options:q.options.map(o=>({value:o.label,...o})),multiple:q.multiSelect,allowCustom:true,customPlaceholder:t('填写其他回答')}))} onSubmit={answers=>{const q=plugin.question;if(q)q.answer(Object.fromEntries(q.questions.map((item,i)=>{const answer=answers[String(i)];return [item.question,[...(answer?.selected||[]),answer?.custom?.trim()].filter(Boolean).join(', ')]})))}} onDismiss={()=>plugin.question?.dismiss()} submitLabel={t("提交回答")} nextLabel={t("下一题")} previousLabel={t("上一题")} dismissLabel={t("取消回答")} previewLabel={t("预览")}/>}
    </div></div><div className="chat-composer-wrap">{composer}</div></>}
  </main></div>
}
