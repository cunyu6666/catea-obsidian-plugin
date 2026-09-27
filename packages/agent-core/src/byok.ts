import type {ModelConfig} from './types'

export const defaultBaseUrl = (protocol: ModelConfig['protocol']) => protocol === 'anthropic'
  ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'

export function normalizeModel(draft: ModelConfig): ModelConfig {
  const model = {...draft, name: draft.name.trim(), model: draft.model.trim(), apiKey: draft.apiKey.trim()}
  if (!model.name || !model.model || !model.apiKey) throw new Error('请填写显示名称、模型 ID 和 API Key')
  if (!['openai', 'anthropic'].includes(model.protocol)) throw new Error('请选择支持的协议')
  if(model.contextWindow!==undefined&&(!Number.isInteger(model.contextWindow)||model.contextWindow<4096||model.contextWindow>2000000))throw new Error('上下文窗口需为 4096 至 2000000 的整数')
  let url: URL
  try { url = new URL(model.baseUrl.trim()) } catch { throw new Error('请输入有效的 API 地址') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('API 地址应为 HTTP(S) 基础地址，不包含账号、查询参数或片段')
  return {...model, baseUrl: url.toString().replace(/\/$/, '')}
}

export function configuredModels(models: ModelConfig[]): ModelConfig[] {
  return models.filter(model => { try { normalizeModel(model); return true } catch { return false } })
}

export function selectedModel(models: ModelConfig[], id: string): ModelConfig | undefined {
  const ready = configuredModels(models)
  return ready.find(model => model.id === id) || ready[0]
}
