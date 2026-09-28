/**
 * [WHO]: Provides modelCapabilities, unsupportedAttachment
 * [FROM]: Depends on ./types, ./attachments
 * [TO]: Consumed by apps/obsidian/src/panel.tsx, packages/agent-core/src/providers.ts, packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/model-capabilities.ts - one source for configured and known model attachment and tool support
 */
import type {ChatAttachment,ModelConfig,ModelCapabilities} from './types'
import {attachmentIsText} from './attachments'

export function modelCapabilities(model:ModelConfig):Partial<ModelCapabilities> {
  const known=/^MiniMax-M2(?:\.|$)/i.test(model.model)?{vision:false,documents:false}:{}
  return {...known,...model.capabilities}
}

export function unsupportedAttachment(model:ModelConfig,files:readonly ChatAttachment[]):ChatAttachment|undefined {
  const capabilities=modelCapabilities(model)
  return files.find(file=>file.kind!=='folder'&&!attachmentIsText(file)&&((file.mimeType||'').startsWith('image/')?capabilities.vision===false:capabilities.documents===false))
}
