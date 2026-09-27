/**
 * [WHO]: Provides WorkingContext
 * [FROM]: Depends on ../upstream/context/boundaries, ../upstream/context/controller,
 *   ../upstream/context/index, ./index, ./upstream-stream
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/context.ts - keeps the full journal while presenting a checkpoint-windowed message view; estimates prompt tokens as (system + tools) / 3
 */
import contextExtension from '../upstream/context/index'
import {ContextWindowController} from '../upstream/context/controller'
import {estimateContextTokens} from '../upstream/context/boundaries'
import {fromTranscript} from './upstream-stream'
import type {Session} from './index'
export class WorkingContext {
 tools:any[]=[];private handlers=new Map<string,Function[]>();private controller:ContextWindowController
 constructor(private session:Session,private window:number,private promptTokens:number,private persist:()=>Promise<void>){
  if(!session.journal)session.journal=session.transcript.map(t=>this.entry('message',{message:fromTranscript(t)}))
  this.controller=new ContextWindowController({getSessionId:()=>session.id,getBranch:()=>session.journal!,getContextWindow:()=>this.window,getPromptTokens:()=>this.promptTokens,appendCheckpoint:(summary,firstKeptEntryId,tokensBefore,details)=>{session.journal!.push(this.entry('compaction',{summary,firstKeptEntryId,tokensBefore,details}))},rebuildContext:()=>({messages:this.messages()} as any)})
  contextExtension({registerTool:(t:any)=>this.tools.push(t),on:(name:string,fn:Function)=>this.handlers.set(name,[...(this.handlers.get(name)||[]),fn]),appendEntry:(customType:string,data:any)=>session.journal!.push(this.entry('custom',{customType,data}))} as any)
 }
 private entry(type:string,data:any){return {id:crypto.randomUUID(),type,timestamp:new Date().toISOString(),...data}}
 append(message:any){if(!this.session.journal!.some(e=>e.type==='message'&&e.message===message))this.session.journal!.push(this.entry('message',{message}))}
 messages():any[]{
  const rows=this.session.journal!,checkpoint=[...rows].reverse().find(e=>e.type==='compaction')
  if(!checkpoint)return rows.filter(e=>e.type==='message').map(e=>e.message)
  const first=rows.findIndex(e=>e.id===checkpoint.firstKeptEntryId)
  return [{role:'user',content:checkpoint.summary,timestamp:Date.parse(checkpoint.timestamp),cateaCheckpoint:checkpoint.id},...rows.slice(Math.max(0,first)).filter(e=>e.type==='message').map(e=>e.message)]
 }
 private ctx(messages:any[]=this.messages()){return {sessionManager:{getBranch:()=>this.session.journal!},requestContextWindow:(handoff:string)=>this.controller.request(handoff),getContextUsage:()=>{const usage=estimateContextTokens(messages);return {contextWindow:this.window,tokens:usage.tokens+(usage.lastUsageIndex===null?this.promptTokens:0)}}}}
 prompt(){return this.handlers.get('before_agent_start')?.[0]?.({},this.ctx())?.appendSystemPrompt||''}
 async prepare(messages:any[],system:string,tools:any[]){
  this.promptTokens=Math.ceil((system.length+JSON.stringify(tools).length)/3)
  // Flush complete messages before evaluating a safe boundary; never journal ephemeral budget hints.
  for(const m of messages)if(!m.cateaCheckpoint)this.append(m)
  const prepared=this.controller.prepare(this.messages())
  await this.persist()
  const extra=this.handlers.get('context')?.[0]?.({messages:prepared},this.ctx(prepared))
  return extra?.messages||prepared
 }
 async run(name:string,args:any,signal:AbortSignal){const tool=this.tools.find(t=>t.name===name);if(!tool)throw new Error('Unknown context tool');const result=await tool.execute(crypto.randomUUID(),args,signal,()=>{},this.ctx());await this.persist();return result.content.map((c:any)=>c.text||'').join('\n')}
 cancel(){this.controller.cancel()}
}
