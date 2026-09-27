/**
 * [WHO]: Provides t
 * [FROM]: Depends on (none)
 * [TO]: Consumed by packages/agent-core/src/providers.ts
 * [HERE]: packages/agent-core/src/i18n.ts - flat error-label map plus t() with {name} interpolation; returns the key when a label is unknown
 */
const labels: Record<string,string> = {
 attachmentUnavailable:'附件无法读取',
 modelStreamFailed:'模型响应失败',modelRequestFailed:'模型请求失败（{status}）',
 modelErrorDetailHidden:'请检查接口、模型与密钥',modelStreamMissing:'接口未返回响应流',
 modelInvalidArguments:'模型返回的工具参数不是有效 JSON',
}
export function t(key:string, values:Record<string,unknown> = {}) {return (labels[key] || key).replace(/\{(\w+)\}/g,(_,k)=>String(values[k] ?? ''))}
