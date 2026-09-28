/**
 * [WHO]: Provides MemoryService
 * [FROM]: Depends on ../../agent-core/src/i18n, ../../agent-core/upstream/ai/utils/validation, ./host, node:path, node:fs/promises, ../upstream/engine, @sinclair/typebox, ../../agent-core/src/contracts, ../../integrations/src/storage, ../../agent-core/src/types, ../../agent-core/src/providers
 * [TO]: Consumed by apps/obsidian/src/composition.ts
 * [HERE]: packages/memory/src/index.ts - hosts per-persona mem-core engines, races recall injection against a 600 ms cache timeout, and drains the durable pending-turns queue with backoff
 */
import {textValue} from '../../agent-core/src/i18n'
import {validateToolArguments} from '../../agent-core/upstream/ai/utils/validation'
import {MemoryHost} from './host'
import {join} from 'node:path'
import {mkdir} from 'node:fs/promises'
import {NanoMemEngine} from '../upstream/engine'
import type {TSchema} from '@sinclair/typebox'
import type {ConversationStore,ModelClient,ModelRequest} from '../../agent-core/src/contracts'
import {Serial,readJson,writeJson,within} from '../../integrations/src/storage'
import type {ModelConfig,ToolEvent} from '../../agent-core/src/types'
import type {ModelReply} from '../../agent-core/src/providers'
interface Job {id:string;sessionId:string;persona:string;modelId:string;user:string;assistant:string;tools:ToolEvent[];stage:number;attempts:number;nextAttempt:number;error?:string}
export class MemoryService {
  private engines=new Map<string,NanoMemEngine>();private serial=new Serial();private jobsLock=new Serial()
  private cache=new Map<string,string>();private processing=false;private closed=false;private paused=false;private abort=new AbortController()
  constructor(private vault:string,private model:(id:string)=>ModelConfig|undefined,private report:(error:string)=>void,private conversations:ConversationStore,private modelClient:ModelClient){}
  private async complete(request:ModelRequest,signal:AbortSignal):Promise<ModelReply>{
    let reply:ModelReply|undefined
    for await(const event of this.modelClient.stream(request,signal))if(event.type==='done')reply=event.reply
    if(!reply)throw new Error('记忆模型未返回结果')
    return reply
  }
  private hosts=new Map<string,MemoryHost>()
  private host(engine:NanoMemEngine,sessionId:string,modelId:string){return new MemoryHost(engine,this.vault,sessionId,async(system,content)=>{const model=this.model(modelId);if(!model)throw new Error('记忆模型未配置');return (await this.complete({model,transcript:[{role:'user',content}],system,tools:[],attachments:new Map()},this.abort.signal)).text},this.report,async(system,content,schema,options)=>{
    const model=this.model(modelId);if(!model)throw new Error('记忆模型未配置')
    const tool={name:options?.toolName||'memory_result',description:'Return the structured memory result',parameters:schema}
    const result=await this.complete({model,transcript:[{role:'user',content}],system:system+'\nReturn the result using the provided tool.',tools:[tool],attachments:new Map()},this.abort.signal)
    const call=result.calls.find(c=>c.name===tool.name)
    const args:unknown=call?.args??JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g,''))
    if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid structured memory result')
    const validated=validateToolArguments({...tool,parameters:schema as TSchema},{id:'memory',type:'toolCall',name:tool.name,arguments:args as Record<string,unknown>}) as Record<string,unknown>
    return JSON.stringify(options?.resultKey?validated[options.resultKey]:validated)
  })}
  async nativeTools(persona:string,modelId:string){const host=this.host(await this.engine(persona),'recall',modelId);this.hosts.set(persona,host);return host.tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters}))}
  private get jobsPath(){return join(this.vault,'.catea/memory/pending-turns.json')}
  private async engine(persona:string){
    let engine=this.engines.get(persona);if(engine)return engine
    if(!['global','vex','aria','pencil'].includes(persona))throw new Error('未知人格')
    const directory=await within(this.vault,`.catea/memory/${persona}`);await mkdir(directory,{recursive:true})
    engine=new NanoMemEngine({memoryDir:directory,locale:'zh',defaultScope:persona==='global'?undefined:{agentId:persona}})
    await engine.runStartupMaintenance();this.engines.set(persona,engine);return engine
  }
  private bind(engine:NanoMemEngine,id:string,signal:AbortSignal=this.abort.signal){
    engine.setLlmFn(async(system,content)=>{
      const model=this.model(id);if(!model)throw new Error('记忆任务的模型未配置')
      return (await this.complete({model,transcript:[{role:'user',content}],system,tools:[],attachments:new Map()},signal)).text
    })
  }
  private lastModelId=''
  async injection(persona:string,query:string,modelId:string){
    this.lastModelId=modelId
    const refresh=this.serial.run(async()=>{
      const entries=await Promise.all(['global',persona].map(async id=>this.host(await this.engine(id),'recall',this.lastModelId).injection(query)))
      const text=entries.filter(Boolean).join('\n\n');this.cache.set(persona,text);return text
    }).catch((e:unknown)=>{this.report(`记忆召回失败：${e instanceof Error?e.message:String(e)}`);return this.cache.get(persona)||''})
    // No additional model request on the first-token path. Slow disk recall refreshes the cache.
    let timer:number|undefined
    try{return await Promise.race([refresh,new Promise<string>(resolve=>{timer=window.setTimeout(()=>resolve(this.cache.get(persona)||''),600)})])}finally{window.clearTimeout(timer)}
  }
  async enqueue(job:Omit<Job,'stage'|'attempts'|'nextAttempt'>){
    await this.jobsLock.run(async()=>{const jobs=await readJson<Job[]>(this.jobsPath,[]);if(!jobs.some(j=>j.id===job.id))await writeJson(this.jobsPath,[...jobs,{...job,stage:0,attempts:0,nextAttempt:0}])})
    void this.process()
  }
  async process(){
    if(this.processing||this.closed||this.paused)return;this.processing=true
    try{
      const jobs=await this.jobsLock.run(()=>readJson<Job[]>(this.jobsPath,[]))
      for(const job of jobs){
        if(this.closed||this.paused)break;if(job.nextAttempt>Date.now())continue
        try{
          await this.serial.run(async()=>{
            const engine=await this.engine(job.persona);this.bind(engine,job.modelId)
            const host=this.host(engine,job.sessionId,job.modelId)
            await host.emit('session_start')
            await host.emit('before_agent_start',{prompt:job.user})
            const session=await this.conversations.load(job.sessionId)
            const allTools:ToolEvent[]=session?.messages?.flatMap(m=>m.tools||[])||job.tools
            await host.replay(allTools)
            const checkpoint=async()=>this.jobsLock.run(async()=>{const latest=await readJson<Job[]>(this.jobsPath,[]);await writeJson(this.jobsPath,latest.map(j=>j.id===job.id?job:j))})
            if(job.stage<2){await host.emit('agent_end',{messages:[{role:'user',content:job.user},{role:'assistant',content:[{type:'text',text:job.assistant}]}]});job.stage=2;await checkpoint()}
            if(job.stage<3){await host.emit('session_shutdown');job.stage=3;await checkpoint()}
            await host.emit('turn_end')
            this.cache.delete(job.persona)

          })
          await this.jobsLock.run(async()=>{const latest=await readJson<Job[]>(this.jobsPath,[]);await writeJson(this.jobsPath,latest.filter(j=>j.id!==job.id))})
        }catch(e:unknown){
          job.attempts++;job.error=e instanceof Error?e.message:String(e);job.nextAttempt=Date.now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))
          await this.jobsLock.run(async()=>{const latest=await readJson<Job[]>(this.jobsPath,[]);await writeJson(this.jobsPath,latest.map(j=>j.id===job.id?job:j))});this.report(`记忆任务待重试：${e instanceof Error?e.message:String(e)}`)
        }
      }
    }catch(e:unknown){this.report(`记忆队列失败：${e instanceof Error?e.message:String(e)}`)}finally{this.processing=false}
  }
  async run(name:string,args:Record<string,unknown>,persona:string,modelId:string,signal:AbortSignal=this.abort.signal){
    return this.serial.run(async()=>{
      signal.throwIfAborted();const engine=await this.engine(args.scope==='global'?'global':persona);this.bind(engine,modelId,signal)
      if(name.startsWith('nanomem_')){const host=this.hosts.get(persona)||this.host(engine,'manual',modelId);return host.run(name,args,signal)}
      let result:unknown
      switch(name){
        case 'memory_search':result=await engine.searchAllEntries(textValue(args.query||''),10);break
        case 'memory_recall':result=await engine.getEntryById(textValue(args.id));await engine.reinforceEntryById(textValue(args.id));break
        case 'memory_remember':result=await engine.remember({type:(['fact','preference','lesson','decision','pattern','struggle','event'].includes(textValue(args.type))?args.type:'fact') as 'fact'|'preference'|'lesson'|'decision'|'pattern'|'struggle'|'event',name:textValue(args.name||''),summary:textValue(args.summary||''),detail:textValue(args.detail||'')},'Catea');break
        case 'memory_edit':result=await engine.editEntryById(textValue(args.id),{summary:textValue(args.summary||''),detail:textValue(args.detail||'')});break
        case 'memory_forget':result=await engine.forgetEntry(textValue(args.id));break
        case 'memory_resolve':result=await engine.resolveConflictByIds(textValue(args.aId),textValue(args.bId),args.action as Parameters<NanoMemEngine['resolveConflictByIds']>[2]);break
        case 'memory_restore':result=await engine.restoreArchivedEntry(textValue(args.id));break
        case 'memory_dream':result=await engine.consolidateDetailed({signal});break
        case 'memory_review':result=await engine.getAlignmentSnapshot();break
        case 'memory_insights':result=await engine.generateFullInsights();break
        default:result={legacy:await engine.getStats(),v2:await engine.getV2Stats()}
      }
      this.cache.delete(persona);return JSON.stringify(result).slice(0,24000)
    })
  }
  setEnabled(enabled:boolean){this.paused=!enabled;if(!enabled)this.abort.abort();else if(this.abort.signal.aborted)this.abort=new AbortController()}
  close(){this.closed=true;this.abort.abort()}
}
