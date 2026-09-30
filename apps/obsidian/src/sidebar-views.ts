/**
 * [WHO]: SidebarViews
 * [FROM]: obsidian
 * [TO]: apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/sidebar-views.ts - serialized singleton sidebar restoration and cleanup
 */
import type { Workspace, WorkspaceLeaf } from 'obsidian'

export class SidebarViews {
  private pending = new Map<string, Promise<void>>()
  private disposed = false

  constructor(private workspace: Workspace) {}

  dispose() {
    this.disposed = true
  }

  sync(type: string, enabled: () => boolean, reveal = false): Promise<void> {
    const previous = this.pending.get(type) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(async () => {
        if (this.disposed) return
        const leaves: WorkspaceLeaf[] = []
        // Unknown and deferred views can retain the requested type only in saved state.
        this.workspace.iterateAllLeaves((leaf) => {
          if (leaf.getViewState().type === type) leaves.push(leaf)
        })
        if (!enabled()) {
          for (const leaf of leaves) leaf.detach()
          return
        }
        let leaf: WorkspaceLeaf | undefined =
          leaves.find((item) => item.view.getViewType() === type) ?? leaves[0]
        for (const duplicate of leaves) {
          if (duplicate !== leaf) duplicate.detach()
        }
        if (!leaf) {
          leaf = this.workspace.getRightLeaf(false) ?? undefined
          if (!leaf) return
          await leaf.setViewState({ type, active: reveal })
        } else if (leaf.isDeferred && leaf.loadIfDeferred) {
          await leaf.loadIfDeferred()
        } else if (leaf.view.getViewType() !== type) {
          await leaf.setViewState({ type, active: reveal })
        }
        if (this.disposed || !enabled()) {
          leaf.detach()
          return
        }
        if (reveal) await this.workspace.revealLeaf(leaf)
      })
    this.pending.set(type, next)
    void next
      .finally(() => {
        if (this.pending.get(type) === next) this.pending.delete(type)
      })
      .catch(() => {})
    return next
  }
}
