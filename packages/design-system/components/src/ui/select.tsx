import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Icon } from '../Icon'
import { cn } from '../lib/utils'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'inline-flex min-h-9 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <Icon name="chevron-down" size={14} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <div className="catea-ui catea-portal">
        <SelectPrimitive.Content
          data-slot="select-content"
          position="popper"
          sideOffset={5}
          className={cn(
            'z-50 max-h-80 min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border border-border bg-surface p-1 text-foreground shadow-xl',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </div>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex cursor-default select-none items-center rounded-md py-2 pr-7 pl-2 text-sm outline-none focus:bg-surface-muted',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2">
        <Icon name="check" size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
