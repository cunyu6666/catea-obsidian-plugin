// Local compatibility boundary for historical NanoMem wire records.
// Runtime algorithms use name/summary/detail; old content remains an on-disk alias.
export function readLegacyContent(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('content' in value)) return undefined
  return typeof value.content === 'string' ? value.content : undefined
}

export function syncLegacyContent(entry: { detail?: string }): void {
  Object.assign(entry, { content: entry.detail })
}

// Browser storage stays with its own window, including popouts. The standalone
// Node CLI uses a module-local registry instead of mutating process globals.
// Multi-bundle hosts can explicitly supply the same registry to each copy.
const nodeHost: Record<PropertyKey, unknown> = {}
let explicitHost: object | undefined
export function configureMemoryHost(host: object | undefined): void {
  explicitHost = host
}
export function memoryHostGlobal(): object {
  return explicitHost ?? (typeof window === 'undefined' ? nodeHost : window)
}
