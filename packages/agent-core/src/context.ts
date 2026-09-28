/**
 * [WHO]: Provides WorkingContext
 * [FROM]: Depends on ../upstream/context/index, ../upstream/context/controller, ../upstream/context/boundaries, ./upstream-stream, ./contracts
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/context.ts - keeps the full journal while presenting a checkpoint-windowed message view; estimates prompt tokens as (system + tools) / 3
 */
import contextExtension from '../upstream/context/index'
import {ContextWindowController} from '../upstream/context/controller'
import {estimateContextTokens} from '../upstream/context/boundaries'
import {fromTranscript,type RuntimeMessage} from './upstream-stream'
import type {JournalEntry,Session} from './contracts'
interface JournalBase {id:string;timestamp:string}
interface ContextHost {
 registerTool(tool:ContextTool): void
 on(name:string,handler:ContextHandler): void
 appendEntry(customType:string,data:unknown): void
}
interface ContextTool {
 name:string;description:string;parameters:Record<string,unknown>
 execute(id:string,args:Record<string,unknown>,signal:AbortSignal,update:()=>void,context:ContextPort):Promise<{content:Array<{text?:string}>}>
}
interface ContextPort {
 sessionManager:{getBranch():JournalEntry[]}
 requestContextWindow(handoff:string):boolean
 getContextUsage():{contextWindow:number;tokens:number}
}
type ContextHandler=(event:{messages?:RuntimeMessage[]},context:ContextPort)=>{appendSystemPrompt?:string;messages?:RuntimeMessage[]}|void
interface ControllerPort {request(handoff:string):boolean;cancel():void;prepare(messages:RuntimeMessage[]):RuntimeMessage[]}
interface ControllerOptions {
 getSessionId():string;getBranch():JournalEntry[];getContextWindow():number;getPromptTokens():number
 appendCheckpoint(summary:string,firstKeptEntryId:string,tokensBefore:number,details:unknown):void
 rebuildContext():{messages:RuntimeMessage[]}
}
// The upstream snapshot omits its host-only type modules. Keep the adapter
// contract explicit here without modifying those byte-verified sources.
const Controller=ContextWindowController as unknown as {new(options:ControllerOptions):ControllerPort}
const registerContext=contextExtension as unknown as (host:ContextHost)=>void
const estimate=estimateContextTokens as unknown as (messages:RuntimeMessage[])=>{tokens:number;lastUsageIndex:number|null}
export class WorkingContext {
 tools:ContextTool[]=[];private handlers=new Map<string,ContextHandler[]>();private controller:ControllerPort
 constructor(private session:Session,private window:number,private promptTokens:number,private persist:()=>Promise<void>){
  if(!session.journal)session.journal=session.transcript.map(t=>this.entry({type:'message',message:fromTranscript(t)}))
  this.controller=new Controller({getSessionId:()=>session.id,getBranch:()=>session.journal!,getContextWindow:()=>this.window,getPromptTokens:()=>this.promptTokens,appendCheckpoint:(summary,firstKeptEntryId,tokensBefore,details)=>{session.journal!.push(this.entry({type:'compaction',summary,firstKeptEntryId,tokensBefore,details}))},rebuildContext:()=>({messages:this.messages()})})
  registerContext({registerTool:t=>{this.tools.push(t)},on:(name,fn)=>{this.handlers.set(name,[...(this.handlers.get(name)||[]),fn])},appendEntry:(customType,data)=>{session.journal!.push(this.entry({type:'custom',customType,data}))}})
 }
 private entry<T extends Omit<Extract<JournalEntry,{type:'message'}>,keyof JournalBase>|Omit<Extract<JournalEntry,{type:'compaction'}>,keyof JournalBase>|Omit<Extract<JournalEntry,{type:'custom'}>,keyof JournalBase>>(data:T):T & JournalBase{return {id:crypto.randomUUID(),timestamp:new Date().toISOString(),...data}}
 append(message:RuntimeMessage){if(!this.session.journal!.some(e=>e.type==='message'&&e.message===message))this.session.journal!.push(this.entry({type:'message',message}))}
 journal(){return this.session.journal!}
 async checkpoint(summary:string,firstKeptEntryId:string,tokensBefore:number){
  const rows=this.session.journal!
  if(!summary.trim()||!rows.some(e=>e.id===firstKeptEntryId))throw new Error('Invalid compaction checkpoint')
  const entry=this.entry({type:'compaction' as const,summary,firstKeptEntryId,tokensBefore,details:{source:'automatic'}})
  rows.push(entry)
  try{await this.persist()}catch(error){rows.splice(rows.indexOf(entry),1);throw error}
 }
 messages():RuntimeMessage[]{
  const rows=this.session.journal!,checkpoint=[...rows].reverse().find(e=>e.type==='compaction')
  const windowMessages=(entries:JournalEntry[])=>{
   const errors=entries.filter((e):e is Extract<JournalEntry,{type:'message'}>=>e.type==='message'&&e.message.role==='assistant'&&e.message.stopReason==='error')
   const excluded=new Set(errors.flatMap(e=>e.message.role==='assistant'?e.message.content.filter(b=>b.type==='toolCall').map(b=>b.id):[]))
   return entries.flatMap(e=>e.type!=='message'||e.message.role==='assistant'&&e.message.stopReason==='error'||e.message.role==='toolResult'&&excluded.has(e.message.toolCallId)?[]:[e.message])
  }
  if(!checkpoint)return windowMessages(rows)
  const first=rows.findIndex(e=>e.id===checkpoint.firstKeptEntryId)
  return [{role:'user',content:checkpoint.summary,timestamp:Date.parse(checkpoint.timestamp),cateaCheckpoint:checkpoint.id},...windowMessages(rows.slice(Math.max(0,first)))]
 }
 private ctx(messages:RuntimeMessage[]=this.messages()):ContextPort{return {sessionManager:{getBranch:()=>this.session.journal!},requestContextWindow:handoff=>this.controller.request(handoff),getContextUsage:()=>{const usage=estimate(messages);return {contextWindow:this.window,tokens:usage.tokens+(usage.lastUsageIndex===null?this.promptTokens:0)}}}}
 prompt(){return this.handlers.get('before_agent_start')?.[0]?.({},this.ctx())?.appendSystemPrompt||''}
 async prepare(messages:RuntimeMessage[],system:string,tools:unknown[]){
  this.promptTokens=Math.ceil((system.length+JSON.stringify(tools).length)/3)
  for(const message of messages)if(!message.cateaCheckpoint)this.append(message)
  const prepared=this.controller.prepare(this.messages())
  await this.persist()
  const extra=this.handlers.get('context')?.[0]?.({messages:prepared},this.ctx(prepared))
  return extra?.messages||prepared
 }
 async run(name:string,args:Record<string,unknown>,signal:AbortSignal){const tool=this.tools.find(t=>t.name===name);if(!tool)throw new Error('Unknown context tool');const result=await tool.execute(crypto.randomUUID(),args,signal,()=>{},this.ctx());await this.persist();return result.content.map(c=>c.text||'').join('\n')}
 cancel(){this.controller.cancel()}
}
