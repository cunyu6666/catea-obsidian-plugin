/**
 * [WHO]: Provides LITE_MODEL_ID, liteModel, isLiteModel
 * [FROM]: Depends on ./types
 * [TO]: Consumed by packages/agent-core/src/byok.ts, packages/agent-core/src/index.ts, apps/obsidian/src/local-model.ts, apps/obsidian/src/panel.tsx, apps/obsidian/src/main.tsx
 * [HERE]: packages/agent-core/src/local-model.ts - canonical local-only chat identity and 32K text-only capability profile
 */
import type { ModelConfig } from './types'

// Preserve saved session IDs across the product display-name change.
export const LITE_MODEL_ID = 'catea-local-0.6b'
export function liteModel(): ModelConfig {
  return {
    id: LITE_MODEL_ID,
    name: 'Catea Lite',
    protocol: 'openai',
    transport: 'local',
    model: 'catea-lite',
    baseUrl: '',
    apiKey: '',
    contextWindow: 32768,
    capabilities: {
      vision: false,
      documents: false,
      tools: false,
      streaming: true,
      parallelTools: false,
      structuredOutput: false,
    },
  }
}
export function isLiteModel(model: ModelConfig | undefined): boolean {
  return model?.id === LITE_MODEL_ID && model.transport === 'local'
}
