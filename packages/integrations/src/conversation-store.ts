/**
 * [WHO]: Provides VaultConversationStore
 * [FROM]: Depends on ../../agent-core/src/contracts, ./storage, node:fs/promises
 * [TO]: Consumed by apps/obsidian/src/composition.ts
 * [HERE]: packages/integrations/src/conversation-store.ts - vault-backed session persistence with serialized writes and index rollback
 */
import {unlink} from 'node:fs/promises'
import type {ConversationStore,Session,SessionSummary} from '../../agent-core/src/contracts'
import {Serial,readJson,writeJson,within} from './storage'

export class VaultConversationStore implements ConversationStore {
  private writes=new Serial()
  constructor(private vault:string){}
  private id(value:string){
    if(!/^[\w-]+$/.test(value)||value==='index')throw new Error('无效会话')
    return value
  }
  private sessionPath(id:string){return within(this.vault,`.catea/sessions/${this.id(id)}.json`)}
  private indexPath(){return within(this.vault,'.catea/sessions/index.json')}
  async list():Promise<SessionSummary[]>{return readJson(await this.indexPath(),[])}
  async load(id:string):Promise<Session|null>{return readJson(await this.sessionPath(id),null)}
  async save(session:Readonly<Session>):Promise<void>{
    const snapshot=structuredClone(session)
    await this.writes.run(async()=>{
      await writeJson(await this.sessionPath(snapshot.id),snapshot)
      const path=await this.indexPath(),index=await readJson<SessionSummary[]>(path,[])
      await writeJson(path,[{id:snapshot.id,title:snapshot.title},...index.filter(row=>row.id!==snapshot.id)].slice(0,500))
    })
  }
  async delete(id:string):Promise<void>{
    const safeId=this.id(id)
    await this.writes.run(async()=>{
      const path=await this.indexPath(),index=await readJson<SessionSummary[]>(path,[])
      if(!index.some(row=>row.id===safeId))return
      const file=await this.sessionPath(safeId)
      await writeJson(path,index.filter(row=>row.id!==safeId))
      try{await unlink(file)}catch(error:unknown){
        if((error as NodeJS.ErrnoException).code!=='ENOENT'){
          await writeJson(path,index)
          throw error
        }
      }
    })
  }
}
