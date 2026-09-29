import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

// shadcn/ui Button structure, with ANNO tokens and compact proportions.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-background hover:opacity-90',
        secondary: 'bg-surface-muted text-foreground hover:bg-foreground/10',
        outline: 'bg-surface text-foreground shadow-[var(--shadow-soft)] hover:bg-surface-muted',
        ghost: 'text-foreground-soft hover:bg-surface-muted hover:text-foreground',
        destructive: 'bg-danger text-white hover:opacity-90',
      },
      size: { default: 'h-[38px] px-3.5', sm: 'h-8 px-3', icon: 'size-9 p-0' },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const ShadcnButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return (
      <Component
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
ShadcnButton.displayName = 'ShadcnButton'
