/**
 * [WHO]: Provides emptyUsage, fromTranscript, providerStream, streamSimple, toTranscript
 * [FROM]: Depends on ../upstream/ai/events, ./providers, ./types
 * [TO]: Consumed by packages/agent-core/src/context.ts, packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/upstream-stream.ts - converts between the internal transcript and CatUI messages; providerStream retries 3x at 500*2^n ms and records delivery diagnostics
 */
import {AssistantMessageEventStream} from '../upstream/ai/events'
import {streamModel,ModelServiceError} from './providers'
import type {ModelConfig,TranscriptItem,ChatAttachment} from './types'
export const emptyUsage=()=>({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}})
export function fromTranscript(t:TranscriptItem):any{
 const base={timestamp:Date.now()}
 if(t.role==='user')return {...base,role:'user',content:t.content,attachmentIds:t.attachmentIds}
 if(t.role==='tool')return {...base,role:'toolResult',toolCallId:t.callId,toolName:t.name,content:[{type:'text',text:t.content}],isError:t.content.startsWith('Tool error:')}
 return {...base,role:'assistant',api:'catea',provider:'catea',model:'',usage:undefined,stopReason:t.calls?.length?'toolUse':'stop',content:[...(t.content?[{type:'text',text:t.content}]:[]),...(t.calls||[]).map(c=>({type:'toolCall',id:c.id,name:c.name,arguments:c.args}))],...(t.anthropicContent?{anthropicContent:t.anthropicContent}:{})}
}
export function toTranscript(m:any):TranscriptItem{
 const text=typeof m.content==='string'?m.content:(m.content||[]).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('')
 if(m.role==='toolResult')return {role:'tool',callId:m.toolCallId,name:m.toolName,content:text}
 if(m.role==='assistant')return {role:'assistant',content:text,calls:(m.content||[]).filter((b:any)=>b.type==='toolCall').map((b:any)=>({id:b.id,name:b.name,args:b.arguments})),...(m.anthropicContent?{anthropicContent:m.anthropicContent}:{})}
 return {role:'user',content:text,attachmentIds:m.attachmentIds}
}
export function providerStream(config:ModelConfig,attachments:()=>ReadonlyMap<string,ChatAttachment>=()=>new Map()){return (_model:any,context:any,options:any)=>{
 const stream=new AssistantMessageEventStream()
 const message:any={role:'assistant',api:_model.api,provider:_model.provider,model:_model.id,timestamp:Date.now(),content:[{type:'text',text:''}],usage:emptyUsage(),stopReason:'stop'}
 void (async()=>{
  let emitted=false
  for(let attempt=0;attempt<3;attempt++){
   try{
    const started=Date.now();let firstDeltaMs:number|undefined,chunks=0;let delivery='unknown'
    const result=await streamModel(config,context.messages.map(toTranscript),context.systemPrompt||'',(context.tools||[]).map((t:any)=>({name:t.name,description:t.description,parameters:t.parameters})),attachments(),delta=>{
     chunks++;firstDeltaMs??=Date.now()-started
     if(!emitted){stream.push({type:'start',partial:message});emitted=true}
     message.content[0].text+=delta;stream.push({type:'text_delta',contentIndex:0,delta,partial:message})
    },options.signal,{maxTokens:options.maxTokens,onTransport:mode=>{delivery=mode}})
    message.content=[{type:'text',text:result.text},...result.calls.map(c=>({type:'toolCall',id:c.id,name:c.name,arguments:c.args}))]
    message.cateaDelivery={mode:delivery,chunks,firstDeltaMs,totalMs:Date.now()-started}
    message.anthropicContent=result.anthropicContent
    if(result.usage)message.usage={...emptyUsage(),input:result.usage.inputTokens,output:result.usage.outputTokens,cacheRead:result.usage.cachedInputTokens||0,totalTokens:result.usage.inputTokens+result.usage.outputTokens}
    message.stopReason=result.stopReason==='length'?'length':result.calls.length?'toolUse':'stop'
    stream.push({type:'done',reason:message.stopReason,message});stream.end(message);return
   }catch(e:any){
    const transient=!emitted&&!options.signal?.aborted&&(!(e instanceof ModelServiceError)||[408,429,500,502,503,504].includes(e.status||0))
    if(transient&&attempt<2){await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new Error('Aborted'))};const timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve()},500*2**attempt);options.signal?.addEventListener('abort',abort,{once:true})}).catch(()=>{});if(!options.signal?.aborted)continue}
    message.stopReason=options.signal?.aborted?'aborted':'error';message.errorMessage=e instanceof ModelServiceError&&e.reason==='context'?'Context window exceeded. Use a saved handoff or shorten this request; original history is preserved.':e.message
    stream.push({type:'error',reason:message.stopReason,error:message});stream.end(message);return
   }
  }
 })();return stream
}}
// Mandatory host injection prevents accidentally selecting CatUI's built-in providers or credentials.
export function streamSimple():never{throw new Error('Catea provider adapter required')}
