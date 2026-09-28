import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ShadcnButton, type ButtonProps } from './ui/button'

interface AnnoButtonProps extends ButtonProps { icon?: ReactNode }

export function Button({ icon, children, ...props }: AnnoButtonProps) {
  return <ShadcnButton {...props}>{icon}{children}</ShadcnButton>
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, className = '', children, ...props }: IconButtonProps) {
  return <ShadcnButton aria-label={label} title={label} size="icon" variant="ghost" className={className} {...props}>{children}</ShadcnButton>
}
