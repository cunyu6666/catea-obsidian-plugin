/**
 * [WHO]: Provides FolderAppearance, installFolderIcons
 * [FROM]: Depends on obsidian, ./main
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/folder-icons.ts - persisted folder icon/color picker with rename tracking and explorer decoration
 */
import { Modal, Notice, TFolder } from 'obsidian'
import type Catea from './main'

export interface FolderAppearance {
  icon: string
  color: string
}
const icons = [
  ['book-open', '书本'],
  ['briefcase', '公文包'],
  ['camera', '相机'],
  ['headphone', '耳机'],
  ['palette', '调色盘'],
  ['lightbulb', '灯泡'],
  ['archive', '档案盒'],
  ['globe', '地球'],
  ['flask', '烧瓶'],
  ['plant', '盆栽'],
]
const colors = [
  ['#7b897e', '灰绿'],
  ['#4e8064', '森林绿'],
  ['#368c8c', '青色'],
  ['#5382b7', '蓝色'],
  ['#7773b5', '紫色'],
  ['#ae7396', '粉色'],
  ['#bc6b68', '红色'],
  ['#c48b56', '橙色'],
  ['#ad9a4c', '金色'],
  ['#8f7d6b', '棕色'],
]
function valid(value?: FolderAppearance) {
  return (
    value && icons.some(([id]) => id === value.icon) && colors.some(([id]) => id === value.color)
  )
}

export function installFolderIcons(plugin: Catea) {
  let frame = 0,
    stopped = false
  const dialogs = new Set<Modal>()
  const clear = (row: HTMLElement) => {
    delete row.dataset.cateaFolderIcon
    row.style.removeProperty('--catea-folder-color')
  }
  const scan = () => {
    frame = 0
    for (const row of document.querySelectorAll<HTMLElement>('.nav-folder-title')) {
      const path = row.dataset.path || row.closest<HTMLElement>('[data-path]')?.dataset.path || ''
      const value = plugin.agentSettings.folderIcons?.[path]
      if (valid(value)) {
        row.dataset.cateaFolderIcon = value!.icon
        row.style.setProperty('--catea-folder-color', value!.color)
      } else clear(row)
    }
  }
  const schedule = () => {
    if (!stopped && !frame) frame = window.requestAnimationFrame(scan)
  }
  const persist = async () => {
    try {
      await plugin.saveAgentSettings()
      schedule()
    } catch {
      new Notice(plugin.t('无法保存文件夹图标，请重试。'))
    }
  }
  class Picker extends Modal {
    onOpen() {
      dialogs.add(this)
      const t = plugin.t,
        folder = this.folder
      this.setTitle(t('自定义文件夹图标'))
      this.contentEl.addClass('catea-folder-picker')
      this.contentEl.createEl('p', { text: folder.path, cls: 'catea-folder-picker__path' })
      let selected = {
        ...(plugin.agentSettings.folderIcons?.[folder.path] || {
          icon: icons[0][0],
          color: colors[0][0],
        }),
      }
      if (!valid(selected)) selected = { icon: icons[0][0], color: colors[0][0] }
      const preview = this.contentEl.createDiv({ cls: 'catea-folder-picker__preview' })
      const previewIcon = preview.createSpan({ cls: 'catea-folder-glyph' })
      preview.createSpan({ text: folder.name })
      this.contentEl.createEl('h3', { text: t('图标') })
      const iconGrid = this.contentEl.createDiv({ cls: 'catea-folder-picker__icons' })
      const iconButtons = icons.map(([id, label]) => {
        const button = iconGrid.createEl('button', { attr: { type: 'button' } })
        button.createSpan({
          cls: 'catea-folder-glyph',
          attr: { 'data-catea-folder-icon': id, 'aria-hidden': 'true' },
        })
        button.createSpan({ text: t(label) })
        button.onclick = () => {
          selected.icon = id
          render()
        }
        return { button, id }
      })
      this.contentEl.createEl('h3', { text: t('颜色') })
      const colorGrid = this.contentEl.createDiv({ cls: 'catea-folder-picker__colors' })
      const colorButtons = colors.map(([id, label]) => {
        const button = colorGrid.createEl('button', { attr: { type: 'button' } })
        const swatch = button.createSpan({
          cls: 'catea-folder-swatch',
          attr: { 'aria-hidden': 'true' },
        })
        swatch.style.setProperty('--catea-folder-color', id)
        button.createSpan({ text: t(label), cls: 'catea-folder-picker__sr' })
        button.onclick = () => {
          selected.color = id
          render()
        }
        return { button, id }
      })
      const render = () => {
        previewIcon.dataset.cateaFolderIcon = selected.icon
        this.contentEl.style.setProperty('--catea-folder-color', selected.color)
        for (const { button, id } of iconButtons)
          button.setAttribute('aria-pressed', String(id === selected.icon))
        for (const { button, id } of colorButtons)
          button.setAttribute('aria-pressed', String(id === selected.color))
      }
      render()
      const actions = this.contentEl.createDiv({ cls: 'catea-folder-picker__actions' })
      const commit = async (value?: FolderAppearance) => {
        if (plugin.app.vault.getAbstractFileByPath(folder.path) !== folder) {
          new Notice(t('文件夹已不存在。'))
          return
        }
        const previous = plugin.agentSettings.folderIcons || {}
        const next = { ...previous }
        if (value) next[folder.path] = value
        else delete next[folder.path]
        plugin.agentSettings.folderIcons = next
        try {
          await plugin.saveAgentSettings()
          schedule()
          this.close()
        } catch {
          plugin.agentSettings.folderIcons = previous
          new Notice(t('无法保存文件夹图标，请重试。'))
        }
      }
      actions.createEl('button', { text: t('恢复默认'), attr: { type: 'button' } }).onclick =
        () => {
          void commit()
        }
      actions.createEl('button', { text: t('取消'), attr: { type: 'button' } }).onclick = () =>
        this.close()
      actions.createEl('button', {
        text: t('保存'),
        cls: 'mod-cta',
        attr: { type: 'button' },
      }).onclick = () => {
        void commit(selected)
      }
    }
    constructor(readonly folder: TFolder) {
      super(plugin.app)
    }
    onClose() {
      dialogs.delete(this)
      this.contentEl.empty()
    }
  }
  plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFolder)
        menu.addItem((item) =>
          item
            .setTitle(plugin.t('自定义文件夹图标'))
            .setIcon('palette')
            .onClick(() => new Picker(file).open()),
        )
    }),
  )
  plugin.registerEvent(
    plugin.app.vault.on('rename', (file, oldPath) => {
      if (!(file instanceof TFolder)) return
      const next = { ...plugin.agentSettings.folderIcons }
      for (const [path, value] of Object.entries(plugin.agentSettings.folderIcons || {}))
        if (path === oldPath || path.startsWith(`${oldPath}/`)) {
          delete next[path]
          next[file.path + path.slice(oldPath.length)] = value
        }
      plugin.agentSettings.folderIcons = next
      void persist()
    }),
  )
  plugin.registerEvent(
    plugin.app.vault.on('delete', (file) => {
      if (!(file instanceof TFolder)) return
      const next = { ...plugin.agentSettings.folderIcons }
      for (const path of Object.keys(next))
        if (path === file.path || path.startsWith(`${file.path}/`)) delete next[path]
      plugin.agentSettings.folderIcons = next
      void persist()
    }),
  )
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-path'],
  })
  plugin.app.workspace.onLayoutReady(schedule)
  plugin.register(() => {
    stopped = true
    observer.disconnect()
    window.cancelAnimationFrame(frame)
    for (const dialog of dialogs) dialog.close()
    for (const row of document.querySelectorAll<HTMLElement>('[data-catea-folder-icon]')) clear(row)
  })
  schedule()
}
