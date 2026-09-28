/**
 * [WHO]: Provides DirectModelClient
 * [FROM]: Depends on ./contracts, ./providers
 * [TO]: Consumed by apps/obsidian/src/composition.ts
 * [HERE]: packages/agent-core/src/model-client.ts - adapts the local BYOK provider into an abortable model event stream
 */
import type {ModelClient,ModelEvent,ModelRequest} from './contracts'
import {streamModel} from './providers'

export class DirectModelClient implements ModelClient {
  async *stream(request:Readonly<ModelRequest>,signal:AbortSignal):AsyncIterable<ModelEvent>{
    const pending:ModelEvent[]=[]
    let wake:(()=>void)|undefined
    let finished=false,error:unknown
    const emit=(event:ModelEvent)=>{pending.push(event);wake?.();wake=undefined}
    const task=streamModel(
      request.model,[...request.transcript],request.system,[...request.tools],request.attachments,
      text=>emit({type:'delta',text}),signal,
      {maxTokens:request.maxTokens,onTransport:mode=>emit({type:'transport',mode})},
    ).then(reply=>emit({type:'done',reply}),reason=>{error=reason}).finally(()=>{finished=true;wake?.();wake=undefined})
    while(!finished||pending.length){
      if(pending.length){yield pending.shift()!;continue}
      await new Promise<void>(resolve=>{wake=resolve})
    }
    await task
    if(error)throw error instanceof Error?error:new Error('Model client failed')
  }
}
