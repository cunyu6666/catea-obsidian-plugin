import icons from './icons.json'
import type { SVGProps } from 'react'
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'dangerouslySetInnerHTML' | 'name'> & {
  name: string
  size?: number
}
export function Icon({ name, size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      {...props}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name as keyof typeof icons] || icons['tool-error'] }}
    />
  )
}
