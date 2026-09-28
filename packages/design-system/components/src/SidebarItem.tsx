import type { ReactNode } from 'react'

export function SidebarItem({ active, icon, title, subtitle, trailing, onClick }: { active?: boolean; icon?: ReactNode; title: string; subtitle?: string; trailing?: ReactNode; onClick: () => void }) {
  return (
    <div className={`anno-sidebar-item ${active ? 'is-active' : ''}`}>
      <button type="button" className="anno-sidebar-item__main" onClick={onClick} title={title}>
        {icon && <span className="anno-sidebar-item__icon">{icon}</span>}
        <span className="anno-sidebar-item__text"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      </button>
      {trailing && <span className="anno-sidebar-item__trailing">{trailing}</span>}
    </div>
  )
}
