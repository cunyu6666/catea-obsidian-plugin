/**
 * [WHO]: Provides OPENROUTER_BASE_URL, OPENROUTER_FREE_MODEL, configuredModels, createOpenRouterModel, defaultBaseUrl, isOpenRouterModel, normalizeModel, selectedModel
 * [FROM]: Depends on ./types
 * [TO]: Consumed by apps/obsidian/src/panel.tsx, apps/obsidian/src/settings.ts,
 *   packages/agent-core/src/index.ts, packages/agent-core/src/vendor-presets.ts
 * [HERE]: packages/agent-core/src/byok.ts - validates ModelConfig and resolves configured and selected models; requires name, model and key; contextWindow integer 4096-2000000; credential-free HTTP(S) URL
 */
import type { ModelConfig } from './types'

export const defaultBaseUrl = (protocol: ModelConfig['protocol']) =>
  protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_FREE_MODEL = 'openrouter/free'

export function isOpenRouterModel(model: ModelConfig): boolean {
  return model.protocol === 'openai' && model.baseUrl.replace(/\/$/, '') === OPENROUTER_BASE_URL
}

export function createOpenRouterModel(id: string, apiKey: string, modelId: string): ModelConfig {
  const slug = modelId.trim()
  if (!slug) throw new Error('请填写 OpenRouter 模型 ID，或选择 Free')
  if (!slug.includes('/') || /\s/.test(slug))
    throw new Error('OpenRouter 模型 ID 应为 provider/model 格式')
  return normalizeModel({
    id,
    apiKey,
    model: slug,
    name: slug === OPENROUTER_FREE_MODEL ? 'OpenRouter Free' : `OpenRouter · ${slug}`,
    protocol: 'openai',
    baseUrl: OPENROUTER_BASE_URL,
    contextWindow: slug === OPENROUTER_FREE_MODEL ? 65536 : 128000,
  })
}

export function normalizeModel(draft: ModelConfig): ModelConfig {
  const model = {
    ...draft,
    name: draft.name.trim(),
    model: draft.model.trim(),
    apiKey: draft.apiKey.trim(),
  }
  if (!model.name || !model.model || !model.apiKey)
    throw new Error('请填写显示名称、模型 ID 和 API Key')
  if (!['openai', 'anthropic'].includes(model.protocol)) throw new Error('请选择支持的协议')
  if (
    model.contextWindow !== undefined &&
    (!Number.isInteger(model.contextWindow) ||
      model.contextWindow < 4096 ||
      model.contextWindow > 2000000)
  )
    throw new Error('上下文窗口需为 4096 至 2000000 的整数')
  if (
    model.capabilities &&
    Object.values(model.capabilities).some((value) => typeof value !== 'boolean')
  )
    throw new Error('模型能力必须为布尔值')
  let url: URL
  try {
    url = new URL(model.baseUrl.trim())
  } catch {
    throw new Error('请输入有效的 API 地址')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('API 地址应为 HTTP(S) 基础地址，不包含账号、查询参数或片段')
  return { ...model, baseUrl: url.toString().replace(/\/$/, '') }
}

export function configuredModels(models: ModelConfig[]): ModelConfig[] {
  return models.filter((model) => {
    try {
      normalizeModel(model)
      return true
    } catch {
      return false
    }
  })
}

export function selectedModel(models: ModelConfig[], id: string): ModelConfig | undefined {
  const ready = configuredModels(models)
  return ready.find((model) => model.id === id) || ready[0]
}
