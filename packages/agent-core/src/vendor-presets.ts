/**
 * [WHO]: Provides VendorPreset, createVendorModel, matchVendorPreset, vendorPresets
 * [FROM]: Depends on ./byok, ./types
 * [TO]: Consumed by apps/obsidian/src/settings.ts
 * [HERE]: packages/agent-core/src/vendor-presets.ts - curated official-vendor BYOK presets; createVendorModel prefills protocol, endpoint, default model and context window through normalizeModel so users only supply an API key; matchVendorPreset detects a preset by protocol and normalized baseUrl
 */
import { normalizeModel } from './byok'
import type { ModelConfig, ModelProtocol } from './types'

export interface VendorPreset {
  /** Stable slug, never shown; models keep their own UUID ids. */
  id: string
  /** Proper-noun display label; renders identically in both UI languages. */
  label: string
  /** Extra search terms (never rendered), so 千问 finds the Qwen preset. */
  aliases?: string[]
  protocol: ModelProtocol
  /**
   * Base URL as consumed by the provider endpoint derivation: either a plain
   * origin (the conventional /v1 segment is inserted), a base already ending
   * in an explicit /vN segment, or — for gateways with unusual paths — the
   * full endpoint path, which endpoint derivation then uses as-is.
   */
  baseUrl: string
  model: string
  contextWindow?: number
  /** Console page where the user creates an API key; no affiliate parameters. */
  keyUrl: string
  /** Explicit color for monochrome icons; multicolor icons bake their own. */
  iconColor?: string
}

export const vendorPresets: VendorPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6-sol',
    contextWindow: 400000,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5',
    contextWindow: 200000,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    iconColor: '#D4915D',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    aliases: ['google', 'gemini', '谷歌'],
    protocol: 'openai',
    // Google's OpenAI compatibility lives under /v1beta/openai without a
    // trailing /v1, so the preset carries the full endpoint path.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.6-flash',
    contextWindow: 1048576,
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    aliases: ['深度求索', 'deepseek'],
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    contextWindow: 1048576,
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    aliases: ['月之暗面', 'moonshot', 'kimi'],
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
    contextWindow: 1048576,
    keyUrl: 'https://platform.kimi.com/console/api-keys',
    iconColor: '#6366F1',
  },
  {
    id: 'kimi-global',
    label: 'Kimi Global',
    aliases: ['月之暗面', 'moonshot', 'kimi'],
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k3',
    contextWindow: 1048576,
    keyUrl: 'https://platform.kimi.ai/console/api-keys',
    iconColor: '#6366F1',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    aliases: ['zhipu', 'bigmodel', 'glm', 'chatglm', '智谱'],
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
    contextWindow: 1048576,
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'qwen',
    label: '通义千问',
    aliases: ['qwen', 'dashscope', '阿里', '千问', 'tongyi'],
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-max',
    contextWindow: 983616,
    keyUrl: 'https://platform.qianwenai.com/home/api-keys',
  },
  {
    id: 'qianfan',
    label: '百度千帆',
    aliases: ['baidu', 'qianfan', 'ernie', '百度', '文心'],
    protocol: 'openai',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    model: 'deepseek-v4-pro',
    contextWindow: 1048576,
    keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    aliases: ['minimax', '海螺', 'hailuo'],
    protocol: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M3',
    contextWindow: 1000000,
    keyUrl: 'https://platform.minimax.io/user-center/api-keys',
  },
  {
    id: 'doubao',
    label: '豆包（火山方舟）',
    aliases: ['doubao', 'volcengine', '火山', 'ark', '豆包', 'byteplus'],
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2-1-pro-260628',
    contextWindow: 262144,
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    aliases: ['xai', 'grok', 'x.ai'],
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4.5',
    contextWindow: 500000,
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    aliases: ['mistral', 'mixtral'],
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    contextWindow: 128000,
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    aliases: ['groq'],
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    contextWindow: 128000,
    keyUrl: 'https://console.groq.com/keys',
    iconColor: '#F55036',
  },
  {
    id: 'nvidia',
    label: 'Nvidia NIM',
    aliases: ['nvidia', 'nim', '英伟达'],
    protocol: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'moonshotai/kimi-k3',
    contextWindow: 128000,
    keyUrl: 'https://build.nvidia.com/settings/api-keys',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    aliases: ['siliconflow', '硅基', 'siliconcloud'],
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    contextWindow: 1048576,
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'modelscope',
    label: 'ModelScope',
    aliases: ['modelscope', '魔搭'],
    protocol: 'openai',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    model: 'ZhipuAI/GLM-5.2',
    contextWindow: 200000,
    keyUrl: 'https://modelscope.cn/my/myaccesstoken',
  },
  {
    id: 'stepfun',
    label: '阶跃星辰',
    aliases: ['stepfun', 'step', '阶跃'],
    protocol: 'openai',
    baseUrl: 'https://api.stepfun.com/v1',
    model: 'step-3.7-flash',
    contextWindow: 262144,
    keyUrl: 'https://platform.stepfun.com/interface-key',
  },
  {
    id: 'longcat',
    label: 'LongCat',
    aliases: ['longcat', '美团'],
    protocol: 'openai',
    baseUrl: 'https://api.longcat.chat/openai/v1',
    model: 'LongCat-2.0',
    contextWindow: 1048576,
    keyUrl: 'https://longcat.chat/platform/api_keys',
    iconColor: '#29E154',
  },
  {
    id: 'mimo',
    label: '小米 MiMo',
    aliases: ['xiaomi', 'mimo', '小米'],
    protocol: 'openai',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.6-pro',
    contextWindow: 1048576,
    keyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    aliases: ['hunyuan', 'tencent', '腾讯', '混元'],
    protocol: 'openai',
    baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    model: 'hy3',
    contextWindow: 256000,
    keyUrl: 'https://console.cloud.tencent.com/tokenhub/apikey',
  },
]

export function createVendorModel(
  preset: VendorPreset,
  options: { id: string; apiKey: string; model?: string; name?: string },
): ModelConfig {
  const model = (options.model ?? preset.model).trim()
  return normalizeModel({
    id: options.id,
    name: (options.name || `${preset.label} · ${model}`).trim(),
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    apiKey: options.apiKey,
    model,
    contextWindow: preset.contextWindow,
  })
}

export function matchVendorPreset(
  model: Pick<ModelConfig, 'protocol' | 'baseUrl'>,
): VendorPreset | undefined {
  const base = model.baseUrl.trim().replace(/\/+$/, '')
  return vendorPresets.find(
    (preset) => preset.protocol === model.protocol && preset.baseUrl.replace(/\/+$/, '') === base,
  )
}
