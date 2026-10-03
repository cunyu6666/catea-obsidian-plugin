/**
 * [WHO]: Provides createAgentFactory
 * [FROM]: Depends on ../../../packages/agent-core/src, ../../../packages/agent-core/src/byok, ../../../packages/agent-core/src/model-client, ../../../packages/integrations/src/conversation-store, ../../../packages/memory/src, ../../../packages/agent-core/src/contracts
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/composition.ts - Obsidian composition root sharing conversation storage and memory across tab agents
 */
import { Agent, type Hooks, type Settings } from '../../../packages/agent-core/src'
import { configuredModels } from '../../../packages/agent-core/src/byok'
import { DirectModelClient } from '../../../packages/agent-core/src/model-client'
import type { AuxiliaryModel, ModelClient } from '../../../packages/agent-core/src/contracts'
import { VaultConversationStore } from '../../../packages/integrations/src/conversation-store'
import { MemoryService } from '../../../packages/memory/src'

export function createAgentFactory(
  vault: string,
  settings: () => Settings,
  auxiliaryModel?: (signal: AbortSignal) => Promise<AuxiliaryModel | null>,
  local?: { models: () => Settings['models']; client: ModelClient },
): (hooks: Hooks) => Agent {
  const conversations = new VaultConversationStore(vault)
  const modelClient = new DirectModelClient()
  const memory = new MemoryService(
    vault,
    (id) => configuredModels(settings().models).find((model) => model.id === id),
    // Background memory failures must never interrupt the conversation with a toast.
    (error) => console.warn('[Catea memory]', error),
    modelClient,
  )
  return (hooks) =>
    new Agent(vault, settings, hooks, {
      conversations,
      memory,
      modelClient,
      auxiliaryModel,
      models: local?.models,
      localChat: local?.client,
    })
}
