/**
 * [WHO]: Provides PermissionPolicy, requirePermission, PermissionRequest, PermissionDecision
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/obsidian-tools.ts, packages/agent-core/src/index.ts, packages/integrations/src/tools.ts
 * [HERE]: packages/agent-core/src/permission-policy.ts - host-neutral permission decisions and approval gate for tool operations
 */
export type PermissionDecision = 'allow' | 'ask' | 'deny'
export interface PermissionRequest {
  mode: 'assist' | 'full'
  capability: 'vault' | 'obsidian' | 'shell' | 'mcp' | 'connector' | 'memory' | 'link-world'
  operation: 'read' | 'inspect' | 'write' | 'execute'
  resource?: string
  disabled?: boolean
}

export class PermissionPolicy {
  static evaluate(request: PermissionRequest): PermissionDecision {
    if (request.disabled) return 'deny'
    if (request.operation === 'read' || request.operation === 'inspect') return 'allow'
    return request.mode === 'full' ? 'allow' : 'ask'
  }
}

export async function requirePermission(
  request: PermissionRequest,
  approve: (title: string, detail: string, signal: AbortSignal) => Promise<boolean>,
  title: string,
  detail: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const decision = PermissionPolicy.evaluate(request)
  if (decision === 'deny') throw new Error(`Permission denied: ${request.capability} is disabled`)
  if (decision === 'ask' && !(await approve(title, detail, signal)))
    throw new Error('Permission denied: 用户取消操作')
  signal.throwIfAborted()
}
