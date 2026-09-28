/**
 * [WHO]: Provides createAgent
 * [FROM]: Depends on ../../../packages/agent-core/src, ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/model-client, ../../../packages/integrations/src/conversation-store, ../../../packages/memory/src
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/composition.ts - Obsidian composition root for conversation storage and memory dependencies
 */
import {Agent,type Hooks,type Settings} from '../../../packages/agent-core/src'
import {configuredModels} from '../../../packages/agent-core/src/byok'
import {DirectModelClient} from '../../../packages/agent-core/src/model-client'
import {VaultConversationStore} from '../../../packages/integrations/src/conversation-store'
import {MemoryService} from '../../../packages/memory/src'

export function createAgent(vault:string,settings:()=>Settings,hooks:Hooks):Agent {
  const conversations=new VaultConversationStore(vault)
  const modelClient=new DirectModelClient()
  const memory=new MemoryService(vault,id=>configuredModels(settings().models).find(model=>model.id===id),hooks.notice,conversations,modelClient)
  return new Agent(vault,settings,hooks,{conversations,memory,modelClient})
}
